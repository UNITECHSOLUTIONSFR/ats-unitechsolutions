"use client";

import { useFormStatus } from "react-dom";

/** Bouton du suivi d'un profil : réagit au clic tout de suite (« ✓ »), l'enregistrement se fait pendant ce temps. */
export function BoutonSuivi({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus();
  return (
    <button aria-label={libelle} className="rounded-full bg-marque-600 px-3 py-1 text-xs font-semibold text-white hover:bg-marque-500">
      {pending ? "✓" : libelle}
    </button>
  );
}
