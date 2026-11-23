/**
 * Matching v3 : calculs purs (testés) — dates, textes comparés, note sur 100 et explication avec preuves.
 * Les seuils sont réglables sans mise en ligne (réglage « matching_v3_seuils ») et calibrés sur la vérification de référence.
 */

export interface SeuilsV3 {
  /** Proximité de métier minimale, quelle que soit la mission. */
  metierMin: number;
  /** Écart toléré sous les meilleurs profils de la mission : au-delà, autre métier (le seuil dépend de la mission). */
  metierEcart: number;
  /** Proximité de sens exigence ↔ expérience en dessous de laquelle l'exigence ne compte pas. */
  exigenceMin: number;
  /** Proximité de sens à partir de laquelle l'exigence est prouvée (sans le mot exact). */
  exigencePreuve: number;
  /** Part du métier dans la note (le reste : les exigences). */
  partMetier: number;
}

export const SEUILS_V3: SeuilsV3 = { metierMin: 0.55, metierEcart: 0.07, exigenceMin: 0.35, exigencePreuve: 0.55, partMetier: 0.4 };

/** Ce que la mission rend possible dans la base : seuil de métier et exigences qu'au moins un CV peut prouver. */
export interface ContexteV3 { metierSeuil: number; metierHaut: number; exigencesUtiles: Set<number> }

export function contexteMission(lignes: LigneV3[], s: SeuilsV3 = SEUILS_V3): ContexteV3 {
  const tri = lignes.map((l) => l.metier_sim).sort((a, b) => b - a);
  // Haut de la mission : 3e meilleur profil (un seul CV atypique ne fixe pas la barre).
  const haut = tri[Math.min(2, tri.length - 1)] ?? 0;
  const utiles = new Set<number>();
  for (const l of lignes) for (const e of l.exigences ?? []) if (e.x || Number(e.s) >= s.exigencePreuve) utiles.add(e.ordre);
  return { metierSeuil: Math.max(s.metierMin, haut - s.metierEcart), metierHaut: haut, exigencesUtiles: utiles };
}

export interface ExigenceV3 { ordre: number; libelle: string; poids: number; s: number; x?: boolean; role: string | null; entreprise: string | null; debut: string | null; fin: string | null; duree_mois: number | null }
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
 * Note sur 100 d'un profil pour une mission, avec l'explication. Autre métier (sous le seuil de la mission) = écarté.
 * Une exigence est prouvée par une expérience qui la cite (mot exact) ou qui en est très proche par le sens. Une exigence
 * qu'aucun CV de la base ne peut prouver (contexte propre au client) n'est pas comptée. Obligatoire non prouvée = 55 au plus.
 */
export function noterV3(l: LigneV3, anneesMin: number | null, s: SeuilsV3 = SEUILS_V3, ctx?: ContexteV3): {
  note: number; memeMetier: boolean; raison: string; recapitulatif: string; analyse: { exigence: string; atteint: boolean; explication: string }[];
} {
  const seuil = ctx?.metierSeuil ?? s.metierMin;
  const haut = Math.max(ctx?.metierHaut ?? seuil + 0.1, seuil + 0.02);
  const memeMetier = l.metier_sim >= seuil;
  const m = borne((l.metier_sim - seuil) / (haut - seuil));
  const exig = (l.exigences ?? []).filter((e) => !ctx || ctx.exigencesUtiles.has(e.ordre));
  const totalPoids = exig.reduce((t, e) => t + Number(e.poids), 0);
  const parts = exig.map((e) => {
    const prouve = !!e.x || Number(e.s) >= s.exigencePreuve;
    return { e, prouve, f: prouve ? 1 : borne((Number(e.s) - s.exigenceMin) / (s.exigencePreuve - s.exigenceMin)) * 0.6 };
  });
  const partExig = totalPoids ? parts.reduce((t, p) => t + Number(p.e.poids) * p.f, 0) / totalPoids : m;
  let note = Math.round(100 * (s.partMetier * (memeMetier ? 0.5 + 0.5 * m : 0) + (1 - s.partMetier) * partExig));
  if (parts.some((p) => Number(p.e.poids) >= 3 && !p.prouve)) note = Math.min(note, 55);
  if (anneesMin && l.annees != null && l.annees + 1 < anneesMin) note = Math.max(0, note - 10);
  if (!memeMetier) note = Math.min(note, 30);
  const prouvees = parts.filter((p) => p.prouve).length;
  const ignorees = (l.exigences ?? []).length - exig.length;
  const analyse = parts.map(({ e, prouve }) => ({
    exigence: e.libelle,
    atteint: prouve,
    explication: prouve
      ? `${e.x ? "Cité dans" : "Prouvé par"} : ${e.role ?? "une expérience"}${e.entreprise ? ` chez ${e.entreprise}` : ""}${periode(e.debut, e.fin) ? ` (${periode(e.debut, e.fin)}${e.duree_mois ? `, ${Math.max(1, Math.round(e.duree_mois / 12))} an(s)` : ""})` : ""}.`
      : `Aucune expérience ne le montre clairement${e.role ? ` (au plus proche : ${e.role}${e.entreprise ? ` chez ${e.entreprise}` : ""})` : ""}.`,
  }));
  const recapitulatif = [
    memeMetier ? `Même métier : ${l.metier_role ?? "poste récent"}.` : `Autre métier : ${l.metier_role ?? "non déterminé"}.`,
    exig.length ? `${prouvees} exigence(s) sur ${exig.length} prouvée(s) par une expérience.` : "",
    ignorees > 0 ? `${ignorees} exigence(s) propre(s) au client, trouvée(s) dans aucun CV de la base, non comptée(s).` : "",
    l.annees != null ? `${Math.round(l.annees)} an(s) d'expérience d'après le CV${anneesMin ? ` (demandé : ${anneesMin})` : ""}.` : "",
  ].filter(Boolean).join(" ");
  const raison = memeMetier ? `${prouvees}/${exig.length} exigences prouvées · ${l.metier_role ?? "métier proche"}` : `Autre métier : ${l.metier_role ?? "non déterminé"}`;
  return { note, memeMetier, raison, recapitulatif, analyse };
}
