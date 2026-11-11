"use client";

import { useActionState, useState } from "react";
import { analyserBesoin, creerMission, type BrouillonMission, type EtatAnalyseMission, type EtatFormulaireMission } from "@/lib/missions/actions";

const SENIORITES = [["", "Non précisée"], ["junior", "Junior (< 3 ans)"], ["confirme", "Confirmé (3 à 6 ans)"], ["senior", "Senior (7 à 12 ans)"], ["expert", "Expert (> 12 ans)"]] as const;

/** Nouvelle mission en deux temps : 1. importer la fiche (ou coller le texte) ; 2. relire les champs pré-remplis et créer. */
export default function FormulaireMission({ texteInitial }: { texteInitial?: string }) {
  const [analyse, analyser, enAnalyse] = useActionState<EtatAnalyseMission, FormData>(analyserBesoin, {});
  if (!analyse.brouillon) return <Etape1 action={analyser} enCours={enAnalyse} erreur={analyse.erreur} texteInitial={texteInitial} />;
  return <Etape2 key={analyse.brouillon.texte.length} brouillon={analyse.brouillon} />;
}

function Etape1({ action, enCours, erreur, texteInitial }: { action: (f: FormData) => void; enCours: boolean; erreur?: string; texteInitial?: string }) {
  const [nomFichier, setNomFichier] = useState("");
  return (
    <form action={action} className="carte space-y-5 p-6">
      <Numero n={1} titre="La fiche mission" texte="Importez le document reçu du client, ou collez son texte. L'outil pré-remplit le formulaire." />
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-marque-200 bg-white/60 px-6 py-8 text-center transition hover:border-marque-400 hover:bg-white">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-marque-50 text-xl text-marque-600">↑</span>
        <span className="font-semibold text-nuit">{nomFichier || "Importer la fiche mission"}</span>
        <span className="text-xs text-slate-500">PDF ou Word · 4 Mo maximum</span>
        <input type="file" name="fichier" accept=".pdf,.docx,.doc,.txt" className="sr-only" onChange={(e) => setNomFichier(e.target.files?.[0]?.name ?? "")} />
      </label>
      <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />ou<span className="h-px flex-1 bg-slate-200" /></div>
      <textarea name="texte_besoin" rows={8} defaultValue={texteInitial} className="champ w-full" placeholder="Collez ici l'email ou la fiche de poste du client…" />
      {erreur && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}
      <div className="flex justify-end">
        <button disabled={enCours} className="bouton-primaire px-6 py-2.5">{enCours ? "Lecture de la fiche…" : "Lire la fiche et pré-remplir"}</button>
      </div>
    </form>
  );
}

function Etape2({ brouillon }: { brouillon: BrouillonMission }) {
  const [etat, action, enCours] = useActionState<EtatFormulaireMission, FormData>(creerMission, {});
  const [competences, setCompetences] = useState(brouillon.competences);
  const [nouvelle, setNouvelle] = useState("");
  const maj = (i: number, v: Partial<BrouillonMission["competences"][number]>) => setCompetences((cs) => cs.map((c, j) => (j === i ? { ...c, ...v } : c)));
  const ajouter = () => {
    const nom = nouvelle.trim();
    if (nom && !competences.some((c) => c.nom.toLowerCase() === nom.toLowerCase())) setCompetences((cs) => [...cs, { nom, obligatoire: false, importance: 2, annees_min: null }]);
    setNouvelle("");
  };
  const obligatoires = competences.filter((c) => c.obligatoire).length;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="brouillon" value={JSON.stringify({ ...brouillon, competences })} />
      <div className="carte space-y-5 p-6">
        <Numero n={2} titre="Vérifiez la mission" texte="Champs lus dans la fiche : corrigez-les si besoin." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="client" libelle="Client" valeur={brouillon.client} />
          <Champ nom="intitule" libelle="Poste" valeur={brouillon.intitule} requis />
          <Champ nom="localisation" libelle="Localisation" valeur={brouillon.localisation} />
          <Champ nom="date_debut" libelle="Démarrage" valeur={brouillon.date_debut} type="date" />
          <Champ nom="annees_min" libelle="Expérience minimum (années)" valeur={brouillon.annees_min?.toString() ?? null} type="number" />
          <label className="block text-sm font-medium text-nuit">Séniorité
            <select name="seniorite" defaultValue={brouillon.seniorite ?? ""} className="champ mt-1 w-full">
              {SENIORITES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="carte space-y-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-nuit">Compétences demandées</h3>
          <span className="text-xs text-slate-500">{competences.length} compétence(s) · {obligatoires} obligatoire(s) · cliquez pour basculer</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {competences.map((c, i) => (
            <span key={c.nom} className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-sm ring-1 ${c.obligatoire ? "bg-nuit text-white ring-nuit" : "bg-white/80 text-nuit ring-slate-200"}`}>
              <button type="button" onClick={() => maj(i, { obligatoire: !c.obligatoire })} title={c.obligatoire ? "Obligatoire (cliquer pour rendre souhaitée)" : "Souhaitée (cliquer pour rendre obligatoire)"}>
                {c.nom}{c.annees_min ? ` · ${c.annees_min} an(s)` : ""}
              </button>
              <button type="button" onClick={() => setCompetences((cs) => cs.filter((_, j) => j !== i))} aria-label={`Retirer ${c.nom}`}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${c.obligatoire ? "hover:bg-white/20" : "text-slate-400 hover:bg-slate-100"}`}>✕</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } }}
            placeholder="Ajouter une compétence (ex. Kafka)" className="champ flex-1" />
          <button type="button" onClick={ajouter} className="bouton-secondaire">Ajouter</button>
        </div>
        <p className="text-xs text-slate-500"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-nuit align-middle" />Obligatoire : un consultant sans cette compétence est écarté. <span className="ml-2 mr-1 inline-block h-2.5 w-2.5 rounded-full bg-white ring-1 ring-slate-300 align-middle" />Souhaitée : elle compte dans le score.</p>
      </div>

      <details className="carte p-6 text-sm">
        <summary className="cursor-pointer font-semibold text-nuit">Texte complet de la fiche</summary>
        <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap font-sans text-slate-600">{brouillon.texte}</pre>
      </details>

      {etat.erreur && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{etat.erreur}</p>}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => window.location.reload()} className="bouton-secondaire">Recommencer</button>
        <button disabled={enCours} className="bouton-primaire px-6 py-2.5">{enCours ? "Création…" : "Créer la mission et classer les consultants"}</button>
      </div>
    </form>
  );
}

function Numero({ n, titre, texte }: { n: number; titre: string; texte: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nuit text-sm font-bold text-white">{n}</span>
      <div><h2 className="font-semibold text-nuit">{titre}</h2><p className="text-sm text-slate-500">{texte}</p></div>
    </div>
  );
}

function Champ({ nom, libelle, valeur, type = "text", requis }: { nom: string; libelle: string; valeur: string | null; type?: string; requis?: boolean }) {
  return (
    <label className="block text-sm font-medium text-nuit">{libelle}{requis && <span className="text-red-600"> *</span>}
      <input name={nom} type={type} defaultValue={valeur ?? ""} required={requis} min={type === "number" ? 0 : undefined} className="champ mt-1 w-full" />
    </label>
  );
}
