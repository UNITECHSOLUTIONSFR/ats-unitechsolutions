import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Evenement { date: string; type: "modification" | "email" | "mission" | "document" | "relance" | "creation" | "note"; titre: string; detail?: string; lien?: string }

const SOURCES: Record<string, string> = {
  interface: "Modifiée dans l'outil", import_excel: "Import du fichier Excel", synchro_excel: "Mise à jour depuis le fichier Excel",
  relance_disponibilite: "Réponse à une demande de disponibilité", fusion: "Fusion de deux fiches", correction_telephone: "Téléphone corrigé",
};
const CHAMPS: Record<string, string> = {
  disponibilite: "disponibilité", disponible_le: "disponible le", telephone_e164: "téléphone", email: "email", intitule_poste: "poste",
  localisation: "localisation", statut: "statut", notes: "notes", nom: "nom", prenom: "prénom",
};
const STATUTS: Record<string, string> = { propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé" };

/** Frise d'une fiche : modifications, emails reçus, suivi des missions, CV et relances, du plus récent au plus ancien. */
export async function frise(supabase: SupabaseClient, consultantId: string, creeLe: string, source: string): Promise<Evenement[]> {
  const [{ data: modifs }, { data: emails }, { data: props }, { data: docs }, { data: relances }, { data: utilisateurs }, { data: notes }] = await Promise.all([
    supabase.from("consultants_historique").select("created_at, source, modifications, par").eq("consultant_id", consultantId).order("created_at", { ascending: false }).limit(50),
    supabase.from("emails_entrants").select("recu_le, objet, statut").eq("consultant_id", consultantId).order("recu_le", { ascending: false }).limit(30),
    supabase.from("propositions").select("id, mission_id, missions(intitule), propositions_historique(nouveau_statut, created_at)").eq("consultant_id", consultantId),
    supabase.from("documents").select("nom_fichier, type, modifie_sharepoint_le, created_at, sharepoint_drive_id").eq("consultant_id", consultantId),
    supabase.from("envois_relance").select("envoye_le, repondu_le, statut, reponse, campagnes_relance(objet)").eq("consultant_id", consultantId),
    supabase.rpc("responsables_possibles"),
    supabase.from("notes_consultant").select("created_at, texte, auteur").eq("consultant_id", consultantId).order("created_at", { ascending: false }).limit(30),
  ]);
  const qui = new Map(((utilisateurs ?? []) as { id: string; nom: string }[]).map((u) => [u.id, u.nom]));
  const ev: Evenement[] = [];
  for (const n of notes ?? []) ev.push({ date: n.created_at, type: "note", titre: `Note${n.auteur && qui.get(n.auteur) ? ` de ${qui.get(n.auteur)}` : ""}`, detail: n.texte });

  for (const m of modifs ?? []) {
    const champs = Object.keys((m.modifications ?? {}) as object).filter((k) => CHAMPS[k]).map((k) => CHAMPS[k]);
    ev.push({ date: m.created_at, type: "modification", titre: SOURCES[m.source] ?? "Fiche modifiée", detail: [champs.length ? champs.join(", ") : "", m.par ? `par ${qui.get(m.par) ?? "un utilisateur"}` : ""].filter(Boolean).join(" · ") });
  }
  for (const e of emails ?? []) ev.push({ date: e.recu_le, type: "email", titre: "Email reçu", detail: e.objet ?? undefined });
  for (const p of props ?? []) {
    const mission = (p.missions as unknown as { intitule: string } | null)?.intitule ?? "Mission";
    for (const h of (p.propositions_historique as unknown as { nouveau_statut: string; created_at: string }[]) ?? []) {
      ev.push({ date: h.created_at, type: "mission", titre: `${STATUTS[h.nouveau_statut] ?? h.nouveau_statut} sur une mission`, detail: mission, lien: `/missions/${p.mission_id}` });
    }
  }
  for (const d of docs ?? []) {
    const parEmail = String(d.sharepoint_drive_id).startsWith("boite:");
    ev.push({ date: d.modifie_sharepoint_le ?? d.created_at, type: "document", titre: parEmail ? "CV reçu par email" : d.type === "pdf_anonyme" ? "PDF anonymisé (SharePoint)" : "CV Word (SharePoint)", detail: d.nom_fichier });
  }
  for (const r of relances ?? []) {
    const objet = (r.campagnes_relance as unknown as { objet: string } | null)?.objet;
    if (r.envoye_le) ev.push({ date: r.envoye_le, type: "relance", titre: "Email envoyé", detail: objet });
    if (r.repondu_le) ev.push({ date: r.repondu_le, type: "relance", titre: "Réponse reçue", detail: (r.reponse as { texte?: string } | null)?.texte ?? undefined });
  }
  ev.push({ date: creeLe, type: "creation", titre: "Fiche créée", detail: { import_excel: "depuis le fichier Excel", email: "depuis une candidature email", sharepoint: "depuis un CV SharePoint", manuel: "à la main" }[source] });
  return ev.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);
}
