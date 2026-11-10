"use client";

import { usePathname, useRouter } from "next/navigation";

/** Flèche « Retour » affichée en haut de chaque écran (sauf l'accueil) : revient à l'écran précédent. */
export default function BoutonRetour() {
  const router = useRouter();
  const chemin = usePathname();
  if (chemin === "/") return null;
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-slate-500 transition hover:bg-white/70 hover:text-nuit"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Retour
    </button>
  );
}
