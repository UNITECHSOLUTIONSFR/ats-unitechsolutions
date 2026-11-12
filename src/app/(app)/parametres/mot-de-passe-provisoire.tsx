"use client";

import { useActionState, useState } from "react";
import { nouveauMotDePasse, type EtatUtilisateur } from "@/lib/utilisateurs/actions";

/** Mot de passe provisoire affiché une seule fois, avec bouton « Copier » et le message prêt à envoyer. */
export function AffichageMotDePasse({ email, motDePasse }: { email?: string; motDePasse: string }) {
  const [copie, setCopie] = useState(false);
  const texte = `Ton accès à l'outil de recrutement Unitech : https://ats-unitechsolutions.vercel.app\nIdentifiant : ${email ?? "ton email professionnel"}\nMot de passe provisoire : ${motDePasse}\nTu en choisiras un nouveau à la première connexion.`;
  return (
    <div className="w-full rounded-2xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200">
      <div className="text-emerald-800">Mot de passe provisoire (affiché une seule fois) :</div>
      <div className="mt-1 select-all font-mono text-xl font-bold tracking-wider text-nuit">{motDePasse}</div>
      <button type="button" onClick={() => navigator.clipboard.writeText(texte).then(() => setCopie(true))} className="bouton-secondaire mt-2">
        {copie ? "Copié ✓" : "Copier le message à envoyer (Teams, SMS…)"}
      </button>
    </div>
  );
}

/** « Nouveau mot de passe » (mot de passe oublié) : un administrateur en génère un provisoire. Aucun email n'est envoyé. */
export function BoutonNouveauMotDePasse({ id, email }: { id: string; email: string }) {
  const [etat, action, enCours] = useActionState<EtatUtilisateur, FormData>(nouveauMotDePasse, {});
  return (
    <form action={action} className="inline-flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      {!etat.motDePasse && (
        <button disabled={enCours} className="rounded-lg bg-marque-50 px-3 py-1 text-xs font-semibold text-marque-700 hover:bg-marque-100">
          {enCours ? "…" : "Nouveau mot de passe"}
        </button>
      )}
      {etat.erreur && <span className="text-xs text-red-700">{etat.erreur}</span>}
      {etat.motDePasse && <AffichageMotDePasse email={email} motDePasse={etat.motDePasse} />}
    </form>
  );
}
