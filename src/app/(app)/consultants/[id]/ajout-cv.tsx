"use client";

import { useActionState, useState } from "react";
import { ajouterCVConsultant, type EtatAjoutCV } from "@/lib/consultants/actions";
import { AttenteVoile } from "../../attente";
import { messageCVTropLourd } from "@/lib/consultants/taille-cv";

/** Ajouter ou remplacer le CV d'une fiche existante (PDF ou Word) : lu par l'IA, rangé dans SharePoint, compétences mises à jour. */
export default function AjoutCV({ id, aDejaUnCV }: { id: string; aDejaUnCV: boolean }) {
  const [etat, action, enCours] = useActionState<EtatAjoutCV, FormData>(ajouterCVConsultant, {});
  const [nom, setNom] = useState<string | null>(null);
  const [tropLourd, setTropLourd] = useState<string | null>(null);
  return (
    <form action={action} className="carte space-y-3 p-5 text-sm">
      <AttenteVoile actif={enCours} messages={["J'enregistre le CV…", "L'IA lit le CV : poste, expérience, compétences…", "Je mets à jour la fiche et le matching…"]} sousTitre="Environ 15 secondes." />
      <h2 className="titre-section">{aDejaUnCV ? "Remplacer le CV" : "Ajouter un CV"}</h2>
      <p className="text-slate-500">PDF ou Word, 4 Mo au maximum. Les champs vides de la fiche sont complétés à partir du CV ; rien de ce qui est déjà saisi n&apos;est remplacé.</p>
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="bouton-secondaire cursor-pointer">
          <input type="file" name="cv" accept=".pdf,.docx,.doc" className="sr-only" onChange={(e) => {
            const f = e.target.files?.[0];
            const refus = f ? messageCVTropLourd(f.size) : null;
            setTropLourd(refus);
            // Trop lourd : le fichier n'est jamais envoyé (choix effacé).
            if (refus) { e.target.value = ""; setNom(null); } else setNom(f?.name ?? null);
          }} />
          Choisir le fichier
        </label>
        <span className="min-w-0 truncate text-slate-600">{nom ?? "Aucun fichier choisi"}</span>
        <button disabled={!nom || enCours} className="bouton-primaire">{aDejaUnCV ? "Remplacer le CV" : "Ajouter le CV"}</button>
      </div>
      {tropLourd && <p role="alert" className="text-red-700">{tropLourd}</p>}
      {etat.erreur && <p className="text-red-700">{etat.erreur}</p>}
    </form>
  );
}
