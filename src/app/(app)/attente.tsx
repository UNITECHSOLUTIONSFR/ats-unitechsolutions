"use client";

import { useEffect, useState } from "react";

/**
 * Écran d'attente : une animation qui tourne et un message qui change toutes les 2,5 secondes.
 * Il n'apparaît qu'après un court délai : une page qui s'ouvre vite ne clignote pas.
 */
function Animation({ messages, sousTitre }: { messages: string[]; sousTitre?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const t = setInterval(() => setI((x) => Math.min(x + 1, messages.length - 1)), 2500);
    return () => clearInterval(t);
  }, [messages.length]);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border-4 border-marque-100" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-marque-600 border-r-marque-400" />
        <div className="absolute inset-[18px] animate-pulse rounded-full bg-marque-100" />
      </div>
      <p key={i} className="attente-message max-w-sm text-base font-semibold text-nuit">{messages[i]}</p>
      {sousTitre && <p className="max-w-sm text-sm text-slate-500">{sousTitre}</p>}
    </div>
  );
}

/** Pendant le chargement d'un écran (fichier loading.tsx). */
export function AttentePage({ messages, sousTitre }: { messages: string[]; sousTitre?: string }) {
  return (
    <div className="attente-apparition flex min-h-[60vh] items-center justify-center" aria-busy="true" role="status">
      <Animation messages={messages} sousTitre={sousTitre} />
    </div>
  );
}

/** Pendant une action longue (génération d'un CV, lecture de Trello…) : voile sur l'écran, impossible de recliquer. */
export function AttenteVoile({ actif, messages, sousTitre }: { actif: boolean; messages: string[]; sousTitre?: string }) {
  if (!actif) return null;
  return (
    <div className="attente-apparition fixed inset-0 z-[90] flex items-center justify-center bg-white/70 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="carte px-10 py-8 shadow-xl"><Animation messages={messages} sousTitre={sousTitre} /></div>
    </div>
  );
}
