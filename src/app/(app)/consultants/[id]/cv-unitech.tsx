"use client";

import { useActionState } from "react";
import { genererCVUnitechAction, type EtatCVUnitech } from "@/lib/cv-unitech/actions";

/** Bloc « CV Unitech » de la fiche : Word nominatif + PDF anonymisé au modèle Unitech, avec l'adéquation à une mission. */
export default function BlocCVUnitech({ consultantId, missions }: { consultantId: string; missions: { id: string; intitule: string; client: string | null }[] }) {
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
