"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChampFiche } from "@/lib/import/excel";
import {
  filtrerEtTrier, valeurEcran, valeursDistinctes, VIDE,
  type Filtres, type LigneTableau, type Tri,
} from "@/lib/tableau/modele";
import { modifierCellules } from "@/lib/tableau/actions";
import { IconeCopier, IconeCrayon, IconeExport, IconeFiche, IconeFiltre, IconeRecherche } from "../icones";

const PAR_PAGE = 100;

interface Props {
  onglets: { id: string; nom: string }[];
  ongletId: string;
  entetes: string[];
  champs: Record<string, ChampFiche>;
  lignes: LigneTableau[];
  estAdmin: boolean;
}

export default function TableauExcel({ onglets, ongletId, entetes, champs, lignes: initiales, estAdmin }: Props) {
  const [lignes, setLignes] = useState(initiales);
  const [filtres, setFiltres] = useState<Filtres>({});
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState<Tri | null>(null);
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [filtreOuvert, setFiltreOuvert] = useState<{ colonne: string; x: number; y: number } | null>(null);
  const [edition, setEdition] = useState<{ id: string; colonne: string } | null>(null);
  const [masse, setMasse] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const affiche = useCallback((c: string, v: string | undefined) => valeurEcran(champs[c], v), [champs]);
  const visibles = useMemo(() => filtrerEtTrier(lignes, filtres, recherche, tri, affiche), [lignes, filtres, recherche, tri, affiche]);
  const pages = Math.max(1, Math.ceil(visibles.length / PAR_PAGE));
  const pageCourante = Math.min(page, pages - 1);
  const affichees = visibles.slice(pageCourante * PAR_PAGE, (pageCourante + 1) * PAR_PAGE);
  const nbFiltres = Object.keys(filtres).length + (recherche ? 1 : 0);

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titre-page">Tableau de suivi</h1>
          <p className="text-sm text-zinc-500">
            {visibles.length.toLocaleString("fr-FR")} ligne(s){nbFiltres > 0 && ` sur ${lignes.length.toLocaleString("fr-FR")}`} ·
            double-cliquez sur une cellule pour la modifier
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <IconeRecherche className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(0); }}
              placeholder="Rechercher dans tout l'onglet…" className="champ w-full pl-9 sm:w-72" />
          </label>
          {nbFiltres > 0 && (
            <button className="bouton-secondaire" onClick={() => { setFiltres({}); setRecherche(""); setTri(null); setPage(0); }}>
              Effacer les filtres
            </button>
          )}
          {estAdmin && <FormulaireExport ongletId={ongletId} ids={visibles.map((l) => l.id)} libelle="Exporter en Excel" />}
        </div>
      </div>

      {/* Onglets, comme dans Excel */}
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200">
        {onglets.map((o) => (
          <Link key={o.id} href={`/tableau?onglet=${o.id}`}
            className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              o.id === ongletId ? "bg-white text-marque-700 shadow-[inset_0_-2px_0] shadow-marque-600" : "text-zinc-500 hover:bg-white/60 hover:text-zinc-800"
            }`}>
            {o.nom}
          </Link>
        ))}
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

      <div className="carte max-h-[calc(100vh-15rem)] overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left">
                <input type="checkbox" checked={toutesCochees} onChange={basculerPage} aria-label="Sélectionner la page" className="accent-marque-600" />
              </th>
              {entetes.map((e) => {
                const actif = !!filtres[e] || tri?.colonne === e;
                return (
                  <th key={e} className="sticky top-0 z-20 border-b border-l border-zinc-200 bg-zinc-50 p-0 text-left font-semibold text-zinc-700">
                    <button
                      onClick={(ev) => {
                        const r = ev.currentTarget.getBoundingClientRect();
                        setFiltreOuvert(filtreOuvert?.colonne === e ? null : { colonne: e, x: Math.min(r.left, window.innerWidth - 300), y: r.bottom + 4 });
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 hover:bg-zinc-100">
                      <span className="whitespace-nowrap">{e}</span>
                      <span className={`flex items-center gap-0.5 ${actif ? "text-marque-600" : "text-zinc-400"}`}>
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
              return (
                <tr key={l.id} className={`group ${cochee ? "bg-marque-50/70" : "hover:bg-zinc-50"}`}>
                  <td className={`sticky left-0 z-10 border-b border-zinc-100 px-3 py-2 ${cochee ? "bg-marque-50" : "bg-white group-hover:bg-zinc-50"}`}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={cochee} onChange={() => basculer(l.id)} className="accent-marque-600" aria-label={`Ligne ${l.position}`} />
                      <span className="w-9 text-right text-xs tabular-nums text-zinc-400">{l.position}</span>
                      {l.consultant_id ? (
                        <Link href={`/consultants/${l.consultant_id}`} title="Ouvrir la fiche" className="text-zinc-400 hover:text-marque-600">
                          <IconeFiche className="h-4 w-4" />
                        </Link>
                      ) : <span className="w-4" />}
                    </div>
                  </td>
                  {entetes.map((e) => {
                    const enEdition = edition?.id === l.id && edition.colonne === e;
                    const v = affiche(e, l.valeurs[e]);
                    return (
                      <td key={e} onDoubleClick={() => setEdition({ id: l.id, colonne: e })}
                        className="max-w-[22rem] cursor-default border-b border-l border-zinc-100 px-3 py-2">
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
            filtrerEtTrier(lignes, Object.fromEntries(Object.entries(filtres).filter(([c]) => c !== filtreOuvert.colonne)), recherche, null, affiche),
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
  if (!valeur) return <span className="text-zinc-300">—</span>;
  if (champ === "email") return <a href={`mailto:${valeur}`} className="text-marque-700 hover:underline">{valeur}</a>;
  if (/^https?:\/\//i.test(valeur)) {
    return <a href={valeur} target="_blank" rel="noreferrer" className="block truncate text-marque-700 hover:underline" title={valeur}>{valeur.replace(/^https?:\/\/(www\.)?/i, "")}</a>;
  }
  if (champ === "statut") return <span className="pastille">{valeur}</span>;
  return <span className={`block ${valeur.length > 60 ? "line-clamp-2" : "whitespace-nowrap"}`} title={valeur.length > 60 ? valeur : undefined}>{valeur}</span>;
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
      className="fixed z-50 w-72 rounded-xl bg-white p-3 text-sm shadow-xl ring-1 ring-zinc-200">
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
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
