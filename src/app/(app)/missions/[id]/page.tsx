import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/acces";
import { classementMission } from "@/lib/matching/classement";
import { formaterTelephone } from "@/lib/metier/telephone";
import { changerStatutMission, modifierExigence, suivreProposition } from "@/lib/missions/actions";

const STATUTS_PROPOSITION: Record<string, string> = {
  propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé",
};
const IMPORTANCE = ["", "secondaire", "importante", "essentielle"];

export default async function PageMission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await exigerUtilisateur();
  const { data: mission } = await supabase
    .from("missions")
    .select("id, client, intitule, texte_besoin, statut, localisation, date_debut, annees_min, seniorite, exigences, mission_competences(competence_id, obligatoire, importance, annees_min, competences(nom_canonique))")
    .eq("id", id)
    .maybeSingle();
  if (!mission) notFound();

  const [classement, { data: propositions }] = await Promise.all([
    classementMission(supabase, id),
    supabase.from("propositions").select("consultant_id, statut").eq("mission_id", id),
  ]);
  const suivi = new Map((propositions ?? []).map((p) => [p.consultant_id, p.statut as string]));
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
        <form action={changerStatutMission} className="flex items-center gap-2 text-sm">
          <input type="hidden" name="mission_id" value={id} />
          <select name="statut" defaultValue={mission.statut} className="champ py-1.5">
            <option value="ouverte">Ouverte</option><option value="pourvue">Pourvue</option><option value="fermee">Fermée</option>
          </select>
          <button className="bouton-secondaire">Enregistrer</button>
        </form>
      </div>

      <section className="carte p-5">
        <h2 className="font-semibold">Exigences extraites</h2>
        <p className="text-sm text-zinc-500">Ajustez-les si besoin : le classement se recalcule aussitôt.</p>
        <ul className="mt-3 divide-y divide-white/70">
          {exigences.map((e) => (
            <li key={e.competence_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="min-w-40 font-medium">{e.competences?.nom_canonique}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${e.obligatoire ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-600"}`}>
                {e.obligatoire ? "obligatoire" : "souhaitée"}
              </span>
              <span className="text-zinc-500">{IMPORTANCE[e.importance]}{e.annees_min ? ` · ${e.annees_min} an(s) min.` : ""}</span>
              <form action={modifierExigence} className="ml-auto flex gap-2">
                <input type="hidden" name="mission_id" value={id} />
                <input type="hidden" name="competence_id" value={e.competence_id} />
                <input type="hidden" name="action" value="obligatoire" />
                <input type="hidden" name="valeur" value={String(!e.obligatoire)} />
                <button className="text-xs text-zinc-600 underline">{e.obligatoire ? "rendre souhaitée" : "rendre obligatoire"}</button>
              </form>
              <form action={modifierExigence}>
                <input type="hidden" name="mission_id" value={id} />
                <input type="hidden" name="competence_id" value={e.competence_id} />
                <input type="hidden" name="action" value="retirer" />
                <button className="text-xs text-zinc-600 underline">retirer</button>
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

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Consultants classés ({classement.length})</h2>
        <p className="text-sm text-zinc-500">Le score est une aide à la décision, jamais un refus automatique.</p>
        <div className="overflow-x-auto carte">
          <table className="w-full text-sm">
            <thead className="bg-white/50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-3">#</th><th className="p-3">Consultant</th><th className="p-3">Score et raisons</th>
                <th className="p-3">Disponibilité</th><th className="p-3">Téléphone</th><th className="p-3">CV</th><th className="p-3">Suivi</th>
              </tr>
            </thead>
            <tbody>
              {classement.map((c, i) => (
                <tr key={c.consultant_id} className={`border-t border-white/70 align-top ${c.resultat.elimine ? "opacity-60" : ""}`}>
                  <td className="p-3 text-zinc-400">{i + 1}</td>
                  <td className="p-3">
                    <Link href={`/consultants/${c.consultant_id}`} className="font-medium hover:underline">
                      {c.prenom} {c.nom}
                    </Link>
                    <div className="text-xs text-zinc-500">{c.trigramme} · {c.intitule_poste ?? "—"}</div>
                  </td>
                  <td className="w-80 p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-slate-200/60">
                        <div className="h-2 rounded-full bg-gradient-to-r from-marque-600 to-marque-400" style={{ width: `${c.resultat.score}%` }} />
                      </div>
                      <span className="font-semibold">{Math.round(c.resultat.score)}</span>
                    </div>
                    {c.resultat.elimine && <div className="mt-1 text-xs text-red-700">{c.resultat.motifsElimination.join(" ; ")}</div>}
                    {c.resultat.alertes.map((a) => <div key={a} className="mt-1 text-xs text-amber-700">⚠ {a}</div>)}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-zinc-500">Pourquoi ce score ?</summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                        {c.resultat.raisons.map((r) => (
                          <li key={r.critere}>{r.max ? `${r.points}/${r.max} · ` : ""}{r.texte}</li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td className="p-3">{c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR") : c.disponibilite ?? "—"}</td>
                  <td className="whitespace-nowrap p-3">
                    {c.telephone_e164 ? <a href={`tel:${c.telephone_e164}`} className="hover:underline">{formaterTelephone(c.telephone_e164)}</a> : "—"}
                  </td>
                  <td className="p-3">
                    {c.pdf_anonyme_url
                      ? <a href={c.pdf_anonyme_url} target="_blank" rel="noreferrer" className="text-marque-700 hover:underline">PDF anonymisé</a>
                      : <span className="text-xs text-amber-700">PDF anonymisé manquant</span>}
                  </td>
                  <td className="p-3">
                    <form action={suivreProposition} className="flex items-center gap-1">
                      <input type="hidden" name="mission_id" value={id} />
                      <input type="hidden" name="consultant_id" value={c.consultant_id} />
                      <input type="hidden" name="score" value={c.resultat.score} />
                      <input type="hidden" name="detail" value={JSON.stringify(c.resultat)} />
                      <select name="statut" defaultValue={suivi.get(c.consultant_id) ?? "propose"} className="champ px-2 py-1 text-xs">
                        {Object.entries(STATUTS_PROPOSITION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <button className="bouton-secondaire px-3 py-1 text-xs">
                        {suivi.has(c.consultant_id) ? "OK" : "Suivre"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!classement.length && (
                <tr><td colSpan={7} className="p-6 text-center text-zinc-500">Aucun consultant ne possède les compétences demandées.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
