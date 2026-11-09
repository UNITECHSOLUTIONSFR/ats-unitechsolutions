import { exigerAdmin } from "@/lib/acces-admin";
import FormulaireImport from "./formulaire";

export default async function ImportExcel() {
  await exigerAdmin();
  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-zinc-600">
        Déposez une <b>copie</b> du fichier Excel de suivi (format .xlsx). L&apos;outil affiche d&apos;abord un rapport,
        sans rien enregistrer ; vous confirmez ensuite l&apos;import. Le fichier n&apos;est pas conservé, et l&apos;original
        n&apos;est jamais modifié. Un même fichier peut être réimporté sans créer de doublons.
      </p>
      <FormulaireImport />
    </div>
  );
}
