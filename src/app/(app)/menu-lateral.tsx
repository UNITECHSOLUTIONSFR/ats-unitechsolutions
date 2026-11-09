"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconeAccueil, IconeMallette, IconePersonnes, IconeReglages, IconeSortie, IconeTableau } from "./icones";

const LIENS = [
  { href: "/", libelle: "Tableau de bord", Icone: IconeAccueil },
  { href: "/tableau", libelle: "Tableau de suivi", Icone: IconeTableau },
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
      <div className="flex items-center justify-between bg-nuit px-4 py-3 text-white lg:hidden">
        <Logo />
        <button onClick={() => setOuvert(!ouvert)} className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-white/20">{ouvert ? "Fermer" : "Menu"}</button>
      </div>

      <aside className={`${ouvert ? "flex" : "hidden"} w-full flex-col bg-nuit text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0`}>
        <div className="hidden px-6 pb-6 pt-7 lg:block"><Logo /></div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {liens.map(({ href, libelle, Icone }) => (
            <Link key={href} href={href} onClick={() => setOuvert(false)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                actif(href) ? "bg-marque-600 text-white shadow-lg shadow-marque-900/40" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}>
              <Icone className={`h-5 w-5 ${actif(href) ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
              {libelle}
            </Link>
          ))}
        </nav>
        <div className="m-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marque-400 to-marque-700 text-sm font-semibold">
            {initiales || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{nom}</div>
            <div className="truncate text-xs text-slate-400">{estAdmin ? "Administrateur" : "Recruteur"} · {email}</div>
          </div>
          <form action="/auth/deconnexion" method="post">
            <button title="Se déconnecter" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
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
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-marque-400 to-marque-700 text-lg font-bold text-white shadow-lg shadow-marque-900/50">U</span>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-white">Unitech Solution</div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Recrutement</div>
      </div>
    </div>
  );
}
