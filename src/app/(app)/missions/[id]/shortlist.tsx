"use client";

import { useState } from "react";

export interface ProfilShortlist { trigramme: string; poste: string | null; annees: number | null; score: number; disponibilite: string; pdf: string | null }

/** Sélection prête à envoyer au client : profils anonymes (trigramme), score, disponibilité et lien du PDF anonymisé. */
export default function Shortlist({ mission, profils }: { mission: string; profils: ProfilShortlist[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  const texte = [
    `Bonjour,`, ``, `Voici les profils que nous vous proposons pour la mission « ${mission} » :`, ``,
    ...profils.flatMap((p, i) => [
      `${i + 1}. ${p.trigramme} — ${p.poste ?? "Consultant"}${p.annees ? ` · ${p.annees} ans d'expérience` : ""} · disponibilité : ${p.disponibilite}`,
      p.pdf ? `   CV anonymisé : ${p.pdf}` : `   CV anonymisé : à joindre`,
    ]),
    ``, `Nous restons à votre disposition pour organiser les entretiens.`, ``, `Cordialement,`,
  ].join("\n");
  async function copier() {
    try { await navigator.clipboard.writeText(texte); setCopie(true); setTimeout(() => setCopie(false), 3000); } catch { /* copie refusée par le navigateur */ }
  }
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} disabled={!profils.length} title={profils.length ? undefined : "Suivez d'abord au moins un consultant sur cette mission"} className="bouton-secondaire">
        Préparer l&apos;envoi au client ({profils.length})
      </button>
      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-nuit/20 p-4 backdrop-blur-sm" onClick={() => setOuvert(false)}>
          <div className="verre w-full max-w-2xl space-y-4 rounded-3xl bg-white/90 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-nuit">Profils pour le client</h2>
                <p className="text-sm text-slate-500">Consultants suivis sur cette mission (hors refusés), présentés de façon anonyme. Copiez le texte dans votre email.</p>
              </div>
              <button type="button" onClick={() => setOuvert(false)} className="rounded-full px-3 py-1 text-slate-400 hover:bg-slate-100" aria-label="Fermer">✕</button>
            </div>
            <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white/80 p-4 font-sans text-sm text-slate-700 ring-1 ring-slate-100">{texte}</pre>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={copier} className="bouton-primaire">{copie ? "Copié ✓" : "Copier le texte"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
