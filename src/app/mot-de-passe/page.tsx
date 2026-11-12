"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { motDePasseChoisi } from "@/lib/utilisateurs/actions";

/** Choix (ou changement) de son mot de passe : obligatoire après un mot de passe provisoire. */
export default function ChoixMotDePasse() {
  const [mdp, setMdp] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [etat, setEtat] = useState<{ enCours?: boolean; erreur?: string }>({});
  const robuste = mdp.length >= 10 && /[a-zA-Z]/.test(mdp) && /\d/.test(mdp);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!robuste) return setEtat({ erreur: "10 caractères au moins, avec des lettres et des chiffres." });
    if (mdp !== confirmation) return setEtat({ erreur: "Les deux mots de passe sont différents." });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !cle) return;
    setEtat({ enCours: true });
    const supabase = createBrowserClient(url, cle);
    const { error } = await supabase.auth.updateUser({ password: mdp });
    if (error) return setEtat({ erreur: error.message.includes("different") ? "Choisissez un mot de passe différent du provisoire." : "Enregistrement impossible : réessayez." });
    await motDePasseChoisi();
    await supabase.auth.refreshSession(); // la session ne porte plus la mention « provisoire »
    // Rechargement complet voulu : la nouvelle session (cookies) est lue par le serveur.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={enregistrer} className="carte w-full max-w-md space-y-4 p-6 sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo statique */}
        <img src="/logo-unitech-symbole.png" alt="" className="h-12 w-12 rounded-xl bg-white object-contain p-1 ring-1 ring-slate-200" />
        <div>
          <h1 className="text-xl font-bold text-nuit">Choisissez votre mot de passe</h1>
          <p className="mt-1 text-sm text-slate-600">10 caractères au moins, avec des lettres et des chiffres. Il remplace le mot de passe provisoire.</p>
        </div>
        <label className="block text-sm font-medium text-nuit">Nouveau mot de passe
          <input type="password" autoComplete="new-password" required value={mdp} onChange={(e) => setMdp(e.target.value)} className="champ mt-1 w-full py-3" />
        </label>
        <label className="block text-sm font-medium text-nuit">Confirmez-le
          <input type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="champ mt-1 w-full py-3" />
        </label>
        <p className={`text-xs ${robuste ? "text-emerald-700" : "text-slate-500"}`}>{robuste ? "✓ Mot de passe robuste" : "Au moins 10 caractères, lettres et chiffres"}</p>
        {etat.erreur && <p className="text-sm text-red-700">{etat.erreur}</p>}
        <button disabled={etat.enCours} className="bouton-primaire w-full justify-center py-3 text-base">{etat.enCours ? "Enregistrement…" : "Enregistrer et continuer"}</button>
      </form>
    </main>
  );
}
