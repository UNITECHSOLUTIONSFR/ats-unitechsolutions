"use client";

import { useState, useTransition } from "react";
import { avisConsultantMission, type EtatAvis } from "@/lib/missions/avis";
import type { AvisMission } from "@/lib/ai";

const VERDICTS = { fort: ["Très bon profil", "bg-emerald-50 text-emerald-700 ring-emerald-200"], moyen: ["Profil à creuser", "bg-amber-50 text-amber-700 ring-amber-200"], faible: ["Peu adapté", "bg-slate-100 text-slate-600 ring-slate-200"] } as const;

/** « ✨ Avis IA » : lecture contextuelle de la fiche de poste et du CV, sur demande, gardée ensuite. */
export default function AvisIA({ missionId, consultantId, initial }: { missionId: string; consultantId: string; initial?: AvisMission }) {
  const [etat, setEtat] = useState<EtatAvis>(initial ? { avis: initial } : {});
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const demander = () => {
    setOuvert(true);
    if (etat.avis) return;
    demarrer(async () => setEtat(await avisConsultantMission(missionId, consultantId)));
  };
  const a = etat.avis;
  return (
    <>
      <button type="button" onClick={() => (ouvert ? setOuvert(false) : demander())}
        className="flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-marque-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 sm:h-9">
        ✨ {enCours ? "Analyse…" : a ? (ouvert ? "Masquer l'avis" : "Avis IA") : "Avis IA"}
      </button>
      {ouvert && (
        <div className="basis-full rounded-2xl bg-gradient-to-br from-violet-50 to-white p-4 text-sm ring-1 ring-violet-100">
          {enCours && <p className="animate-pulse text-slate-500">L&apos;IA lit la fiche de poste et le CV…</p>}
          {etat.erreur && <p className="text-red-700">{etat.erreur}</p>}
          {a && (
            <div className="space-y-3">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${VERDICTS[a.verdict][1]}`}>{VERDICTS[a.verdict][0]}</span>
                <p className="min-w-0 flex-1 text-slate-700">{a.resume}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Liste titre="Points forts" icone="✓" couleur="text-emerald-600" elements={a.points_forts} />
                <Liste titre="À vérifier" icone="!" couleur="text-amber-600" elements={a.manques} />
                <Liste titre="Questions d'entretien" icone="?" couleur="text-marque-600" elements={a.questions} />
              </div>
              <p className="text-[11px] text-slate-400">Avis indicatif de l&apos;IA, à partir du CV : c&apos;est vous qui décidez.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Liste({ titre, icone, couleur, elements }: { titre: string; icone: string; couleur: string; elements: string[] }) {
  if (!elements.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{titre}</div>
      <ul className="space-y-1">{elements.map((e) => <li key={e} className="flex gap-2 text-slate-700"><span className={`font-bold ${couleur}`}>{icone}</span><span>{e}</span></li>)}</ul>
    </div>
  );
}
