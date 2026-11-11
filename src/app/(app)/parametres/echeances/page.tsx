import { exigerAdmin } from "@/lib/acces-admin";
import { chargerBilanAdmin } from "@/lib/admin/bilan";
import { enregistrerEcheance, retirerEcheance } from "@/lib/admin/actions";
import { PastilleEcheance } from "@/app/(app)/bilan-admin";

/** Échéances des secrets et accès : l'administrateur saisit les dates, l'outil prévient 30 puis 7 jours avant. */
export default async function Echeances() {
  const { supabase } = await exigerAdmin();
  const { echeances } = await chargerBilanAdmin(supabase);
  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-slate-600">
        Seules les <strong>dates</strong> sont enregistrées ici, jamais les secrets eux-mêmes. Le tableau de bord prévient 30 jours puis 7 jours avant chaque échéance.
      </p>
      {echeances.map((e) => (
        <form key={e.id} action={enregistrerEcheance} className="carte grid gap-3 p-5 text-sm sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="id" value={e.id} />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-nuit">{e.nom}</span><PastilleEcheance e={e} /></div>
            {e.ouRenouveler && <p className="text-slate-500">Où : {e.ouRenouveler}</p>}
            <input name="note" defaultValue={e.note ?? ""} placeholder="Note" className="champ w-full" />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block"><span className="text-slate-600">Expire ou se renouvelle le</span>
              <input type="date" name="expire_le" defaultValue={e.expireLe ?? ""} className="champ mt-1 block" /></label>
            <button className="bouton-primaire">Enregistrer</button>
            <button formAction={retirerEcheance} className="bouton-secondaire">Retirer</button>
          </div>
        </form>
      ))}
      <form action={enregistrerEcheance} className="carte grid gap-3 p-5 text-sm sm:grid-cols-4">
        <input name="nom" required placeholder="Autre secret ou abonnement" className="champ sm:col-span-2" />
        <input name="ou_renouveler" placeholder="Où le renouveler" className="champ" />
        <input type="date" name="expire_le" className="champ" />
        <button className="bouton-secondaire sm:col-span-4 sm:justify-self-start">Ajouter</button>
      </form>
    </div>
  );
}
