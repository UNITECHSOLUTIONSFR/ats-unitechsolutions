import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { apercuCV } from "@/lib/consultants/apercu-cv";
import { evaluationPourMission, missionsPourConsultant } from "@/lib/matching/pour-consultant";
import { suivreProposition } from "@/lib/missions/actions";
import { ExplicationScore, JaugeScore, niveauScore } from "../../missions/evaluation";
import BoutonCVMission from "../../missions/[id]/cv-mission";

const STATUTS: Record<string, string> = { propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé" };

/** Venant d'une mission : l'évaluation du consultant pour cette mission, avec le suivi et le CV Unitech. */
export async function EvaluationMission({ consultantId, missionId }: { consultantId: string; missionId: string }) {
  const { supabase } = await exigerUtilisateur();
  const [ev, { data: suivi }, { data: cv }] = await Promise.all([
    evaluationPourMission(supabase, missionId, consultantId),
    supabase.from("propositions").select("statut").match({ mission_id: missionId, consultant_id: consultantId }).maybeSingle(),
    supabase.from("cv_unitech_generes").select("id, word_url, pdf_url").match({ mission_id: missionId, consultant_id: consultantId }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!ev) return null;
  const r = ev.ligne.resultat;
  return (
    <section className="carte overflow-hidden ring-2 ring-marque-200">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-marque-50/70 px-4 py-3 sm:px-6">
        <span className="text-xs font-bold uppercase tracking-wide text-marque-700">Évaluation pour la mission</span>
        <Link href={`/missions/${missionId}`} className="min-w-0 font-semibold text-nuit hover:text-marque-600">
          {ev.mission.intitule}{ev.mission.client ? ` · ${ev.mission.client}` : ""} →
        </Link>
        {ev.rang && <span className="text-sm text-slate-500 sm:ml-auto">{ev.rang === 1 ? "1er" : `${ev.rang}e`} du classement</span>}
      </div>
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-6">
        <JaugeScore score={r.score} />
        <div className="min-w-0 flex-1 space-y-4">
          <ExplicationScore resultat={r} />
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <form action={suivreProposition} className="flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200">
              <input type="hidden" name="mission_id" value={missionId} />
              <input type="hidden" name="consultant_id" value={consultantId} />
              <input type="hidden" name="score" value={r.score} />
              <input type="hidden" name="detail" value={JSON.stringify(r)} />
              <select name="statut" defaultValue={suivi?.statut ?? "propose"} aria-label="Suivi" className="rounded-full bg-transparent px-2 py-1 text-xs font-semibold text-nuit outline-none">
                {Object.entries(STATUTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button className="rounded-full bg-marque-600 px-3 py-1 text-xs font-semibold text-white hover:bg-marque-500">{suivi ? "Mettre à jour" : "Suivre sur cette mission"}</button>
            </form>
            {suivi && <span className="pastille pastille-vert">Suivi : {STATUTS[suivi.statut] ?? suivi.statut}</span>}
            <BoutonCVMission consultantId={consultantId} missionId={missionId} existant={cv ? { id: cv.id, word: cv.word_url, pdf: cv.pdf_url } : undefined} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Missions ouvertes pour lesquelles le consultant est qualifié, en pastilles (score affiché). */
export async function MissionsPourLui({ consultantId }: { consultantId: string }) {
  const { supabase } = await exigerUtilisateur();
  const liste = await missionsPourConsultant(supabase, consultantId);
  return (
    <section className="carte p-4 sm:p-6">
      <h2 className="titre-section">Missions ouvertes pour ce profil</h2>
      <p className="mt-0.5 text-xs text-slate-500">Missions en cours où il obtient au moins 50/100. Touchez une mission pour voir l&apos;évaluation.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {liste.map((e) => {
          const n = niveauScore(e.score);
          return (
            <Link key={e.mission.id} href={`/consultants/${consultantId}?mission=${e.mission.id}`}
              className={`inline-flex max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-sm font-semibold ring-1 transition hover:-translate-y-0.5 ${n.fond} ${n.anneau}`}>
              <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white px-1 text-sm font-extrabold tabular-nums shadow-sm" style={{ color: n.couleur }}>{Math.round(e.score)}</span>
              <span className="min-w-0 truncate text-nuit">{e.mission.intitule}{e.mission.client ? <span className="font-normal text-slate-500"> · {e.mission.client}</span> : null}</span>
            </Link>
          );
        })}
        {!liste.length && <span className="text-sm text-slate-500">Aucune mission ouverte ne lui correspond pour l&apos;instant.</span>}
      </div>
    </section>
  );
}

/** Aperçu du CV dans la fiche (lecture seule), avec un lien pour l'ouvrir dans SharePoint. */
export async function ApercuDuCV({ consultantId }: { consultantId: string }) {
  const { supabase } = await exigerUtilisateur();
  const a = await apercuCV(supabase, consultantId);
  return (
    <section className="carte overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-6">
        <h2 className="titre-section">CV</h2>
        {a.ouvrir && <a href={a.ouvrir} target="_blank" rel="noreferrer" className="text-sm font-semibold text-marque-600 hover:underline">Ouvrir dans SharePoint ↗</a>}
      </div>
      {a.url ? (
        <iframe src={a.url} title={a.nom ?? "CV"} className="h-[70vh] min-h-[480px] w-full border-t border-slate-100 bg-slate-50" />
      ) : a.texte ? (
        <pre className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap border-t border-slate-100 bg-slate-50 px-4 py-3 font-sans text-sm text-slate-700 sm:px-6">{a.texte}</pre>
      ) : (
        <p className="border-t border-slate-100 px-4 py-6 text-sm text-slate-500 sm:px-6">Aucun CV enregistré pour ce consultant.</p>
      )}
    </section>
  );
}
