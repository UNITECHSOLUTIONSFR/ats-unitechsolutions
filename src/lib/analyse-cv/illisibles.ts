import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageIA } from "@/lib/ai";
import { enregistrerUsages } from "@/lib/ai/journal";
import { BOITE_CANDIDATURES, piecesJointesCV, type MessageBoite } from "@/lib/emails/boite";
import { lireScan, traiterCandidature } from "@/lib/emails/traitement";
import { empreinteSHA256, extraireTexte, graphGet } from "@/lib/sharepoint";

/**
 * Reprise des CV illisibles (une dizaine par passage) :
 * - CV SharePoint au vieux format Word (.doc) ou scannés : convertis en PDF par Microsoft (simple lecture), puis lus ;
 *   ils sont ensuite analysés avec les autres ;
 * - CV reçus par email et scannés : l'email est retrouvé dans la boîte de l'outil et le CV lu par l'IA.
 *   Les emails qui n'y sont plus (historique du groupe, droit retiré) restent signalés.
 */
export async function reprendreIllisibles(supabase: SupabaseClient, limite = 10) {
  const bilan = { sharepointLus: 0, emailsRepris: 0, introuvables: 0 };
  const usages: UsageIA[] = [];

  const { data: docs } = await supabase.from("documents").select("id, nom_fichier, sharepoint_drive_id, sharepoint_item_id")
    .eq("texte_extractible", false).not("sharepoint_drive_id", "like", "boite:%").limit(limite);
  for (const d of docs ?? []) {
    try {
      const pdf = await graphGet<Buffer>(`drives/${d.sharepoint_drive_id}/items/${d.sharepoint_item_id}/content?format=pdf`, { brut: true });
      let extrait = await extraireTexte(pdf, "converti.pdf");
      if (!extrait.extractible) extrait = await lireScan(pdf, "converti.pdf", usages);
      if (!extrait.extractible) continue;
      await supabase.from("documents").update({ texte_extrait: extrait.texte, texte_extractible: true, empreinte_sha256: empreinteSHA256(pdf) }).eq("id", d.id);
      await supabase.from("alertes").update({ statut: "resolue", resolue_le: new Date().toISOString() }).eq("type", "cv_illisible").eq("document_id", d.id).eq("statut", "ouverte");
      bilan.sharepointLus++;
    } catch { /* fichier déplacé ou supprimé : on réessaiera au prochain passage */ }
  }

  const { data: alertes } = await supabase.from("alertes").select("id, details").eq("type", "cv_illisible").eq("statut", "ouverte").is("document_id", null).limit(200);
  // Une seule tentative par fichier, même s'il a été signalé plusieurs fois.
  const parFichier = new Map<string, { ids: string[]; objet: string }>();
  for (const a of alertes ?? []) {
    const det = (a.details ?? {}) as { email?: string; fichier?: string; reprise?: string };
    if (!det.fichier || det.reprise === "introuvable") continue;
    const k = `${det.email ?? ""}|${det.fichier}`;
    parFichier.set(k, { ids: [...(parFichier.get(k)?.ids ?? []), a.id], objet: det.email ?? "" });
  }
  for (const [k, { ids, objet }] of [...parFichier].slice(0, limite)) {
    const fichier = k.split("|").slice(1).join("|");
    const r = await graphGet<{ value: MessageBoite[] }>(
      `users/${BOITE_CANDIDATURES}/messages?$search=${encodeURIComponent(`"subject:${objet.replace(/"/g, "")}"`)}&$select=id,internetMessageId,subject,receivedDateTime,hasAttachments,webLink,from,conversationId&$top=5`,
    ).catch(() => ({ value: [] as MessageBoite[] }));
    let repris = false;
    for (const m of r.value) {
      const pj = (await piecesJointesCV(m.id).catch(() => [])).find((p) => p.name === fichier);
      if (!pj) continue;
      const res = await traiterCandidature(supabase, m, pj, { driveId: `boite:${BOITE_CANDIDATURES}` }, usages).catch(() => null);
      if (res?.statut === "candidature_traitee") { repris = true; break; }
    }
    if (repris) {
      await supabase.from("alertes").update({ statut: "resolue", resolue_le: new Date().toISOString() }).in("id", ids);
      bilan.emailsRepris++;
    } else {
      for (const id of ids) await supabase.from("alertes").update({ details: { email: objet, fichier, reprise: "introuvable" } }).eq("id", id);
      bilan.introuvables++;
    }
  }
  await enregistrerUsages(usages, "reprise:illisibles");
  return { ...bilan, coutUSD: usages.reduce((s, u) => s + u.cout_estime_usd, 0) };
}
