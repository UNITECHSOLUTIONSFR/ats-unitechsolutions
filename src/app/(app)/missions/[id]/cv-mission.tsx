"use client";

import { useActionState } from "react";
import { genererCVUnitechAction, genererPDFUnitechAction, type EtatCVUnitech, type EtatPDFUnitech } from "@/lib/cv-unitech/actions";

const classe = "flex h-10 items-center gap-1.5 rounded-full bg-white/70 px-3 text-xs font-semibold text-nuit ring-1 ring-white/80 transition hover:bg-white hover:shadow-md disabled:opacity-60 sm:h-9";

/** Sur un profil classé : Word Unitech avec l'adéquation à cette mission, puis PDF produit à partir du Word (corrigé ou non). */
export default function BoutonCVMission({ consultantId, missionId, existant }: { consultantId: string; missionId: string; existant?: { id: string; word: string; pdf: string | null } }) {
  const [etat, action, enCours] = useActionState<EtatCVUnitech, FormData>(genererCVUnitechAction, {});
  const cv = existant ?? (etat.resultat ? { id: etat.resultat.id, word: etat.resultat.word.url, pdf: null } : undefined);
  if (cv) return <WordPuisPDF cv={cv} />;
  return (
    <form action={action}>
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
  const pdf = etat.resultat?.pdf.url ?? cv.pdf;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="generation_id" value={cv.id} />
      <a href={cv.word} target="_blank" rel="noreferrer" className={classe}>Word Unitech</a>
      {pdf && <a href={pdf} target="_blank" rel="noreferrer" className={classe}>PDF Unitech</a>}
      <button disabled={enCours} title={etat.erreur} className={classe}>{enCours ? "Conversion…" : pdf ? "↻ PDF depuis le Word" : "PDF depuis le Word"}</button>
    </form>
  );
}
