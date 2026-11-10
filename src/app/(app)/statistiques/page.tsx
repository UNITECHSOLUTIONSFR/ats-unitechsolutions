import { exigerUtilisateur } from "@/lib/acces";
import { lireTout } from "@/lib/supabase/pages";

const SOURCES: Record<string, string> = { email: "Candidatures email", sharepoint: "CV SharePoint", manuel: "Saisie à la main", api: "API" };
const ETAPES: [string, string][] = [["propose", "Proposés"], ["appele", "Appelés"], ["envoye_client", "Envoyés au client"], ["retenu", "Retenus"], ["refuse", "Refusés"]];
const SEMAINES = 12;

/** Statistiques simples : arrivée des profils, sources, suivi des propositions, missions. */
export default async function Statistiques() {
  const { supabase } = await exigerUtilisateur();
  const maintenant = instant();
  const debut = lundi(maintenant - (SEMAINES - 1) * 7 * 86_400_000);
  const [nouveaux, { data: props }, { data: missions }, { data: historique }] = await Promise.all([
    lireTout<{ created_at: string; source: string }>((a, b) => supabase.from("consultants").select("created_at, source").neq("source", "import_excel").gte("created_at", new Date(debut).toISOString()).range(a, b)),
    supabase.from("propositions").select("statut").limit(10000),
    supabase.from("missions").select("id, statut, created_at"),
    supabase.from("propositions_historique").select("nouveau_statut, created_at, propositions(mission_id)").eq("nouveau_statut", "envoye_client").limit(5000),
  ]);

  // Nouveaux profils par semaine (lundi → dimanche)
  const semaines = Array.from({ length: SEMAINES }, (_, i) => ({ debut: debut + i * 7 * 86_400_000, n: 0 }));
  for (const c of nouveaux) {
    const i = Math.floor((Date.parse(c.created_at) - debut) / (7 * 86_400_000));
    if (i >= 0 && i < SEMAINES) semaines[i].n++;
  }
  const maxSemaine = Math.max(1, ...semaines.map((s) => s.n));
  const sources = Object.entries(nouveaux.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.source]: (acc[c.source] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const parStatut = (props ?? []).reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.statut]: (acc[p.statut] ?? 0) + 1 }), {});
  const maxStatut = Math.max(1, ...Object.values(parStatut));
  const ms = (missions ?? []).reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.statut]: (acc[m.statut] ?? 0) + 1 }), {});
  // Délai entre la création d'une mission et le premier profil envoyé au client
  const creation = new Map((missions ?? []).map((m) => [m.id, Date.parse(m.created_at)]));
  const premierEnvoi = new Map<string, number>();
  for (const h of historique ?? []) {
    const id = (h.propositions as unknown as { mission_id: string } | null)?.mission_id;
    if (!id) continue;
    const t = Date.parse(h.created_at);
    if (!premierEnvoi.has(id) || t < premierEnvoi.get(id)!) premierEnvoi.set(id, t);
  }
  const delais = [...premierEnvoi].filter(([id]) => creation.has(id)).map(([id, t]) => (t - creation.get(id)!) / 86_400_000);
  const delaiMoyen = delais.length ? delais.reduce((s, d) => s + d, 0) / delais.length : null;
  const total30 = nouveaux.filter((c) => Date.parse(c.created_at) > maintenant - 30 * 86_400_000).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titre-page">Statistiques</h1>
        <p className="sous-titre mt-1">Profils arrivés hors import initial, suivi des propositions et missions.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tuile titre="Nouveaux profils (30 jours)" valeur={total30.toLocaleString("fr-FR")} />
        <Tuile titre="Missions ouvertes / pourvues" valeur={`${ms.ouverte ?? 0} / ${ms.pourvue ?? 0}`} />
        <Tuile titre="Profils retenus par un client" valeur={String(parStatut.retenu ?? 0)} />
        <Tuile titre="Délai moyen avant 1er envoi au client" valeur={delaiMoyen === null ? "—" : `${delaiMoyen.toFixed(1)} j`} />
      </div>

      <section className="carte p-6">
        <h2 className="font-semibold text-nuit">Nouveaux profils par semaine</h2>
        <p className="text-xs text-slate-500">{SEMAINES} dernières semaines · survolez une barre pour le détail</p>
        <div className="mt-5 flex h-48 items-end gap-1.5" role="img" aria-label="Nouveaux profils par semaine">
          {semaines.map((s) => (
            <div key={s.debut} className="group relative flex h-full flex-1 flex-col justify-end" title={`Semaine du ${new Date(s.debut).toLocaleDateString("fr-FR")} : ${s.n} profil(s)`}>
              <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-nuit px-2 py-0.5 text-xs text-white group-hover:block">{s.n}</span>
              <div className="rounded-t-[4px] bg-marque-500 transition group-hover:bg-marque-600" style={{ height: `${(s.n / maxSemaine) * 100}%`, minHeight: s.n ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5 border-t border-slate-200 pt-1 text-[11px] tabular-nums text-slate-400">
          {semaines.map((s, i) => <span key={s.debut} className="flex-1 text-center">{i % 2 === 0 ? new Date(s.debut).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : ""}</span>)}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="carte p-6">
          <h2 className="font-semibold text-nuit">D&apos;où viennent les profils</h2>
          <p className="text-xs text-slate-500">{SEMAINES} dernières semaines</p>
          <Barres lignes={sources.map(([k, n]) => [SOURCES[k] ?? k, n])} />
        </section>
        <section className="carte p-6">
          <h2 className="font-semibold text-nuit">Suivi des propositions</h2>
          <p className="text-xs text-slate-500">Statut actuel de chaque consultant suivi sur une mission</p>
          <Barres lignes={ETAPES.map(([k, l]) => [l, parStatut[k] ?? 0])} max={maxStatut} />
        </section>
      </div>
    </div>
  );
}

function Tuile({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="carte p-5">
      <div className="text-3xl font-bold tracking-tight text-nuit tabular-nums">{valeur}</div>
      <div className="text-sm text-slate-500">{titre}</div>
    </div>
  );
}

/** Barres horizontales d'une seule couleur, valeur écrite à droite. */
function Barres({ lignes, max }: { lignes: [string, number][]; max?: number }) {
  const m = max ?? Math.max(1, ...lignes.map(([, n]) => n));
  if (!lignes.length) return <p className="mt-4 text-sm text-slate-500">Pas encore de données.</p>;
  return (
    <ul className="mt-4 space-y-2.5 text-sm">
      {lignes.map(([libelle, n]) => (
        <li key={libelle} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3" title={`${libelle} : ${n}`}>
          <span className="truncate text-slate-600">{libelle}</span>
          <span className="h-2.5 rounded-full bg-slate-100"><span className="block h-full rounded-full bg-marque-500" style={{ width: `${(n / m) * 100}%` }} /></span>
          <span className="text-right font-semibold tabular-nums text-nuit">{n.toLocaleString("fr-FR")}</span>
        </li>
      ))}
    </ul>
  );
}

/** Lundi 0 h (UTC) de la semaine contenant cet instant. */
function lundi(t: number): number {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime();
}

/** Instant présent (fonction à part : le calcul de l'écran reste prévisible). */
function instant(): number {
  return Date.now();
}
