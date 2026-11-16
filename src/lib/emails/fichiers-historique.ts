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

/** Téléchargement d'une pièce jointe. Groupe : le fil de chaque message est retrouvé une fois (liste des fils du groupe). */
async function telechargeurGroupe() {
  const g = await graphGet<{ value: { id: string }[] }>(`groups?$filter=${encodeURIComponent("mail eq 'recrutement@unitechsolutions.fr'")}&$select=id`);
  const gid = g.value[0]?.id;
  if (!gid) throw new Error("groupe recrutement introuvable");
  const filDe = new Map<string, string>();
  let url: string | undefined = `groups/${gid}/threads?$select=id&$top=50`;
  while (url) {
    const page: { value: { id: string }[]; "@odata.nextLink"?: string } = await graphGet(url);
    for (const f of page.value) {
      const posts = await graphGet<{ value: { id: string }[] }>(`groups/${gid}/threads/${f.id}/posts?$select=id`);
      for (const p of posts.value) filDe.set(p.id, f.id);
    }
    url = page["@odata.nextLink"]?.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0\//, "");
  }
  return async (postId: string, pjId: string) => {
    const fil = filDe.get(postId);
    if (!fil) throw new Error("message introuvable dans le groupe");
    const pj = await graphGet<{ contentBytes?: string }>(`groups/${gid}/threads/${fil}/posts/${postId}/attachments/${pjId}`);
    if (!pj.contentBytes) throw new Error("pièce jointe vide");
    return Buffer.from(pj.contentBytes, "base64");
  };
}

function telechargeurBoite(boite: string) {
  return async (messageId: string, pjId: string) =>
    graphGet<Buffer>(`users/${boite}/messages/${messageId}/attachments/${pjId}/$value`, { brut: true });
}

export async function recupererFichiersHistorique(
  supabase: SupabaseClient, source: keyof typeof SOURCES, options: { boite?: string; limite?: number; simulation?: boolean } = {},
): Promise<{ aTraiter: number; ranges: number; erreurs: string[] }> {
  const { driveId, sousDossier } = SOURCES[source];
  const { data } = await supabase.from("documents").select("id, consultant_id, nom_fichier, sharepoint_item_id, modifie_sharepoint_le")
    .eq("sharepoint_drive_id", driveId).not("url_web", "ilike", "%sharepoint.com%").limit(options.limite ?? 1000);
  const docs = (data ?? []) as Doc[];
  const bilan = { aTraiter: docs.length, ranges: 0, erreurs: [] as string[] };
  if (options.simulation || !docs.length) return bilan;
  if (source === "perso" && !options.boite) throw new Error("boîte à lire non précisée");
  const telecharger = source === "groupe" ? await telechargeurGroupe() : telechargeurBoite(options.boite!);
  const ids = [...new Set(docs.map((d) => d.consultant_id).filter(Boolean))] as string[];
  const personnes = new Map<string, { prenom: string; nom: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: c } = await supabase.from("consultants").select("id, prenom, nom").in("id", ids.slice(i, i + 200));
    for (const x of c ?? []) personnes.set(x.id, { prenom: x.prenom, nom: x.nom });
  }
  for (let i = 0; i < docs.length; i += 4) {
    await Promise.all(docs.slice(i, i + 4).map(async (d) => {
      try {
        const [messageId, pjId] = [d.sharepoint_item_id.slice(0, d.sharepoint_item_id.lastIndexOf("/")), d.sharepoint_item_id.slice(d.sharepoint_item_id.lastIndexOf("/") + 1)];
        const contenu = await telecharger(messageId, pjId);
        const personne = (d.consultant_id && personnes.get(d.consultant_id)) || { prenom: "", nom: d.nom_fichier.replace(/\.[a-z]+$/i, "") };
        await deposerCVRecu(supabase, d.id, contenu, d.nom_fichier, personne, d.modifie_sharepoint_le ?? new Date().toISOString(), sousDossier);
        bilan.ranges++;
      } catch (e) {
        bilan.erreurs.push(`${d.nom_fichier} : ${(e as Error).message.slice(0, 120)}`);
      }
    }));
  }
  return bilan;
}
