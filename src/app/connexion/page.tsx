"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function PageConnexion() {
  const [email, setEmail] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "envoye" | "erreur">("saisie");

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !cle) {
      setEtat("erreur");
      return;
    }
    setEtat("envoi");
    const supabase = createBrowserClient(url, cle);
    // shouldCreateUser: false -> aucun compte n'est créé pour une adresse non invitée.
    await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    // Message identique que l'adresse soit invitée ou non (on ne révèle pas qui a accès).
    setEtat("envoye");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-xl font-semibold">ATS Unitech Solution</h1>
        <p className="mt-1 text-sm text-zinc-600">Connexion réservée aux personnes invitées.</p>

        {etat === "envoye" ? (
          <p className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
            Si cette adresse est autorisée, un lien de connexion vient de lui être envoyé. Ouvrez-le depuis cet
            appareil.
          </p>
        ) : (
          <form onSubmit={envoyer} className="mt-6 space-y-4">
            <label className="block text-sm font-medium" htmlFor="email">
              Adresse email professionnelle
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900"
              placeholder="prenom.nom@unitechsolutions.fr"
            />
            <button
              type="submit"
              disabled={etat === "envoi"}
              className="w-full rounded-lg bg-zinc-900 px-3 py-2 font-medium text-white disabled:opacity-50"
            >
              {etat === "envoi" ? "Envoi…" : "Recevoir un lien de connexion"}
            </button>
            {etat === "erreur" && (
              <p className="text-sm text-red-700">L&apos;application n&apos;est pas encore reliée à sa base de données.</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
