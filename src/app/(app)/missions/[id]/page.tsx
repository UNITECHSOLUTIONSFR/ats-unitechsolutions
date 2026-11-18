import Link from "next/link";
import CriteresMatching from "./criteres";
import { BoutonSuivi } from "./bouton-suivi";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/acces";
import { estPertinent, noteAffichee, type LigneClassement } from "@/lib/matching/classement";
import { classementAAfficher, matchingV2Actif } from "@/lib/matching/stockage";
import BoutonRecalculer from "./recalculer";
import { formaterTelephone } from "@/lib/metier/telephone";
import { responsablesPossibles } from "@/lib/missions/responsables";
import ChoixResponsable from "../responsable";
import Shortlist, { type ProfilShortlist } from "./shortlist";
import BoutonCVMission from "./cv-mission";
import Exigences from "./exigences";
import { BoutonWhatsApp } from "../../whatsapp";
import AvisIA from "./avis-ia";
import { ExplicationScore, JaugeScore } from "../evaluation";
import type { AvisMission } from "@/lib/ai";

// Génération des CV Unitech (IA + SharePoint) depuis cet écran : jusqu'à 2 minutes.
export const maxDuration = 120;
import { suivreProposition } from "@/lib/missions/actions";
import ChoixStatut from "../statut";
import { EtiquetteTrello } from "../trello";
import GestionMission from "./gestion";
import { LIBELLE_STATUT } from "@/lib/missions/statuts";

const STATUTS_PROPOSITION: Record<string, string> = {
  propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé",
};

export default async function PageMission({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tous?: string }> }) {
  const { id } = await params;
  // Les 20 premiers profils d'abord (page légère) ; les 30 suivants sur demande.
  const tous = (await searchParams).tous === "1";
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { data: mission } = await supabase
    .from("missions")
    .select("id, client, intitule, texte_besoin, statut, responsable_id, trello_carte_id, trello_colonne, trello_recruteur, trello_url, trello_lu_le, tjm, localisation, date_debut, annees_min, seniorite, exigences, criteres_matching, criteres_par_equipe, mission_competences(competence_id, obligatoire, importance, annees_min, competences(nom_canonique))")
    .eq("id", id)
    .maybeSingle();
  if (!mission) notFound();

  const [resume, { data: propositions }, responsables, { data: cvMission }, { data: avisExistants }, v2] = await Promise.all([
    classementAAfficher(id), // rangé dans la base : lu sans calcul (recalculé en arrière-plan quand quelque chose change)
    supabase.from("propositions").select("consultant_id, statut").eq("mission_id", id),
    responsablesPossibles(supabase),
    supabase.from("cv_unitech_generes").select("id, consultant_id, word_url, pdf_url, created_at").eq("mission_id", id).order("created_at", { ascending: false }),
    supabase.from("avis_ia").select("consultant_id, contenu").eq("mission_id", id),
    matchingV2Actif(supabase),
  ]);
  const classement = resume.top;
  // Affichés : uniquement les profils que l'IA a lus et jugés pertinents (note ≥ 60). Les autres ne sont pas montrés.
  const proposes = classement.filter(estPertinent);
  // Matching v2 : profils proches (pas tous les critères), montrés à part avec ce qui leur manque.
  const proches = classement.filter((c) => c.eligible === false && (c.manques?.length ?? 0) > 0);
  const avisParConsultant = new Map((avisExistants ?? []).map((a) => [a.consultant_id as string, a.contenu as AvisMission]));
  // Dernier CV Unitech généré pour cette mission, par consultant : rouvert sans nouvelle génération.
  const cvParConsultant = new Map<string, { id: string; word: string; pdf: string | null }>();
  for (const g of cvMission ?? []) if (!cvParConsultant.has(g.consultant_id)) cvParConsultant.set(g.consultant_id, { id: g.id, word: g.word_url, pdf: g.pdf_url });
  const suivi = new Map((propositions ?? []).map((p) => [p.consultant_id, p.statut as string]));
  const shortlist: ProfilShortlist[] = classement.filter((c) => suivi.has(c.consultant_id) && suivi.get(c.consultant_id) !== "refuse").map((c) => ({
    trigramme: c.trigramme, poste: c.intitule_poste, annees: c.annees_experience, score: Math.round(noteAffichee(c)),
    disponibilite: c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR") : c.disponibilite ?? "à préciser", pdf: c.pdf_anonyme_url,
  }));
  const exigences = (mission.mission_competences ?? []) as unknown as {
    competence_id: string; obligatoire: boolean; importance: number; annees_min: number | null; competences: { nom_canonique: string } | null;
  }[];
  exigences.sort((a, b) => Number(b.obligatoire) - Number(a.obligatoire) || b.importance - a.importance);
  // Nombre de profils qui ont chaque compétence (analysée) : repère les exigences trop pointues.
  const { data: possedees } = exigences.length
    ? await supabase.rpc("profils_par_competence", { p_ids: exigences.map((e) => e.competence_id) })
    : { data: [] };
  const profilsParCompetence = new Map(((possedees ?? []) as { competence_id: string; nombre: number }[]).map((p) => [p.competence_id, Number(p.nombre)]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="titre-page">{mission.intitule}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {mission.client && <span className="rounded-full bg-white px-3 py-1 font-medium text-nuit ring-1 ring-slate-200">🏢 {mission.client}</span>}
            {mission.trello_carte_id && <EtiquetteTrello colonne={mission.trello_colonne} recruteur={mission.trello_recruteur} url={mission.trello_url} />}
            {mission.tjm && <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-800 ring-1 ring-amber-200" title="Information interne : jamais utilisée pour classer les candidats, jamais envoyée à un consultant">💶 {mission.tjm} <span className="text-xs font-normal">(interne)</span></span>}
            {mission.localisation && <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">📍 {mission.localisation}</span>}
            {mission.date_debut && <span className="rounded-full bg-marque-50 px-3 py-1 font-semibold text-marque-700 ring-1 ring-marque-100">Démarrage le {new Date(mission.date_debut).toLocaleDateString("fr-FR")}</span>}
            {mission.annees_min && <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">⏱ {mission.annees_min} ans minimum</span>}
            {mission.seniorite && <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">★ {mission.seniorite === "confirme" ? "confirmé" : mission.seniorite}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <Shortlist mission={mission.intitule} profils={shortlist} />
        {utilisateur.role === "admin" && <a href={`/missions/${id}/export`} className="bouton-secondaire">Exporter en Excel</a>}
        {mission.trello_carte_id ? (
          // Mission Trello : statut et recruteur suivent la carte (Trello fait foi, l'outil n'y écrit jamais).
          <span className="rounded-full bg-slate-50 px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200">
            Statut : <b className="text-nuit">{LIBELLE_STATUT[mission.statut] ?? mission.statut}</b> · suit Trello
          </span>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Responsable</span>
              <ChoixResponsable missionId={id} responsableId={mission.responsable_id} responsables={responsables} estAdmin={utilisateur.role === "admin"} />
            </div>
            <ChoixStatut missionId={id} statut={mission.statut} />
          </>
        )}
        </div>
      </div>

      <GestionMission estAdmin={utilisateur.role === "admin"} mission={{
        id, intitule: mission.intitule, client: mission.client, localisation: mission.localisation, texte_besoin: mission.texte_besoin, trello: !!mission.trello_carte_id,
      }} />

      <Exigences missionId={id} texteBesoin={mission.texte_besoin} exigences={exigences.map((e) => ({
        competence_id: e.competence_id, nom: e.competences?.nom_canonique ?? "?", obligatoire: e.obligatoire, importance: e.importance, profils: profilsParCompetence.get(e.competence_id) ?? 0,
      }))} />

      {v2 && <CriteresMatching missionId={id} criteres={mission.criteres_matching as Parameters<typeof CriteresMatching>[0]["criteres"]} parEquipe={!!mission.criteres_par_equipe} eligibles={resume.eligibles} />}

      <section className="space-y-4">
        {/* Synthèse */}
        <div className="carte flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-nuit">
              {resume.pertinents} profil(s) pertinent(s) pour cette mission
            </h2>
            <p className="sous-titre">{v2 ? "Seuls les profils dont le CV remplit les critères ci-dessus et que l'IA, après lecture du CV complet, juge pertinents (note de 60 et plus) sont affichés." : "Seuls les profils que l'IA a lus et jugés pertinents (note de 60 et plus) sont affichés."} La note est une aide à la décision, jamais un refus automatique.</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {resume.calculeLe && <span>Classement du {new Date(resume.calculeLe).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</span>}
              {resume.miseAJour && <span className="pastille pastille-orange">Mise à jour en cours…</span>}
              <BoutonRecalculer missionId={id} />
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="pastille pastille-vert">75 et plus : très bonne adéquation</span>
            <span className="pastille">50 à 74 : à étudier</span>
          </div>
        </div>

        {proposes.slice(0, tous ? 100 : 20).map((c, i) => (
          <CarteCandidat key={c.consultant_id} rang={i + 1} c={c} missionId={id} statut={suivi.get(c.consultant_id)} ouvert={i < 3} cv={cvParConsultant.get(c.consultant_id)} avis={avisParConsultant.get(c.consultant_id)} />
        ))}
        {!tous && proposes.length > 20 && (
          <Link href={`/missions/${id}?tous=1`} scroll={false} className="bouton-secondaire w-full justify-center">Voir les {proposes.length - 20} autres profils pertinents</Link>
        )}
        {!proposes.length && (
          <div className="carte p-8 text-center text-sm text-slate-500">
            <p className="font-medium text-nuit">Aucun profil pertinent pour l&apos;instant.</p>
            <p className="mt-1">Aucun CV de la base ne remplit tous les critères avec une expérience prouvée. Si un critère est trop strict, corrigez-le ci-dessus : le classement se recalcule aussitôt. Un profil ajouté ensuite est comparé à la mission automatiquement.</p>
          </div>
        )}
        {proches.length > 0 && (
          <div className="carte space-y-2 p-5 text-sm">
            <h3 className="font-semibold text-nuit">Profils proches, qui ne remplissent pas tous les critères</h3>
            <p className="text-xs text-slate-500">Proches par le sens, mais un critère obligatoire est absent de leur CV : à n&apos;appeler qu&apos;en connaissance de cause.</p>
            <ul className="divide-y divide-slate-100">
              {proches.slice(0, 10).map((c) => (
                <li key={c.consultant_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/consultants/${c.consultant_id}`} className="lien font-medium">{c.prenom === "—" ? "" : c.prenom} {c.nom}</Link>
                  <span className="text-slate-500">{c.intitule_poste ?? "Poste non renseigné"}</span>
                  <span className="pastille pastille-orange">Absent du CV : {(c.manques ?? []).join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

/** Un consultant classé : identité et score, actions, puis l'explication du score critère par critère. */
/** Avis de l'IA sur le profil (lecture de la mission et du profil). */
const AVIS_IA = {
  pertinent: { libelle: "Pertinent", classe: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  a_etudier: { libelle: "À étudier", classe: "bg-amber-50 text-amber-800 ring-amber-200" },
  hors_sujet: { libelle: "Hors sujet", classe: "bg-red-50 text-red-800 ring-red-200" },
} as const;

function CarteCandidat({ rang, c, missionId, statut, ouvert, cv, avis }: {
  rang: number; c: LigneClassement; missionId: string; statut?: string; ouvert: boolean; cv?: { id: string; word: string; pdf: string | null }; avis?: AvisMission;
}) {
  const initiales = `${c.prenom?.[0] ?? ""}${c.nom?.[0] ?? ""}`.replace("—", "").toUpperCase() || "?";
  const action = "flex h-10 items-center gap-1.5 rounded-full sm:h-9 bg-white px-3 text-xs font-semibold text-nuit ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-slate-300";
  return (
    <article className={`carte p-4 sm:p-5 ${c.resultat.elimine || c.avisIA?.verdict === "hors_sujet" ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="relative shrink-0">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-marque-400 to-marque-700 text-base font-bold text-white sm:h-14 sm:w-14 sm:text-lg">{initiales}</span>
          <span className="absolute -left-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-nuit shadow ring-1 ring-slate-200">{rang}</span>
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/consultants/${c.consultant_id}?mission=${missionId}`} className="block truncate text-base font-semibold text-nuit hover:text-marque-600">{c.prenom} {c.nom}</Link>
          <div className="truncate text-sm text-slate-500">{c.intitule_poste ?? "Poste non renseigné"} · <span className="font-mono text-xs">{c.trigramme}</span></div>
          <div className="mt-0.5 truncate text-xs text-slate-500">Disponibilité : {c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR") : c.disponibilite ?? "non renseignée"}</div>
        </div>
        <JaugeScore score={noteAffichee(c)} />
      </div>
      {c.avisIA && (
        <div className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ring-1 ${AVIS_IA[c.avisIA.verdict].classe}`}>
          <span className="shrink-0 font-bold">IA · {c.avisIA.note != null ? `${c.avisIA.note}/100` : AVIS_IA[c.avisIA.verdict].libelle}</span>
          {c.avisIA.raison && <span className="text-slate-700">{c.avisIA.raison}</span>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {c.telephone_e164 && <a href={`tel:${c.telephone_e164}`} className={action} title={formaterTelephone(c.telephone_e164)}>☎ {formaterTelephone(c.telephone_e164)}</a>}
        <BoutonWhatsApp telephone={c.telephone_e164} prenom={c.prenom} className="flex h-10 items-center gap-1.5 rounded-full bg-[#25D366] px-3 text-xs font-semibold text-white shadow-sm hover:brightness-95 sm:h-9" />
        {c.email && <a href={`mailto:${c.email}`} className={action}>✉ Email</a>}
        {c.word_url && <a href={c.word_url} target="_blank" rel="noreferrer" className={action}>CV Word</a>}
        {c.pdf_anonyme_url && <a href={c.pdf_anonyme_url} target="_blank" rel="noreferrer" className={action}>PDF anonymisé</a>}
        <BoutonCVMission consultantId={c.consultant_id} missionId={missionId} existant={cv} />
        <form action={suivreProposition} className="flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200 ">
          <input type="hidden" name="mission_id" value={missionId} />
          <input type="hidden" name="consultant_id" value={c.consultant_id} />
          <input type="hidden" name="score" value={noteAffichee(c)} />
          <select name="statut" defaultValue={statut ?? "propose"} aria-label="Suivi" className="rounded-full bg-transparent px-2 py-1 text-xs font-semibold text-nuit outline-none">
            {Object.entries(STATUTS_PROPOSITION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <BoutonSuivi libelle={statut ? "OK" : "Suivre"} />
        </form>
        <AvisIA missionId={missionId} consultantId={c.consultant_id} initial={avis} />
      </div>

      <details open={ouvert} className="group mt-3 rounded-2xl bg-slate-50/80 px-4 py-3 ring-1 ring-slate-200/70">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-nuit">Détail des critères (compétences, expérience, disponibilité)</span>
          <span className="ml-auto text-xs font-medium text-marque-600 group-open:hidden">Voir l&apos;explication</span>
        </summary>
        <div className="mt-3"><ExplicationScore resultat={c.resultat} /></div>
        <Link href={`/consultants/${c.consultant_id}?mission=${missionId}`} className="mt-3 inline-block text-sm font-semibold text-marque-600 hover:underline">Ouvrir sa fiche avec cette évaluation →</Link>
      </details>
    </article>
  );
}
