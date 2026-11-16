import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActivitePersonne { id: string; nom: string; role: string; recherches: number; consultations: number; fichesConsultees: number; ajouts: number; modifications: number }
export interface ActiviteJour { jour: string; recherches: number; consultations: number; ajouts: number }

/** Minuit à Paris (heure d'hiver/été) pour la date donnée, en ISO. */
export function debutJourParis(date: Date): Date {
  const jour = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(date); // AAAA-MM-JJ
  const midiUTC = new Date(`${jour}T12:00:00Z`);
  const heureParis = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(midiUTC));
  return new Date(Date.parse(`${jour}T00:00:00Z`) - (heureParis - 12) * 3_600_000);
}
export const jourParis = (iso: string) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));

type Ligne = { utilisateur_id: string | null; action: string; consultant_id: string | null; details: Record<string, unknown> | null; created_at: string };

/**
 * Activité de l'équipe depuis le journal d'accès : recherches, fiches consultées, fiches ajoutées (saisie ou import), modifications.
 * Par personne pour la période, et jour par jour.
 */
export async function activiteEquipe(supabase: SupabaseClient, joursEnArriere: number): Promise<{ personnes: ActivitePersonne[]; jours: ActiviteJour[] }> {
  const depuis = debutJourParis(new Date(Date.now() - joursEnArriere * 86_400_000));
  const lignes: Ligne[] = [];
  for (let a = 0; ; a += 1000) {
    const { data } = await supabase.from("journal_acces").select("utilisateur_id, action, consultant_id, details, created_at")
      .gte("created_at", depuis.toISOString()).in("action", ["recherche", "consultation", "creation", "modification"]).order("created_at").range(a, a + 999);
    lignes.push(...((data ?? []) as Ligne[]));
    if (!data || data.length < 1000) break;
  }
  const { data: utilisateurs } = await supabase.from("utilisateurs").select("id, nom_affiche, email, role, actif").order("nom_affiche");
  const parPersonne = new Map<string, ActivitePersonne & { _vues: Set<string> }>();
  for (const u of utilisateurs ?? []) {
    if (!u.actif) continue;
    parPersonne.set(u.id, { id: u.id, nom: u.nom_affiche || u.email.split("@")[0], role: u.role, recherches: 0, consultations: 0, fichesConsultees: 0, ajouts: 0, modifications: 0, _vues: new Set() });
  }
  const parJour = new Map<string, ActiviteJour>();
  for (const l of lignes) {
    const p = l.utilisateur_id ? parPersonne.get(l.utilisateur_id) : undefined;
    const j = jourParis(l.created_at);
    const jour = parJour.get(j) ?? { jour: j, recherches: 0, consultations: 0, ajouts: 0 };
    parJour.set(j, jour);
    // Import d'un fichier : le nombre de fiches créées est noté dans le journal.
    const crees = l.action === "modification" && typeof l.details?.crees === "number" ? (l.details.crees as number) : 0;
    if (l.action === "recherche") { jour.recherches++; if (p) p.recherches++; }
    else if (l.action === "consultation") { jour.consultations++; if (p) { p.consultations++; if (l.consultant_id) p._vues.add(l.consultant_id); } }
    else if (l.action === "creation" || crees) { const n = l.action === "creation" ? 1 : crees; jour.ajouts += n; if (p) p.ajouts += n; }
    else if (l.action === "modification" && p) p.modifications++;
  }
  const personnes = [...parPersonne.values()].map(({ _vues, ...p }) => ({ ...p, fichesConsultees: _vues.size }))
    .sort((a, b) => b.recherches + b.consultations + b.ajouts - (a.recherches + a.consultations + a.ajouts) || a.nom.localeCompare(b.nom, "fr"));
  return { personnes, jours: [...parJour.values()].sort((a, b) => b.jour.localeCompare(a.jour)) };
}
