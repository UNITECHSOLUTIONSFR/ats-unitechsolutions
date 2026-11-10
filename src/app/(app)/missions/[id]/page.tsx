import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/acces";
import { classementMission, type LigneClassement } from "@/lib/matching/classement";
import { formaterTelephone } from "@/lib/metier/telephone";
import { responsablesPossibles } from "@/lib/missions/responsables";
import ChoixResponsable from "../responsable";
import Shortlist, { type ProfilShortlist } from "./shortlist";
import BoutonCVMission from "./cv-mission";

// Génération des CV Unitech (IA + SharePoint) depuis cet écran : jusqu'à 2 minutes.
export const maxDuration = 120;
import { changerStatutMission, modifierExigence, suivreProposition } from "@/lib/missions/actions";

const STATUTS_PROPOSITION: Record<string, string> = {
  propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé",
};
const IMPORTANCE = ["", "secondaire", "importante", "essentielle"];

export default async function PageMission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { data: mission } = await supabase
    .from("missions")
    .select("id, client, intitule, texte_besoin, statut, responsable_id, localisation, date_debut, annees_min, seniorite, exigences, mission_competences(competence_id, obligatoire, importance, annees_min, competences(nom_canonique))")
    .eq("id", id)
    .maybeSingle();
  if (!mission) notFound();

  const [classement, { data: propositions }, responsables] = await Promise.all([
    classementMission(supabase, id),
    supabase.from("propositions").select("consultant_id, statut").eq("mission_id", id),
    responsablesPossibles(supabase),
  ]);
  const suivi = new Map((propositions ?? []).map((p) => [p.consultant_id, p.statut as string]));
  const shortlist: ProfilShortlist[] = classement.filter((c) => suivi.has(c.consultant_id) && suivi.get(c.consultant_id) !== "refuse").map((c) => ({
    trigramme: c.trigramme, poste: c.intitule_poste, annees: c.annees_experience, score: Math.round(c.resultat.score),
    disponibilite: c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR") : c.disponibilite ?? "à préciser", pdf: c.pdf_anonyme_url,
  }));
  const exigences = (mission.mission_competences ?? []) as unknown as {
    competence_id: string; obligatoire: boolean; importance: number; annees_min: number | null; competences: { nom_canonique: string } | null;
  }[];
  exigences.sort((a, b) => Number(b.obligatoire) - Number(a.obligatoire) || b.importance - a.importance);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="titre-page">{mission.intitule}</h1>
          <p className="text-zinc-600">
            {[mission.client, mission.localisation, mission.date_debut && `début ${new Date(mission.date_debut).toLocaleDateString("fr-FR")}`,
              mission.annees_min && `${mission.annees_min} ans min.`, mission.seniorite].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <Shortlist mission={mission.intitule} profils={shortlist} />
        {utilisateur.role === "admin" && <a href={`/missions/${id}/export`} className="bouton-secondaire">Exporter en Excel</a>}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Responsable</span>
          <ChoixResponsable missionId={id} responsableId={mission.responsable_id} responsables={responsables} estAdmin={utilisateur.role === "admin"} />
        </div>
        <form action={changerStatutMission} className="flex items-center gap-2 text-sm">
          <input type="hidden" name="mission_id" value={id} />
          <select name="statut" defaultValue={mission.statut} className="champ py-1.5">
            <option value="ouverte">Ouverte</option><option value="pourvue">Pourvue</option><option value="fermee">Fermée</option>
          </select>
          <button className="bouton-secondaire">Enregistrer</button>
        </form>
        </div>
      </div>

      <section className="carte p-6">
        <h2 className="font-semibold text-nuit">Exigences extraites</h2>
        <p className="text-sm text-zinc-500">Ajustez-les si besoin : le classement se recalcule aussitôt.</p>
        <ul className="mt-3 divide-y divide-white/70">
          {exigences.map((e) => (
            <li key={e.competence_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="min-w-40 font-medium">{e.competences?.nom_canonique}</span>
              <span className={`pastille ${e.obligatoire ? "pastille-rouge" : ""}`}>
                {e.obligatoire ? "obligatoire" : "souhaitée"}
              </span>
              <span className="text-zinc-500">{IMPORTANCE[e.importance]}{e.annees_min ? ` · ${e.annees_min} an(s) min.` : ""}</span>
              <form action={modifierExigence} className="ml-auto flex gap-2">
                <input type="hidden" name="mission_id" value={id} />
                <input type="hidden" name="competence_id" value={e.competence_id} />
                <input type="hidden" name="action" value="obligatoire" />
                <input type="hidden" name="valeur" value={String(!e.obligatoire)} />
                <button className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-nuit">{e.obligatoire ? "rendre souhaitée" : "rendre obligatoire"}</button>
              </form>
              <form action={modifierExigence}>
                <input type="hidden" name="mission_id" value={id} />
                <input type="hidden" name="competence_id" value={e.competence_id} />
                <input type="hidden" name="action" value="retirer" />
                <button className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-700">retirer</button>
              </form>
            </li>
          ))}
          {!exigences.length && <li className="py-2 text-sm text-zinc-500">Aucune compétence identifiée.</li>}
        </ul>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-zinc-500">Texte du besoin</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-zinc-700">{mission.texte_besoin}</pre>
        </details>
      </section>

      <section className="space-y-4">
        {/* Synthèse */}
        <div className="carte flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-nuit">
              {classement.filter((c) => !c.resultat.elimine && c.resultat.score >= 60).length} profil(s) pertinent(s) pour cette mission
            </h2>
            <p className="sous-titre">{classement.length} consultant(s) classé(s) · le score est une aide à la décision, jamais un refus automatique.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="pastille pastille-vert">≥ 75 : très bonne adéquation</span>
            <span className="pastille">50 – 74 : à étudier</span>
          </div>
        </div>

        {classement.map((c, i) => (
          <CarteCandidat key={c.consultant_id} rang={i + 1} c={c} missionId={id} statut={suivi.get(c.consultant_id)} ouvert={i < 10} />
        ))}
        {!classement.length && <div className="carte p-8 text-center text-slate-500">Aucun consultant ne possède les compétences demandées.</div>}
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
function CarteCandidat({ rang, c, missionId, statut, ouvert }: {
  rang: number; c: LigneClassement; missionId: string; statut?: string; ouvert: boolean;
}) {
  const n = niveau(c.resultat.score);
  const initiales = `${c.prenom?.[0] ?? ""}${c.nom?.[0] ?? ""}`.replace("—", "").toUpperCase() || "?";
  const action = "flex h-9 items-center gap-1.5 rounded-full bg-white/70 px-3 text-xs font-semibold text-nuit ring-1 ring-white/80 transition hover:bg-white hover:shadow-md";
  return (
    <article className={`carte p-5 ${c.resultat.elimine ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-marque-400 to-marque-700 text-lg font-bold text-white shadow-md">{initiales}</span>
          <span className="absolute -left-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-nuit shadow ring-1 ring-slate-200">{rang}</span>
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/consultants/${c.consultant_id}`} className="text-base font-semibold text-nuit hover:text-marque-600">{c.prenom} {c.nom}</Link>
          <div className="truncate text-sm text-slate-500">{c.intitule_poste ?? "Poste non renseigné"} · <span className="font-mono">{c.trigramme}</span></div>
          <div className="mt-0.5 text-xs text-slate-500">Disponibilité : {c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR") : c.disponibilite ?? "non renseignée"}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.telephone_e164 && <a href={`tel:${c.telephone_e164}`} className={action} title={formaterTelephone(c.telephone_e164)}>☎ {formaterTelephone(c.telephone_e164)}</a>}
          {c.email && <a href={`mailto:${c.email}`} className={action}>✉ Email</a>}
          {c.word_url && <a href={c.word_url} target="_blank" rel="noreferrer" className={action}>CV Word</a>}
          {c.pdf_anonyme_url
            ? <a href={c.pdf_anonyme_url} target="_blank" rel="noreferrer" className={action}>PDF anonymisé</a>
            : <span className="pastille pastille-orange">PDF anonymisé manquant</span>}
          <BoutonCVMission consultantId={c.consultant_id} missionId={missionId} />
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
