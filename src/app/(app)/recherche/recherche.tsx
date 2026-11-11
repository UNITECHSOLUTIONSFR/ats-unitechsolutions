"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { envoyerMessageRecherche, relancerRecherche } from "@/lib/recherche/actions";
import type { Criteres, ResultatRecherche } from "@/lib/recherche/moteur";
import { formaterTelephone } from "@/lib/metier/telephone";
import PanneauFiche, { prechargerFiche } from "../consultants/panneau-fiche";
import { TexteSurligne } from "../consultants/texte-surligne";

const EXEMPLES = [
  "Je cherche un DevOps, 5-6 ans d'expérience, qui maîtrise Jenkins et Kubernetes, mobile sur Paris",
  "Un développeur Java Spring Boot senior qui a travaillé chez Orange",
  "Chef de projet SAP FI avec 10 ans d'expérience dans la banque",
];
const TRIS = { pertinence: "Pertinence", experience: "Expérience", nom: "Nom (A → Z)" } as const;
const PAR_PAGE = 30;

interface Message { de: "moi" | "outil"; texte: string }
interface Filtres { complets: boolean; scoreMin: number; anneesMin: string; anneesMax: string; lieu: "tous" | "compatibles" | "compatibles_inconnus"; statuts: string[]; avecWord: boolean; avecPdf: boolean; texte: string }
const FILTRES_INITIAUX: Filtres = { complets: true, scoreMin: 0, anneesMin: "", anneesMax: "", lieu: "tous", statuts: [], avecWord: false, avecPdf: false, texte: "" };

/** Section « Recherche » : conversation en haut, filtres à gauche, profils en cartes à droite (mis à jour en temps réel). */
export default function Recherche() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [saisie, setSaisie] = useState("");
  const [criteres, setCriteres] = useState<Criteres | null>(null);
  const [resultats, setResultats] = useState<ResultatRecherche[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_INITIAUX);
  const [tri, setTri] = useState<keyof typeof TRIS>("pertinence");
  const [nbAffiches, setNbAffiches] = useState(PAR_PAGE);
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null);
  const fil = useRef<HTMLDivElement>(null);

  useEffect(() => { fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: "smooth" }); }, [messages, enCours]);

  function envoyer(texte: string) {
    const t = texte.trim();
    if (!t || enCours) return;
    setSaisie("");
    setErreur(null);
    setMessages((m) => [...m, { de: "moi", texte: t }]);
    demarrer(async () => {
      const r = await envoyerMessageRecherche(t, criteres);
      if (r.erreur) { setErreur(r.erreur); return; }
      setCriteres(r.criteres ?? null);
      setResultats(r.resultats ?? []);
      setNbAffiches(PAR_PAGE);
      setMessages((m) => [...m, { de: "outil", texte: `${r.reponse ?? ""} ${r.resultats?.length ? `${r.resultats.length} profil(s) trouvé(s).` : "Aucun profil trouvé : élargissez la demande."}`.trim() }]);
    });
  }

  /** Critères modifiés d'un clic : nouveau classement sans IA. */
  function modifier(nouveaux: Criteres) {
    setCriteres(nouveaux);
    demarrer(async () => {
      const r = await relancerRecherche(nouveaux);
      if (r.erreur) setErreur(r.erreur); else { setResultats(r.resultats ?? []); setNbAffiches(PAR_PAGE); }
    });
  }

  function recommencer() {
    setMessages([]); setCriteres(null); setResultats(null); setErreur(null); setFiltres(FILTRES_INITIAUX); setSaisie("");
  }

  const visibles = useMemo(() => filtrer(resultats ?? [], filtres, tri), [resultats, filtres, tri]);
  const nbFiltres = compterFiltres(filtres);

  return (
    <div className="min-w-0 space-y-5">
      {/* Conversation */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-nuit via-marque-700 to-marque-500 p-5 text-white shadow-[0_30px_60px_-30px_rgba(31,69,163,0.6)] sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Décrivez le consultant que vous cherchez</h1>
            <p className="mt-1 text-sm text-white/70">Écrivez comme à un collègue, puis affinez : « plutôt freelance », « sans Kubernetes », « avec 8 ans minimum »…</p>
          </div>
          {messages.length > 0 && <button onClick={recommencer} className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/25">Nouvelle recherche</button>}
        </div>

        {messages.length > 0 && (
          <div ref={fil} className="relative mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.de === "moi" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.de === "moi" ? "rounded-br-md bg-white text-nuit" : "rounded-bl-md bg-white/15 text-white ring-1 ring-white/20"}`}>{m.texte}</p>
              </div>
            ))}
            {enCours && <div className="flex"><p className="rounded-2xl rounded-bl-md bg-white/15 px-4 py-2 text-sm text-white/80 ring-1 ring-white/20"><span className="animate-pulse">Recherche en cours…</span></p></div>}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); envoyer(saisie); }} className="relative mt-4 flex items-end gap-2 rounded-[1.4rem] bg-white p-2 shadow-lg">
          <textarea value={saisie} onChange={(e) => setSaisie(e.target.value)} rows={1} maxLength={2000}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(saisie); } }}
            placeholder={messages.length ? "Affinez la recherche…" : "Ex. Je cherche un DevOps, 5-6 ans d'expérience, Jenkins et Kubernetes, mobile sur Paris"}
            className="max-h-32 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-nuit outline-none placeholder:text-slate-400" />
          <button disabled={enCours || !saisie.trim()} className="bouton-primaire shrink-0 px-5 py-2.5">{enCours ? "…" : "Rechercher"}</button>
        </form>
        {erreur && <p className="relative mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{erreur}</p>}

        {!messages.length && (
          <div className="relative mt-3 flex flex-wrap gap-2">
            {EXEMPLES.map((e) => (
              <button key={e} onClick={() => envoyer(e)} className="rounded-full bg-white/10 px-3 py-1.5 text-left text-xs text-white/85 ring-1 ring-white/20 transition hover:bg-white/20">{e}</button>
            ))}
          </div>
        )}
      </section>

      {/* Critères compris, modifiables d'un clic */}
      {criteres && <BarreCriteres criteres={criteres} onChange={modifier} desactive={enCours} texteMission={messages.filter((m) => m.de === "moi").map((m) => m.texte).join("\n")} />}

      {resultats && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] [&>*]:min-w-0">
          {/* Filtres */}
          <aside className="carte h-fit space-y-5 p-5 text-sm lg:sticky lg:top-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-nuit">Filtres</h2>
              {nbFiltres > 0 && <button onClick={() => setFiltres(FILTRES_INITIAUX)} className="lien text-sm">Réinitialiser</button>}
            </div>
            <Groupe titre="Dans les résultats">
              <input value={filtres.texte} onChange={(e) => setFiltres({ ...filtres, texte: e.target.value })} placeholder="Nom, poste, compétence…" className="champ w-full" />
            </Groupe>
            <Groupe titre="Pertinence">
              <Case label="Toutes les compétences obligatoires" checked={filtres.complets} onChange={(v) => setFiltres({ ...filtres, complets: v })} />
              <label className="mt-2 block">
                <span className="flex justify-between text-slate-500"><span>Score minimum</span><span className="font-semibold tabular-nums text-nuit">{filtres.scoreMin}</span></span>
                <input type="range" min={0} max={100} step={5} value={filtres.scoreMin} onChange={(e) => setFiltres({ ...filtres, scoreMin: Number(e.target.value) })} className="mt-1 w-full accent-marque-600" />
              </label>
            </Groupe>
            <Groupe titre="Années d'expérience">
              <div className="flex items-center gap-2">
                <input type="number" min={0} value={filtres.anneesMin} onChange={(e) => setFiltres({ ...filtres, anneesMin: e.target.value })} placeholder="Min" className="champ w-full" />
                <span className="text-slate-400">à</span>
                <input type="number" min={0} value={filtres.anneesMax} onChange={(e) => setFiltres({ ...filtres, anneesMax: e.target.value })} placeholder="Max" className="champ w-full" />
              </div>
            </Groupe>
            {criteres?.lieu && (
              <Groupe titre={`Lieu : ${criteres.lieu}`}>
                {([["tous", "Tous les profils"], ["compatibles_inconnus", "Compatibles ou non renseignés"], ["compatibles", "Compatibles seulement"]] as const).map(([v, l]) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 py-0.5 text-slate-700">
                    <input type="radio" name="lieu" checked={filtres.lieu === v} onChange={() => setFiltres({ ...filtres, lieu: v })} className="accent-marque-600" />{l}
                  </label>
                ))}
                <p className="mt-1 text-xs text-slate-400">D&apos;après la mobilité, sinon la localisation.</p>
              </Groupe>
            )}
            <Groupe titre="Documents">
              <Case label="Avec CV Word" checked={filtres.avecWord} onChange={(v) => setFiltres({ ...filtres, avecWord: v })} />
              <Case label="Avec PDF anonymisé" checked={filtres.avecPdf} onChange={(v) => setFiltres({ ...filtres, avecPdf: v })} />
            </Groupe>
          </aside>

          {/* Résultats */}
          <section className={`space-y-3 transition ${enCours ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <h2 className="text-xl font-bold tracking-tight text-nuit">
                {visibles.length.toLocaleString("fr-FR")} profil{visibles.length > 1 ? "s" : ""}
                {visibles.length !== resultats.length && <span className="text-base font-medium text-slate-400"> sur {resultats.length}</span>}
              </h2>
              <label className="flex items-center gap-2 text-sm text-slate-500">Trier par
                <select value={tri} onChange={(e) => setTri(e.target.value as keyof typeof TRIS)} className="champ py-1.5">
                  {Object.entries(TRIS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            {visibles.slice(0, nbAffiches).map((r) => <Carte key={r.id} r={r} lieu={criteres?.lieu ?? null} onOuvrir={() => setFicheOuverte(r.id)} />)}
            {visibles.length > nbAffiches && (
              <button onClick={() => setNbAffiches((n) => n + PAR_PAGE)} className="bouton-secondaire mx-auto flex">Afficher {Math.min(PAR_PAGE, visibles.length - nbAffiches)} profils de plus</button>
            )}
            {!visibles.length && (
              <div className="carte p-8 text-center text-sm text-slate-500">
                Aucun profil ne correspond.{" "}
                {nbFiltres > 0 ? <button onClick={() => setFiltres(FILTRES_INITIAUX)} className="lien">Retirer les filtres</button> : "Rendez une compétence « souhaitée » ou élargissez la demande."}
              </div>
            )}
          </section>
        </div>
      )}

      {ficheOuverte && <PanneauFiche id={ficheOuverte} onFermer={() => setFicheOuverte(null)} />}
    </div>
  );
}

/** Critères compris par l'outil : un clic rend une compétence obligatoire ou souhaitée, ✕ la retire. */
function BarreCriteres({ criteres, onChange, desactive, texteMission }: { criteres: Criteres; onChange: (c: Criteres) => void; desactive: boolean; texteMission: string }) {
  const [ajout, setAjout] = useState("");
  const retirer = (cle: "poste" | "lieu" | "seniorite") => onChange({ ...criteres, [cle]: null });
  const annees = criteres.annees_min !== null || criteres.annees_max !== null
    ? criteres.annees_min !== null && criteres.annees_max !== null ? `${criteres.annees_min} à ${criteres.annees_max} ans` : criteres.annees_min !== null ? `${criteres.annees_min} ans et plus` : `${criteres.annees_max} ans au plus`
    : null;
  return (
    <section className="carte flex flex-wrap items-center gap-2 p-4 text-sm">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Critères</span>
      {criteres.poste && <Puce texte={criteres.poste} icone="💼" onRetirer={() => retirer("poste")} desactive={desactive} />}
      {criteres.competences.map((c, i) => (
        <span key={c.nom} className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold ring-1 transition ${c.obligatoire ? "bg-marque-600 text-white ring-marque-600" : "bg-marque-50 text-marque-700 ring-marque-100"}`}>
          <button disabled={desactive} title={c.obligatoire ? "Obligatoire : cliquer pour la rendre souhaitée" : "Souhaitée : cliquer pour la rendre obligatoire"}
            onClick={() => onChange({ ...criteres, competences: criteres.competences.map((x, j) => (j === i ? { ...x, obligatoire: !x.obligatoire } : x)) })}>
            {c.nom}{c.obligatoire ? "" : " (souhaitée)"}
          </button>
          <button disabled={desactive} onClick={() => onChange({ ...criteres, competences: criteres.competences.filter((_, j) => j !== i) })} aria-label={`Retirer ${c.nom}`} className="rounded-full px-1 opacity-70 hover:opacity-100">✕</button>
        </span>
      ))}
      {annees && <Puce texte={annees} icone="⏱" onRetirer={() => onChange({ ...criteres, annees_min: null, annees_max: null })} desactive={desactive} />}
      {criteres.seniorite && <Puce texte={criteres.seniorite === "confirme" ? "confirmé" : criteres.seniorite} icone="★" onRetirer={() => retirer("seniorite")} desactive={desactive} />}
      {criteres.lieu && <Puce texte={criteres.lieu} icone="📍" onRetirer={() => retirer("lieu")} desactive={desactive} />}
      {criteres.mots_cles.map((m) => <Puce key={m} texte={`« ${m} » dans le CV`} icone="🔎" desactive={desactive} onRetirer={() => onChange({ ...criteres, mots_cles: criteres.mots_cles.filter((x) => x !== m) })} />)}
      <form onSubmit={(e) => { e.preventDefault(); const n = ajout.trim(); if (n && !criteres.competences.some((c) => c.nom.toLowerCase() === n.toLowerCase())) onChange({ ...criteres, competences: [...criteres.competences, { nom: n, obligatoire: false }] }); setAjout(""); }}>
        <input value={ajout} onChange={(e) => setAjout(e.target.value)} placeholder="+ compétence" className="w-32 rounded-full bg-white/70 px-3 py-1 text-xs outline-none ring-1 ring-slate-200 focus:ring-marque-300" />
      </form>
      <Link href={`/missions/nouvelle?texte=${encodeURIComponent(texteMission)}`} className="bouton-secondaire ml-auto text-xs">Créer une mission à partir de cette recherche</Link>
    </section>
  );
}

function Puce({ texte, icone, onRetirer, desactive }: { texte: string; icone: string; onRetirer: () => void; desactive: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/80 py-1 pl-3 pr-1.5 text-xs font-semibold text-nuit ring-1 ring-slate-200">
      <span aria-hidden>{icone}</span>{texte}
      <button disabled={desactive} onClick={onRetirer} aria-label={`Retirer ${texte}`} className="rounded-full px-1 text-slate-400 hover:text-nuit">✕</button>
    </span>
  );
}

/** Carte d'un profil : identité, pastilles, compétences (★ = demandée), résumé, raisons du score, extrait du CV, actions. */
function Carte({ r, lieu, onOuvrir }: { r: ResultatRecherche; lieu: string | null; onOuvrir: () => void }) {
  const initiales = `${r.prenom?.[0] ?? ""}${r.nom?.[0] ?? ""}`.replace("—", "").toUpperCase() || "?";
  const couleur = r.elimine ? "text-slate-400" : r.score >= 75 ? "text-emerald-600" : r.score >= 50 ? "text-marque-600" : "text-slate-500";
  const tel = formaterTelephone(r.telephone);
  return (
    <article onMouseEnter={() => prechargerFiche(r.id)} className={`carte p-5 transition hover:shadow-[0_20px_40px_-25px_rgba(11,26,63,0.45)] ${r.elimine ? "opacity-75" : ""}`}>
      <div className="flex items-start gap-4">
        <button onClick={onOuvrir} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-marque-400 to-marque-700 text-lg font-bold text-white shadow-md" aria-label="Ouvrir la fiche">{initiales}</button>
        <div className="min-w-0 flex-1">
          <button onClick={onOuvrir} className="text-left">
            <div className="text-[15px] text-slate-600">{r.prenom} {r.nom} <span className="font-mono text-xs text-slate-400">{r.trigramme}</span></div>
            <div className="text-lg font-bold leading-snug tracking-tight text-nuit hover:text-marque-700">{r.intitule_poste ?? "Poste non renseigné"}</div>
          </button>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-3xl font-extrabold tabular-nums ${couleur}`}>{r.score}<span className="text-sm font-semibold text-slate-400">/100</span></div>
          {r.elimine && <div className="text-[11px] font-semibold text-red-600">Manque : {r.manquantes.join(", ")}</div>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.annees !== null && <span className="pastille bg-marque-50/90 text-marque-700 ring-marque-100">⏱ {r.annees} an{r.annees > 1 ? "s" : ""} d&apos;expérience{r.seniorite ? ` · ${r.seniorite === "confirme" ? "confirmé" : r.seniorite}` : ""}</span>}
        {r.localisation && <span className="pastille">📍 {r.localisation}</span>}
        <span className="pastille">🌍 Mobilité : {r.mobilite ?? "non renseignée"}</span>
        {lieu && r.lieu === "ok" && <span className="pastille pastille-vert">✓ Compatible {lieu}</span>}
        {lieu && r.lieu === "autre" && <span className="pastille pastille-orange">Hors {lieu}</span>}
        {r.disponibilite && <span className="pastille" title="Information indicative : la disponibilité sera mise à jour">Dispo : {r.disponibilite}</span>}
      </div>

      {r.competences.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.competences.map((k) => (
            <span key={k.nom} className={`rounded-lg px-2 py-1 text-xs font-medium ${k.demandee ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-slate-50 text-slate-600"}`}>{k.demandee && "★ "}{k.nom}</span>
          ))}
        </div>
      )}

      {r.resume && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{r.resume}</p>}
      {r.extrait && (
        <p className="mt-2 rounded-xl bg-violet-50/70 px-3 py-2 text-[12.5px] leading-snug text-slate-600">
          <span className="mr-1.5 font-semibold text-violet-700">{r.extrait.source === "email" ? "CV reçu par email :" : "CV :"}</span><TexteSurligne texte={r.extrait.texte} />
        </p>
      )}
      {r.raisons.length > 0 && (
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold text-marque-600">Pourquoi ce score</summary>
          <ul className="mt-1 list-inside list-disc space-y-0.5">{r.raisons.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <button onClick={onOuvrir} className="bouton-primaire py-1.5 text-xs">Voir la fiche</button>
        {r.word_url && <a href={r.word_url} target="_blank" rel="noreferrer" className="bouton-secondaire text-xs">CV Word</a>}
        {r.pdf_url && <a href={r.pdf_url} target="_blank" rel="noreferrer" className="bouton-secondaire text-xs">PDF anonymisé</a>}
        {tel && <a href={`tel:${r.telephone}`} className="bouton-secondaire text-xs">☎ {tel}</a>}
        {r.email && <a href={`mailto:${r.email}`} className="bouton-secondaire text-xs">@ Écrire</a>}
      </div>
    </article>
  );
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{titre}</h3>{children}</div>;
}

function Case({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-marque-600" />{label}
    </label>
  );
}

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtres appliqués aux résultats dans le navigateur : la liste se met à jour sans attendre. */
export function filtrer(liste: ResultatRecherche[], f: Filtres, tri: keyof typeof TRIS): ResultatRecherche[] {
  const min = f.anneesMin === "" ? null : Number(f.anneesMin);
  const max = f.anneesMax === "" ? null : Number(f.anneesMax);
  const texte = sansAccents(f.texte.trim());
  const res = liste.filter((r) =>
    (!f.complets || !r.elimine)
    && r.score >= f.scoreMin
    && (min === null || (r.annees ?? -1) >= min)
    && (max === null || (r.annees !== null && r.annees <= max))
    && (f.lieu === "tous" || r.lieu === "ok" || (f.lieu === "compatibles_inconnus" && r.lieu === "inconnu") || r.lieu === null)
    && (!f.statuts.length || f.statuts.includes(r.statut))
    && (!f.avecWord || !!r.word_url)
    && (!f.avecPdf || !!r.pdf_url)
    && (!texte || sansAccents(`${r.prenom} ${r.nom} ${r.trigramme} ${r.intitule_poste ?? ""} ${r.competences.map((k) => k.nom).join(" ")} ${r.localisation ?? ""} ${r.mobilite ?? ""}`).includes(texte)));
  if (tri === "experience") return [...res].sort((a, b) => (b.annees ?? -1) - (a.annees ?? -1));
  if (tri === "nom") return [...res].sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr"));
  return res;
}

function compterFiltres(f: Filtres): number {
  return Number(!f.complets) + Number(f.scoreMin > 0) + Number(f.anneesMin !== "") + Number(f.anneesMax !== "") + Number(f.lieu !== "tous")
    + f.statuts.length + Number(f.avecWord) + Number(f.avecPdf) + Number(!!f.texte.trim());
}
