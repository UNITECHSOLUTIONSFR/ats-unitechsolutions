import type { FichierAEffacer } from "@/lib/rgpd/effacement";

/** Fichiers à supprimer à la main dans SharePoint (ou dans la boîte mail) après un effacement. */
export default function ListeFichiers({ fichiers }: { fichiers: FichierAEffacer[] }) {
  if (!fichiers.length) return <p className="text-zinc-500">Aucun fichier SharePoint relié.</p>;
  return (
    <div>
      <p className="font-medium text-amber-700">À supprimer aussi à la main dans SharePoint :</p>
      <ul className="mt-1 list-disc pl-5">
        {fichiers.map((f, i) => (
          <li key={i}>{f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="text-marque-700 hover:underline">{f.nom}</a> : f.nom}{f.chemin ? ` — ${f.chemin}` : ""}</li>
        ))}
      </ul>
    </div>
  );
}
