"use client";

import { useEffect } from "react";

/**
 * Mesure du temps réel d'affichage des écrans (pilotage de la vitesse) : du clic sur un lien jusqu'à l'écran complet
 * (plus d'écran d'attente), ou de l'ouverture de la page jusqu'à son affichage. Envoyé discrètement, sans donnée personnelle.
 */
export default function MesureVitesse() {
  useEffect(() => {
    const envoyer = (ecran: string, duree: number, type: "ouverture" | "navigation" | "action") => {
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

    // Boutons (enregistrer, changer un statut, fusionner…) : durée de l'aller-retour avec le serveur, nommée par le texte du bouton.
    // Seul le libellé du bouton est envoyé (texte de l'interface, jamais une saisie).
    let dernierBouton = "";
    const surEnvoi = (e: SubmitEvent) => {
      const b = e.submitter as HTMLElement | null;
      dernierBouton = (b?.getAttribute("aria-label") || b?.textContent || "bouton").replace(/\s+/g, " ").trim().slice(0, 40);
    };
    document.addEventListener("submit", surEnvoi, true);
    let observateur: PerformanceObserver | null = null;
    try {
      observateur = new PerformanceObserver((liste) => {
        for (const r of liste.getEntries() as PerformanceResourceTiming[]) {
          if (r.initiatorType !== "fetch") continue;
          const u = new URL(r.name);
          // Action serveur : envoi vers l'adresse de la page (les changements d'écran passent par « ?_rsc= », exclus).
          if (u.origin !== location.origin || u.searchParams.has("_rsc") || u.pathname.startsWith("/api/") || u.pathname.startsWith("/_next/")) continue;
          envoyer(`${u.pathname} · ${dernierBouton || "action"}`, r.duration, "action");
        }
      });
      observateur.observe({ type: "resource", buffered: false });
    } catch { /* navigateur ancien : pas de mesure des boutons */ }
    return () => { document.removeEventListener("click", surClic, true); document.removeEventListener("submit", surEnvoi, true); observateur?.disconnect(); };
  }, []);
  return null;
}
