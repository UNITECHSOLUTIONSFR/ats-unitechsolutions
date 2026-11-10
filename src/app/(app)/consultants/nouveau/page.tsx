import { exigerUtilisateur } from "@/lib/acces";
import Formulaire from "./formulaire";

export default async function NouveauConsultant() {
  await exigerUtilisateur();
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="titre-page">Nouveau consultant</h1>
      <p className="text-zinc-600">La fiche apparaît tout de suite dans l&apos;écran Consultants, et elle est ajoutée au fichier Excel de suivi la nuit suivante.</p>
      <Formulaire />
    </div>
  );
}
