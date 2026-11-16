"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Mise à jour automatique toutes les minutes (suivi en temps réel). */
export default function Rafraichir() {
  const router = useRouter();
  const [heure, setHeure] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => { router.refresh(); setHeure(new Date()); }, 60_000);
    return () => clearInterval(t);
  }, [router]);
  return <span className="text-xs text-slate-500">Mis à jour à {heure.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · actualisation chaque minute</span>;
}
