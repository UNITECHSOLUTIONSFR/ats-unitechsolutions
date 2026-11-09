import { exigerUtilisateur } from "@/lib/acces";
import FormulaireMission from "./formulaire";

export default async function NouvelleMission() {
  await exigerUtilisateur();
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="titre-page">Nouvelle mission</h1>
      <p className="text-zinc-600">
        Collez le besoin du client tel que vous l&apos;avez reçu. L&apos;outil en extrait les compétences demandées, puis
        classe les consultants. Vous pourrez ajuster les exigences ensuite.
      </p>
      <FormulaireMission />
    </div>
  );
}
