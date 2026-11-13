"use client";

import { useActionState } from "react";
import { genererCVUnitechAction, genererPDFUnitechAction, type EtatCVUnitech, type EtatPDFUnitech } from "@/lib/cv-unitech/actions";

export interface CVGenere { id: string; date: string; mission: string | null; dossier: string | null; word: { nom: string; url: string }; pdf: { nom: string; url: string } | null; pdfLe: string | null }

/**
 * Bloc « CV Unitech » de la fiche, en deux temps :
 * 1. le Word au modèle Unitech (rangé dans le dossier métier), à relire et corriger si besoin dans SharePoint ;
 * 2. le PDF, produit à partir du Word tel qu'il est dans SharePoint (mis à jour chaque nuit si le Word change).
 */
export default function BlocCVUnitech({ consultantId, missions, generes }: { consultantId: string; missions: { id: string; intitule: string; client: string | null }[]; generes: CVGenere[] }) {
  const [etat, action, enCours] = useActionState<EtatCVUnitech, FormData>(genererCVUnitechAction, {});
  return (
    <div className="carte space-y-3 p-6 text-sm">
      <h2 className="titre-section">CV Unitech</h2>
      <p className="text-slate-500"><b>1.</b> Générez le Word, relisez-le et corrigez-le dans SharePoint. <b>2.</b> Produisez le PDF : il reprend le Word corrigé.</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="consultant_id" value={consultantId} />
        <label className="block font-medium text-nuit">Adéquation à la mission (facultatif)
          <select name="mission_id" defaultValue="" className="champ mt-1 w-full">
            <option value="">Sans mission (section « Profil »)</option>
            {missions.map((m) => <option key={m.id} value={m.id}>{m.intitule}{m.client ? ` · ${m.client}` : ""}</option>)}
          </select>
        </label>
        <button disabled={enCours} className="bouton-primaire w-full justify-center">{enCours ? "Rédaction du Word… (environ 30 s)" : "1. Générer le Word Unitech"}</button>
        {etat.erreur && <p className="text-red-700">{etat.erreur}</p>}
        {etat.resultat && (
          <p className="rounded-xl bg-emerald-50/80 p-3 text-emerald-800 ring-1 ring-emerald-200">
            Word déposé dans SharePoint · dossier <b>{etat.resultat.dossier.split("/").slice(-1)[0]}</b>. Relisez-le (les notes surlignées en jaune sont à compléter), puis produisez le PDF ci-dessous.
          </p>
        )}
        {etat.resultat?.avertissement && <p className="rounded-xl bg-amber-50 p-3 text-amber-800 ring-1 ring-amber-200">{etat.resultat.avertissement}</p>}
      </form>
      {generes.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="text-xs font-semibold text-slate-400">CV générés</div>
          {generes.map((g) => <LigneCV key={g.id} g={g} />)}
        </div>
      )}
    </div>
  );
}

function LigneCV({ g }: { g: CVGenere }) {
  const [etat, action, enCours] = useActionState<EtatPDFUnitech, FormData>(genererPDFUnitechAction, {});
  const pdf = etat.resultat?.pdf ?? g.pdf;
  return (
    <form action={action} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70">
      <input type="hidden" name="generation_id" value={g.id} />
      <div className="text-xs text-slate-400">{new Date(g.date).toLocaleDateString("fr-FR")} · {g.mission ?? "Sans mission"}{g.dossier ? ` · ${g.dossier.split("/").slice(-1)[0]}` : ""}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <a href={g.word.url} target="_blank" rel="noreferrer" className="bouton-secondaire text-xs">Word (ouvrir, corriger)</a>
        {pdf && <a href={pdf.url} target="_blank" rel="noreferrer" className="bouton-secondaire text-xs">PDF</a>}
        <button disabled={enCours} className="bouton-primaire py-1.5 text-xs">{enCours ? "Conversion…" : pdf ? "2. Mettre à jour le PDF" : "2. Produire le PDF"}</button>
      </div>
      {etat.erreur && <p className="mt-1 text-xs text-red-700">{etat.erreur}</p>}
      {etat.resultat && <p className="mt-1 text-xs text-emerald-700">PDF produit à partir du Word actuel ✓</p>}
    </form>
  );
}
