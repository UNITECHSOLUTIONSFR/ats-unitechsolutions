"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconeAccueil, IconeMallette, IconePersonnes, IconeReglages, IconeSortie, IconeTableau } from "./icones";

const LIENS = [
  { href: "/", libelle: "Tableau de bord", Icone: IconeAccueil },
  { href: "/consultants", libelle: "Consultants", Icone: IconePersonnes },
  { href: "/cv", libelle: "CV SharePoint", Icone: IconeTableau },
  { href: "/missions", libelle: "Missions", Icone: IconeMallette },
];

export default function MenuLateral({ nom, email, estAdmin }: { nom: string; email: string; estAdmin: boolean }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const liens = estAdmin ? [...LIENS, { href: "/parametres", libelle: "Paramètres", Icone: IconeReglages }] : LIENS;
  const actif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));
  const initiales = nom.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((m) => m[0]!.toUpperCase()).join("");

  return (
    <>
      {/* Barre du haut sur téléphone */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
        <Logo />
        <button onClick={() => setOuvert(!ouvert)} className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-zinc-300">{ouvert ? "Fermer" : "Menu"}</button>
      </div>

      <aside className={`${ouvert ? "flex" : "hidden"} w-full flex-col border-r border-zinc-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0`}>
        <div className="hidden px-6 pb-6 pt-7 lg:block"><Logo /></div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {liens.map(({ href, libelle, Icone }) => (
            <Link key={href} href={href} onClick={() => setOuvert(false)}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 font-medium ${
                actif(href) ? "bg-marque-50 text-marque-700" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`}>
              <Icone className={`h-5 w-5 ${actif(href) ? "text-marque-600" : "text-zinc-400 group-hover:text-zinc-600"}`} />
              {libelle}
            </Link>
          ))}
        </nav>
        <div className="m-3 flex items-center gap-3 rounded-lg border border-zinc-200 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marque-600 font-semibold text-white">
            {initiales || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-zinc-900">{nom}</div>
            <div className="truncate text-xs text-zinc-500">{estAdmin ? "Administrateur" : "Recruteur"} · {email}</div>
          </div>
          <form action="/auth/deconnexion" method="post">
            <button title="Se déconnecter" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
              <IconeSortie className="h-5 w-5" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- petit logo statique */}
      <img src="/logo-unitech-symbole.png" alt="" className="h-9 w-9 object-contain" />
      <div className="leading-tight">
        <div className="font-semibold tracking-wide text-marque-600">UNITECH</div>
        <div className="text-xs tracking-[0.3em] text-marque-600">Solutions</div>
      </div>
    </div>
  );
}
