import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphGet } from "@/lib/sharepoint";
import { deposerCVRecu } from "./depot";

/**
 * Récupération ponctuelle des FICHIERS des CV déjà lus et analysés (historique du groupe recrutement@ et dossier « Consultant »
 * de la boîte de l'administratrice) : chaque pièce jointe est téléchargée (lecture seule) et rangée dans SharePoint,
 * « Candidatures reçues / <sous-dossier> » ; la fiche peut alors ouvrir le CV d'origine. Aucune IA, rien n'est relu ni modifié.
 * Accès temporaires : Group.Read.All (groupe) et rôle Exchange « Application Mail.Read » limité à la boîte.
 */
export const SOURCES = {
  groupe: { driveId: "boite:groupe:recrutement@unitechsolutions.fr", sousDossier: "Historique recrutement@" },
  perso: { driveId: "boite:reprise:Consultant", sousDossier: "Historique boîte Consultant" },
} as const;

type Doc = { id: string; consultant_id: string | null; nom_fichier: string; sharepoint_item_id: string; modifie_sharepoint_le: string | null };

/** Avancement de la lecture des fils du groupe, gardé entre deux passages (la lecture complète dépasse 5 minutes). */
const REGLAGE_FILS = "reprise_groupe_fils";
type EtatFils = { suivant: string | null; fils: Record<string, string>; fini: boolean };

async function idGroupe(): Promise<string> {
  const g = await graphGet<{ value: { id: string }[] }>(`groups?$filter=${encodeURIComponent("mail eq 'recrutement@unitechsolutions.fr'")}&$select=id`);
  const gid = g.value[0]?.id;
  if (!gid) throw new Error("groupe recrutement introuvable");
  return gid;
}

/**
 * Groupe : une pièce jointe se télécharge par son fil de discussion, qu'il faut retrouver dans la liste des fils (50 par page,
 * messages compris). Seuls les messages attendus sont retenus ; la lecture reprend là où elle s'était arrêtée.
 */
async function avancerFils(supabase: SupabaseClient, gid: string, attendus: Set<string>, finAvant: number): Promise<EtatFils> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", REGLAGE_FILS).maybeSingle();
  const etat: EtatFils = (data?.valeur as EtatFils | null) ?? { suivant: `groups/${gid}/threads?$select=id&$expand=posts($select=id)&$top=50`, fils: {}, fini: false };
  const manquants = () => [...attendus].some((p) => !etat.fils[p]);
  while (!etat.fini && etat.suivant && Date.now() < finAvant && manquants()) {
    const page: { value: { id: string; posts?: { id: string }[] }[]; "@odata.nextLink"?: string } = await graphGet(etat.suivant);
    for (const f of page.value) for (const p of f.posts ?? []) if (attendus.has(p.id)) etat.fils[p.id] = f.id;
    etat.suivant = page["@odata.nextLink"]?.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0\//, "") ?? null;
    if (!etat.suivant) etat.fini = true;
    await supabase.from("reglages").upsert({ cle: REGLAGE_FILS, valeur: etat });
  }
  return etat;
}

function telechargeurGroupe(gid: string, fils: Record<string, string>) {
  // Le téléchargement direct d'une pièce jointe de groupe est refusé (403) : elle est lue avec les messages de son fil.
  const parFil = new Map<string, Promise<{ id: string; attachments?: { id: string; contentBytes?: string }[] }[]>>();
  return async (postId: string, pjId: string) => {
    const fil = fils[postId];
    if (!fil) throw new Error("message introuvable dans le groupe");
    if (!parFil.has(fil)) parFil.set(fil, graphGet<{ value: { id: string; attachments?: { id: string; contentBytes?: string }[] }[] }>(
      `groups/${gid}/threads/${fil}/posts?$select=id&$expand=attachments`).then((r) => r.value));
    const posts = await parFil.get(fil)!;
    const pj = posts.find((p) => p.id === postId)?.attachments?.find((a) => a.id === pjId);
    if (!pj?.contentBytes) throw new Error("pièce jointe introuvable ou vide");
    return Buffer.from(pj.contentBytes, "base64");
  };
}

const decouper = (id: string) => [id.slice(0, id.lastIndexOf("/")), id.slice(id.lastIndexOf("/") + 1)] as const;

function telechargeurBoite(boite: string) {
  return async (messageId: string, pjId: string) =>
    graphGet<Buffer>(`users/${boite}/messages/${messageId}/attachments/${pjId}/$value`, { brut: true });
}

export async function recupererFichiersHistorique(
  supabase: SupabaseClient, source: keyof typeof SOURCES, options: { boite?: string; limite?: number; simulation?: boolean } = {},
): Promise<{ aTraiter: number; ranges: number; erreurs: string[]; aSuivre: boolean; lecture?: string }> {
  // Un passage s'arrête avant la limite de 5 minutes de l'hébergeur ; le bouton enchaîne les passages.
  const debut = Date.now();
  const { driveId, sousDossier } = SOURCES[source];
  const { data } = await supabase.from("documents").select("id, consultant_id, nom_fichier, sharepoint_item_id, modifie_sharepoint_le")
    .eq("sharepoint_drive_id", driveId).not("url_web", "ilike", "%sharepoint.com%").limit(2000);
  let docs = (data ?? []) as Doc[];
  const bilan = { aTraiter: docs.length, ranges: 0, erreurs: [] as string[], aSuivre: false, lecture: undefined as string | undefined };
  if (options.simulation || !docs.length) return bilan;
  if (source === "perso" && !options.boite) throw new Error("boîte à lire non précisée");

  let telecharger: (messageId: string, pjId: string) => Promise<Buffer>;
  if (source === "groupe") {
    const gid = await idGroupe();
    const etat = await avancerFils(supabase, gid, new Set(docs.map((d) => decouper(d.sharepoint_item_id)[0])), debut + 150_000);
    const trouves = docs.filter((d) => etat.fils[decouper(d.sharepoint_item_id)[0]]);
    // Messages pas encore retrouvés : laissés pour le passage suivant (ou signalés une fois tout le groupe lu).
    if (!etat.fini) { bilan.aSuivre = true; bilan.lecture = `${Object.keys(etat.fils).length} message(s) retrouvé(s) sur ${docs.length}, lecture du groupe en cours`; }
    else for (const d of docs.filter((x) => !trouves.includes(x))) bilan.erreurs.push(`${d.nom_fichier} : message introuvable dans le groupe`);
    docs = trouves;
    telecharger = telechargeurGroupe(gid, etat.fils);
  } else telecharger = telechargeurBoite(options.boite!);
  docs = docs.slice(0, options.limite ?? 1000);

  const ids = [...new Set(docs.map((d) => d.consultant_id).filter(Boolean))] as string[];
  const personnes = new Map<string, { prenom: string; nom: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: c } = await supabase.from("consultants").select("id, prenom, nom").in("id", ids.slice(i, i + 200));
    for (const x of c ?? []) personnes.set(x.id, { prenom: x.prenom, nom: x.nom });
  }
  for (let i = 0; i < docs.length; i += 4) {
    if (Date.now() - debut > 240_000) { bilan.aSuivre = true; break; }
    await Promise.all(docs.slice(i, i + 4).map(async (d) => {
      try {
        const [messageId, pjId] = decouper(d.sharepoint_item_id);
        const contenu = await telecharger(messageId, pjId);
        const personne = (d.consultant_id && personnes.get(d.consultant_id)) || { prenom: "", nom: d.nom_fichier.replace(/\.[a-z]+$/i, "") };
        await deposerCVRecu(supabase, d.id, contenu, d.nom_fichier, personne, d.modifie_sharepoint_le ?? new Date().toISOString(), sousDossier);
        bilan.ranges++;
      } catch (e) {
        bilan.erreurs.push(`${d.nom_fichier} : ${(e as Error).message.slice(0, 120)}`);
      }
    }));
  }
  if (bilan.ranges && bilan.ranges < bilan.aTraiter) bilan.aSuivre = true;
  return bilan;
}
