"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clientNavigateur } from "@/lib/supabase/navigateur";

/** Deuxième étape de connexion des administrateurs : code à 6 chiffres de l'application d'authentification. */
export default function Verification() {
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const router = useRouter();
  const entrer = () => { router.replace("/"); router.refresh(); };

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true); setErreur("");
    const supabase = clientNavigateur();
    const { data } = await supabase.auth.mfa.listFactors();
    const facteur = data?.totp.find((f) => f.status === "verified");
    if (!facteur) { entrer(); return; }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: facteur.id, code: code.replace(/\s/g, "") });
    if (error) { setErreur("Code incorrect ou expiré. Réessayez avec le code affiché maintenant."); setEnCours(false); return; }
    entrer();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={valider} className="carte w-full max-w-sm space-y-4 p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-marque-500 to-marque-700 text-xl text-white">🔐</span>
        <h1 className="text-xl font-bold text-nuit">Vérification en deux étapes</h1>
        <p className="text-sm text-slate-500">Saisissez le code à 6 chiffres affiché dans votre application d&apos;authentification.</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7}
          className="champ w-full text-center text-2xl tracking-[0.4em]" placeholder="000000" aria-label="Code de vérification" />
        {erreur && <p className="text-sm text-red-700">{erreur}</p>}
        <button disabled={enCours || code.replace(/\s/g, "").length !== 6} className="bouton-primaire w-full justify-center">{enCours ? "Vérification…" : "Valider"}</button>
      </form>
    </main>
  );
}
