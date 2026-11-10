import { exigerUtilisateur } from "@/lib/acces";
import FormulaireMission from "./formulaire";

export default async function NouvelleMission() {
  await exigerUtilisateur();
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="titre-page">Nouvelle mission</h1>
        <p className="sous-titre mt-1">Importez la fiche du client : l&apos;outil la lit, vous vérifiez, puis il classe les consultants avec un score expliqué.</p>
      </div>
      <FormulaireMission />
    </div>
  );
}
