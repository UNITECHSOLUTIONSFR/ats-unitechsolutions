import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";
import { etatBudgetMois } from "@/lib/ai/journal";
import { TACHES } from "@/lib/sync/taches";

/** Délai au-delà duquel un traitement automatique est considéré « en retard ». */
const ATTENDU_HEURES: Record<string, number> = { synchro_excel: 26, synchro_cv: 26, synchro_emails: 2 };

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

  return (
    <div className="space-y-6">
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
