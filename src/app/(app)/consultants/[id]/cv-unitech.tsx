"use client";

import { useActionState } from "react";
import { genererCVUnitechAction, type EtatCVUnitech } from "@/lib/cv-unitech/actions";

/** Bloc « CV Unitech » de la fiche : Word nominatif + PDF anonymisé au modèle Unitech, avec l'adéquation à une mission. */
export interface CVGenere { id: string; date: string; mission: string | null; word: { nom: string; url: string }; pdf: { nom: string; url: string } }

export default function BlocCVUnitech({ consultantId, missions, generes }: { consultantId: string; missions: { id: string; intitule: string; client: string | null }[]; generes: CVGenere[] }) {
  const [etat, action, enCours] = useActionState<EtatCVUnitech, FormData>(genererCVUnitechAction, {});
  return (
    <form action={action} className="carte space-y-3 p-6 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">CV Unitech</h2>
      <p className="text-slate-500">Word nominatif et PDF anonymisé au modèle Unitech, à partir du CV de la fiche. Relisez-les avant envoi au client.</p>
      <input type="hidden" name="consultant_id" value={consultantId} />
      <label className="block font-medium text-nuit">Adéquation à la mission (facultatif)
        <select name="mission_id" defaultValue="" className="champ mt-1 w-full">
          <option value="">Sans mission (section « Profil »)</option>
          {missions.map((m) => <option key={m.id} value={m.id}>{m.intitule}{m.client ? ` · ${m.client}` : ""}</option>)}
        </select>
      </label>
      <button disabled={enCours} className="bouton-primaire w-full justify-center">{enCours ? "Rédaction du CV… (environ 30 s)" : "Générer le Word et le PDF Unitech"}</button>
      {etat.erreur && <p className="text-red-700">{etat.erreur}</p>}
      {generes.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="text-xs font-semibold text-slate-400">Déjà générés</div>
          {generes.map((g) => (
            <div key={g.id} className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-white/80">
              <div className="text-xs text-slate-400">{new Date(g.date).toLocaleDateString("fr-FR")} · {g.mission ?? "Sans mission"}</div>
              <div className="flex flex-wrap gap-3">
                <a href={g.word.url} target="_blank" rel="noreferrer" className="lien">Word</a>
                <a href={g.pdf.url} target="_blank" rel="noreferrer" className="lien">PDF anonymisé</a>
              </div>
            </div>
          ))}
        </div>
      )}
      {etat.resultat && (
        <div className="space-y-1 rounded-xl bg-emerald-50/80 p-3 text-emerald-800 ring-1 ring-emerald-200">
          <div>Déposés dans SharePoint · {etat.resultat.dossier.split("/").slice(-1)[0]}</div>
          <a href={etat.resultat.word.url} target="_blank" rel="noreferrer" className="lien block truncate">Word · {etat.resultat.word.nom}</a>
          <a href={etat.resultat.pdf.url} target="_blank" rel="noreferrer" className="lien block truncate">PDF · {etat.resultat.pdf.nom}</a>
        </div>
      )}
    </form>
  );
}
