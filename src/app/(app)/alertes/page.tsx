import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { traiterAlertes } from "@/lib/alertes/actions";
import { ALERTES_TECHNIQUES, alerteVisible, detailAlerte, LIBELLES_ALERTES } from "@/lib/alertes/libelles";

export default async function Alertes({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const estAdmin = utilisateur.role === "admin";
  const { type } = await searchParams;
  let q = supabase.from("alertes").select("id, type, details, created_at, consultant_id, consultants(prenom, nom, trigramme)")
    .eq("statut", "ouverte").order("created_at", { ascending: false }).limit(300);
  if (type) q = q.eq("type", type);
  // Les recruteurs ne voient pas les alertes techniques.
  if (!estAdmin) q = q.not("type", "in", `(${ALERTES_TECHNIQUES.join(",")})`);
  const [{ data: alertes }, { data: tous }] = await Promise.all([q, supabase.from("alertes").select("type").eq("statut", "ouverte")]);
  const toutes = (tous ?? []).filter((a) => alerteVisible(a.type, estAdmin));
  const parType = new Map<string, number>();
  for (const a of toutes ?? []) parType.set(a.type, (parType.get(a.type) ?? 0) + 1);

  const ICONES: Record<string, string> = { doublon_possible: "👥", telephone_invalide: "☎", nom_manquant: "❓", cv_illisible: "📄", association_douteuse: "🔗", disponibilite_ancienne: "⏳", autre: "✎" };

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-nuit">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm ring-1 ring-slate-200">!</span>
        Cas à vérifier
      </h1>
      <nav className="flex gap-6 overflow-x-auto border-b border-slate-200/80">
        {[[undefined, "Tous", toutes?.length ?? 0] as const, ...[...parType].sort((a, b) => b[1] - a[1]).map(([t, n]) => [t, LIBELLES_ALERTES[t] ?? t, n] as const)].map(([t, libelle, n]) => (
          <Link key={t ?? "tous"} href={t ? `/alertes?type=${t}` : "/alertes"} className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-[15px] font-semibold transition ${type === t ? "border-marque-600 text-nuit" : "border-transparent text-slate-500 hover:text-nuit"}`}>
            {libelle}<span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${type === t ? "bg-marque-50 text-marque-700" : "bg-slate-100 text-slate-500"}`}>{n}</span>
          </Link>
        ))}
      </nav>
      <form action={traiterAlertes} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Cochez des cas puis :</span>
          <button name="action" value="resolue:selection" className="bouton-secondaire">Marquer résolus</button>
          <button name="action" value="ignoree:selection" className="bouton-secondaire">Ignorer</button>
        </div>
        <ul className="space-y-2">
          {(alertes ?? []).map((a) => {
            const c = a.consultants as unknown as { prenom: string; nom: string; trigramme: string } | null;
            const fusion = estAdmin && a.type === "doublon_possible" && a.consultant_id ? ((a.details as { fiches_existantes?: string[] })?.fiches_existantes ?? [])[0] : undefined;
            return (
              <li key={a.id} className="carte flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                <input type="checkbox" name="ids" value={a.id} className="h-4 w-4 accent-marque-600" aria-label="Sélectionner" />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-base ring-1 ring-amber-100" aria-hidden>{ICONES[a.type] ?? "!"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {c ? <Link href={`/consultants/${a.consultant_id}`} className="font-semibold text-nuit hover:text-marque-700">{c.prenom} {c.nom}</Link> : <span className="font-semibold text-slate-500">Sans fiche</span>}
                    {c && <span className="font-mono text-xs text-slate-400">{c.trigramme}</span>}
                    <span className="text-xs font-medium text-amber-700">{LIBELLES_ALERTES[a.type] ?? a.type}</span>
                    <span className="text-xs text-slate-400">· {new Date(a.created_at).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <div className="truncate text-slate-500">{detailAlerte(a.details as Record<string, unknown>, estAdmin)}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {fusion && <Link href={`/alertes/fusion?a=${a.consultant_id}&b=${fusion}`} className="bouton-primaire py-1.5 text-xs">Comparer</Link>}
                  <button name="action" value={`resolue:${a.id}`} className="bouton-secondaire text-xs">✓ Résolu</button>
                  <button name="action" value={`ignoree:${a.id}`} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-nuit">Ignorer</button>
                </div>
              </li>
            );
          })}
          {!alertes?.length && <li className="carte p-10 text-center text-sm text-slate-500">Rien à vérifier. 🎉</li>}
        </ul>
      </form>
    </div>
  );
}
