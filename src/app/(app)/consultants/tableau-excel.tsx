"use client";

import Link from "next/link";
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChampFiche } from "@/lib/import/excel";
import {
  filtreRapide, filtrerEtTrier, valeurEcran, valeursDistinctes, VIDE,
  type FiltreRapide, type Filtres, type LigneTableau, type Tri,
} from "@/lib/tableau/modele";
import { modifierCellules } from "@/lib/tableau/actions";
import { classePastille } from "@/lib/statuts";
import PanneauFiche, { prechargerFiche } from "./panneau-fiche";
import { IconeCopier, IconeCrayon, IconeExport, IconeFiche, IconeFiltre, IconeImport, IconePlus, IconeRecherche } from "../icones";

const PAR_PAGE = 100;

export interface ExtraitCV { extrait: string; source: string }

/** Extrait du CV où le mot cherché apparaît (balisé [[…]] par la base), mot surligné. */
export function TexteSurligne({ texte }: { texte: string }) {
  return <>« {texte.split(/(\[\[.*?\]\])/).map((m, i) => m.startsWith("[[")
    ? <mark key={i} className="rounded bg-amber-100 px-0.5 font-semibold text-nuit">{m.slice(2, -2)}</mark>
    : <Fragment key={i}>{m}</Fragment>)} »</>;
}

/** Largeur de chaque colonne selon ce qu'elle contient : compacte pour un trigramme, large pour des notes. Texte trop long = coupé, visible au survol. */
const LARGEURS: Partial<Record<ChampFiche, string>> = {
  trigramme: "w-20 min-w-20 max-w-20", prenom: "min-w-32 max-w-40", nom: "min-w-32 max-w-44", nom_complet: "min-w-44 max-w-56",
  telephone: "min-w-36 max-w-36", email: "min-w-52 max-w-64", email_2: "min-w-44 max-w-56", statut: "min-w-28 max-w-36",
  disponibilite: "min-w-32 max-w-40", date_maj: "min-w-28 max-w-28", intitule_poste: "min-w-48 max-w-64", localisation: "min-w-32 max-w-44",
  experience: "min-w-24 max-w-32", tjm_salaire: "min-w-28 max-w-36", linkedin: "min-w-36 max-w-44", cv_lien: "min-w-32 max-w-40",
  notes: "min-w-64 max-w-80", commentaire_email: "min-w-48 max-w-64",
};
const largeur = (champ?: ChampFiche) => (champ && LARGEURS[champ]) || "min-w-32 max-w-56";

interface Props {
  /** Vues par domaine (colonne « Domaine »), affichées comme des onglets. */
  vues: { cle: string; nom: string }[];
  vueInitiale: string;
  colonneDomaine: string;
  ongletId: string;
  entetes: string[];
  champs: Record<string, ChampFiche>;
  lignes: LigneTableau[];
  estAdmin: boolean;
  /** Liens SharePoint par fiche consultant : Word Unitech et PDF anonymisé. */
  documents: Record<string, { word?: string; email?: string; pdf?: string }>;
  /** Vrai tant que seules les 100 premières lignes sont arrivées. */
  chargementPartiel?: boolean;
}

export default function TableauExcel({ vues, vueInitiale, colonneDomaine, ongletId, entetes, champs, lignes: initiales, estAdmin, documents, chargementPartiel }: Props) {
  const [lignes, setLignes] = useState(initiales);
  // Données rafraîchies (après l'affichage de la version gardée en mémoire) : on les prend sans perdre filtres ni tri.
  const [source, setSource] = useState(initiales);
  if (source !== initiales) { setSource(initiales); setLignes(initiales); }
  // Vue par domaine : filtrée dans le navigateur, sans recharger les 4 000 lignes.
  const [vueActive, setVueActive] = useState(vueInitiale);
  const [filtres, setFiltres] = useState<Filtres>({});
  const [recherche, setRecherche] = useState("");
  // Tri par défaut : ordre alphabétique des prénoms.
  const [tri, setTri] = useState<Tri | null>(() => {
    const colonnePrenom = Object.entries(champs).find(([, c]) => c === "prenom")?.[0];
    return colonnePrenom ? { colonne: colonnePrenom, sens: "asc" } : null;
  });
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [filtreOuvert, setFiltreOuvert] = useState<{ colonne: string; x: number; y: number } | null>(null);
  const [edition, setEdition] = useState<{ id: string; colonne: string } | null>(null);
  const [masse, setMasse] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null);
  const fermerFiche = useCallback(() => setFicheOuverte(null), []);

  const affiche = useCallback((c: string, v: string | undefined) => valeurEcran(champs[c], v), [champs]);
  // La saisie reste fluide : le filtrage suit juste derrière la frappe.
  const rechercheDifferee = useDeferredValue(recherche);
  const [rapides, setRapides] = useState<FiltreRapide[]>([]);
  const lignesVue = useMemo(() => {
    const maintenant = Date.parse(new Date().toISOString());
    return lignes.filter((l) =>
      (!vueActive || (l.valeurs[colonneDomaine] ?? "").split(" ; ").includes(vueActive)) &&
      rapides.every((f) => filtreRapide(l, f, maintenant)));
  }, [lignes, vueActive, colonneDomaine, rapides]);
  // La recherche porte aussi sur le texte complet des CV (côté base, index plein texte).
  const [dansCV, setDansCV] = useState<{ q: string; ids: Set<string>; extraits: Map<string, ExtraitCV> }>({ q: "", ids: new Set(), extraits: new Map() });
  useEffect(() => {
    const q = rechercheDifferee.trim();
    if (q.length < 3) return;
    let actif = true;
    const t = setTimeout(() => {
      fetch(`/api/consultants/recherche-cv?q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : [])).then((res: ({ id: string } & ExtraitCV)[]) => {
        if (actif) setDansCV({ q, ids: new Set(res.map((x) => x.id)), extraits: new Map(res.map((x) => [x.id, { extrait: x.extrait, source: x.source }])) });
      }).catch(() => undefined);
    }, 300);
    return () => { actif = false; clearTimeout(t); };
  }, [rechercheDifferee]);
  const [avecCV, setAvecCV] = useState(true);
  const idsCV = avecCV && dansCV.q === rechercheDifferee.trim() ? dansCV.ids : undefined;
  const visibles = useMemo(() => filtrerEtTrier(lignesVue, filtres, rechercheDifferee, tri, affiche, idsCV), [lignesVue, filtres, rechercheDifferee, tri, affiche, idsCV]);
  // Lignes trouvées seulement grâce au texte du CV (le mot n'est dans aucune colonne) : signalées par une pastille.
  const parLeCV = useMemo(() => {
    if (!idsCV?.size) return new Set<string>();
    const dansColonnes = new Set(filtrerEtTrier(lignesVue, filtres, rechercheDifferee, null, affiche).map((l) => l.id));
    return new Set(visibles.filter((l) => !dansColonnes.has(l.id)).map((l) => l.id));
  }, [idsCV, lignesVue, filtres, rechercheDifferee, affiche, visibles]);
  const pages = Math.max(1, Math.ceil(visibles.length / PAR_PAGE));
  const pageCourante = Math.min(page, pages - 1);
  const affichees = visibles.slice(pageCourante * PAR_PAGE, (pageCourante + 1) * PAR_PAGE);
  const nbFiltres = Object.keys(filtres).length + (recherche ? 1 : 0) + rapides.length;

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  function enregistrer(ids: string[], colonne: string, valeur: string) {
    const avant = lignes;
    const cibles = new Set(ids);
    setLignes((ls) =>
      ls.map((l) => {
        if (!cibles.has(l.id)) return l;
        const valeurs = { ...l.valeurs };
        if (valeur.trim()) valeurs[colonne] = valeur.trim();
        else delete valeurs[colonne];
        return { ...l, valeurs };
      }),
    );
    demarrer(async () => {
      const r = await modifierCellules(ids, colonne, valeur);
      setMessage({ ok: r.ok, texte: r.message });
      if (!r.ok && !r.lignes && !/^Tableau modifié/.test(r.message)) setLignes(avant);
    });
  }

  const toutesCochees = affichees.length > 0 && affichees.every((l) => selection.has(l.id));
  function basculerPage() {
    setSelection((s) => {
      const n = new Set(s);
      affichees.forEach((l) => (toutesCochees ? n.delete(l.id) : n.add(l.id)));
      return n;
    });
  }
  function basculer(id: string) {
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const colEmail = entetes.find((e) => champs[e] === "email");
  const colTel = entetes.find((e) => champs[e] === "telephone");
  const lignesSelection = lignes.filter((l) => selection.has(l.id));
  async function copier(colonne: string, libelle: string) {
    const valeurs = [...new Set(lignesSelection.map((l) => affiche(colonne, l.valeurs[colonne])).filter(Boolean))];
    try {
      await navigator.clipboard.writeText(valeurs.join("; "));
      setMessage({ ok: true, texte: `${valeurs.length} ${libelle} copié(e)s : collez-les dans Outlook ou ailleurs.` });
    } catch {
      setMessage({ ok: false, texte: "Copie impossible dans ce navigateur." });
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {ficheOuverte && <PanneauFiche id={ficheOuverte} onFermer={fermerFiche} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titre-page">Consultants</h1>
          <p className="text-sm text-zinc-500">
            {chargementPartiel ? "Chargement des autres lignes…" : <>{visibles.length.toLocaleString("fr-FR")} ligne(s){nbFiltres > 0 && ` sur ${lignesVue.length.toLocaleString("fr-FR")}`}{parLeCV.size > 0 && `, dont ${parLeCV.size} où le mot est seulement dans le CV`}</>} ·
            <span className="hidden sm:inline">double-cliquez sur une cellule pour la modifier</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <IconeRecherche className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(0); }}
              placeholder="Nom, compétence, ville, téléphone, mot du CV…" className="champ w-full pl-9 sm:w-72" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500" title="Chercher aussi le mot dans le texte complet des CV">
            <input type="checkbox" checked={avecCV} onChange={(e) => { setAvecCV(e.target.checked); setPage(0); }} className="accent-marque-600" />
            Chercher aussi dans les CV
          </label>
          {nbFiltres > 0 && (
            <button className="bouton-secondaire" onClick={() => { setFiltres({}); setRecherche(""); setRapides([]); setTri(null); setPage(0); }}>
              Effacer les filtres
            </button>
          )}
          <MenuActions ongletId={ongletId} idsVisibles={visibles.map((l) => l.id)} estAdmin={estAdmin} />
        </div>
      </div>

      {/* Vues par domaine, comme les onglets de l'Excel, mais calculées (toujours à jour) */}
      <div className="verre flex w-fit max-w-full gap-1 overflow-x-auto rounded-full p-1">
        {vues.map((o) => (
          <button key={o.cle} type="button"
            onClick={() => {
              setVueActive(o.cle); setPage(0); setSelection(new Set());
              window.history.replaceState(null, "", o.cle ? `/consultants?domaine=${encodeURIComponent(o.cle)}` : "/consultants");
            }}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              o.cle === vueActive ? "bg-nuit text-white shadow-[0_6px_16px_-8px_rgba(11,26,63,0.7)]" : "text-slate-500 hover:bg-white/80 hover:text-nuit"
            }`}>
            {o.nom}
          </button>
        ))}
      </div>

      {/* Filtres rapides */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 text-sm sm:flex-wrap sm:overflow-visible">
        {([["disponibles", "Disponibles maintenant"], ["a_verifier", "Dispo à vérifier (> 3 mois)"], ["semaine", "Ajoutés cette semaine"], ["cv", "CV analysé"]] as const).map(([f, libelle]) => {
          const actif = rapides.includes(f);
          return (
            <button key={f} type="button" disabled={chargementPartiel}
              onClick={() => { setRapides((r) => (actif ? r.filter((x) => x !== f) : [...r, f])); setPage(0); }}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1 font-medium ring-1 transition disabled:opacity-50 ${actif ? "bg-nuit text-white ring-nuit" : "bg-white/70 text-slate-600 ring-slate-200 hover:bg-white"}`}>
              {libelle}
            </button>
          );
        })}
      </div>

      {selection.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-marque-50 px-4 py-2.5 text-sm ring-1 ring-marque-200">
          <b className="text-marque-800">{selection.size} ligne(s) sélectionnée(s)</b>
          <button className="bouton-secondaire" onClick={() => setMasse(true)}><IconeCrayon className="h-4 w-4" />Modifier une colonne</button>
          {colEmail && <button className="bouton-secondaire" onClick={() => copier(colEmail, "email")}><IconeCopier className="h-4 w-4" />Copier les emails</button>}
          {colTel && <button className="bouton-secondaire" onClick={() => copier(colTel, "téléphone")}><IconeCopier className="h-4 w-4" />Copier les téléphones</button>}
          {estAdmin && <FormulaireExport ongletId={ongletId} ids={visibles.filter((l) => selection.has(l.id)).map((l) => l.id)} libelle="Exporter la sélection" secondaire />}
          <button className="ml-auto text-marque-700 hover:underline" onClick={() => setSelection(new Set())}>Tout désélectionner</button>
        </div>
      )}

      {message && (
        <p className={`rounded-lg px-4 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message.texte}</p>
      )}

      <div className="carte max-h-[calc(100vh-15rem)] overflow-auto rounded-2xl">
        <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-30 bg-white/95 px-4 py-3 text-left backdrop-blur-xl sm:left-0">
                <input type="checkbox" checked={toutesCochees} onChange={basculerPage} aria-label="Sélectionner la page" className="accent-marque-600" />
              </th>
              {entetes.map((e) => {
                const actif = !!filtres[e] || tri?.colonne === e;
                return (
                  <th key={e} className={`${largeur(champs[e])} sticky top-0 z-20 bg-white/95 p-0 text-left text-[13px] font-semibold text-slate-500 backdrop-blur-xl`}>
                    <button
                      onClick={(ev) => {
                        const r = ev.currentTarget.getBoundingClientRect();
                        setFiltreOuvert(filtreOuvert?.colonne === e ? null : { colonne: e, x: Math.min(r.left, window.innerWidth - 300), y: r.bottom + 4 });
                      }}
                      className="group/entete flex w-full items-center justify-between gap-2 px-3 py-3 transition hover:text-nuit">
                      <span className="truncate" title={e}>{e}</span>
                      <span className={`flex items-center gap-0.5 transition ${actif ? "text-marque-600" : "text-slate-300 opacity-0 group-hover/entete:opacity-100"}`}>
                        {tri?.colonne === e && <span className="text-xs">{tri.sens === "asc" ? "▲" : "▼"}</span>}
                        <IconeFiltre className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {affichees.map((l) => {
              const cochee = selection.has(l.id);
              const extrait = parLeCV.has(l.id) && l.consultant_id ? dansCV.extraits.get(l.consultant_id) : undefined;
              return (
                <Fragment key={l.id}>
                <tr
                  onMouseEnter={l.consultant_id ? () => prechargerFiche(l.consultant_id!) : undefined}
                  onClick={(ev) => {
                    // Clic sur la ligne : fiche dans le panneau de droite (sauf case à cocher, lien ou cellule en édition).
                    if (l.consultant_id && !(ev.target as HTMLElement).closest("input, a, button")) setFicheOuverte(l.consultant_id);
                  }}
                  className={`group cursor-pointer ${cochee ? "bg-marque-50" : "bg-white/90 hover:bg-marque-50/70"}`}>
                  <td className={`border-t border-slate-100/80 px-4 py-2.5 sm:sticky sm:left-0 sm:z-10 ${cochee ? "bg-marque-50" : "bg-white group-hover:bg-[#f3f6fc]"}`}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={cochee} onChange={() => basculer(l.id)} className="accent-marque-600" aria-label={`Ligne ${l.position}`} />
                      <span className="w-9 text-right text-[13px] tabular-nums text-slate-400">{l.position}</span>
                      {parLeCV.has(l.id) && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700" title="Le mot cherché figure dans le texte du CV de cette personne">mot dans le CV</span>}
                      {l.consultant_id ? (
                        <button type="button" onClick={() => setFicheOuverte(l.consultant_id)} title="Ouvrir la fiche" className="text-zinc-400 hover:text-marque-600">
                          <IconeFiche className="h-4 w-4" />
                        </button>
                      ) : <span className="w-4" />}
                      {l.consultant_id && documents[l.consultant_id]?.word && (
                        <a href={documents[l.consultant_id].word} target="_blank" rel="noreferrer" title="Ouvrir le CV Word (SharePoint)"
                          className="rounded-md bg-marque-50 px-1.5 py-0.5 text-[10px] font-bold text-marque-700 hover:bg-marque-100">Word</a>
                      )}
                      {l.consultant_id && documents[l.consultant_id]?.email && (
                        <a href={documents[l.consultant_id].email} target="_blank" rel="noreferrer" title="Ouvrir le CV reçu par email (SharePoint)"
                          className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100">CV reçu</a>
                      )}
                      {l.consultant_id && documents[l.consultant_id]?.pdf && (
                        <a href={documents[l.consultant_id].pdf} target="_blank" rel="noreferrer" title="Ouvrir le PDF anonymisé (SharePoint)"
                          className="rounded-md bg-marque-50 px-1.5 py-0.5 text-[10px] font-bold text-marque-700 hover:bg-marque-100">PDF</a>
                      )}
                    </div>
                  </td>
                  {entetes.map((e) => {
                    const enEdition = edition?.id === l.id && edition.colonne === e;
                    const v = affiche(e, l.valeurs[e]);
                    return (
                      <td key={e} onDoubleClick={() => setEdition({ id: l.id, colonne: e })}
                        className={`${largeur(champs[e])} cursor-default border-t border-slate-100/80 px-3 py-2.5 text-slate-700`}>
                        {enEdition ? (
                          <EditeurCellule valeur={l.valeurs[e] ?? ""}
                            onValider={(nv) => { setEdition(null); if (nv.trim() !== (l.valeurs[e] ?? "")) enregistrer([l.id], e, nv); }}
                            onAnnuler={() => setEdition(null)} />
                        ) : (
                          <Cellule valeur={v} champ={champs[e]} />
                        )}
                      </td>
                    );
                  })}
                </tr>
                {extrait && (
                  <tr className={cochee ? "bg-marque-50" : "bg-white/90"}>
                    <td colSpan={entetes.length + 1} className="px-4 pb-2.5 pt-0">
                      <div className="sm:sticky sm:left-4 max-w-3xl text-[12.5px] leading-snug text-slate-500">
                        <span className="mr-1.5 font-semibold text-violet-700">{extrait.source === "email" ? "CV reçu par email :" : "CV SharePoint :"}</span>
                        <TexteSurligne texte={extrait.extrait} />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {!affichees.length && (
              <tr><td colSpan={entetes.length + 1} className="p-10 text-center text-zinc-500">Aucune ligne ne correspond aux filtres.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-600">
        <span>{enCours ? "Enregistrement…" : `Page ${pageCourante + 1} sur ${pages}`}</span>
        <div className="flex gap-2">
          <button className="bouton-secondaire" disabled={pageCourante === 0} onClick={() => setPage(pageCourante - 1)}>← Précédente</button>
          <button className="bouton-secondaire" disabled={pageCourante >= pages - 1} onClick={() => setPage(pageCourante + 1)}>Suivante →</button>
        </div>
      </div>

      {filtreOuvert && (
        <MenuFiltre
          key={filtreOuvert.colonne}
          colonne={filtreOuvert.colonne}
          position={filtreOuvert}
          // Comme Excel : les choix proposés tiennent compte des autres filtres.
          valeurs={valeursDistinctes(
            filtrerEtTrier(lignesVue, Object.fromEntries(Object.entries(filtres).filter(([c]) => c !== filtreOuvert.colonne)), recherche, null, affiche),
            filtreOuvert.colonne, affiche,
          )}
          coches={filtres[filtreOuvert.colonne]}
          onTrier={(sens) => { setTri({ colonne: filtreOuvert.colonne, sens }); setFiltreOuvert(null); }}
          onAppliquer={(vals) => {
            setFiltres((f) => {
              const n = { ...f };
              if (vals === null) delete n[filtreOuvert.colonne];
              else n[filtreOuvert.colonne] = vals;
              return n;
            });
            setPage(0);
            setFiltreOuvert(null);
          }}
          onFermer={() => setFiltreOuvert(null)}
        />
      )}

      {masse && (
        <ModificationMasse
          entetes={entetes}
          nombre={selection.size}
          onAnnuler={() => setMasse(false)}
          onValider={(colonne, valeur) => { setMasse(false); enregistrer([...selection], colonne, valeur); }}
        />
      )}
    </div>
  );
}

function Cellule({ valeur, champ }: { valeur: string; champ?: ChampFiche }) {
  if (!valeur) return null; // case vide : laissée blanche, plus lisible qu'un tiret
  if (champ === "email") return <a href={`mailto:${valeur}`} className="block truncate text-marque-700 hover:underline" title={valeur}>{valeur}</a>;
  if (/^https?:\/\//i.test(valeur)) {
    return <a href={valeur} target="_blank" rel="noreferrer" className="block truncate text-marque-700 hover:underline" title={valeur}>{valeur.replace(/^https?:\/\/(www\.)?/i, "")}</a>;
  }
  if (champ === "statut" || champ === "disponibilite") return <span className={`${classePastille(valeur)} text-[13px]`}>{valeur}</span>;
  return <span className="block truncate" title={valeur.length > 20 ? valeur : undefined}>{valeur}</span>;
}

function EditeurCellule({ valeur, onValider, onAnnuler }: { valeur: string; onValider: (v: string) => void; onAnnuler: () => void }) {
  const [v, setV] = useState(valeur);
  const fini = useRef(false);
  return (
    <input autoFocus value={v} onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { fini.current = true; onValider(v); }
        if (e.key === "Escape") { fini.current = true; onAnnuler(); }
      }}
      onBlur={() => { if (!fini.current) onValider(v); }}
      className="w-full min-w-40 rounded border border-marque-400 px-1.5 py-0.5 outline-none ring-2 ring-marque-200" />
  );
}

function MenuFiltre({ colonne, position, valeurs, coches, onTrier, onAppliquer, onFermer }: {
  colonne: string;
  position: { x: number; y: number };
  valeurs: { valeur: string; nombre: number }[];
  coches?: string[];
  onTrier: (sens: "asc" | "desc") => void;
  onAppliquer: (vals: string[] | null) => void;
  onFermer: () => void;
}) {
  const [choix, setChoix] = useState<Set<string>>(new Set(coches ?? valeurs.map((v) => v.valeur)));
  const [cherche, setCherche] = useState("");
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const clic = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) onFermer(); };
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    setTimeout(() => document.addEventListener("mousedown", clic), 0);
    document.addEventListener("keydown", touche);
    return () => { document.removeEventListener("mousedown", clic); document.removeEventListener("keydown", touche); };
  }, [onFermer]);

  const q = cherche.toLowerCase();
  const listees = valeurs.filter((v) => v.valeur.toLowerCase().includes(q));
  const MAX = 400;
  const toutes = listees.every((v) => choix.has(v.valeur));

  function appliquer() {
    // Avec une recherche, Excel ne garde que les valeurs trouvées et cochées.
    const retenues = q ? listees.filter((v) => choix.has(v.valeur)).map((v) => v.valeur) : [...choix];
    if (!q && retenues.length === valeurs.length) onAppliquer(null);
    else onAppliquer(retenues);
  }

  return (
    <div ref={boite} style={{ left: Math.max(8, position.x), top: position.y }}
      className="verre fixed z-50 w-72 rounded-2xl bg-white/85 p-3 text-sm">
      <div className="mb-2 truncate text-xs font-semibold uppercase tracking-wide text-zinc-500">{colonne}</div>
      <div className="mb-2 grid grid-cols-2 gap-1">
        <button className="bouton-secondaire justify-center" onClick={() => onTrier("asc")}>Trier A → Z</button>
        <button className="bouton-secondaire justify-center" onClick={() => onTrier("desc")}>Trier Z → A</button>
      </div>
      <input autoFocus value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Rechercher une valeur…" className="champ mb-2 w-full" />
      <label className="flex items-center gap-2 border-b border-zinc-100 py-1.5 font-medium">
        <input type="checkbox" className="accent-marque-600" checked={toutes}
          onChange={() => setChoix((c) => { const n = new Set(c); listees.forEach((v) => (toutes ? n.delete(v.valeur) : n.add(v.valeur))); return n; })} />
        (Tout sélectionner)
      </label>
      <div className="max-h-64 overflow-y-auto py-1">
        {listees.slice(0, MAX).map((v) => (
          <label key={v.valeur} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-zinc-50">
            <input type="checkbox" className="accent-marque-600" checked={choix.has(v.valeur)}
              onChange={() => setChoix((c) => { const n = new Set(c); if (n.has(v.valeur)) n.delete(v.valeur); else n.add(v.valeur); return n; })} />
            <span className={`flex-1 truncate ${v.valeur === VIDE ? "italic text-zinc-500" : ""}`}>{v.valeur}</span>
            <span className="text-xs text-zinc-400">{v.nombre}</span>
          </label>
        ))}
        {listees.length > MAX && <p className="px-1 py-1 text-xs text-zinc-500">{listees.length - MAX} autres valeurs : affinez la recherche.</p>}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button className="bouton-secondaire" onClick={onFermer}>Annuler</button>
        <button className="bouton-primaire" onClick={appliquer}>OK</button>
      </div>
    </div>
  );
}

function ModificationMasse({ entetes, nombre, onAnnuler, onValider }: {
  entetes: string[];
  nombre: number;
  onAnnuler: () => void;
  onValider: (colonne: string, valeur: string) => void;
}) {
  const [colonne, setColonne] = useState(entetes[0]);
  const [valeur, setValeur] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm" onClick={onAnnuler}>
      <div className="verre w-full max-w-md rounded-3xl bg-white/85 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Modifier {nombre} ligne(s)</h2>
        <p className="mt-1 text-sm text-zinc-500">La même valeur sera écrite dans la colonne choisie pour toutes les lignes sélectionnées. Laissez vide pour effacer.</p>
        <label className="mt-4 block text-sm font-medium">Colonne
          <select value={colonne} onChange={(e) => setColonne(e.target.value)} className="champ mt-1 w-full">
            {entetes.map((e) => <option key={e}>{e}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm font-medium">Nouvelle valeur
          <input autoFocus value={valeur} onChange={(e) => setValeur(e.target.value)} className="champ mt-1 w-full" placeholder="ex. Disponible, 01/12/2026…" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button className="bouton-secondaire" onClick={onAnnuler}>Annuler</button>
          <button className="bouton-primaire" onClick={() => onValider(colonne, valeur)}>Appliquer à {nombre} ligne(s)</button>
        </div>
      </div>
    </div>
  );
}

/** Bouton « + » tout à droite : nouvelle fiche, nouvelle mission, export et import du fichier Excel. */
function MenuActions({ ongletId, idsVisibles, estAdmin }: { ongletId: string; idsVisibles: string[]; estAdmin: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", touche);
    return () => { document.removeEventListener("mousedown", clic); document.removeEventListener("keydown", touche); };
  }, [ouvert]);
  const element = "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-nuit transition hover:bg-white";
  return (
    <div ref={boite} className="relative">
      <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} aria-label="Actions" title="Actions"
        className={`flex h-10 w-10 items-center justify-center rounded-full bg-nuit text-white shadow-[0_8px_20px_-8px_rgba(11,26,63,0.6)] transition hover:bg-marque-700 ${ouvert ? "rotate-45" : ""}`}>
        <IconePlus className="h-5 w-5" />
      </button>
      {ouvert && (
        <div className="verre absolute right-0 top-12 z-50 w-64 rounded-2xl bg-white/85 p-1.5">
          <Link href="/consultants/nouveau" className={element}><IconePlus className="h-4 w-4 text-marque-600" />Nouveau consultant</Link>
          <Link href="/missions/nouvelle" className={element}><IconeFiche className="h-4 w-4 text-marque-600" />Nouvelle mission</Link>
          {estAdmin && (
            <>
              <div className="my-1 border-t border-slate-200/70" />
              <form method="post" action="/tableau/export">
                <input type="hidden" name="onglet" value={ongletId} />
                <input type="hidden" name="ids" value={JSON.stringify(idsVisibles)} />
                <button disabled={!idsVisibles.length} className={element}><IconeExport className="h-4 w-4 text-marque-600" />Exporter en Excel ({idsVisibles.length.toLocaleString("fr-FR")} lignes)</button>
              </form>
              <Link href="/parametres/import" className={element}><IconeImport className="h-4 w-4 text-marque-600" />Importer un fichier Excel</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FormulaireExport({ ongletId, ids, libelle, secondaire }: { ongletId: string; ids: string[]; libelle: string; secondaire?: boolean }) {
  return (
    <form method="post" action="/tableau/export">
      <input type="hidden" name="onglet" value={ongletId} />
      <input type="hidden" name="ids" value={JSON.stringify(ids)} />
      <button disabled={!ids.length} className={secondaire ? "bouton-secondaire" : "bouton-primaire"}>
        <IconeExport className="h-4 w-4" />{libelle}
      </button>
    </form>
  );
}
