"use client";

import { useEffect } from "react";

/**
 * Mesure du temps réel d'affichage des écrans (pilotage de la vitesse) : du clic sur un lien jusqu'à l'écran complet
 * (plus d'écran d'attente), ou de l'ouverture de la page jusqu'à son affichage. Envoyé discrètement, sans donnée personnelle.
 */
export default function MesureVitesse() {
  useEffect(() => {
    const envoyer = (ecran: string, duree: number, type: "ouverture" | "navigation") => {
      try {
        const corps = JSON.stringify({ ecran, duree: Math.round(duree), type });
        if (!navigator.sendBeacon?.("/api/mesures", new Blob([corps], { type: "application/json" }))) {
          fetch("/api/mesures", { method: "POST", headers: { "Content-Type": "application/json" }, body: corps, keepalive: true }).catch(() => undefined);
        }
      } catch { /* sans importance */ }
    };
    // Ouverture de la page (premier affichage complet).
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) setTimeout(() => envoyer(location.pathname, nav.domContentLoadedEventEnd || performance.now(), "ouverture"), 0);

    // Navigation : clic sur un lien interne → nouvelle adresse affichée et plus d'écran d'attente.
    let suivi: number | null = null;
    const surClic = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target || a.origin !== location.origin || e.metaKey || e.ctrlKey || e.button !== 0) return;
      const vers = a.pathname, debut = performance.now();
      if (vers === location.pathname && a.search === location.search) return;
      if (suivi) cancelAnimationFrame(suivi);
      const verifier = () => {
        const fini = location.pathname === vers && !document.querySelector("main [role=status][aria-busy=true]");
        if (fini) { suivi = null; envoyer(vers, performance.now() - debut, "navigation"); return; }
        if (performance.now() - debut > 60_000) { suivi = null; return; }
        suivi = requestAnimationFrame(verifier);
      };
      suivi = requestAnimationFrame(verifier);
    };
    document.addEventListener("click", surClic, true);
    return () => document.removeEventListener("click", surClic, true);
  }, []);
  return null;
}
