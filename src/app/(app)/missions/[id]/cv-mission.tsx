"use client";

import { useActionState } from "react";
import { genererCVUnitechAction, type EtatCVUnitech } from "@/lib/cv-unitech/actions";

/** Sur un profil classé : CV Unitech (Word + PDF anonymisé) avec l'adéquation à cette mission. */
export default function BoutonCVMission({ consultantId, missionId }: { consultantId: string; missionId: string }) {
  const [etat, action, enCours] = useActionState<EtatCVUnitech, FormData>(genererCVUnitechAction, {});
  if (etat.resultat) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <a href={etat.resultat.word.url} target="_blank" rel="noreferrer" className="lien">Word Unitech</a>
        <a href={etat.resultat.pdf.url} target="_blank" rel="noreferrer" className="lien">PDF Unitech</a>
      </span>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="consultant_id" value={consultantId} />
      <input type="hidden" name="mission_id" value={missionId} />
      <button disabled={enCours} title={etat.erreur} className="flex h-9 items-center gap-1.5 rounded-full bg-white/70 px-3 text-xs font-semibold text-nuit ring-1 ring-white/80 transition hover:bg-white hover:shadow-md disabled:opacity-60">
        {enCours ? "Rédaction…" : etat.erreur ? "Réessayer le CV" : "CV Unitech pour cette mission"}
      </button>
    </form>
  );
}
