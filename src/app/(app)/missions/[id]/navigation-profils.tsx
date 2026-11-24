"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Fenêtre d'un profil : flèches ← → pour passer au profil précédent / suivant, Échap pour fermer. */
export default function NavigationProfils({ precedent, suivant, fermer }: { precedent: string | null; suivant: string | null; fermer: string }) {
  const router = useRouter();
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "ArrowLeft" && precedent) router.push(precedent, { scroll: false });
      if (e.key === "ArrowRight" && suivant) router.push(suivant, { scroll: false });
      if (e.key === "Escape") router.push(fermer, { scroll: false });
    };
    window.addEventListener("keydown", touche);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", touche); document.body.style.overflow = ""; };
  }, [precedent, suivant, fermer, router]);
  return null;
}
