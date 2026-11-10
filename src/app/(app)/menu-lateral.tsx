"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconeAccueil, IconeFiche, IconeMallette, IconePersonnes, IconeReglages, IconeSortie, IconeTableau } from "./icones";

const LIENS = [
  { href: "/", libelle: "Tableau de bord", Icone: IconeAccueil },
  { href: "/consultants", libelle: "Consultants", Icone: IconePersonnes },
  { href: "/cv", libelle: "CV SharePoint", Icone: IconeTableau },
  { href: "/missions", libelle: "Missions", Icone: IconeMallette },
];

export default function MenuLateral({ nom, email, estAdmin }: { nom: string; email: string; estAdmin: boolean }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const liens = [...LIENS, ...(estAdmin ? [{ href: "/parametres", libelle: "Paramètres", Icone: IconeReglages }] : []), { href: "/aide", libelle: "Aide", Icone: IconeFiche }];
  const actif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));
  const initiales = nom.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((m) => m[0]!.toUpperCase()).join("");

  return (
    <>
      {/* Barre du haut sur téléphone */}
      <div className="verre sticky top-0 z-40 flex items-center justify-between px-4 py-3 lg:hidden">
        <Logo />
        <button onClick={() => setOuvert(!ouvert)} className="bouton-secondaire">{ouvert ? "Fermer" : "Menu"}</button>
      </div>

      <aside className={`${ouvert ? "flex" : "hidden"} w-full flex-col lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-68 lg:shrink-0 lg:p-3`}>
        <div className="verre flex flex-1 flex-col rounded-none lg:rounded-[1.75rem]">
          <div className="hidden px-5 pb-5 pt-6 lg:block"><Logo /></div>
          <nav className="flex-1 space-y-1 px-3 py-2">
            {liens.map(({ href, libelle, Icone }) => (
              <Link key={href} href={href} onClick={() => setOuvert(false)}
                className={`group flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  actif(href) ? "bg-nuit text-white shadow-[0_8px_20px_-8px_rgba(11,26,63,0.6)]" : "text-slate-600 hover:bg-white/70 hover:text-nuit"
                }`}>
                <Icone className={`h-[18px] w-[18px] ${actif(href) ? "text-white" : "text-slate-400 group-hover:text-nuit"}`} />
                {libelle}
              </Link>
            ))}
          </nav>
          <div className="m-3 flex items-center gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-white/80">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marque-400 to-marque-700 text-sm font-semibold text-white">
              {initiales || "?"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-nuit">{nom}</div>
              <div className="truncate text-xs text-slate-500">{estAdmin ? "Administrateur" : "Recruteur"}</div>
            </div>
            <form action="/auth/deconnexion" method="post">
              <button title={`Se déconnecter (${email})`} className="rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-nuit">
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
      <img src="/logo-unitech-symbole.png" alt="" className="h-9 w-9 rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-200/70" />
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-nuit">Unitech <span className="font-medium text-marque-500">Recrutement</span></div>
        <div className="text-[11px] text-slate-500">Suivi &amp; matching des consultants</div>
      </div>
    </div>
  );
}
