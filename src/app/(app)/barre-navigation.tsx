"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Confirmation immédiate du clic : dès qu'on clique sur un lien interne (fiche, mission, menu…), une barre bleue
 * avance en haut de l'écran et le curseur passe en attente, jusqu'à l'affichage de la nouvelle page.
 */
export default function BarreNavigation() {
  const chemin = usePathname();
  const params = useSearchParams();
  const [actif, setActif] = useState(false);

  // Nouvelle page affichée : la barre se termine.
  useEffect(() => {
    const t = setTimeout(() => setActif(false), 0);
    return () => clearTimeout(t);
  }, [chemin, params]);

  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setActif(true);
    };
    document.addEventListener("click", clic, true);
    return () => document.removeEventListener("click", clic, true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("navigation-en-cours", actif);
    if (!actif) return;
    const secours = setTimeout(() => setActif(false), 15_000); // jamais bloquée
    return () => clearTimeout(secours);
  }, [actif]);

  if (!actif) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden" role="progressbar" aria-label="Chargement de la page">
      <div className="barre-navigation h-full bg-gradient-to-r from-marque-400 via-marque-600 to-sky-400 shadow-[0_0_10px_rgba(31,69,163,0.6)]" />
    </div>
  );
}
