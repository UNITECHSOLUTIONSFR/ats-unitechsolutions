"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "@/lib/parametres/sections";

/** En-tête des paramètres : titre, et sur une section, le chemin « Paramètres › Section ». */
export default function FilParametres({ extra }: { extra: { href: string; titre: string; texte: string }[] }) {
  const chemin = usePathname();
  const section = [...SECTIONS, ...extra].find((s) => chemin.startsWith(s.href));
  if (!section) return <div><h1 className="titre-page">Paramètres</h1><p className="sous-titre mt-1">Réservé aux administrateurs.</p></div>;
  return (
    <div>
      <div className="text-sm text-slate-500"><Link href="/parametres" className="hover:text-nuit">Paramètres</Link> <span className="text-slate-300">›</span> {section.titre}</div>
      <h1 className="titre-page mt-1">{section.titre}</h1>
      <p className="sous-titre mt-1">{section.texte}</p>
    </div>
  );
}
