import Link from "next/link";
import CriteresMatching from "./criteres";
import { BoutonSuivi } from "./bouton-suivi";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/acces";
import { estPertinent, noteAffichee, type LigneClassement } from "@/lib/matching/classement";
import { VERSION_MOTEUR_V4 } from "@/lib/matching/v4";
import { VERSION_MOTEUR_V5 } from "@/lib/matching/v5";
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
import { EvaluationIA, JaugeScore } from "../evaluation";
import type { AvisMission } from "@/lib/ai";

// Génération des CV Unitech (IA + SharePoint) depuis cet écran : jusqu'à 2 minutes.
export const maxDuration = 120;
import { donnerRetourMatching, suivreProposition } from "@/lib/missions/actions";
import ChoixStatut from "../statut";
import NavigationProfils from "./navigation-profils";
import { ApercuDuCV } from "../../consultants/[id]/blocs-mission";
import { Suspense } from "react";
import { EtiquetteTrello } from "../trello";
import { LIBELLE_STATUT } from "@/lib/missions/statuts";

/** Ancienneté d'une date en jours (cartes des profils). */
function joursDepuis(date: string): number {
  return Math.floor((new Date().getTime() - Date.parse(date)) / 86_400_000);
}
function ilYa(date: string): string {
  const j = joursDepuis(date);
  return j < 1 ? "Aujourd'hui" : j < 30 ? `Il y a ${j} jour${j > 1 ? "s" : ""}` : j < 365 ? `Il y a ${Math.floor(j / 30)} mois` : `Il y a ${Math.floor(j / 365)} an${j >= 730 ? "s" : ""}`;
}

const STATUTS_PROPOSITION: Record<string, string> = {
  propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé",
};

export default async function PageMission({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ profil?: string }> }) {
  const { id } = await params;
  // Profil ouvert en détail (clic sur sa carte) ; les autres restent en petites cartes.
  const profilOuvert = (await searchParams).profil ?? null;
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { data: mission } = await supabase
    .from("missions")
    .select("id, client, intitule, texte_besoin, statut, responsable_id, trello_carte_id, trello_colonne, trello_recruteur, trello_url, trello_lu_le, tjm, localisation, date_debut, annees_min, seniorite, exigences, criteres_matching, criteres_par_equipe, mission_competences(competence_id, obligatoire, importance, annees_min, competences(nom_canonique))")
    .eq("id", id)
    .maybeSingle();
  if (!mission) notFound();

  const [resume, { data: propositions }, responsables, { data: cvMission }, { data: avisExistants }, v2, { data: retours }] = await Promise.all([
    classementAAfficher(id), // rangé dans la base : lu sans calcul (recalculé en arrière-plan quand quelque chose change)
    supabase.from("propositions").select("consultant_id, statut").eq("mission_id", id),
    responsablesPossibles(supabase),
    supabase.from("cv_unitech_generes").select("id, consultant_id, word_url, pdf_url, created_at").eq("mission_id", id).order("created_at", { ascending: false }),
    supabase.from("avis_ia").select("consultant_id, contenu").eq("mission_id", id),
    matchingV2Actif(supabase),
    supabase.from("retours_matching").select("consultant_id, avis").eq("mission_id", id),
  ]);
  // Cartes déjà ouvertes par la personne connectée (« Lu » / « Pas encore lu ») ; la carte ouverte est notée tout de suite.
  const [{ data: lus }] = await Promise.all([
    supabase.from("profils_lus").select("consultant_id").eq("mission_id", id).eq("utilisateur_id", utilisateur.id),
    profilOuvert ? supabase.from("profils_lus").upsert({ mission_id: id, consultant_id: profilOuvert, utilisateur_id: utilisateur.id }, { ignoreDuplicates: true }) : Promise.resolve(null),
  ]);
  const dejaLus = new Set([...(lus ?? []).map((l) => l.consultant_id as string), ...(profilOuvert ? [profilOuvert] : [])]);
  const retourParConsultant = new Map((retours ?? []).map((r) => [r.consultant_id as string, r.avis as "bon" | "pas"]));
  // Lancé en même temps que le reste de la page (au lieu d'après) : nombre de profils par compétence demandée.
  const possedeesP = ((mission.mission_competences ?? []) as unknown as { competence_id: string }[]).length
    ? supabase.rpc("profils_par_competence", { p_ids: ((mission.mission_competences ?? []) as unknown as { competence_id: string }[]).map((e) => e.competence_id) })
    : Promise.resolve({ data: [] as unknown[] });
  const classement = resume.top;
  // Affichés : les profils que l'IA a comparés à la fiche de poste et notés 31 ou plus, du plus haut au plus bas (24/11/2026).
  const proposes = classement.filter(estPertinent);
  const nouveauMatching = resume.version === VERSION_MOTEUR_V4 || resume.version === VERSION_MOTEUR_V5;
  const avisParConsultant = new Map((avisExistants ?? []).map((a) => [a.consultant_id as string, a.contenu as AvisMission]));
  // Dernier CV Unitech généré pour cette mission, par consultant : rouvert sans nouvelle génération.
  const cvParConsultant = new Map<string, { id: string; word: string; pdf: string | null }>();
  for (const g of cvMission ?? []) if (!cvParConsultant.has(g.consultant_id)) cvParConsultant.set(g.consultant_id, { id: g.id, word: g.word_url, pdf: g.pdf_url });
  const suivi = new Map((propositions ?? []).map((p) => [p.consultant_id, p.statut as string]));
  // Cartes (24/11/2026) : date d'arrivée du profil et TJM / salaire de sa fiche (jamais le TJM de la mission).
  const { data: infosFiches } = proposes.length
    ? await supabase.from("consultants").select("id, created_at, tjm_salaire").in("id", proposes.map((c) => c.consultant_id))
    : { data: [] };
  const infos = new Map((infosFiches ?? []).map((f) => [f.id as string, { arrivee: f.created_at as string, tjm: (f.tjm_salaire as string | null) ?? null }]));

  const shortlist: ProfilShortlist[] = classement.filter((c) => suivi.has(c.consultant_id) && suivi.get(c.consultant_id) !== "refuse").map((c) => ({
    trigramme: c.trigramme, poste: c.intitule_poste, annees: c.annees_experience, score: Math.round(noteAffichee(c)),
    disponibilite: c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : c.disponibilite ?? "à préciser", pdf: c.pdf_anonyme_url,
  }));
  const exigences = (mission.mission_competences ?? []) as unknown as {
    competence_id: string; obligatoire: boolean; importance: number; annees_min: number | null; competences: { nom_canonique: string } | null;
  }[];
  exigences.sort((a, b) => Number(b.obligatoire) - Number(a.obligatoire) || b.importance - a.importance);
  // Nombre de profils qui ont chaque compétence (analysée) : repère les exigences trop pointues.
  const { data: possedees } = await possedeesP;
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
            {mission.date_debut && <span className="rounded-full bg-marque-50 px-3 py-1 font-semibold text-marque-700 ring-1 ring-marque-100">Démarrage le {new Date(mission.date_debut).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>}
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

      {/* Suppression d'une mission retirée de l'écran (19/11/2026) : Trello fait foi pour les missions. */}

      <Exigences missionId={id} texteBesoin={mission.texte_besoin} exigences={exigences.map((e) => ({
        competence_id: e.competence_id, nom: e.competences?.nom_canonique ?? "?", obligatoire: e.obligatoire, importance: e.importance, profils: profilsParCompetence.get(e.competence_id) ?? 0,
      }))} />

      {v2 && <CriteresMatching missionId={id} criteres={mission.criteres_matching as Parameters<typeof CriteresMatching>[0]["criteres"]} parEquipe={!!mission.criteres_par_equipe} eligibles={resume.eligibles} />}

      <section className="space-y-4">
        {/* Synthèse */}
        <div className="carte flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-nuit">
              {proposes.length} profil(s) pour cette mission
            </h2>
            <p className="sous-titre">{nouveauMatching ? "Chaque CV retenu a été comparé en entier à la fiche de poste, critère par critère. Affichés : les profils notés 31 et plus, du plus haut au plus bas." : "Profils notés 31 et plus, du plus haut au plus bas, avec les notes calculées avant le 24/11/2026 (ancienne note)."} La note est une aide à la décision, jamais un refus automatique.</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {resume.calculeLe && <span>Classement du {new Date(resume.calculeLe).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</span>}
              {resume.calculeLe && !nouveauMatching && <span className="pastille">Ancienne note</span>}
              {resume.miseAJour && <span className="pastille pastille-orange">Mise à jour en cours…</span>}
              {!nouveauMatching && <BoutonRecalculer missionId={id} />}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="pastille pastille-vert">75 et plus : très bonne adéquation</span>
            <span className="pastille">50 à 74 : à étudier</span>
          </div>
        </div>

        {/* Profil choisi : fenêtre à droite (avis de l'IA, expériences, CV) ; clic en dehors, ✕ ou Échap pour fermer, ← → pour naviguer. */}
        {(() => {
          const i = proposes.findIndex((c) => c.consultant_id === profilOuvert);
          if (i < 0) return null;
          const c = proposes[i];
          const lien = (j: number) => (j >= 0 && j < proposes.length ? `/missions/${id}?profil=${proposes[j].consultant_id}` : null);
          return (
            <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${c.prenom} ${c.nom}`}>
              <Link href={`/missions/${id}`} scroll={false} className="absolute inset-0 bg-nuit/30 backdrop-blur-[1px]" aria-label="Fermer" />
              <div className="absolute inset-y-0 right-0 flex w-full max-w-[1100px] flex-col bg-slate-50 shadow-2xl sm:w-[85vw]">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                  <Link href={`/missions/${id}`} scroll={false} className="flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-slate-200 hover:bg-slate-50" aria-label="Fermer">✕</Link>
                  <span className="min-w-0 flex-1 truncate text-lg font-bold text-nuit">{c.prenom === "—" ? "" : c.prenom} {c.nom} <span className="font-normal text-slate-400">({i + 1}/{proposes.length})</span></span>
                  <span className="hidden text-sm text-slate-500 sm:inline">Utilisez ← → pour naviguer</span>
                  {lien(i - 1) && <Link href={lien(i - 1)!} scroll={false} className="flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-slate-200 hover:bg-slate-50" aria-label="Profil précédent">←</Link>}
                  {lien(i + 1) && <Link href={lien(i + 1)!} scroll={false} className="flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-slate-200 hover:bg-slate-50" aria-label="Profil suivant">→</Link>}
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                  <CarteCandidat rang={i + 1} c={c} missionId={id} statut={suivi.get(c.consultant_id)} ouvert cv={cvParConsultant.get(c.consultant_id)} avis={avisParConsultant.get(c.consultant_id)} retour={retourParConsultant.get(c.consultant_id)} />
                  <Suspense fallback={<div className="squelette h-[480px]" />}><ApercuDuCV consultantId={c.consultant_id} /></Suspense>
                </div>
              </div>
              <NavigationProfils precedent={lien(i - 1)} suivant={lien(i + 1)} fermer={`/missions/${id}`} />
            </div>
          );
        })()}

        {/* Tous les profils en petites cartes, par groupe de note (seuils de la légende ci-dessus). */}
        {[
          { titre: "Très bonne adéquation", sous: "75 et plus", min: 75, max: 101 },
          { titre: "À étudier", sous: "50 à 74", min: 50, max: 75 },
          { titre: "Correspondance faible", sous: "31 à 49", min: 0, max: 50 },
        ].map((g) => {
          const liste = proposes.map((c, i) => ({ c, rang: i + 1 })).filter(({ c }) => { const n = Math.round(noteAffichee(c)); return n >= g.min && n < g.max; });
          if (!liste.length) return null;
          return (
            <section key={g.titre} className="space-y-3">
              <h3 className="text-base font-bold text-nuit">{g.titre} <span className="font-normal text-slate-400">({liste.length}) · {g.sous}</span></h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {liste.map(({ c, rang }) => {
                  const n = Math.round(noteAffichee(c));
                  const actif = c.consultant_id === profilOuvert;
                  const info = infos.get(c.consultant_id);
                  const nouveau = !!info && joursDepuis(info.arrivee) < 7;
                  const statut = suivi.get(c.consultant_id);
                  return (
                    <Link key={c.consultant_id} href={`/missions/${id}?profil=${c.consultant_id}`} scroll={false}
                      className={`carte flex flex-col gap-3 p-5 transition hover:ring-2 hover:ring-marque-200 ${actif ? "ring-2 ring-marque-500" : ""}`}>
                      <span className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-nuit text-sm font-bold text-white">{`${c.prenom?.[0] ?? ""}${c.nom?.[0] ?? ""}`.replace("—", "").toUpperCase() || "?"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold text-nuit">{c.prenom === "—" ? "" : c.prenom} {c.nom}</span>
                          <span className="block truncate text-sm text-slate-500">{c.intitule_poste ?? "Poste non renseigné"}</span>
                          {info && <span className="block text-xs text-slate-400">{ilYa(info.arrivee)}</span>}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {info?.tjm && <span className="rounded-lg bg-marque-50 px-2.5 py-1 text-sm font-semibold text-marque-700 ring-1 ring-marque-200">💶 {info.tjm}</span>}
                        {nouveau && <span className="rounded-lg bg-white px-2.5 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-300">✦ Nouveau</span>}
                        {dejaLus.has(c.consultant_id)
                          ? <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-500">✓ Lu</span>
                          : <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-sm font-semibold text-sky-700 ring-1 ring-sky-200">● Pas encore lu</span>}
                      </span>
                      <span className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-sm font-medium text-slate-500">{statut ? (STATUTS_PROPOSITION[statut] ?? statut) : "◌ Non sélectionné"}</span>
                        <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${n >= 75 ? "bg-emerald-50 text-emerald-700" : n >= 50 ? "bg-marque-50 text-marque-700" : "bg-slate-100 text-slate-600"}`}>{n}</span>
                      </span>
                      <span className="sr-only">Rang {rang}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!proposes.length && !resume.calculeLe && (
          <div className="carte p-8 text-center text-sm text-slate-500">
            <p className="font-medium text-nuit">Classement en préparation…</p>
            <p className="mt-1">Seules les missions de la colonne Trello « Missions en cours » sont lues par l&apos;IA (une seule fois) : comptez quelques minutes après leur arrivée, puis rechargez la page.</p>
          </div>
        )}
        {!proposes.length && !!resume.calculeLe && (
          <div className="carte p-8 text-center text-sm text-slate-500">
            <p className="font-medium text-nuit">Aucun profil pertinent pour l&apos;instant.</p>
            <p className="mt-1">Aucun CV de la base n&apos;a obtenu 31 ou plus pour cette mission. Un CV ajouté ensuite est comparé à la mission automatiquement.</p>
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

function CarteCandidat({ rang, c, missionId, statut, ouvert, cv, avis, retour }: {
  rang: number; c: LigneClassement; missionId: string; statut?: string; ouvert: boolean; cv?: { id: string; word: string; pdf: string | null }; avis?: AvisMission; retour?: "bon" | "pas";
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
          <div className="mt-0.5 truncate text-xs text-slate-500">Disponibilité : {c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : c.disponibilite ?? "non renseignée"}</div>
        </div>
        <JaugeScore score={noteAffichee(c)} />
      </div>
      {c.avisIA && (
        <div className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ring-1 ${AVIS_IA[c.avisIA.verdict].classe}`}>
          <span className="shrink-0 font-bold">Note · {c.avisIA.note != null ? `${c.avisIA.note}/100` : AVIS_IA[c.avisIA.verdict].libelle}</span>
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
          <select name="statut" defaultValue={statut ?? ""} aria-label="Suivi" className="rounded-full bg-transparent px-2 py-1 text-xs font-semibold text-nuit outline-none">
            <option value="" disabled>Suivi…</option>
            {Object.entries(STATUTS_PROPOSITION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <BoutonSuivi libelle={statut ? "OK" : "Suivre"} />
        </form>
        <AvisIA missionId={missionId} consultantId={c.consultant_id} initial={avis} />
        <form action={donnerRetourMatching} className="flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200">
          <input type="hidden" name="mission_id" value={missionId} />
          <input type="hidden" name="consultant_id" value={c.consultant_id} />
          <button name="avis" value="bon" aria-pressed={retour === "bon"} title="Bon profil pour cette mission"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${retour === "bon" ? "bg-emerald-600 text-white" : "text-emerald-700 hover:bg-emerald-50"}`}>👍 Bon profil</button>
          <button name="avis" value="pas" aria-pressed={retour === "pas"} title="Pas pour cette mission"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${retour === "pas" ? "bg-rose-600 text-white" : "text-rose-700 hover:bg-rose-50"}`}>👎 Pas pour cette mission</button>
        </form>
      </div>

      <details open={ouvert} className="group mt-3 rounded-2xl bg-slate-50/80 px-4 py-3 ring-1 ring-slate-200/70">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-nuit">Évaluation : récapitulatif et analyse point par point</span>
          <span className="ml-auto text-xs font-medium text-marque-600 group-open:hidden">Voir l&apos;évaluation</span>
        </summary>
        <div className="mt-3"><EvaluationIA note={c.avisIA?.note} raison={c.avisIA?.raison} detail={c.avisIA?.detail} /></div>
        <Link href={`/consultants/${c.consultant_id}?mission=${missionId}`} className="mt-3 inline-block text-sm font-semibold text-marque-600 hover:underline">Ouvrir sa fiche avec cette évaluation →</Link>
      </details>
    </article>
  );
}
