import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/acces";
import { classementMission, type LigneClassement } from "@/lib/matching/classement";
import { formaterTelephone } from "@/lib/metier/telephone";
import { responsablesPossibles } from "@/lib/missions/responsables";
import ChoixResponsable from "../responsable";
import Shortlist, { type ProfilShortlist } from "./shortlist";
import BoutonCVMission from "./cv-mission";
import Exigences from "./exigences";
import { BoutonWhatsApp } from "../../whatsapp";
import AvisIA from "./avis-ia";
import type { AvisMission } from "@/lib/ai";

// Génération des CV Unitech (IA + SharePoint) depuis cet écran : jusqu'à 2 minutes.
export const maxDuration = 120;
import { suivreProposition } from "@/lib/missions/actions";
import ChoixStatut from "../statut";

const STATUTS_PROPOSITION: Record<string, string> = {
  propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé",
};

export default async function PageMission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { data: mission } = await supabase
    .from("missions")
    .select("id, client, intitule, texte_besoin, statut, responsable_id, localisation, date_debut, annees_min, seniorite, exigences, mission_competences(competence_id, obligatoire, importance, annees_min, competences(nom_canonique))")
    .eq("id", id)
    .maybeSingle();
  if (!mission) notFound();

  const [classement, { data: propositions }, responsables, { data: cvMission }, { data: avisExistants }] = await Promise.all([
    classementMission(supabase, id),
    supabase.from("propositions").select("consultant_id, statut").eq("mission_id", id),
    responsablesPossibles(supabase),
    supabase.from("cv_unitech_generes").select("consultant_id, word_url, pdf_url, created_at").eq("mission_id", id).order("created_at", { ascending: false }),
    supabase.from("avis_ia").select("consultant_id, contenu").eq("mission_id", id),
  ]);
  const avisParConsultant = new Map((avisExistants ?? []).map((a) => [a.consultant_id as string, a.contenu as AvisMission]));
  // Dernier CV Unitech généré pour cette mission, par consultant : rouvert sans nouvelle génération.
  const cvParConsultant = new Map<string, { word: string; pdf: string }>();
  for (const g of cvMission ?? []) if (!cvParConsultant.has(g.consultant_id)) cvParConsultant.set(g.consultant_id, { word: g.word_url, pdf: g.pdf_url });
  const suivi = new Map((propositions ?? []).map((p) => [p.consultant_id, p.statut as string]));
  const shortlist: ProfilShortlist[] = classement.filter((c) => suivi.has(c.consultant_id) && suivi.get(c.consultant_id) !== "refuse").map((c) => ({
    trigramme: c.trigramme, poste: c.intitule_poste, annees: c.annees_experience, score: Math.round(c.resultat.score),
    disponibilite: c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR") : c.disponibilite ?? "à préciser", pdf: c.pdf_anonyme_url,
  }));
  const exigences = (mission.mission_competences ?? []) as unknown as {
    competence_id: string; obligatoire: boolean; importance: number; annees_min: number | null; competences: { nom_canonique: string } | null;
  }[];
  exigences.sort((a, b) => Number(b.obligatoire) - Number(a.obligatoire) || b.importance - a.importance);
  // Nombre de profils qui ont chaque compétence (analysée) : repère les exigences trop pointues.
  const { data: possedees } = exigences.length
    ? await supabase.from("consultant_competences").select("competence_id").in("competence_id", exigences.map((e) => e.competence_id)).limit(20000)
    : { data: [] };
  const profilsParCompetence = new Map<string, number>();
  for (const p of possedees ?? []) profilsParCompetence.set(p.competence_id, (profilsParCompetence.get(p.competence_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="titre-page">{mission.intitule}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {mission.client && <span className="rounded-full bg-white px-3 py-1 font-medium text-nuit ring-1 ring-slate-200">🏢 {mission.client}</span>}
            {mission.localisation && <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">📍 {mission.localisation}</span>}
            {mission.date_debut && <span className="rounded-full bg-marque-50 px-3 py-1 font-semibold text-marque-700 ring-1 ring-marque-100">Démarrage le {new Date(mission.date_debut).toLocaleDateString("fr-FR")}</span>}
            {mission.annees_min && <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">⏱ {mission.annees_min} ans minimum</span>}
            {mission.seniorite && <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">★ {mission.seniorite === "confirme" ? "confirmé" : mission.seniorite}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <Shortlist mission={mission.intitule} profils={shortlist} />
        {utilisateur.role === "admin" && <a href={`/missions/${id}/export`} className="bouton-secondaire">Exporter en Excel</a>}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Responsable</span>
          <ChoixResponsable missionId={id} responsableId={mission.responsable_id} responsables={responsables} estAdmin={utilisateur.role === "admin"} />
        </div>
        <ChoixStatut missionId={id} statut={mission.statut} />
        </div>
      </div>

      <Exigences missionId={id} texteBesoin={mission.texte_besoin} exigences={exigences.map((e) => ({
        competence_id: e.competence_id, nom: e.competences?.nom_canonique ?? "?", obligatoire: e.obligatoire, importance: e.importance, profils: profilsParCompetence.get(e.competence_id) ?? 0,
      }))} />

      <section className="space-y-4">
        {/* Synthèse */}
        <div className="carte flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-nuit">
              {classement.filter((c) => !c.resultat.elimine && c.resultat.score >= 60).length} profil(s) pertinent(s) pour cette mission
            </h2>
            <p className="sous-titre">{classement.length} consultant(s) classé(s) · le score est une aide à la décision, jamais un refus automatique.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="pastille pastille-vert">≥ 75 : très bonne adéquation</span>
            <span className="pastille">50 – 74 : à étudier</span>
          </div>
        </div>

        {classement.map((c, i) => (
          <CarteCandidat key={c.consultant_id} rang={i + 1} c={c} missionId={id} statut={suivi.get(c.consultant_id)} ouvert={i < 3} cv={cvParConsultant.get(c.consultant_id)} avis={avisParConsultant.get(c.consultant_id)} />
        ))}
        {!classement.length && (
          <div className="carte p-8 text-center text-sm text-slate-500">
            <p className="font-medium text-nuit">Aucun consultant ne possède les compétences demandées.</p>
            <p className="mt-1">Rendez certaines compétences « souhaitées » plutôt qu&apos;obligatoires, ou retirez-en une : le classement se recalcule aussitôt. La mission reste enregistrée.</p>
          </div>
        )}
      </section>
    </div>
  );
}

const CRITERES: Record<string, string> = {
  competences: "Compétences", annees: "Expérience", seniorite: "Séniorité", disponibilite: "Disponibilité", semantique: "Proximité du profil", filtre: "Filtre",
};

function niveau(score: number) {
  if (score >= 75) return { libelle: "Très bonne adéquation", classe: "pastille-vert", texte: "text-emerald-600" };
  if (score >= 50) return { libelle: "À étudier", classe: "pastille-orange", texte: "text-marque-600" };
  return { libelle: "Adéquation faible", classe: "pastille-gris", texte: "text-slate-500" };
}

/** Un consultant classé : identité, actions, puis l'explication du score critère par critère. */
function CarteCandidat({ rang, c, missionId, statut, ouvert, cv, avis }: {
  rang: number; c: LigneClassement; missionId: string; statut?: string; ouvert: boolean; cv?: { word: string; pdf: string }; avis?: AvisMission;
}) {
  const n = niveau(c.resultat.score);
  const initiales = `${c.prenom?.[0] ?? ""}${c.nom?.[0] ?? ""}`.replace("—", "").toUpperCase() || "?";
  const action = "flex h-10 items-center gap-1.5 rounded-full sm:h-9 bg-white/70 px-3 text-xs font-semibold text-nuit ring-1 ring-white/80 transition hover:bg-white hover:shadow-md";
  return (
    <article className={`carte p-4 sm:p-5 ${c.resultat.elimine ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-marque-400 to-marque-700 text-lg font-bold text-white shadow-md">{initiales}</span>
          <span className="absolute -left-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-nuit shadow ring-1 ring-slate-200">{rang}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/consultants/${c.consultant_id}`} className="text-base font-semibold text-nuit hover:text-marque-600">{c.prenom} {c.nom}</Link>
            {/* Téléphone : le score tout de suite visible */}
            <span className={`shrink-0 text-xl font-extrabold tabular-nums sm:hidden ${n.texte}`}>{Math.round(c.resultat.score)}</span>
          </div>
          <div className="truncate text-sm text-slate-500">{c.intitule_poste ?? "Poste non renseigné"} · <span className="font-mono">{c.trigramme}</span></div>
          <div className="mt-0.5 text-xs text-slate-500">Disponibilité : {c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR") : c.disponibilite ?? "non renseignée"}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.telephone_e164 && <a href={`tel:${c.telephone_e164}`} className={action} title={formaterTelephone(c.telephone_e164)}>☎ {formaterTelephone(c.telephone_e164)}</a>}
          <AvisIA missionId={missionId} consultantId={c.consultant_id} initial={avis} />
          <BoutonWhatsApp telephone={c.telephone_e164} prenom={c.prenom} className="flex h-10 items-center gap-1.5 rounded-full bg-[#25D366] px-3 text-xs font-semibold text-white shadow-sm hover:brightness-95 sm:h-9" />
          {c.email && <a href={`mailto:${c.email}`} className={action}>✉ Email</a>}
          {c.word_url && <a href={c.word_url} target="_blank" rel="noreferrer" className={action}>CV Word</a>}
          {c.pdf_anonyme_url
            ? <a href={c.pdf_anonyme_url} target="_blank" rel="noreferrer" className={action}>PDF anonymisé</a>
            : <span className="pastille pastille-orange">PDF anonymisé manquant</span>}
          {cv ? (
            <>
              <a href={cv.word} target="_blank" rel="noreferrer" className={action}>Word Unitech</a>
              <a href={cv.pdf} target="_blank" rel="noreferrer" className={action}>PDF Unitech</a>
            </>
          ) : <BoutonCVMission consultantId={c.consultant_id} missionId={missionId} />}
          <form action={suivreProposition} className="flex items-center gap-1 rounded-full bg-white/70 p-1 ring-1 ring-white/80">
            <input type="hidden" name="mission_id" value={missionId} />
            <input type="hidden" name="consultant_id" value={c.consultant_id} />
            <input type="hidden" name="score" value={c.resultat.score} />
            <input type="hidden" name="detail" value={JSON.stringify(c.resultat)} />
            <select name="statut" defaultValue={statut ?? "propose"} className="rounded-full bg-transparent px-2 py-1 text-xs font-semibold text-nuit outline-none">
              {Object.entries(STATUTS_PROPOSITION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="rounded-full bg-nuit px-3 py-1 text-xs font-semibold text-white hover:bg-marque-700">{statut ? "OK" : "Suivre"}</button>
          </form>
        </div>
      </div>

      <details open={ouvert} className="group mt-4 rounded-2xl bg-white/60 p-4 ring-1 ring-marque-100">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-nuit">Évaluation</span>
          <span className={`pastille ${n.classe}`}>{n.libelle} · {Math.round(c.resultat.score)}/100</span>
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200/70"><span className="block h-full rounded-full bg-gradient-to-r from-marque-600 to-marque-400" style={{ width: `${c.resultat.score}%` }} /></span>
          <span className="ml-auto text-xs text-slate-400 group-open:hidden">Afficher le détail</span>
        </summary>
        <ul className="mt-3 space-y-1.5 text-sm">
          {c.resultat.raisons.map((r) => {
            const ratio = r.max ? r.points / r.max : 1;
            const icone = ratio >= 0.7 ? ["✓", "bg-emerald-50 text-emerald-600 ring-emerald-200"] : ratio > 0 ? ["◐", "bg-amber-50 text-amber-600 ring-amber-200"] : ["✕", "bg-red-50 text-red-600 ring-red-200"];
            return (
              <li key={r.critere} className="flex gap-2.5">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ${icone[1]}`}>{icone[0]}</span>
                <span className="text-slate-600"><b className="font-semibold text-nuit">{CRITERES[r.critere] ?? r.critere}{r.max ? ` (${r.points}/${r.max})` : ""} :</b> {r.texte}</span>
              </li>
            );
          })}
          {c.resultat.elimine && <li className="text-red-700">Écarté : {c.resultat.motifsElimination.join(" ; ")}</li>}
          {c.resultat.alertes.map((a) => <li key={a} className="text-amber-700">⚠ {a}</li>)}
        </ul>
      </details>
    </article>
  );
}
