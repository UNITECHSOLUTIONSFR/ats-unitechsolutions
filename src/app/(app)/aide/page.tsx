import Link from "next/link";

/** Guide de démarrage en une page, pour l'équipe recrutement. */
export default function Aide() {
  const etapes = [
    { titre: "Trouver un consultant", texte: "Écran Consultants : tapez un nom, une compétence, une ville ou un numéro dans la recherche (ex. « java paris »). Les onglets filtrent par domaine. Cliquez sur une ligne pour ouvrir la fiche." },
    { titre: "Lire et contacter", texte: "La fiche montre en un coup d'œil : téléphone, email, CV Word et PDF anonymisé (SharePoint), disponibilité, compétences et missions. Les boutons du haut appellent ou écrivent directement." },
    { titre: "Mettre à jour", texte: "Double-cliquez sur une cellule du tableau pour la modifier, comme dans Excel. Cochez plusieurs lignes pour modifier une colonne d'un coup ou copier les emails. Tout est enregistré et historisé." },
    { titre: "Répondre à un besoin client", texte: "Missions → Nouvelle mission : collez le texte du client. L'outil en extrait les exigences et classe les profils avec un score sur 100 expliqué. Le score est une aide, jamais une décision." },
    { titre: "Suivre une proposition", texte: "Sur la mission ou depuis la fiche (« Proposer »), faites avancer chaque consultant : proposé → appelé → envoyé au client → retenu ou refusé." },
    { titre: "Candidatures reçues", texte: "Les CV envoyés à recrutement@ sont lus automatiquement : la fiche est créée ou complétée et apparaît en haut du tableau. Rien à faire de votre côté." },
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="titre-page">Démarrer en 5 minutes</h1>
        <p className="sous-titre mt-1">Tout ce qu&apos;il faut savoir pour utiliser l&apos;outil au quotidien.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {etapes.map((e, i) => (
          <section key={e.titre} className="carte p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-nuit text-sm font-bold text-white">{i + 1}</span>
              <h2 className="font-semibold text-nuit">{e.titre}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{e.texte}</p>
          </section>
        ))}
      </div>
      <section className="carte p-5 text-sm text-slate-600">
        <h2 className="font-semibold text-nuit">Bon à savoir</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Une disponibilité de plus de 3 mois est signalée « à vérifier » : pensez à la mettre à jour après chaque échange.</li>
          <li>Les cas douteux (doublons possibles, téléphones à vérifier) sont regroupés dans <Link href="/alertes" className="lien">Cas à vérifier</Link>.</li>
          <li>Les données des candidats sont personnelles : ne les exportez et ne les partagez que pour le besoin d&apos;une mission.</li>
          <li>Une question ou un problème : contactez l&apos;administratrice de l&apos;outil.</li>
        </ul>
      </section>
    </div>
  );
}
