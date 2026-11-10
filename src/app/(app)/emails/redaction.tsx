"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { apercuDestinataires, creerCampagne, enregistrerModele, type ApercuDestinataires, type EtatRelance } from "@/lib/relance/actions";
import { rendreMessage } from "@/lib/relance/modele";

interface Modele { id: string; nom: string; objet: string; corps: string; type: string }
const STATUTS = [["candidat", "Candidats"], ["consultant", "Consultants"], ["en_mission", "En mission"]] as const;

/** Trois étapes : à qui écrire, quoi écrire, puis préparation de l'envoi. */
export default function Redaction({ modeles }: { modeles: Modele[] }) {
  const [etat, action, enCours] = useActionState<EtatRelance, FormData>(creerCampagne, {});
  // 1. Destinataires
  const [statuts, setStatuts] = useState<string[]>([]);
  const [fonction, setFonction] = useState("");
  const [jours, setJours] = useState(90);
  const [avant, setAvant] = useState("");
  const [exclus, setExclus] = useState<string[]>([]);
  const [apercu, setApercu] = useState<ApercuDestinataires | null>(null);
  useEffect(() => {
    let actif = true;
    const t = setTimeout(() => {
      apercuDestinataires({ statuts, fonction: fonction || undefined, dispoPlusVieilleQueJours: jours || undefined, disponibleAvant: avant || undefined, exclus })
        .then((a) => { if (actif) setApercu(a); });
    }, 350);
    return () => { actif = false; clearTimeout(t); };
  }, [statuts, fonction, jours, avant, exclus]);
  // 2. Message
  const premier = modeles[0];
  const [type, setType] = useState(premier?.type ?? "disponibilite");
  const [objet, setObjet] = useState(premier?.objet ?? "");
  const [corps, setCorps] = useState(premier?.corps ?? "");
  const [nomModele, setNomModele] = useState("");
  const exemple = apercu?.exemples[0];
  const rendu = useMemo(() => rendreMessage(corps, { prenom: exemple?.nom.split(" ")[0] ?? "Marie", nom: "" }, "https://ats-unitechsolutions.vercel.app/desinscription/…"), [corps, exemple]);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="exclus" value={JSON.stringify(exclus)} />
      <input type="hidden" name="type" value={type} />

      <div className="carte space-y-4 p-6">
        <Etape n={1} titre="À qui écrire ?" texte="Combinez les critères ; décochez une personne pour l'exclure." />
        <div className="grid gap-4 lg:grid-cols-4">
          <label className="block text-sm font-medium text-nuit lg:col-span-2">Fonction ou compétence
            <input name="fonction" value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="ex. java, chef de projet, SAP" className="champ mt-1 w-full" />
          </label>
          <label className="block text-sm font-medium text-nuit">Disponibilité non mise à jour depuis
            <select name="dispo_jours" value={jours} onChange={(e) => setJours(Number(e.target.value))} className="champ mt-1 w-full">
              <option value={0}>peu importe</option><option value={30}>plus d&apos;1 mois</option><option value={90}>plus de 3 mois</option><option value={180}>plus de 6 mois</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-nuit">Disponible avant le
            <input type="date" name="disponible_avant" value={avant} onChange={(e) => setAvant(e.target.value)} className="champ mt-1 w-full" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold text-slate-400">Statut</span>
          {STATUTS.map(([v, l]) => (
            <label key={v} className={`cursor-pointer rounded-full px-3.5 py-1 font-medium ring-1 transition ${statuts.includes(v) ? "bg-nuit text-white ring-nuit" : "bg-white/70 text-slate-600 ring-slate-200"}`}>
              <input type="checkbox" name="statuts" value={v} className="sr-only" checked={statuts.includes(v)}
                onChange={() => setStatuts((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))} />{l}
            </label>
          ))}
          <span className="text-xs text-slate-400">Aucun choix = tous (hors inactifs et désinscrits)</span>
        </div>
        <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-white/80">
          <div className="mb-2 text-sm font-semibold text-nuit">{apercu ? `${apercu.total.toLocaleString("fr-FR")} consultant(s) sélectionné(s)` : "Calcul…"}{exclus.length > 0 && <span className="font-normal text-slate-500"> · {exclus.length} exclu(s)</span>}</div>
          <div className="grid max-h-56 gap-x-4 gap-y-1 overflow-y-auto text-sm sm:grid-cols-2 lg:grid-cols-3">
            {apercu?.exemples.map((c) => (
              <label key={c.id} className="flex items-center gap-2 truncate">
                <input type="checkbox" defaultChecked className="accent-marque-600" onChange={(e) => { if (!e.target.checked) setExclus((x) => [...x, c.id]); }} />
                <span className="truncate text-nuit">{c.nom}</span><span className="truncate text-xs text-slate-400">{c.poste ?? ""}</span>
              </label>
            ))}
          </div>
          {apercu && apercu.total > apercu.exemples.length && <p className="mt-2 text-xs text-slate-500">Les {apercu.exemples.length} premiers sont affichés.</p>}
        </div>
      </div>

      <div className="carte space-y-4 p-6">
        <Etape n={2} titre="Quoi écrire ?" texte="Partez d'un modèle ou écrivez librement. {prenom} est remplacé par le prénom de chaque consultant." />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <select onChange={(e) => { const m = modeles.find((x) => x.id === e.target.value); if (m) { setObjet(m.objet); setCorps(m.corps); setType(m.type); } }}
                defaultValue={premier?.id ?? ""} className="champ flex-1" aria-label="Modèle">
                <option value="" disabled>Choisir un modèle…</option>
                {modeles.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
              <div className="flex rounded-full bg-slate-100/80 p-1">
                {([["disponibilite", "Disponibilité"], ["libre", "Email libre"]] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setType(v)} className={`rounded-full px-3 py-1 text-xs font-semibold ${type === v ? "bg-white text-nuit shadow-sm" : "text-slate-500"}`}>{l}</button>
                ))}
              </div>
            </div>
            <label className="block font-medium text-nuit">Objet<input name="objet" value={objet} onChange={(e) => setObjet(e.target.value)} className="champ mt-1 w-full" /></label>
            <label className="block font-medium text-nuit">Message<textarea name="corps" value={corps} onChange={(e) => setCorps(e.target.value)} rows={11} className="champ mt-1 w-full" /></label>
            <div className="flex gap-2">
              <input value={nomModele} onChange={(e) => setNomModele(e.target.value)} placeholder="Nom du modèle" className="champ flex-1" />
              <button type="submit" formAction={enregistrerModele} name="nom_modele" value={nomModele} disabled={!nomModele.trim()} className="bouton-secondaire">Enregistrer comme modèle</button>
            </div>
            <p className="text-xs text-slate-500">{type === "libre" ? "Email libre : les réponses sont rattachées à la fiche, sans mise à jour automatique." : "Disponibilité : chaque réponse est lue et met à jour la disponibilité automatiquement."}</p>
          </div>
          <div className="rounded-2xl bg-white/70 p-5 text-sm ring-1 ring-white/80">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Aperçu{exemple ? ` (pour ${exemple.nom})` : ""}</div>
            <div className="mt-2 font-semibold text-nuit">{objet}</div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{rendu}</pre>
          </div>
        </div>
      </div>

      <div className="carte flex flex-wrap items-center justify-between gap-3 p-6">
        <Etape n={3} titre="Préparer l'envoi" texte="Rien ne part à cette étape : l'envoi se lance ensuite, dans « Envois »." />
        <button disabled={enCours || !apercu?.total} className="bouton-primaire px-6 py-2.5">{enCours ? "Préparation…" : `Préparer pour ${apercu?.total.toLocaleString("fr-FR") ?? "…"} consultant(s)`}</button>
        {etat.erreur && <p className="w-full text-sm text-red-700">{etat.erreur}</p>}
        {etat.message && <p className="w-full text-sm text-emerald-700">{etat.message}</p>}
      </div>
    </form>
  );
}

function Etape({ n, titre, texte }: { n: number; titre: string; texte: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nuit text-sm font-bold text-white">{n}</span>
      <div><h2 className="font-semibold text-nuit">{titre}</h2><p className="text-sm text-slate-500">{texte}</p></div>
    </div>
  );
}
