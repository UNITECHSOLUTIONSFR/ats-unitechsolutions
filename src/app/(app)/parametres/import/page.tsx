import { exigerAdmin } from "@/lib/acces-admin";
import FormulaireImport from "./formulaire";

export default async function ImportExcel() {
  await exigerAdmin();
  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-slate-600">
        Déposez un fichier Excel (.xlsx) : son contenu <b>s&apos;ajoute</b> à la base consultants, ligne par ligne, dans les
        colonnes qui portent le même titre. Rien n&apos;est écrasé ni supprimé. L&apos;outil affiche d&apos;abord ce qui va
        être ajouté ; rien n&apos;est enregistré avant votre confirmation. Le fichier n&apos;est pas conservé.
      </p>
      <FormulaireImport />
    </div>
  );
}
