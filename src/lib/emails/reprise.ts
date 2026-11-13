import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageIA } from "@/lib/ai";
import { enregistrerUsages } from "@/lib/ai/journal";
import { graphGet } from "@/lib/sharepoint";
import { traiterMessage, type BilanEmails } from "./traitement";
import type { MessageBoite, PieceJointe } from "./boite";

type Dossier = { id: string; displayName: string; childFolderCount: number };
const CHAMPS = "id,internetMessageId,subject,receivedDateTime,hasAttachments,webLink,from,conversationId";
const suivant = (lien?: string) => lien?.replace("https://graph.microsoft.com/v1.0/", "") ?? "";

/**
 * Reprise unique d'un dossier (et de ses sous-dossiers) de la boîte de réception d'une personne, lancée par un administrateur.
 * Nécessite un accès Exchange temporaire en lecture sur cette boîte (à retirer ensuite). Les CV ne sont pas déposés dans
 * SharePoint : ils sont affichés sur la plateforme (texte), le Word Unitech les rangera dans le dossier métier.
 */
export async function repriseDossierBoite(supabase: SupabaseClient, boite: string, nomDossier: string, limite = 20): Promise<BilanEmails & { total: number; aFaire: number }> {
  const enfants = await graphGet<{ value: Dossier[] }>(`users/${boite}/mailFolders/inbox/childFolders?$top=200`);
  const racine = enfants.value.find((d) => d.displayName.trim().toLowerCase() === nomDossier.trim().toLowerCase());
  if (!racine) throw new Error(`dossier « ${nomDossier} » introuvable dans la boîte de réception`);
  const dossiers: Dossier[] = [];
  const parcourir = async (d: Dossier) => {
    dossiers.push(d);
    if (d.childFolderCount) for (const c of (await graphGet<{ value: Dossier[] }>(`users/${boite}/mailFolders/${d.id}/childFolders?$top=200`)).value) await parcourir(c);
  };
  await parcourir(racine);
  const messages: MessageBoite[] = [];
  for (const d of dossiers) {
    let url = `users/${boite}/mailFolders/${d.id}/messages?$filter=hasAttachments eq true&$top=200&$select=${CHAMPS}`;
    while (url) { const r = await graphGet<{ value: MessageBoite[]; "@odata.nextLink"?: string }>(url); messages.push(...r.value); url = suivant(r["@odata.nextLink"]); }
  }
  messages.sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime));
  const cle = (m: MessageBoite) => m.internetMessageId || m.id;
  const vus = new Set<string>();
  for (let i = 0; i < messages.length; i += 100) {
    const { data } = await supabase.from("emails_entrants").select("message_id").in("message_id", messages.slice(i, i + 100).map(cle));
    for (const r of data ?? []) vus.add(r.message_id);
  }
  const aFaire = messages.filter((m) => !vus.has(cle(m)));
  const bilan: BilanEmails = { lus: 0, candidatures: 0, dejaConnues: 0, ignores: 0, erreurs: [], coutUSD: 0, restants: aFaire.length > 0 };
  const usages: UsageIA[] = [];
  const piecesJointes = (id: string) => async (): Promise<PieceJointe[]> => {
    const r = await graphGet<{ value: (PieceJointe & { "@odata.type": string })[] }>(`users/${boite}/messages/${id}/attachments`);
    return r.value.filter((p) => p["@odata.type"] === "#microsoft.graph.fileAttachment" && /\.(docx|doc|pdf)$/i.test(p.name) && p.size <= 10 * 1024 * 1024);
  };
  // 6 emails traités en parallèle ; on n'en démarre plus après 4 minutes (limite de 5 minutes par passage).
  const debut = Date.now();
  const file = aFaire.slice(0, limite);
  const ouvrier = async () => {
    for (let m = file.shift(); m; m = file.shift()) {
      if (Date.now() - debut > 240_000) return;
      await traiterMessage(supabase, m, piecesJointes(m.id), { driveId: `boite:reprise:${nomDossier}`, deposer: false }, usages, bilan);
    }
  };
  try {
    await Promise.all(Array.from({ length: 6 }, ouvrier));
  } finally {
    await enregistrerUsages(usages, `reprise:${nomDossier}`);
  }
  bilan.coutUSD = usages.reduce((s, u) => s + u.cout_estime_usd, 0);
  return { ...bilan, total: messages.length, aFaire: Math.max(0, aFaire.length - bilan.lus) };
}
