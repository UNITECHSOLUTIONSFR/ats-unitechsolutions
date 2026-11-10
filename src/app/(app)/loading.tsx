/** Affiché instantanément au changement d'écran, le temps que les données arrivent. */
export default function Chargement() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Chargement">
      <div className="squelette h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="squelette h-24" />)}
      </div>
      <div className="squelette h-[50vh]" />
    </div>
  );
}
