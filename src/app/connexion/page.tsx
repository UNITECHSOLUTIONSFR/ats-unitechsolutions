"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function PageConnexion() {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "refuse" | "erreur">("saisie");

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !cle) { setEtat("erreur"); return; }
    setEtat("envoi");
    const { error } = await createBrowserClient(url, cle).auth.signInWithPassword({ email: email.trim().toLowerCase(), password: motDePasse });
    // Même message que l'adresse existe ou non (on ne révèle pas qui a accès).
    if (error) { setEtat("refuse"); return; }
    // Passage par /auth/ : le compteur d'inactivité de la session repart de zéro.
    // Rechargement complet voulu : la nouvelle session (cookies) est lue par le serveur.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/auth/entree");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Bandeau */}
      <header className="verre sticky top-0 z-10 rounded-none">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo statique */}
            <img src="/logo-unitech-symbole.png" alt="" className="h-9 w-9 rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-200/70" />
            <span className="text-[17px] font-bold tracking-tight text-nuit">Unitech <span className="font-medium text-marque-500">Recrutement</span></span>
          </div>
          <span className="hidden text-sm text-slate-500 sm:block">Outil interne · accès sur invitation</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        {/* Accroche + connexion */}
        <section>
          <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.045em] text-nuit sm:text-6xl">
            Le bon consultant,<br />
            au bon moment,<br />
            <span className="bg-gradient-to-r from-marque-600 to-marque-400 bg-clip-text text-transparent">en une minute.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Tout le vivier Unitech au même endroit : fiches, CV SharePoint, candidatures reçues par email,
            et un classement expliqué des profils pour chaque besoin client.
          </p>

          <div className="mt-8 max-w-md">
            <Suspense fallback={null}><MessageSession /></Suspense>
            <form onSubmit={seConnecter} className="carte space-y-3 p-5">
              <label className="block text-sm font-medium text-nuit">Email professionnel
                <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@unitechsolutions.fr" className="champ mt-1 w-full py-3" />
              </label>
              <label className="block text-sm font-medium text-nuit">Mot de passe
                <input type="password" required autoComplete="current-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)}
                  className="champ mt-1 w-full py-3" />
              </label>
              {etat === "refuse" && <p className="text-sm text-red-700">Email ou mot de passe incorrect.</p>}
              {etat === "erreur" && <p className="text-sm text-red-700">L&apos;application n&apos;est pas encore reliée à sa base de données.</p>}
              <button type="submit" disabled={etat === "envoi"} className="bouton-primaire w-full justify-center py-3 text-base">
                {etat === "envoi" ? "Connexion…" : "Se connecter"}
              </button>
            </form>
            <p className="mt-3 px-2 text-sm text-slate-500">Mot de passe oublié ou premier accès : demandez à un administrateur un mot de passe provisoire.</p>
          </div>

          <div className="mt-12 flex flex-wrap gap-x-10 gap-y-4 border-t border-slate-200/70 pt-6">
            <Atout titre="Vivier" texte="Excel, CV et emails réunis" />
            <Atout titre="Matching" texte="Besoin client ↔ profils" />
            <Atout titre="Suivi" texte="Proposé → retenu" />
          </div>
        </section>

        {/* Aperçu illustratif de l'outil */}
        <section aria-hidden className="relative hidden lg:block">
          <div className="pointer-events-none absolute -inset-10 rounded-full bg-marque-300/25 blur-3xl" />
          <div className="carte relative overflow-hidden">
            <div className="flex items-center gap-1.5 border-b border-white/70 px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="ml-3 text-xs font-medium text-slate-500">Classement · Mission Développeur Java</span>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Score</div>
                  <div className="text-5xl font-extrabold tracking-tight text-emerald-600">86<span className="text-2xl">/100</span></div>
                </div>
                <span className="pastille pastille-vert">Très bonne adéquation</span>
              </div>
              <Barre libelle="Compétences demandées" valeur={92} />
              <Barre libelle="Expérience" valeur={80} />
              <Barre libelle="Disponibilité" valeur={100} />
              <div className="rounded-2xl bg-white/70 p-4 text-sm text-slate-600 ring-1 ring-white/80">
                <div className="mb-1 text-xs font-semibold text-marque-600">Pourquoi ce score</div>
                Java et Spring maîtrisés (8 ans), disponible sous 2 semaines, basé à Paris.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Atout({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div>
      <div className="text-xl font-bold tracking-tight text-nuit">{titre}</div>
      <div className="text-sm text-slate-500">{texte}</div>
    </div>
  );
}

function Barre({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-600"><span>{libelle}</span><span className="tabular-nums">{valeur}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200/70">
        <div className="h-full rounded-full bg-gradient-to-r from-marque-600 to-marque-400" style={{ width: `${valeur}%` }} />
      </div>
    </div>
  );
}

/** Explique pourquoi une nouvelle connexion est demandée (session de plus de 7 jours, ou 3 jours sans activité). */
function MessageSession() {
  const session = useSearchParams().get("session");
  if (!session) return null;
  return (
    <p className="mb-3 rounded-2xl bg-marque-50 px-4 py-2.5 text-sm text-marque-700 ring-1 ring-marque-100">
      {session === "duree" ? "Par sécurité, la connexion est renouvelée chaque semaine : reconnectez-vous." : "Vous n'avez pas utilisé l'outil depuis plus de 3 jours : reconnectez-vous."}
    </p>
  );
}
