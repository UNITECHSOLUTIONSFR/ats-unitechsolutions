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

export interface FicheAjoutee {
  id: string; prenom: string; nom: string; trigramme: string; intitule_poste: string | null; telephone_e164: string | null;
  email: string | null; source: string; created_at: string; par: string | null;
}

/**
 * Fiches ajoutées par une personne (ou par toute l'équipe) sur la période : saisies à la main (journal « création »)
 * et fiches créées par un import de fichier qu'elle a lancé. Mêmes règles que le compteur de l'écran Activité.
 */
export async function fichesAjoutees(supabase: SupabaseClient, joursEnArriere: number, utilisateurId?: string): Promise<FicheAjoutee[]> {
  const depuis = debutJourParis(new Date(Date.now() - joursEnArriere * 86_400_000)).toISOString();
  let creations = supabase.from("journal_acces").select("consultant_id, utilisateur_id").eq("action", "creation").gte("created_at", depuis).not("consultant_id", "is", null).limit(5000);
  // Imports de fichier : une ligne de journal par import (avec le nombre de fiches créées) ; les fiches créées par l'import
  // sont celles d'origine « import de fichier » créées dans les 30 minutes qui précèdent cette ligne.
  let imports = supabase.from("journal_acces").select("utilisateur_id, created_at, details").eq("action", "modification").gte("created_at", depuis).not("details->crees", "is", null).limit(500);
  if (utilisateurId) { creations = creations.eq("utilisateur_id", utilisateurId); imports = imports.eq("utilisateur_id", utilisateurId); }
  const [{ data: c }, { data: i }] = await Promise.all([creations, imports]);
  const auteur = new Map<string, string | null>();
  for (const x of c ?? []) auteur.set(x.consultant_id as string, x.utilisateur_id as string | null);
  const fiches: FicheAjoutee[] = [];
  const ids = [...auteur.keys()];
  const COLONNES = "id, prenom, nom, trigramme, intitule_poste, telephone_e164, email, source, created_at";
  for (let k = 0; k < ids.length; k += 300) {
    const { data } = await supabase.from("consultants").select(COLONNES).in("id", ids.slice(k, k + 300)).gte("created_at", depuis);
    for (const f of data ?? []) fiches.push({ ...(f as Omit<FicheAjoutee, "par">), par: auteur.get(f.id) ?? null });
  }
  const vus = new Set(fiches.map((f) => f.id));
  for (const imp of (i ?? []) as { utilisateur_id: string | null; created_at: string; details: { crees?: number } | null }[]) {
    if (!imp.details?.crees) continue;
    const fin = imp.created_at, debut = new Date(Date.parse(fin) - 30 * 60_000).toISOString();
    const importees = await lireTousConsultants(supabase, COLONNES, debut, fin);
    for (const f of importees) if (!vus.has(f.id)) { vus.add(f.id); fiches.push({ ...f, par: imp.utilisateur_id }); }
  }
  return fiches.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function lireTousConsultants(supabase: SupabaseClient, colonnes: string, debut: string, fin: string): Promise<Omit<FicheAjoutee, "par">[]> {
  const res: Omit<FicheAjoutee, "par">[] = [];
  for (let a = 0; ; a += 1000) {
    const { data } = await supabase.from("consultants").select(colonnes).eq("source", "import_annexe").gte("created_at", debut).lte("created_at", fin).order("created_at").range(a, a + 999);
    res.push(...((data ?? []) as unknown as Omit<FicheAjoutee, "par">[]));
    if (!data || data.length < 1000) return res;
  }
}
