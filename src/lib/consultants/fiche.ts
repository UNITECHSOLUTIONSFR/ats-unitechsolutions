import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { journaliser } from "@/lib/acces";
import { formaterTelephone } from "@/lib/metier/telephone";

export interface FicheResume {
  id: string;
  prenom: string;
  nom: string;
  trigramme: string;
  statut: string;
  intitule_poste: string | null;
  telephone: string;
  email: string | null;
  email_2: string | null;
  localisation: string | null;
  mobilite: string | null;
  disponibilite: string | null;
  disponibilite_maj_le: string | null;
  linkedin: string | null;
  notes: string | null;
  resume: string | null;
  annees_experience: number | null;
  seniorite: string | null;
  competences: { nom: string; annees: number | null }[];
  /** type « email » : CV reçu par email (le lien ouvre l'email dans Outlook). */
  documents: { type: string; nom: string; url: string | null }[];
  /** CV Unitech le plus récent : PDF s'il a été produit, sinon Word. */
  cvUnitech: { url: string; pdf: boolean } | null;
  propositions: { mission_id: string; mission: string; statut: string; score: number | null }[];
  alertes: string[];
  /** Missions ouvertes sur lesquelles il n'est pas encore proposé (bouton « Proposer sur une mission »). */
  missionsOuvertes: { id: string; intitule: string; client: string | null }[];
  /** Notes rapides de l'équipe, les plus récentes d'abord. */
  notesEquipe: { id: string; texte: string; date: string; auteur: string; moi: boolean }[];
}

/** Fiche complète d'un consultant, pour le panneau latéral de l'écran Consultants (servie par /api/fiche/[id]). La consultation est journalisée. */
export async function chargerFiche(supabase: SupabaseClient, utilisateurId: string | null, id: string): Promise<FicheResume | null> {
  // Toutes les lectures en même temps.
  const [{ data: c }, { data: profil }, { data: comp }, { data: docs }, { data: props }, { data: alertes }, { data: ouvertes }, { data: notes }, { data: unitech }] = await Promise.all([
    supabase.from("consultants").select("*").eq("id", id).maybeSingle(),
    supabase.from("profils").select("resume, annees_experience, seniorite").eq("consultant_id", id).maybeSingle(),
    supabase.from("consultant_competences").select("annees, competences(nom_canonique)").eq("consultant_id", id).order("annees", { ascending: false, nullsFirst: false }),
    supabase.from("documents").select("type, nom_fichier, url_web, modifie_sharepoint_le, sharepoint_drive_id").eq("consultant_id", id).eq("supprime_sharepoint", false).order("modifie_sharepoint_le", { ascending: false }),
    supabase.from("propositions").select("mission_id, statut, score, missions(intitule)").eq("consultant_id", id).order("updated_at", { ascending: false }),
    supabase.from("alertes").select("type").eq("consultant_id", id).eq("statut", "ouverte").not("type", "in", "(association_douteuse)"),
    supabase.from("missions").select("id, intitule, client").eq("statut", "ouverte").order("created_at", { ascending: false }),
    supabase.from("notes_consultant").select("id, texte, created_at, auteur").eq("consultant_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("cv_unitech_generes").select("word_url, pdf_url").eq("consultant_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // Noms des auteurs (un recruteur ne lit pas la table des utilisateurs : liste des personnes invitées).
  const { data: personnes } = notes?.length ? await supabase.rpc("responsables_possibles") : { data: [] };
  const nomDe = new Map(((personnes ?? []) as { id: string; nom: string }[]).map((p) => [p.id, p.nom]));

  if (!c) return null;
  if (utilisateurId) await journaliser(supabase, utilisateurId, "consultation", id, { ecran: "panneau" });
  return {
    id: c.id, prenom: c.prenom, nom: c.nom, trigramme: c.trigramme, statut: c.statut,
    intitule_poste: c.intitule_poste, telephone: formaterTelephone(c.telephone_e164) || c.telephone_brut || "",
    email: c.email, email_2: c.email_2, localisation: c.localisation, mobilite: c.mobilite ?? null, disponibilite: c.disponible_le ?? c.disponibilite,
    disponibilite_maj_le: c.disponibilite_maj_le, linkedin: c.linkedin, notes: c.notes,
    resume: profil?.resume ?? null, annees_experience: profil?.annees_experience ?? null, seniorite: profil?.seniorite ?? null,
    competences: (comp ?? []).map((k) => ({ nom: (k.competences as unknown as { nom_canonique: string } | null)?.nom_canonique ?? "?", annees: k.annees })),
    cvUnitech: unitech ? { url: (unitech.pdf_url ?? unitech.word_url) as string, pdf: !!unitech.pdf_url } : null,
    documents: (docs ?? []).filter((d) => !String(d.sharepoint_drive_id).startsWith("boite:") || d.url_web?.includes("sharepoint.com"))
      .map((d) => ({ type: String(d.sharepoint_drive_id).startsWith("boite:") ? "email" : d.type, nom: d.nom_fichier, url: d.url_web })),
    propositions: (props ?? []).map((p) => ({
      mission_id: p.mission_id, statut: p.statut, score: p.score,
      mission: (p.missions as unknown as { intitule: string } | null)?.intitule ?? "Mission",
    })),
    alertes: [...new Set((alertes ?? []).map((a) => a.type as string))],
    missionsOuvertes: (ouvertes ?? []).filter((m) => !(props ?? []).some((p) => p.mission_id === m.id)),
    notesEquipe: (notes ?? []).map((n) => ({ id: n.id, texte: n.texte, date: n.created_at, auteur: (n.auteur && nomDe.get(n.auteur)) || "—", moi: n.auteur === utilisateurId })),
  };
}
