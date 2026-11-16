"use client";

import { AttenteVoile } from "../../attente";

import { useActionState } from "react";
import { genererCVUnitechAction, genererPDFUnitechAction, type EtatCVUnitech, type EtatPDFUnitech } from "@/lib/cv-unitech/actions";

const classe = "flex h-10 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-nuit ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-slate-300 disabled:opacity-60 sm:h-9";

/** Sur un profil classé : Word Unitech avec l'adéquation à cette mission, puis PDF produit à partir du Word (corrigé ou non). */
export default function BoutonCVMission({ consultantId, missionId, existant }: { consultantId: string; missionId: string; existant?: { id: string; word: string; pdf: string | null } }) {
  const [etat, action, enCours] = useActionState<EtatCVUnitech, FormData>(genererCVUnitechAction, {});
  const voileCV = <AttenteVoile actif={enCours} messages={["Je lis le CV du consultant…", "Je rédige le CV au format Unitech…", "Je mets en page le Word…", "J'enregistre le document, presque fini…"]} sousTitre="Environ 30 secondes. Vous pouvez rester sur cette page." />;
  const cv = existant ?? (etat.resultat ? { id: etat.resultat.id, word: etat.resultat.word.url, pdf: null } : undefined);
  if (cv) return <WordPuisPDF cv={cv} />;
  return (
    <form action={action}>
      {voileCV}
      <input type="hidden" name="consultant_id" value={consultantId} />
      <input type="hidden" name="mission_id" value={missionId} />
      <button disabled={enCours} title={etat.erreur} className={classe}>
        {enCours ? "Rédaction du Word…" : etat.erreur ? "Réessayer le CV" : "CV Unitech (Word)"}
      </button>
    </form>
  );
}

function WordPuisPDF({ cv }: { cv: { id: string; word: string; pdf: string | null } }) {
  const [etat, action, enCours] = useActionState<EtatPDFUnitech, FormData>(genererPDFUnitechAction, {});
  const voilePDF = <AttenteVoile actif={enCours} messages={["Je convertis le Word en PDF…", "J'enregistre le PDF…"]} sousTitre="Quelques secondes." />;
  const pdf = etat.resultat?.pdf.url ?? cv.pdf;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {voilePDF}
      <input type="hidden" name="generation_id" value={cv.id} />
      <a href={cv.word} target="_blank" rel="noreferrer" className={classe}>Word Unitech</a>
      {pdf && <a href={pdf} target="_blank" rel="noreferrer" className={classe}>PDF Unitech</a>}
      <button disabled={enCours} title={etat.erreur} className={classe}>{enCours ? "Conversion…" : pdf ? "↻ PDF depuis le Word" : "PDF depuis le Word"}</button>
    </form>
  );
}
