import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";
import { etatBudgetMois } from "@/lib/ai/journal";
import { TACHES } from "@/lib/sync/taches";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";

/** Délai au-delà duquel un traitement automatique est considéré « en retard ». */
const ATTENDU_HEURES: Record<string, number> = { synchro_excel: 26, synchro_cv: 26, synchro_emails: 2, sauvegarde_hebdo: 8 * 24 };

/** Bilan de santé : tout tourne-t-il ? Dernier passage de chaque traitement, erreurs, coûts, cas à vérifier. */
export default async function Sante() {
  const { supabase } = await exigerAdmin();
  const types = Object.values(TACHES).map((t) => t.type).filter((t) => ATTENDU_HEURES[t]);
  const [derniers, budget, { count: alertes }, { count: erreursEmails }, { count: echecs24h }] = await Promise.all([
    Promise.all(types.map(async (t) => ({
      type: t,
      ok: (await supabase.from("executions").select("debut, fin").eq("type", t).eq("statut", "termine").order("debut", { ascending: false }).limit(1).maybeSingle()).data,
    }))),
    etatBudgetMois(),
    supabase.from("alertes").select("id", { count: "exact", head: true }).eq("statut", "ouverte"),
    supabase.from("emails_entrants").select("id", { count: "exact", head: true }).eq("statut", "erreur").gte("recu_le", ilYa(7 * 24)),
    supabase.from("executions").select("id", { count: "exact", head: true }).eq("statut", "echec").gte("debut", ilYa(24)),
  ]);
  const maintenant = Date.parse(new Date().toISOString());
  // Vitesse réelle des écrans (mesurée dans le navigateur de l'équipe), 7 derniers jours.
  const { data: vitesse } = await clientSupabaseAdmin().rpc("vitesse_ecrans_detail", { p_jours: 7 });
  const ecrans = (vitesse ?? []) as { ecran: string; type: string; nombre: number; mediane_ms: number; p90_ms: number }[];
  // Objectifs : écran ouvert en moins de 0,3 s d'habitude et 1 s 9 fois sur 10 ; bouton : 1 s 9 fois sur 10.
  const objectif = (e: (typeof ecrans)[number]) => (e.type === "action" ? { habituel: 1000, p90: 1000 } : { habituel: 300, p90: 1000 });
  const horsObjectif = ecrans.filter((e) => e.nombre >= 3 && e.p90_ms > objectif(e).p90);
  const LIBELLE_TYPE: Record<string, string> = { ouverture: "Ouverture", navigation: "Écran", action: "Bouton" };
  const secondes = (ms: number) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;

  return (
    <div className="space-y-6">
      <section className="carte p-5">
        <h2 className="titre-section">Vitesse des écrans (7 derniers jours)</h2>
        <p className="mt-0.5 text-sm text-slate-500">Temps réels vus par l&apos;équipe sur 7 jours, du clic à l&apos;écran affiché. <b>Objectifs</b> : un écran s&apos;ouvre en moins de 0,3 s d&apos;habitude et en moins d&apos;1 s 9 fois sur 10 ; un bouton répond en moins d&apos;1 s 9 fois sur 10 (les travaux longs, IA ou SharePoint, se font en arrière-plan).</p>
        {horsObjectif.length > 0 && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
            ⚠ {horsObjectif.length} écran(s) ou bouton(s) au-dessus de l&apos;objectif : {horsObjectif.slice(0, 5).map((e) => `${e.ecran} (${secondes(e.p90_ms)})`).join(" · ")}
          </p>
        )}
        {ecrans.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-1.5 pr-4 font-medium">Écran</th><th className="pr-4 font-medium">Type</th><th className="pr-4 font-medium">Nombre</th><th className="pr-4 font-medium">Habituel</th><th className="font-medium">9 fois sur 10</th></tr></thead>
              <tbody>
                {ecrans.map((e) => (
                  <tr key={`${e.ecran}|${e.type}`} className="border-t border-slate-100">
                    <td className="py-1.5 pr-4 font-mono text-xs text-nuit">{e.ecran}</td>
                    <td className="pr-4 text-xs text-slate-500">{LIBELLE_TYPE[e.type] ?? e.type}</td>
                    <td className="pr-4 tabular-nums">{e.nombre}</td>
                    <td className={`pr-4 tabular-nums font-semibold ${e.mediane_ms <= objectif(e).habituel ? "text-emerald-700" : "text-amber-700"}`}>{secondes(e.mediane_ms)}</td>
                    <td className={`tabular-nums ${e.p90_ms <= objectif(e).p90 ? "text-slate-600" : "font-semibold text-red-700"}`}>{secondes(e.p90_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-sm text-slate-500">Pas encore de mesure : elles arrivent dès que l&apos;équipe utilise l&apos;outil.</p>}
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {derniers.map(({ type, ok }) => {
          const libelle = Object.values(TACHES).find((t) => t.type === type)?.libelle ?? type;
          const heures = ok ? (maintenant - Date.parse(ok.debut)) / 3_600_000 : Infinity;
          const bon = heures <= ATTENDU_HEURES[type];
          return (
            <Indicateur key={type} bon={bon} titre={libelle}
              valeur={ok ? `il y a ${heures < 1 ? `${Math.round(heures * 60)} min` : heures < 48 ? `${Math.round(heures)} h` : `${Math.round(heures / 24)} j`}` : "jamais"}
              texte={bon ? "Dernier passage réussi dans les temps." : "En retard : vérifiez Paramètres → Synchronisations."} lien="/parametres/synchronisations" />
          );
        })}
        <Indicateur bon={!echecs24h} titre="Traitements en échec (24 h)" valeur={String(echecs24h ?? 0)} texte={echecs24h ? "Au moins un traitement a échoué." : "Aucun échec."} lien="/parametres/synchronisations" />
        <Indicateur bon={!erreursEmails} titre="Emails en erreur (7 jours)" valeur={String(erreursEmails ?? 0)} texte={erreursEmails ? "Des emails n'ont pas pu être lus." : "Tous les emails ont été lus."} lien="/parametres/emails" />
        <Indicateur bon={!budget.depasse && budget.depense < budget.plafond * 0.8} titre="Coût IA du mois"
          valeur={`${budget.depense.toFixed(2)} $ / ${budget.plafond} $`} texte={budget.depasse ? "Plafond atteint : les analyses sont suspendues." : budget.depense >= budget.plafond * 0.8 ? "Plus de 80 % du plafond." : "Sous le plafond."} lien="/parametres/couts" />
        <Indicateur bon={(alertes ?? 0) < 50} titre="Cas à vérifier" valeur={String(alertes ?? 0)} texte="Doublons possibles, téléphones, CV illisibles…" lien="/alertes" />
      </section>
      <p className="text-xs text-slate-500">Les traitements automatiques tournent chaque nuit (Excel 2 h, CV 2 h 30) et toutes les heures (emails), lancés par GitHub.</p>
    </div>
  );
}

function Indicateur({ bon, titre, valeur, texte, lien }: { bon: boolean; titre: string; valeur: string; texte: string; lien: string }) {
  return (
    <Link href={lien} className="carte-interactive relative overflow-hidden p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${bon ? "bg-emerald-500" : "bg-amber-500"}`} />
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-500">{titre}</div>
        <span className={`pastille ${bon ? "pastille-vert" : "pastille-orange"}`}>{bon ? "OK" : "À regarder"}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-nuit">{valeur}</div>
      <div className="mt-1 text-xs text-slate-500">{texte}</div>
    </Link>
  );
}

function ilYa(heures: number): string {
  return new Date(Date.now() - heures * 3_600_000).toISOString();
}
