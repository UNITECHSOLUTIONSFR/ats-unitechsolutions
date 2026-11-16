"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { envoyerMessageRecherche, relancerRecherche } from "@/lib/recherche/actions";
import type { Criteres, ResultatRecherche } from "@/lib/recherche/moteur";
import { formaterTelephone } from "@/lib/metier/telephone";
import PanneauFiche, { prechargerFiche } from "../consultants/panneau-fiche";
import { TexteSurligne } from "../consultants/texte-surligne";
import { BoutonWhatsApp } from "../whatsapp";

const EXEMPLES = [
  "Je cherche un DevOps, 5-6 ans d'expérience, qui maîtrise Jenkins et Kubernetes, mobile sur Paris",
  "Un développeur Java Spring Boot senior qui a travaillé chez Orange",
  "Chef de projet SAP FI avec 10 ans d'expérience dans la banque",
];
const TRIS = { pertinence: "Pertinence", recent: "Arrivés récemment", experience: "Expérience", nom: "Nom (A → Z)" } as const;
const PAR_PAGE = 30;

interface Message { de: "moi" | "outil"; texte: string }
export interface Filtres {
  complets: boolean; scoreMin: number; anneesMin: string; anneesMax: string; lieu: "tous" | "compatibles" | "compatibles_inconnus"; statuts: string[];
  avecWord: boolean; avecPdf: boolean; analyse: boolean; texte: string;
  seniorites: string[]; dispo: "" | "maintenant" | "1mois" | "3mois"; dispoRecente: boolean; ville: string; competences: string[]; langues: string[];
  secteur: string; certification: string; tjmMax: string; sources: string[]; ajout: "" | "7" | "30" | "90"; avecTel: boolean; avecEmail: boolean;
}
export const FILTRES_INITIAUX: Filtres = {
  complets: true, scoreMin: 0, anneesMin: "", anneesMax: "", lieu: "tous", statuts: [], avecWord: false, avecPdf: false, analyse: false, texte: "",
  seniorites: [], dispo: "", dispoRecente: false, ville: "", competences: [], langues: [], secteur: "", certification: "", tjmMax: "", sources: [], ajout: "", avecTel: false, avecEmail: false,
};
const SENIORITES: [string, string][] = [["junior", "Junior"], ["confirme", "Confirmé"], ["senior", "Senior"], ["expert", "Expert"]];
const SOURCES: [string, string][] = [["import_excel", "Fichier de suivi"], ["email", "Email"], ["sharepoint", "SharePoint"], ["import_annexe", "Import de fichier"], ["manuel", "Saisie"]];

/** Section « Recherche » : conversation en haut, filtres à gauche, profils en cartes à droite (mis à jour en temps réel). */
export default function Recherche({ recents }: { recents: ResultatRecherche[] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [saisie, setSaisie] = useState("");
  const [criteres, setCriteres] = useState<Criteres | null>(null);
  const [resultats, setResultats] = useState<ResultatRecherche[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_INITIAUX);
  const [tri, setTri] = useState<keyof typeof TRIS>("recent");
  const [nbAffiches, setNbAffiches] = useState(PAR_PAGE);
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null);
  const [filtresOuverts, setFiltresOuverts] = useState(false); // téléphone : filtres repliés
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
      setTri("pertinence");
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
    setMessages([]); setCriteres(null); setResultats(null); setErreur(null); setFiltres(FILTRES_INITIAUX); setSaisie(""); setTri("recent");
  }

  // Avant toute recherche : les profils arrivés récemment ; ensuite : le classement de la demande.
  const enRecherche = resultats !== null;
  const liste = resultats ?? recents;
  const visibles = useMemo(() => filtrer(liste, enRecherche ? filtres : { ...filtres, complets: false }, tri), [liste, filtres, tri, enRecherche]);
  const nbFiltres = compterFiltres(filtres);
  const maj = (m: Partial<Filtres>) => { setFiltres((f) => ({ ...f, ...m })); setNbAffiches(PAR_PAGE); };
  const comptes = useMemo(() => compter(liste), [liste]);

  return (
    <div className="min-w-0 space-y-5">
      {/* En-tête : la demande en langage courant, l'échange s'affiche au-dessus de la barre */}
      <section className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-nuit via-marque-600 to-marque-400 p-5 text-white shadow-[0_30px_60px_-30px_rgba(31,69,163,0.6)] sm:rounded-[2rem] sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Recherche</h1>
              <p className="mt-1 text-sm text-white/75">Décrivez le profil comme à un collègue : l&apos;outil comprend, classe et explique.</p>
            </div>
            {messages.length > 0 && <button onClick={recommencer} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-white/30 transition hover:bg-white/25">Nouvelle recherche</button>}
          </div>
          {messages.length > 0 && (
            <div ref={fil} className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.de === "moi" ? "justify-end" : "justify-start"}`}>
                  <p className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.de === "moi" ? "rounded-br-md bg-white text-nuit" : "rounded-bl-md bg-white/15 text-white ring-1 ring-white/20"}`}>{m.texte}</p>
                </div>
              ))}
              {enCours && (
                <div className="flex">
                  <p className="flex items-center gap-2.5 rounded-2xl rounded-bl-md bg-white/15 px-3.5 py-2 text-sm text-white/90">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
                    Je comprends la demande et je cherche dans vos consultants…
                  </p>
                </div>
              )}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); envoyer(saisie); }} className="flex items-center gap-2 rounded-2xl bg-white p-1.5 pl-4 shadow-lg focus-within:ring-4 focus-within:ring-white/30">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-slate-400" aria-hidden><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a.75.75 0 11-1.06 1.06l-3.08-3.08A7 7 0 012 9z" clipRule="evenodd" /></svg>
            <textarea value={saisie} onChange={(e) => setSaisie(e.target.value)} rows={1} maxLength={2000}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(saisie); } }}
              placeholder={messages.length ? "Affinez la recherche…" : "Ex. DevOps 5 ans, Paris"}
              className="max-h-32 min-h-[2.75rem] flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] text-nuit outline-none placeholder:text-slate-400" />
            <button disabled={enCours || !saisie.trim()} className="bouton-primaire shrink-0 px-5 py-2.5">{enCours ? "…" : "Rechercher"}</button>
          </form>
          {erreur && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{erreur}</p>}
          {!messages.length && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-white/60">Exemples :</span>
              {EXEMPLES.map((e) => (
                <button key={e} onClick={() => envoyer(e)} className="rounded-full bg-white/10 px-3 py-1 text-left text-white/90 ring-1 ring-white/25 transition hover:bg-white/20">{e}</button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Critères compris, modifiables d'un clic */}
      {criteres && <BarreCriteres criteres={criteres} onChange={modifier} desactive={enCours} />}

      {(
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-5 [&>*]:min-w-0">
          {/* Filtres */}
          <button type="button" onClick={() => setFiltresOuverts(!filtresOuverts)} className="bouton-secondaire w-full justify-center py-2.5 lg:hidden">
            {filtresOuverts ? "Masquer les filtres" : `Filtres${nbFiltres ? ` (${nbFiltres})` : ""}`}
          </button>
          <aside className={`carte h-fit overflow-hidden text-sm lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto ${filtresOuverts ? "block" : "hidden"}`}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
              <h2 className="flex items-center gap-2 text-base font-bold text-nuit">
                Filtres{nbFiltres > 0 && <span className="rounded-full bg-marque-600 px-2 py-0.5 text-xs font-bold text-white">{nbFiltres}</span>}
              </h2>
              {nbFiltres > 0 && <button onClick={() => setFiltres(FILTRES_INITIAUX)} className="lien text-sm">Tout effacer</button>}
            </div>
            <div className="divide-y divide-slate-100">
              <Groupe titre="Dans les résultats" ouvert>
                <Champ valeur={filtres.texte} onChange={(v) => maj({ texte: v })} placeholder="Nom, poste, compétence…" />
              </Groupe>
              {enRecherche && (
                <Groupe titre="Pertinence" ouvert actif={!filtres.complets || filtres.scoreMin > 0}>
                  <Case label="Toutes les compétences obligatoires" checked={filtres.complets} onChange={(v) => maj({ complets: v })} />
                  <label className="mt-2 block">
                    <span className="flex justify-between text-slate-500"><span>Score minimum</span><span className="font-semibold tabular-nums text-nuit">{filtres.scoreMin}</span></span>
                    <input type="range" min={0} max={100} step={5} value={filtres.scoreMin} onChange={(e) => maj({ scoreMin: Number(e.target.value) })} className="mt-1 w-full accent-marque-600" />
                  </label>
                </Groupe>
              )}
              <Groupe titre="Disponibilité" ouvert actif={!!filtres.dispo || filtres.dispoRecente}>
                <Puces options={[["maintenant", "Maintenant"], ["1mois", "Sous 1 mois"], ["3mois", "Sous 3 mois"]]} choisis={filtres.dispo ? [filtres.dispo] : []}
                  onChange={(v) => maj({ dispo: (v.at(-1) ?? "") as Filtres["dispo"] })} />
                <div className="mt-2"><Case label="Mise à jour il y a moins de 3 mois" checked={filtres.dispoRecente} onChange={(v) => maj({ dispoRecente: v })} /></div>
              </Groupe>
              <Groupe titre="Expérience" ouvert actif={filtres.anneesMin !== "" || filtres.anneesMax !== "" || filtres.seniorites.length > 0}>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={filtres.anneesMin} onChange={(e) => maj({ anneesMin: e.target.value })} placeholder="Min" className="champ w-full" />
                  <span className="text-slate-400">à</span>
                  <input type="number" min={0} value={filtres.anneesMax} onChange={(e) => maj({ anneesMax: e.target.value })} placeholder="Max" className="champ w-full" />
                  <span className="text-slate-400">ans</span>
                </div>
                <div className="mt-2.5"><Puces options={SENIORITES} choisis={filtres.seniorites} onChange={(v) => maj({ seniorites: v })} comptes={comptes.seniorites} /></div>
              </Groupe>
              {criteres?.lieu && (
                <Groupe titre={`Lieu demandé : ${criteres.lieu}`} ouvert actif={filtres.lieu !== "tous"}>
                  {([["tous", "Tous les profils"], ["compatibles_inconnus", "Compatibles ou non renseignés"], ["compatibles", "Compatibles seulement"]] as const).map(([v, l]) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 py-0.5 text-slate-700">
                      <input type="radio" name="lieu" checked={filtres.lieu === v} onChange={() => maj({ lieu: v })} className="accent-marque-600" />{l}
                    </label>
                  ))}
                  <p className="mt-1 text-xs text-slate-400">D&apos;après la mobilité, sinon la localisation.</p>
                </Groupe>
              )}
              <Groupe titre="Localisation et mobilité" ouvert={!!filtres.ville} actif={!!filtres.ville}>
                <Champ valeur={filtres.ville} onChange={(v) => maj({ ville: v })} placeholder="Ex. Paris, Lyon, 92…" />
              </Groupe>
              {comptes.competences.length > 0 && (
                <Groupe titre="Compétences" ouvert={filtres.competences.length > 0} actif={filtres.competences.length > 0}>
                  <Puces options={comptes.competences.map(([n]) => [n, n])} choisis={filtres.competences} onChange={(v) => maj({ competences: v })} comptes={Object.fromEntries(comptes.competences)} />
                  <p className="mt-1.5 text-xs text-slate-400">Les plus fréquentes dans ces résultats. Toutes les compétences cochées sont exigées.</p>
                </Groupe>
              )}
              {comptes.langues.length > 0 && (
                <Groupe titre="Langues" ouvert={filtres.langues.length > 0} actif={filtres.langues.length > 0}>
                  <Puces options={comptes.langues.map(([n]) => [n, n])} choisis={filtres.langues} onChange={(v) => maj({ langues: v })} comptes={Object.fromEntries(comptes.langues)} />
                </Groupe>
              )}
              <Groupe titre="Secteurs et certifications" ouvert={!!(filtres.secteur || filtres.certification)} actif={!!(filtres.secteur || filtres.certification)}>
                <Champ valeur={filtres.secteur} onChange={(v) => maj({ secteur: v })} placeholder="Secteur : banque, énergie…" />
                <div className="mt-2"><Champ valeur={filtres.certification} onChange={(v) => maj({ certification: v })} placeholder="Certification : AWS, PMP…" /></div>
              </Groupe>
              <Groupe titre="TJM / salaire" ouvert={!!filtres.tjmMax} actif={!!filtres.tjmMax}>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={filtres.tjmMax} onChange={(e) => maj({ tjmMax: e.target.value })} placeholder="Maximum" className="champ w-full" />
                  <span className="text-slate-400">€</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">Profils sans TJM renseigné exclus.</p>
              </Groupe>
              <Groupe titre="Origine de la fiche" ouvert={filtres.sources.length > 0 || !!filtres.ajout} actif={filtres.sources.length > 0 || !!filtres.ajout}>
                <Puces options={SOURCES.filter(([v]) => comptes.sources[v])} choisis={filtres.sources} onChange={(v) => maj({ sources: v })} comptes={comptes.sources} />
                <div className="mt-2.5"><Puces options={[["7", "Ajoutés < 7 jours"], ["30", "< 30 jours"], ["90", "< 3 mois"]]} choisis={filtres.ajout ? [filtres.ajout] : []}
                  onChange={(v) => maj({ ajout: (v.at(-1) ?? "") as Filtres["ajout"] })} /></div>
              </Groupe>
              <Groupe titre="Documents et coordonnées" ouvert={filtres.avecWord || filtres.avecPdf || filtres.analyse || filtres.avecTel || filtres.avecEmail}
                actif={filtres.avecWord || filtres.avecPdf || filtres.analyse || filtres.avecTel || filtres.avecEmail}>
                <Case label="Avec CV Word" checked={filtres.avecWord} onChange={(v) => maj({ avecWord: v })} />
                <Case label="Avec PDF anonymisé" checked={filtres.avecPdf} onChange={(v) => maj({ avecPdf: v })} />
                <Case label="CV analysé (compétences connues)" checked={filtres.analyse} onChange={(v) => maj({ analyse: v })} />
                <Case label="Avec téléphone" checked={filtres.avecTel} onChange={(v) => maj({ avecTel: v })} />
                <Case label="Avec email" checked={filtres.avecEmail} onChange={(v) => maj({ avecEmail: v })} />
              </Groupe>
            </div>
          </aside>

          {/* Résultats */}
          <section className={`space-y-3 transition ${enCours ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <h2 className="text-xl font-bold tracking-tight text-nuit">
                {enRecherche ? `${visibles.length.toLocaleString("fr-FR")} profil${visibles.length > 1 ? "s" : ""}` : "Profils récents"}
                {enRecherche && visibles.length !== liste.length && <span className="text-base font-medium text-slate-400"> sur {liste.length}</span>}
              </h2>
              <label className="flex items-center gap-2 text-sm text-slate-500">Trier par
                <select value={tri} onChange={(e) => setTri(e.target.value as keyof typeof TRIS)} className="champ py-1.5">
                  {Object.entries(TRIS).filter(([v]) => enRecherche || v !== "pertinence").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            {visibles.slice(0, nbAffiches).map((r) => <Carte key={r.id} r={r} lieu={criteres?.lieu ?? null} avecScore={enRecherche} onOuvrir={() => setFicheOuverte(r.id)} />)}
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
function BarreCriteres({ criteres, onChange, desactive }: { criteres: Criteres; onChange: (c: Criteres) => void; desactive: boolean }) {
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
function Carte({ r, lieu, avecScore, onOuvrir }: { r: ResultatRecherche; lieu: string | null; avecScore: boolean; onOuvrir: () => void }) {
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
        {avecScore && <div className="shrink-0 text-right">
          <div className={`text-3xl font-extrabold tabular-nums ${couleur}`}>{r.score}<span className="text-sm font-semibold text-slate-400">/100</span></div>
          {r.elimine && <div className="text-[11px] font-semibold text-red-600">Manque : {r.manquantes.join(", ")}</div>}
        </div>}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.annees !== null && <span className="pastille bg-marque-50/90 text-marque-700 ring-marque-100">⏱ {r.annees} an{r.annees > 1 ? "s" : ""} d&apos;expérience{r.seniorite ? ` · ${r.seniorite === "confirme" ? "confirmé" : r.seniorite}` : ""}</span>}
        {r.localisation && <span className="pastille">📍 {r.localisation}</span>}
        {r.mobilite && <span className="pastille">🌍 Mobilité : {r.mobilite}</span>}
        {lieu && r.lieu === "ok" && <span className="pastille pastille-vert">✓ Compatible {lieu}</span>}
        {lieu && r.lieu === "autre" && <span className="pastille pastille-orange">Hors {lieu}</span>}
        {r.disponibilite && <span className="pastille" title="Information indicative : la disponibilité sera mise à jour">Dispo : {r.disponibilite}</span>}
      </div>

      {r.competences.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-slate-400">Compétences</span>
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
        <BoutonWhatsApp telephone={r.telephone} prenom={r.prenom} />
        {r.email && <a href={`mailto:${r.email}`} className="bouton-secondaire text-xs">@ Écrire</a>}
      </div>
    </article>
  );
}

/** Section de filtres repliable ; un point bleu signale un filtre actif. */
function Groupe({ titre, children, ouvert, actif }: { titre: string; children: React.ReactNode; ouvert?: boolean; actif?: boolean }) {
  return (
    <details open={ouvert} className="group px-5 py-3.5">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">{titre}{actif && <span className="h-1.5 w-1.5 rounded-full bg-marque-600" />}</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function Champ({ valeur, onChange, placeholder }: { valeur: string; onChange: (v: string) => void; placeholder: string }) {
  return <input value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="champ w-full" />;
}

/** Choix multiples en pastilles cliquables, avec le nombre de profils concernés. */
function Puces({ options, choisis, onChange, comptes }: { options: [string, string][]; choisis: string[]; onChange: (v: string[]) => void; comptes?: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => {
        const on = choisis.includes(v);
        return (
          <button key={v} type="button" onClick={() => onChange(on ? choisis.filter((x) => x !== v) : [...choisis, v])}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${on ? "bg-marque-600 text-white ring-marque-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-marque-50 hover:text-marque-700"}`}>
            {l}{comptes?.[v] !== undefined && <span className={`ml-1 font-medium ${on ? "text-white/70" : "text-slate-400"}`}>{comptes[v]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Valeurs présentes dans la liste, pour proposer les filtres utiles (avec leur nombre de profils). */
function compter(liste: ResultatRecherche[]) {
  const comp = new Map<string, number>(), lang = new Map<string, number>();
  const seniorites: Record<string, number> = {}, sources: Record<string, number> = {};
  for (const r of liste) {
    for (const k of new Set(r.competences.map((c) => c.nom.replace(/ \(CV\)$/, "")))) comp.set(k, (comp.get(k) ?? 0) + 1);
    for (const l of new Set(r.langues ?? [])) lang.set(l, (lang.get(l) ?? 0) + 1);
    if (r.seniorite) seniorites[r.seniorite] = (seniorites[r.seniorite] ?? 0) + 1;
    if (r.source) sources[r.source] = (sources[r.source] ?? 0) + 1;
  }
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr")).slice(0, n);
  return { competences: top(comp, 24), langues: top(lang, 10), seniorites, sources };
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
  const ville = sansAccents(f.ville.trim()), secteur = sansAccents(f.secteur.trim()), certification = sansAccents(f.certification.trim());
  const tjmMax = f.tjmMax === "" ? null : Number(f.tjmMax);
  const maintenant = Date.now();
  const res = liste.filter((r) =>
    (!f.complets || !r.elimine)
    && r.score >= f.scoreMin
    && (min === null || (r.annees ?? -1) >= min)
    && (max === null || (r.annees !== null && r.annees <= max))
    && (f.lieu === "tous" || r.lieu === "ok" || (f.lieu === "compatibles_inconnus" && r.lieu === "inconnu") || r.lieu === null)
    && (!f.statuts.length || f.statuts.includes(r.statut))
    && (!f.avecWord || !!r.word_url)
    && (!f.avecPdf || !!r.pdf_url)
    && (!f.analyse || r.competences.length > 0)
    && (!texte || sansAccents(`${r.prenom} ${r.nom} ${r.trigramme} ${r.intitule_poste ?? ""} ${r.competences.map((k) => k.nom).join(" ")} ${r.localisation ?? ""} ${r.mobilite ?? ""}`).includes(texte))
    && (!f.seniorites.length || (!!r.seniorite && f.seniorites.includes(r.seniorite)))
    && (!f.dispo || disponibleAvant(r, f.dispo, maintenant))
    && (!f.dispoRecente || (!!r.dispo_maj_le && maintenant - Date.parse(r.dispo_maj_le) < 92 * JOUR))
    && (!ville || sansAccents(`${r.localisation ?? ""} ${r.mobilite ?? ""}`).includes(ville))
    && f.competences.every((k) => r.competences.some((c) => c.nom.replace(/ \(CV\)$/, "") === k))
    && f.langues.every((l) => (r.langues ?? []).includes(l))
    && (!secteur || sansAccents((r.secteurs ?? []).join(" ")).includes(secteur))
    && (!certification || sansAccents((r.certifications ?? []).join(" ")).includes(certification))
    && (tjmMax === null || (montant(r.tjm_salaire) !== null && montant(r.tjm_salaire)! <= tjmMax))
    && (!f.sources.length || (!!r.source && f.sources.includes(r.source)))
    && (!f.ajout || (!!r.cree_le && maintenant - Date.parse(r.cree_le) < Number(f.ajout) * JOUR))
    && (!f.avecTel || !!r.telephone)
    && (!f.avecEmail || !!r.email));
  if (tri === "experience") return [...res].sort((a, b) => (b.annees ?? -1) - (a.annees ?? -1));
  if (tri === "recent") return res;
  if (tri === "nom") return [...res].sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr"));
  return res;
}

function compterFiltres(f: Filtres): number {
  return Number(!f.complets) + Number(f.scoreMin > 0) + Number(f.anneesMin !== "") + Number(f.anneesMax !== "") + Number(f.lieu !== "tous")
    + f.statuts.length + Number(f.avecWord) + Number(f.avecPdf) + Number(f.analyse) + Number(!!f.texte.trim())
    + f.seniorites.length + Number(!!f.dispo) + Number(f.dispoRecente) + Number(!!f.ville.trim()) + f.competences.length + f.langues.length
    + Number(!!f.secteur.trim()) + Number(!!f.certification.trim()) + Number(!!f.tjmMax) + f.sources.length + Number(!!f.ajout) + Number(f.avecTel) + Number(f.avecEmail);
}

const JOUR = 86_400_000;

/** Premier montant d'un texte « TJM / salaire » (« 450 € / j » → 450, « 55k » → 55000). */
export function montant(t: string | null | undefined): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(k)?/i.exec((t ?? "").replace(/\s(?=\d{3}\b)/g, ""));
  if (!m) return null;
  return Math.round(Number(m[1].replace(",", ".")) * (m[2] ? 1000 : 1));
}

/** Disponible maintenant, sous 1 mois ou sous 3 mois (date de disponibilité, ou mention « immédiate »). */
function disponibleAvant(r: ResultatRecherche, quand: "maintenant" | "1mois" | "3mois", maintenant: number): boolean {
  const limite = maintenant + (quand === "maintenant" ? 0 : quand === "1mois" ? 31 : 92) * JOUR;
  if (r.disponible_le) return Date.parse(r.disponible_le) <= limite;
  return /imm[ée]diat|dispo|de suite|maintenant/i.test(r.disponibilite ?? "") && !/non/i.test(r.disponibilite ?? "");
}
