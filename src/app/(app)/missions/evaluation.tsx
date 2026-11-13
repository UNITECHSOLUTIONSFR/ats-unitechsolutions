import type { ResultatScore } from "@/lib/matching/score";

/** Niveau d'adéquation : même couleur partout (vert, bleu, gris). */
export function niveauScore(score: number) {
  if (score >= 75) return { libelle: "Très bon profil", couleur: "#059669", fond: "bg-emerald-50", texte: "text-emerald-700", anneau: "ring-emerald-200" };
  if (score >= 50) return { libelle: "À étudier", couleur: "#1f45a3", fond: "bg-marque-50", texte: "text-marque-700", anneau: "ring-marque-100" };
  return { libelle: "Peu adapté", couleur: "#94a3b8", fond: "bg-slate-50", texte: "text-slate-600", anneau: "ring-slate-200" };
}

/** Jauge circulaire : le score en grand au centre, l'anneau rempli à proportion, le niveau en dessous. */
export function JaugeScore({ score, petite, sansLibelle }: { score: number; petite?: boolean; sansLibelle?: boolean }) {
  const n = niveauScore(score);
  const s = Math.round(score);
  const taille = petite ? "h-14 w-14" : "h-20 w-20";
  return (
    <div className="flex shrink-0 flex-col items-center gap-1" title={`${n.libelle} · ${s}/100`}>
      <div className={`relative ${taille} rounded-full`} style={{ background: `conic-gradient(${n.couleur} ${s * 3.6}deg, #e2e8f0 0deg)` }}>
        <div className="absolute inset-[5px] flex flex-col items-center justify-center rounded-full bg-white">
          <span className={`font-extrabold leading-none tabular-nums ${petite ? "text-xl" : "text-[1.75rem]"}`} style={{ color: n.couleur }}>{s}</span>
          <span className="text-[10px] font-medium text-slate-400">/ 100</span>
        </div>
      </div>
      {!sansLibelle && <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${n.fond} ${n.texte}`}>{n.libelle}</span>}
    </div>
  );
}

/** « Pourquoi ce score », en langage clair : ce qui colle, ce qui manque, ce qu'il faut vérifier au téléphone. */
export function ExplicationScore({ resultat }: { resultat: ResultatScore }) {
  const e = resultat.explication;
  // Évaluations enregistrées avant l'explication en clair : on reprend les critères tels quels.
  if (!e) return <ul className="space-y-1 text-sm text-slate-600">{resultat.raisons.filter((r) => r.max).map((r) => <li key={r.critere}>• {r.texte}</li>)}</ul>;
  const blocs = [
    { titre: "Ce qui colle", icone: "✓", couleur: "text-emerald-600 bg-emerald-50 ring-emerald-200", lignes: e.atouts },
    { titre: "Ce qui manque", icone: "✕", couleur: "text-red-600 bg-red-50 ring-red-200", lignes: [...resultat.motifsElimination.map((m) => `Écarté : ${m}`), ...e.manques] },
    { titre: "À vérifier au téléphone", icone: "?", couleur: "text-amber-600 bg-amber-50 ring-amber-200", lignes: e.aVerifier },
  ].filter((b) => b.lignes.length);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {blocs.map((b) => (
        <div key={b.titre}>
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{b.titre}</div>
          <ul className="space-y-1.5 text-sm">
            {b.lignes.map((l) => (
              <li key={l} className="flex gap-2">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ${b.couleur}`}>{b.icone}</span>
                <span className="text-slate-700">{l}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
