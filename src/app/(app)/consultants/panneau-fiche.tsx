"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { chargerFiche, type FicheResume } from "@/lib/consultants/fiche";
import { classePastille } from "@/lib/statuts";

const ALERTES: Record<string, string> = {
  doublon_possible: "Doublon possible", telephone_invalide: "Téléphone à vérifier", nom_manquant: "Nom manquant",
  cv_illisible: "CV illisible", association_douteuse: "Association CV à vérifier", disponibilite_ancienne: "Disponibilité ancienne",
};
const PROPOSITIONS: Record<string, string> = {
  propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé",
};

/** Fiche complète dans un panneau à droite, sans quitter le tableau. */
export default function PanneauFiche({ id, onFermer }: { id: string; onFermer: () => void }) {
  const [fiche, setFiche] = useState<FicheResume | null | undefined>(undefined);
  useEffect(() => {
    let actif = true;
    chargerFiche(id).then((f) => { if (actif) setFiche(f); });
    return () => { actif = false; };
  }, [id]);
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);

  const ancienne = disponibiliteAncienne(fiche?.disponibilite_maj_le);
  const word = fiche?.documents.find((d) => d.type === "word_nominatif");
  const pdf = fiche?.documents.find((d) => d.type === "pdf_anonyme");

  return (
    <>
      <div className="fixed inset-0 z-40 bg-zinc-900/10" onClick={onFermer} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5">
          {fiche ? (
            <div>
              <h2 className="titre-page">{fiche.prenom} {fiche.nom} <span className="font-mono text-zinc-400">{fiche.trigramme}</span></h2>
              <p className="text-zinc-600">{fiche.intitule_poste ?? "—"}</p>
              <span className={`mt-2 ${classePastille(fiche.statut)}`}>{fiche.statut}</span>
            </div>
          ) : <p className="text-zinc-500">{fiche === null ? "Fiche introuvable." : "Chargement…"}</p>}
          <button onClick={onFermer} className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100" aria-label="Fermer">✕</button>
        </div>

        {fiche && (
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {fiche.alertes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {fiche.alertes.map((a) => <span key={a} className="pastille pastille-rouge">{ALERTES[a] ?? a}</span>)}
              </div>
            )}

            <Bloc titre="Coordonnées">
              <Ligne libelle="Téléphone">{fiche.telephone ? <a href={`tel:${fiche.telephone.replace(/\s/g, "")}`} className="text-marque-700 hover:underline">{fiche.telephone}</a> : "—"}</Ligne>
              <Ligne libelle="Email">{fiche.email ? <a href={`mailto:${fiche.email}`} className="text-marque-700 hover:underline">{fiche.email}</a> : "—"}</Ligne>
              {fiche.email_2 && <Ligne libelle="Email 2">{fiche.email_2}</Ligne>}
              <Ligne libelle="Localisation">{fiche.localisation ?? "—"}</Ligne>
              {fiche.linkedin && <Ligne libelle="LinkedIn"><a href={fiche.linkedin.startsWith("http") ? fiche.linkedin : `https://${fiche.linkedin}`} target="_blank" rel="noreferrer" className="text-marque-700 hover:underline">Profil</a></Ligne>}
            </Bloc>

            <Bloc titre="Disponibilité">
              <p>{fiche.disponibilite ?? "Non renseignée"}</p>
              <p className={ancienne ? "text-amber-700" : "text-zinc-500"}>
                {fiche.disponibilite_maj_le ? `Mise à jour le ${new Date(fiche.disponibilite_maj_le).toLocaleDateString("fr-FR")}` : "Jamais mise à jour"}
                {ancienne && " — à vérifier"}
              </p>
            </Bloc>

            <Bloc titre="CV (SharePoint)">
              {word ? <a href={word.url ?? "#"} target="_blank" rel="noreferrer" className="block truncate text-marque-700 hover:underline">Word Unitech · {word.nom}</a> : <p className="text-zinc-500">Pas de CV Word relié</p>}
              {pdf ? <a href={pdf.url ?? "#"} target="_blank" rel="noreferrer" className="block truncate text-marque-700 hover:underline">PDF anonymisé · {pdf.nom}</a> : <span className="pastille pastille-orange">PDF anonymisé manquant</span>}
            </Bloc>

            <Bloc titre="Profil">
              {fiche.resume ? <p>{fiche.resume}</p> : <p className="text-zinc-500">CV pas encore analysé.</p>}
              {(fiche.annees_experience || fiche.seniorite) && (
                <p className="text-zinc-500">{[fiche.annees_experience && `${fiche.annees_experience} ans d'expérience`, fiche.seniorite].filter(Boolean).join(" · ")}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {fiche.competences.map((k) => <span key={k.nom} className="pastille">{k.nom}{k.annees ? ` · ${k.annees} an(s)` : ""}</span>)}
              </div>
            </Bloc>

            <Bloc titre="Missions">
              {fiche.propositions.length ? fiche.propositions.map((p) => (
                <div key={p.mission_id} className="flex items-center justify-between gap-2">
                  <Link href={`/missions/${p.mission_id}`} className="truncate text-marque-700 hover:underline">{p.mission}</Link>
                  <span className={classePastille(PROPOSITIONS[p.statut])}>{PROPOSITIONS[p.statut]}</span>
                </div>
              )) : <p className="text-zinc-500">Aucune proposition.</p>}
            </Bloc>

            {fiche.notes && <Bloc titre="Notes"><p className="whitespace-pre-line">{fiche.notes}</p></Bloc>}
          </div>
        )}

        {fiche && (
          <div className="border-t border-zinc-200 p-4">
            <Link href={`/consultants/${fiche.id}`} className="bouton-primaire w-full justify-center">Ouvrir la fiche complète et modifier</Link>
          </div>
        )}
      </aside>
    </>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="font-semibold text-zinc-900">{titre}</h3>
      {children}
    </section>
  );
}

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return <div className="flex gap-3"><span className="w-24 shrink-0 text-zinc-500">{libelle}</span><span className="min-w-0 break-words">{children}</span></div>;
}

/** Disponibilité « à vérifier » si elle n'a pas été mise à jour depuis plus de 3 mois. */
function disponibiliteAncienne(maj: string | null | undefined): boolean {
  return !maj || Date.parse(maj) < Date.now() - 90 * 86_400_000;
}
