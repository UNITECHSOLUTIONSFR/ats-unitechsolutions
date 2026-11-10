import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lireReponseDisponibilite, type UsageIA } from "@/lib/ai";
import { champsParEntete } from "@/lib/import/excel";
import { BOITE_CANDIDATURES, type MessageBoite } from "@/lib/emails/boite";
import { graphGet } from "@/lib/sharepoint";
import { miseAJourDepuisReponse, texteDeLaReponse } from "./modele";

/** L'email reçu répond-il à une relance ? Même fil Outlook d'abord, sinon même expéditeur relancé depuis moins de 60 jours. */
export async function envoiCorrespondant(supabase: SupabaseClient, m: MessageBoite) {
  if (m.conversationId) {
    const { data } = await supabase.from("envois_relance").select("id, consultant_id").eq("conversation_id", m.conversationId)
      .in("statut", ["envoye", "repondu", "a_verifier"]).limit(1).maybeSingle();
    if (data) return data;
  }
  const expediteur = m.from?.emailAddress?.address?.toLowerCase();
  if (!expediteur) return null;
  const { data } = await supabase.from("envois_relance").select("id, consultant_id").eq("email", expediteur).eq("statut", "envoye")
    .gte("envoye_le", new Date(Date.now() - 60 * 86_400_000).toISOString()).order("envoye_le", { ascending: false }).limit(1).maybeSingle();
  return data;
}

const texteBrut = (html: string) => html
  .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

/**
 * Applique automatiquement une réponse à la relance : l'IA lit la disponibilité, la fiche est mise à jour
 * (historique gardé), ainsi que la ligne du tableau ; la cellule est notée pour le fichier Excel (synchronisation suivante).
 * Le texte de l'email n'est pas conservé, seulement la lecture qui en est faite.
 */
export async function traiterReponse(supabase: SupabaseClient, m: MessageBoite, envoi: { id: string; consultant_id: string }, usages: UsageIA[]) {
  const msg = await graphGet<{ uniqueBody?: { content: string }; body?: { content: string } }>(
    `users/${BOITE_CANDIDATURES}/messages/${m.id}?$select=uniqueBody,body`);
  const texte = texteDeLaReponse(texteBrut(msg.uniqueBody?.content || msg.body?.content || ""));
  const maintenant = new Date();
  const r = await lireReponseDisponibilite(texte || m.subject || "", maintenant.toISOString().slice(0, 10));
  usages.push(...r.usages);
  const maj = miseAJourDepuisReponse(r.donnees, maintenant);

  if (maj.fiche) {
    const { data: avant } = await supabase.from("consultants").select("disponibilite, disponible_le, ne_plus_contacter").eq("id", envoi.consultant_id).maybeSingle();
    const enAttenteExcel = maj.texte ? { disponibilite: maj.texte } : null;
    await supabase.from("consultants").update({ ...maj.fiche, ...(enAttenteExcel ? { excel_maj_en_attente: enAttenteExcel } : {}) }).eq("id", envoi.consultant_id);
    const modifications = Object.fromEntries(Object.keys(maj.fiche).filter((k) => k in (avant ?? {}))
      .map((k) => [k, { avant: (avant as Record<string, unknown>)?.[k] ?? null, apres: maj.fiche![k] }]));
    await supabase.from("consultants_historique").insert({ consultant_id: envoi.consultant_id, source: "relance_disponibilite", modifications, par: null });
    if (maj.texte) await mettreAJourLigneTableau(supabase, envoi.consultant_id, maj.texte);
  } else {
    await supabase.from("alertes").insert({ type: "autre", consultant_id: envoi.consultant_id, details: { relance: "réponse à vérifier", objet: m.subject } });
  }
  await supabase.from("envois_relance").update({
    statut: maj.statutEnvoi, repondu_le: m.receivedDateTime, reponse: { ...r.donnees, applique: !!maj.fiche, texte: maj.texte },
  }).eq("id", envoi.id);
  return maj;
}

/** Colonne « Disponibilité » de l'onglet principal : la ligne reliée à la fiche prend la nouvelle valeur. */
async function mettreAJourLigneTableau(supabase: SupabaseClient, consultantId: string, texte: string) {
  const { data: onglet } = await supabase.from("tableau_onglets").select("id, entetes").eq("principal", true).maybeSingle();
  if (!onglet) return;
  const colonne = Object.entries(champsParEntete(onglet.entetes, onglet.entetes)).find(([, c]) => c === "disponibilite")?.[0];
  if (!colonne) return;
  const { data: lignes } = await supabase.from("tableau_lignes").select("id, valeurs").eq("onglet_id", onglet.id).eq("consultant_id", consultantId);
  for (const l of lignes ?? []) {
    await supabase.from("tableau_lignes").update({ valeurs: { ...(l.valeurs as Record<string, string>), [colonne]: texte } }).eq("id", l.id);
  }
}
