/**
 * Matching v3 : calculs purs (testés) — dates, textes comparés, note sur 100 et explication avec preuves.
 * Les seuils sont réglables sans mise en ligne (réglage « matching_v3_seuils ») et calibrés sur la vérification de référence.
 */

export interface SeuilsV3 {
  /** Proximité de métier en dessous de laquelle le profil est d'un autre métier (écarté d'office). */
  metierMin: number;
  /** Proximité de métier à partir de laquelle le métier compte en entier. */
  metierPlein: number;
  /** Proximité exigence ↔ expérience en dessous de laquelle l'exigence ne compte pas du tout. */
  exigenceMin: number;
  /** Proximité à partir de laquelle l'exigence est prouvée. */
  exigencePreuve: number;
  /** Part du métier dans la note (le reste : les exigences). */
  partMetier: number;
}

export const SEUILS_V3: SeuilsV3 = { metierMin: 0.5, metierPlein: 0.68, exigenceMin: 0.45, exigencePreuve: 0.58, partMetier: 0.35 };

export interface ExigenceV3 { ordre: number; libelle: string; poids: number; s: number; role: string | null; entreprise: string | null; debut: string | null; fin: string | null; duree_mois: number | null }
export interface LigneV3 { consultant_id: string; metier_sim: number; metier_role: string | null; exigences: ExigenceV3[]; annees: number | null }

/** « 2021-03 », « 2021 », « 03/2021 » → « 2021-03-01 » ; « en cours » ou illisible → null. */
export function dateISO(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01-01`;
  return null;
}

/** Durée en mois entre deux dates AAAA-MM-JJ (fin absente = aujourd'hui) ; null sans début. */
export function dureeMois(debut: string | null, fin: string | null, aujourdhui = new Date()): number | null {
  if (!debut) return null;
  const d = new Date(debut), f = fin ? new Date(fin) : aujourdhui;
  const mois = (f.getUTCFullYear() - d.getUTCFullYear()) * 12 + (f.getUTCMonth() - d.getUTCMonth()) + 1;
  return mois > 0 && mois < 600 ? mois : null;
}

/** Texte d'une expérience comparé aux exigences (sans nom ni coordonnées). */
export function texteExperience(e: { role: string; metier: string | null; entreprise: string | null; technologies: string[]; responsabilites: string }): string {
  return [`${e.role}${e.metier && e.metier.toLowerCase() !== e.role.toLowerCase() ? ` (${e.metier})` : ""}${e.entreprise ? ` chez ${e.entreprise}` : ""}`,
    e.responsabilites, e.technologies.length ? `Technologies : ${e.technologies.join(", ")}` : ""].filter(Boolean).join("\n");
}

/** Texte résumant le métier réel d'un consultant (pour son empreinte de dossier). */
export function texteDossier(metier: string | null, metiers: string[], experiences: { role: string; metier: string | null; debut: string | null; fin: string | null }[]): string {
  const roles = experiences.slice(0, 6).map((x) => `${x.role}${x.metier ? ` (${x.metier})` : ""}${periode(x.debut, x.fin) ? `, ${periode(x.debut, x.fin)}` : ""}`);
  return [`Métier : ${metier ?? "inconnu"}`, metiers.length ? `Métiers exercés : ${metiers.join(", ")}` : "", roles.length ? `Postes récents : ${roles.join(" ; ")}` : ""].filter(Boolean).join("\n");
}

/** Années d'expérience : périodes qui se chevauchent comptées une seule fois (missions en parallèle). */
export function anneesSansChevauchement(xs: { debut: string | null; fin: string | null }[], aujourdhui = new Date()): number | null {
  const p = xs.filter((x) => x.debut).map((x) => [Date.parse(x.debut!), x.fin ? Date.parse(x.fin) + 31 * 86_400_000 : aujourdhui.getTime()] as const)
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  if (!p.length) return null;
  let total = 0, [a, b] = p[0];
  for (const [c, d] of p.slice(1)) { if (c <= b) b = Math.max(b, d); else { total += b - a; [a, b] = [c, d]; } }
  total += b - a;
  return Math.round((total / (365.25 * 86_400_000)) * 10) / 10;
}

export function periode(debut: string | null, fin: string | null): string {
  const a = (d: string | null) => d?.slice(0, 4) ?? null;
  if (!a(debut)) return fin ? `jusqu'en ${a(fin)}` : "";
  return fin ? (a(debut) === a(fin) ? `${a(debut)}` : `${a(debut)} – ${a(fin)}`) : `depuis ${a(debut)}`;
}

const borne = (x: number) => Math.max(0, Math.min(1, x));
const pct = (s: number) => `${Math.round(s * 100)} %`;

/**
 * Note sur 100 d'un profil pour une mission, avec l'explication : métier (part fixe) + exigences pondérées (prouvées
 * par une expérience). Autre métier = écarté d'office. Exigence obligatoire (poids 3) non prouvée = 55 au plus.
 */
export function noterV3(l: LigneV3, anneesMin: number | null, s: SeuilsV3 = SEUILS_V3): {
  note: number; memeMetier: boolean; raison: string; recapitulatif: string; analyse: { exigence: string; atteint: boolean; explication: string }[];
} {
  const memeMetier = l.metier_sim >= s.metierMin;
  const m = borne((l.metier_sim - s.metierMin) / (s.metierPlein - s.metierMin));
  const exig = l.exigences ?? [];
  const totalPoids = exig.reduce((t, e) => t + Number(e.poids), 0);
  const parts = exig.map((e) => ({ e, f: borne((Number(e.s) - s.exigenceMin) / (s.exigencePreuve - s.exigenceMin)), prouve: Number(e.s) >= s.exigencePreuve }));
  const partExig = totalPoids ? parts.reduce((t, p) => t + Number(p.e.poids) * p.f, 0) / totalPoids : m;
  let note = Math.round(100 * (s.partMetier * m + (1 - s.partMetier) * partExig));
  if (parts.some((p) => Number(p.e.poids) >= 3 && !p.prouve)) note = Math.min(note, 55);
  if (anneesMin && l.annees != null && l.annees + 1 < anneesMin) note = Math.max(0, note - 10);
  if (!memeMetier) note = Math.min(note, 30);
  const prouvees = parts.filter((p) => p.prouve).length;
  const analyse = parts.map(({ e, prouve }) => ({
    exigence: e.libelle,
    atteint: prouve,
    explication: prouve
      ? `Prouvé par : ${e.role ?? "une expérience"}${e.entreprise ? ` chez ${e.entreprise}` : ""}${periode(e.debut, e.fin) ? ` (${periode(e.debut, e.fin)}${e.duree_mois ? `, ${Math.max(1, Math.round(e.duree_mois / 12))} an(s)` : ""})` : ""}.`
      : `Aucune expérience ne le montre clairement${e.role ? ` (au plus proche : ${e.role}${e.entreprise ? ` chez ${e.entreprise}` : ""})` : ""}.`,
  }));
  const recapitulatif = [
    memeMetier ? `Même métier : ${l.metier_role ?? "poste récent"} (proximité ${pct(l.metier_sim)}).` : `Autre métier : ${l.metier_role ?? "non déterminé"} (proximité ${pct(l.metier_sim)}).`,
    exig.length ? `${prouvees} exigence(s) sur ${exig.length} prouvée(s) par une expérience.` : "",
    l.annees != null ? `${Math.round(l.annees)} an(s) d'expérience d'après le CV${anneesMin ? ` (demandé : ${anneesMin})` : ""}.` : "",
  ].filter(Boolean).join(" ");
  const raison = memeMetier ? `${prouvees}/${exig.length} exigences prouvées · ${l.metier_role ?? "métier proche"}` : `Autre métier : ${l.metier_role ?? "non déterminé"}`;
  return { note, memeMetier, raison, recapitulatif, analyse };
}
