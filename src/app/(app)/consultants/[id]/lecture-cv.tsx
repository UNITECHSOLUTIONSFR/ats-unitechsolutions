"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Bandeau « CV en cours de lecture » : l'IA lit le CV en arrière-plan ; la fiche se rafraîchit toute seule
 * toutes les 3 secondes jusqu'à ce qu'elle soit complétée (2 minutes au plus).
 */
export function LectureCVEnCours({ depuis, texte, texteBloque }: { depuis: string; texte?: string; texteBloque?: string }) {
  const router = useRouter();
  const [bloque, setBloque] = useState(false);
  useEffect(() => {
    const reste = Math.max(0, 120_000 - (Date.now() - Date.parse(depuis)));
    const fin = setTimeout(() => setBloque(true), reste);
    const t = reste > 0 ? setInterval(() => router.refresh(), 3000) : null;
    return () => { clearTimeout(fin); if (t) clearInterval(t); };
  }, [depuis, router]);
  return (
    <p role="status" className="flex items-center gap-2 rounded-2xl bg-marque-50 px-4 py-2.5 text-sm text-marque-700 ring-1 ring-marque-100">
      {!bloque && <span className="h-3 w-3 animate-spin rounded-full border-2 border-marque-300 border-t-marque-600" aria-hidden />}
      {bloque ? (texteBloque ?? "La lecture du CV semble bloquée : ajoutez-le à nouveau si la fiche ne se complète pas.") : (texte ?? "L'IA lit le CV : la fiche se complète toute seule dans quelques secondes (compétences, champs vides, matching). Vous pouvez continuer à travailler.")}
    </p>
  );
}
