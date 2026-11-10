import { exigerAdmin } from "@/lib/acces-admin";
import { PONDERATIONS_PAR_DEFAUT, type Ponderations } from "@/lib/matching/score";
import FormulaireReglages from "./formulaire";

const USAGES: Record<string, string> = { fiche_cv: "Lecture des CV", mission: "Analyse des fiches de poste", tri_email: "Tri des emails", analyse_approfondie: "Analyse approfondie" };

export default async function CoutsEtReglages() {
  const { supabase } = await exigerAdmin();
  const debutMois = new Date(); debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
  const debutPrecedent = new Date(debutMois); debutPrecedent.setUTCMonth(debutPrecedent.getUTCMonth() - 1);
  const [{ data: usages }, { data: reglages }] = await Promise.all([
    supabase.from("ai_usage").select("usage, cout_estime_usd, created_at").gte("created_at", debutPrecedent.toISOString()),
    supabase.from("reglages").select("cle, valeur"),
  ]);
  const r = new Map((reglages ?? []).map((x) => [x.cle, x.valeur]));
  const plafond = Number(r.get("plafond_ia_mensuel_usd") ?? 25);
  const ponderations = { ...PONDERATIONS_PAR_DEFAUT, ...((r.get("ponderations_score") as Partial<Ponderations>) ?? {}) };
  const seuil = Number(r.get("seuil_alerte_nouvelle_fiche") ?? 70);

  const ceMois = new Map<string, number>(); let totalMois = 0, totalPrecedent = 0, appels = 0;
  for (const u of usages ?? []) {
    const c = Number(u.cout_estime_usd);
    if (u.created_at >= debutMois.toISOString()) { ceMois.set(u.usage, (ceMois.get(u.usage) ?? 0) + c); totalMois += c; appels++; }
    else totalPrecedent += c;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <section className="carte space-y-3 p-5">
        <h2 className="font-semibold">Coûts de l&apos;IA</h2>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div><div className="text-2xl font-semibold">{totalMois.toFixed(2)} $</div><div className="text-zinc-500">ce mois-ci ({appels} appels)</div></div>
          <div><div className="text-2xl font-semibold">{plafond} $</div><div className="text-zinc-500">plafond mensuel</div></div>
          <div><div className="text-2xl font-semibold">{totalPrecedent.toFixed(2)} $</div><div className="text-zinc-500">mois précédent</div></div>
        </div>
        <div className="h-2 rounded-full bg-slate-200/60"><div className="h-2 rounded-full bg-gradient-to-r from-marque-600 to-marque-400" style={{ width: `${Math.min(100, (totalMois / Math.max(plafond, 0.01)) * 100)}%` }} /></div>
        <ul className="text-sm text-zinc-600">
          {[...ceMois].map(([u, c]) => <li key={u}>{USAGES[u] ?? u} : {c.toFixed(3)} $</li>)}
        </ul>
        <p className="text-xs text-zinc-500">Au-delà du plafond, les traitements non urgents (lecture des CV, emails) s&apos;arrêtent jusqu&apos;au mois suivant. Les fiches de poste restent analysées.</p>
      </section>
      <FormulaireReglages plafond={plafond} ponderations={ponderations} seuil={seuil} />
    </div>
  );
}
