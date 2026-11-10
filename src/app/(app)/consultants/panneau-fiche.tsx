"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { FicheResume } from "@/lib/consultants/fiche";
import { suivreProposition } from "@/lib/missions/actions";
import { classePastille } from "@/lib/statuts";

const ALERTES: Record<string, string> = {
  doublon_possible: "Doublon possible", telephone_invalide: "Téléphone à vérifier", nom_manquant: "Nom manquant",
  cv_illisible: "CV illisible", association_douteuse: "Association CV à vérifier", disponibilite_ancienne: "Disponibilité ancienne",
};
const PROPOSITIONS: Record<string, string> = {
  propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé",
};

// Fiches déjà ouvertes : réaffichées instantanément (puis rafraîchies en arrière-plan).
const CACHE = new Map<string, FicheResume | null>();
async function lireFiche(id: string, prechargement = false): Promise<FicheResume | null> {
  const r = await fetch(`/api/fiche/${id}${prechargement ? "?prechargement" : ""}`, { cache: "no-store" });
  const f = r.ok ? ((await r.json()) as FicheResume | null) : null;
  CACHE.set(id, f);
  return f;
}
/** Précharge une fiche (survol d'une ligne) pour qu'elle s'ouvre sans attente. */
export function prechargerFiche(id: string) {
  if (!CACHE.has(id)) lireFiche(id, true).catch(() => CACHE.delete(id));
}

/** Fiche complète dans un panneau à droite, sans quitter le tableau : contact, CV, compétences, missions. */
export default function PanneauFiche({ id, onFermer }: { id: string; onFermer: () => void }) {
  const [fiche, setFiche] = useState<FicheResume | null | undefined>(() => CACHE.get(id));
  const [envoi, demarrer] = useTransition();
  const recharger = useCallback(() => lireFiche(id).then(setFiche), [id]);
  useEffect(() => {
    let actif = true;
    lireFiche(id).then((f) => { if (actif) setFiche(f); }).catch(() => { if (actif) setFiche(null); });
    return () => { actif = false; };
  }, [id]);
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);

  const ancienne = disponibiliteAncienne(fiche?.disponibilite_maj_le);
  const word = fiche?.documents.find((d) => d.type === "word_nominatif");
  const email = fiche?.documents.find((d) => d.type === "email");
  const pdf = fiche?.documents.find((d) => d.type === "pdf_anonyme");
  const initiales = fiche ? `${fiche.prenom?.[0] ?? ""}${fiche.nom?.[0] ?? ""}`.replace("—", "").toUpperCase() : "";

  function proposer(formData: FormData) {
    demarrer(async () => { await suivreProposition(formData); await recharger(); });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-nuit/10 backdrop-blur-[2px]" onClick={onFermer} />
      <aside className="verre fixed inset-y-2 right-2 z-50 flex w-[calc(100%-1rem)] max-w-md flex-col overflow-hidden rounded-[1.75rem] bg-white/80">
        <div className="relative bg-gradient-to-br from-nuit via-marque-600 to-marque-500 p-5 text-white">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <button onClick={onFermer} className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-white/70 hover:bg-white/15 hover:text-white" aria-label="Fermer">✕</button>
          {fiche ? (
            <div className="relative flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold ring-1 ring-white/30 backdrop-blur">{initiales || "?"}</span>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold tracking-tight">{fiche.prenom} {fiche.nom} <span className="font-mono text-sm font-medium text-white/60">{fiche.trigramme}</span></h2>
                <p className="truncate text-sm text-white/80">{fiche.intitule_poste ?? "Poste non renseigné"}</p>
                <span className="mt-1.5 inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium ring-1 ring-white/25">{fiche.statut}</span>
              </div>
            </div>
          ) : <p className="relative text-white/80">{fiche === null ? "Fiche introuvable." : "Chargement…"}</p>}
        </div>

        {fiche && (
          <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
            {/* Actions rapides */}
            <div className="grid grid-cols-4 gap-2">
              <Action href={fiche.telephone ? `tel:${fiche.telephone.replace(/\s/g, "")}` : undefined} libelle="Appeler" icone="☎" />
              <Action href={fiche.email ? `mailto:${fiche.email}` : undefined} libelle="Écrire" icone="@" />
              {word || !email
                ? <Action href={word?.url ?? undefined} libelle="CV Word" icone="W" externe />
                : <Action href={email.url ?? undefined} libelle="Email reçu" icone="✉" externe />}
              <Action href={pdf?.url ?? undefined} libelle="PDF anonyme" icone="PDF" externe />
            </div>

            {fiche.alertes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {fiche.alertes.map((a) => <span key={a} className="pastille pastille-rouge">{ALERTES[a] ?? a}</span>)}
              </div>
            )}

            <Bloc titre="Coordonnées">
              <Ligne libelle="Téléphone">{fiche.telephone || "—"}</Ligne>
              <Ligne libelle="Email">{fiche.email ?? "—"}</Ligne>
              {fiche.email_2 && <Ligne libelle="Email 2">{fiche.email_2}</Ligne>}
              <Ligne libelle="Localisation">{fiche.localisation ?? "—"}</Ligne>
              {fiche.linkedin && <Ligne libelle="LinkedIn"><a href={fiche.linkedin.startsWith("http") ? fiche.linkedin : `https://${fiche.linkedin}`} target="_blank" rel="noreferrer" className="lien">Voir le profil</a></Ligne>}
            </Bloc>

            <Bloc titre="Disponibilité">
              <p className="font-medium text-nuit">{fiche.disponibilite ?? "Non renseignée"}</p>
              <p className={ancienne ? "text-amber-700" : "text-slate-500"}>
                {fiche.disponibilite_maj_le ? `Mise à jour le ${new Date(fiche.disponibilite_maj_le).toLocaleDateString("fr-FR")}` : "Jamais mise à jour"}
                {ancienne && " — à vérifier"}
              </p>
              {!pdf && <span className="pastille pastille-orange mt-1">PDF anonymisé manquant</span>}
            </Bloc>

            <Bloc titre="Profil">
              {fiche.resume ? <p className="text-slate-700">{fiche.resume}</p> : <p className="text-slate-500">CV pas encore analysé.</p>}
              {(fiche.annees_experience || fiche.seniorite) && (
                <p className="text-slate-500">{[fiche.annees_experience && `${fiche.annees_experience} ans d'expérience`, fiche.seniorite].filter(Boolean).join(" · ")}</p>
              )}
              {fiche.competences.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {fiche.competences.map((k) => <span key={k.nom} className="pastille bg-marque-50/90 text-marque-700 ring-marque-100">{k.nom}{k.annees ? ` · ${k.annees} an(s)` : ""}</span>)}
                </div>
              )}
            </Bloc>

            <Bloc titre="Missions">
              {fiche.propositions.map((p) => (
                <div key={p.mission_id} className="flex items-center justify-between gap-2">
                  <Link href={`/missions/${p.mission_id}`} className="lien truncate">{p.mission}</Link>
                  <span className={classePastille(PROPOSITIONS[p.statut])}>{PROPOSITIONS[p.statut]}</span>
                </div>
              ))}
              {!fiche.propositions.length && <p className="text-slate-500">Aucune proposition pour l&apos;instant.</p>}
              {fiche.missionsOuvertes.length > 0 && (
                <form action={proposer} className="flex gap-2 pt-1">
                  <input type="hidden" name="consultant_id" value={fiche.id} />
                  <input type="hidden" name="statut" value="propose" />
                  <select name="mission_id" className="champ min-w-0 flex-1" required defaultValue="">
                    <option value="" disabled>Choisir une mission ouverte…</option>
                    {fiche.missionsOuvertes.map((m) => <option key={m.id} value={m.id}>{m.intitule}{m.client ? ` · ${m.client}` : ""}</option>)}
                  </select>
                  <button disabled={envoi} className="bouton-primaire shrink-0">{envoi ? "…" : "Proposer"}</button>
                </form>
              )}
            </Bloc>

            {fiche.notes && <Bloc titre="Notes"><p className="whitespace-pre-line text-slate-700">{fiche.notes}</p></Bloc>}
          </div>
        )}

        {fiche && (
          <div className="border-t border-white/70 p-4">
            <Link href={`/consultants/${fiche.id}`} className="bouton-primaire w-full justify-center">Ouvrir la fiche complète et modifier</Link>
          </div>
        )}
      </aside>
    </>
  );
}

function Action({ href, libelle, icone, externe }: { href?: string; libelle: string; icone: string; externe?: boolean }) {
  const classe = "flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[11px] font-semibold ring-1 transition";
  if (!href) return <span className={`${classe} cursor-not-allowed bg-white/40 text-slate-300 ring-white/60`}><span className="text-base leading-none">{icone}</span>{libelle}</span>;
  return (
    <a href={href} {...(externe ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`${classe} bg-white/70 text-nuit ring-white/80 hover:-translate-y-0.5 hover:bg-white hover:shadow-md`}>
      <span className="text-base font-bold leading-none text-marque-600">{icone}</span>{libelle}
    </a>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 rounded-2xl bg-white/60 p-4 ring-1 ring-white/80">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titre}</h3>
      {children}
    </section>
  );
}

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return <div className="flex gap-3"><span className="w-24 shrink-0 text-slate-500">{libelle}</span><span className="min-w-0 break-words text-nuit">{children}</span></div>;
}

/** Disponibilité « à vérifier » si elle n'a pas été mise à jour depuis plus de 3 mois. */
function disponibiliteAncienne(maj: string | null | undefined): boolean {
  return !maj || Date.parse(maj) < Date.now() - 90 * 86_400_000;
}
