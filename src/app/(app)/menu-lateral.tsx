"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconeAccueil, IconeEnveloppe, IconeGraphique, IconeFiche, IconeMallette, IconePersonnes, IconeRecherche, IconeReglages, IconeSortie } from "./icones";

/** Onglets du bas sur téléphone : l'essentiel en déplacement (le reste est dans « Menu »). */
const ONGLETS_MOBILE = [
  { href: "/", libelle: "Accueil", Icone: IconeAccueil },
  { href: "/recherche", libelle: "Recherche", Icone: IconeRecherche },
  { href: "/missions", libelle: "Missions", Icone: IconeMallette },
  { href: "/consultants", libelle: "Consultants", Icone: IconePersonnes },
];

const LIENS = [
  { href: "/", libelle: "Tableau de bord", Icone: IconeAccueil },
  { href: "/recherche", libelle: "Recherche", Icone: IconeRecherche },
  { href: "/consultants", libelle: "Consultants", Icone: IconePersonnes },
  { href: "/missions", libelle: "Missions", Icone: IconeMallette },
];

export default function MenuLateral({ nom, email, estAdmin }: { nom: string; email: string; estAdmin: boolean }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const liens = [
    ...LIENS,
    ...(estAdmin ? [{ href: "/emails", libelle: "Emails", Icone: IconeEnveloppe }] : []),
    { href: "/statistiques", libelle: "Statistiques", Icone: IconeGraphique },
    { href: "/aide", libelle: "Aide", Icone: IconeFiche },
    ...(estAdmin ? [{ href: "/parametres", libelle: "Paramètres", Icone: IconeReglages }] : []),
  ];
  const actif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));
  const initiales = nom.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((m) => m[0]!.toUpperCase()).join("");

  return (
    <>
      {/* Barre du haut sur téléphone (sous l'encoche) */}
      <div className="sticky top-0 z-40 flex items-center justify-between bg-gradient-to-r from-marque-600 to-nuit px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white lg:hidden">
        <Link href="/" onClick={() => setOuvert(false)}><Logo /></Link>
        <Link href="/missions/nouvelle" onClick={() => setOuvert(false)} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-nuit shadow">+ Mission</Link>
      </div>

      {/* Barre d'onglets en bas sur téléphone, comme une application */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 [&>*]:min-w-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navigation principale">
        {ONGLETS_MOBILE.map(({ href, libelle, Icone }) => (
          <Link key={href} href={href} onClick={() => setOuvert(false)}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${!ouvert && actif(href) ? "text-marque-600" : "text-slate-500"}`}>
            <Icone className="h-5 w-5" /><span className="max-w-full truncate px-0.5 text-[10px] min-[360px]:text-[11px]">{libelle}</span>
          </Link>
        ))}
        <button onClick={() => setOuvert(!ouvert)} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${ouvert ? "text-marque-600" : "text-slate-500"}`}>
          <span className="text-lg leading-5" aria-hidden>{ouvert ? "✕" : "☰"}</span><span className="text-[10px] min-[360px]:text-[11px]">{ouvert ? "Fermer" : "Menu"}</span>
        </button>
      </nav>

      <aside className={`${ouvert ? "fixed inset-0 z-30 flex overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))]" : "hidden"} w-full flex-col lg:static lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-68 lg:shrink-0 lg:overflow-visible lg:p-3 lg:pb-3 lg:pt-3`}>
        {/* Bleu Unitech, en verre : dégradé du bleu du logo vers le bleu nuit, liseré lumineux. */}
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-none bg-gradient-to-b from-marque-600 via-marque-700 to-nuit text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.25),0_20px_40px_-20px_rgba(2,33,121,0.8)] lg:rounded-[1.75rem]">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-marque-400/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative hidden px-5 pb-5 pt-6 lg:block"><Logo /></div>
          <nav className="relative flex-1 space-y-1 px-3 py-2">
            {liens.map(({ href, libelle, Icone }) => (
              <Link key={href} href={href} onClick={() => setOuvert(false)}
                className={`group flex items-center gap-3 rounded-full px-4 py-3 text-base font-semibold transition lg:py-2.5 lg:text-sm ${
                  actif(href) ? "bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25),0_8px_20px_-10px_rgba(0,0,0,0.5)] backdrop-blur" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}>
                <Icone className={`h-[18px] w-[18px] ${actif(href) ? "text-white" : "text-white/50 group-hover:text-white"}`} />
                {libelle}
              </Link>
            ))}
          </nav>
          <div className="relative m-3 flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-marque-700">
              {initiales || "?"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{nom}</div>
              <div className="truncate text-xs text-white/60">{estAdmin ? "Administrateur" : "Recruteur"} · <Link href="/mot-de-passe" onClick={() => setOuvert(false)} className="underline-offset-2 hover:text-white hover:underline">mot de passe</Link></div>
            </div>
            <form action="/auth/deconnexion" method="post">
              <button title={`Se déconnecter (${email})`} className="rounded-full p-1.5 text-white/60 hover:bg-white/15 hover:text-white">
                <IconeSortie className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- petit logo statique */}
      <img src="/logo-unitech-symbole.png" alt="" className="h-9 w-9 rounded-xl bg-white object-contain p-1 shadow-md" />
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-white">UNITECH <span className="font-medium text-marque-200">Recrutement</span></div>
        <div className="text-[11px] text-white/60">Suivi &amp; matching des consultants</div>
      </div>
    </div>
  );
}
