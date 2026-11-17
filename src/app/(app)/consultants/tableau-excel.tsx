"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChampFiche } from "@/lib/import/excel";
import { valeurEcran, VIDE, type FiltreRapide, type Filtres, type Tri } from "@/lib/tableau/modele";
import type { CriteresTableau, LigneAffichee, PageTableau } from "@/lib/tableau/page";
import { modifierCellules } from "@/lib/tableau/actions";
import { classePastille } from "@/lib/statuts";
import PanneauFiche, { apercuDepuisLigne, prechargerFiche } from "./panneau-fiche";
import { TexteSurligne } from "./texte-surligne";
import { BoutonWhatsApp } from "../whatsapp";
import { IconeCopier, IconeCrayon, IconeExport, IconeFiche, IconeFiltre, IconeImport, IconePlus, IconeRecherche } from "../icones";

const PAR_PAGE = 50;

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
  /** Vues : toute la base, arrivées du jour. */
  vues: { cle: string; nom: string }[];
  criteresInitiaux: CriteresTableau;
  /** Première page, préparée par le serveur (affichée tout de suite). */
  premiere: PageTableau;
  ongletId: string;
  entetes: string[];
  champs: Record<string, ChampFiche>;
  estAdmin: boolean;
}

/** Demande une page à la base (les demandes dépassées sont abandonnées). */
async function lirePage(criteres: CriteresTableau, signal: AbortSignal): Promise<PageTableau> {
  const r = await fetch("/api/consultants/page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(criteres), signal });
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<PageTableau>;
}

export default function TableauExcel({ vues, criteresInitiaux, premiere, ongletId, entetes, champs, estAdmin }: Props) {
  const [donnees, setDonnees] = useState<PageTableau>(premiere);
  const [chargement, setChargement] = useState(false);
  const [erreurLecture, setErreurLecture] = useState(false);
  const [vueActive, setVueActive] = useState(criteresInitiaux.vue);
  const [filtres, setFiltres] = useState<Filtres>({});
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState<Tri | null>(criteresInitiaux.tri);
  const [page, setPage] = useState(0);
  // Lignes cochées, gardées avec leur contenu (copie des emails, fusion) même en changeant de page.
  const [selection, setSelection] = useState<Map<string, LigneAffichee>>(new Map());
  const [filtreOuvert, setFiltreOuvert] = useState<{ colonne: string; x: number; y: number; valeurs: { valeur: string; nombre: number }[] | null } | null>(null);
  const [edition, setEdition] = useState<{ id: string; colonne: string } | null>(null);
  const [masse, setMasse] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null);
  const fermerFiche = useCallback(() => setFicheOuverte(null), []);
  const [rapides, setRapides] = useState<FiltreRapide[]>([]);
  const [avecCV, setAvecCV] = useState(true);

  const affiche = useCallback((c: string, v: string | undefined) => valeurEcran(champs[c], v), [champs]);
  // La saisie reste fluide : la base n'est interrogée qu'une fois la frappe terminée (un quart de seconde).
  const [rechercheEnvoyee, setRechercheEnvoyee] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setRechercheEnvoyee(recherche), 250);
    return () => clearTimeout(t);
  }, [recherche]);
  const criteres = useMemo<CriteresTableau>(() => ({ filtres, recherche: rechercheEnvoyee, tri, rapides, vue: vueActive, avecCV, page }),
    [filtres, rechercheEnvoyee, tri, rapides, vueActive, avecCV, page]);
  // Nouvelle recherche ou nouveaux filtres : les lignes cochées auparavant (plus visibles) sont décochées.
  const cleSelection = JSON.stringify([filtres, rechercheEnvoyee, rapides, vueActive]);
  const [derniereCle, setDerniereCle] = useState(cleSelection);
  if (derniereCle !== cleSelection) { setDerniereCle(cleSelection); setSelection(new Map()); }
  // Nouvelle page demandée à chaque changement de critère (la première vient du serveur).
  const premierPassage = useRef(true);
  useEffect(() => {
    if (premierPassage.current) { premierPassage.current = false; return; }
    const arret = new AbortController();
    setChargement(true);
    lirePage(criteres, arret.signal)
      .then((d) => { setDonnees(d); setErreurLecture(false); setChargement(false); })
      .catch((e) => { if ((e as Error).name !== "AbortError") { setErreurLecture(true); setChargement(false); } });
    return () => arret.abort();
  }, [criteres]);
  // Suivi de l'activité : la recherche est notée une fois la saisie terminée (2 secondes sans frappe).
  useEffect(() => {
    const q = rechercheEnvoyee.trim();
    if (q.length < 3) return;
    const t = setTimeout(() => {
      fetch("/api/activite/recherche", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texte: q }) }).catch(() => undefined);
    }, 1750);
    return () => clearTimeout(t);
  }, [rechercheEnvoyee]);

  const affichees = donnees.lignes;
  const total = donnees.total;
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const pageCourante = Math.min(page, pages - 1);
  const nbFiltres = Object.keys(filtres).length + (recherche ? 1 : 0) + rapides.length;
  const nbParVue: Record<string, number> = { email_jour: donnees.compteurs.email_jour, sharepoint_jour: donnees.compteurs.sharepoint_jour };

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  // Ouverture du filtre d'une colonne : ses valeurs (avec leur nombre) sont demandées à la base, selon les autres critères.
  function ouvrirFiltre(colonne: string, x: number, y: number) {
    setFiltreOuvert({ colonne, x, y, valeurs: null });
    fetch("/api/consultants/valeurs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ criteres, colonne }) })
      .then((r) => (r.ok ? r.json() : []))
      .then((valeurs: { valeur: string; nombre: number }[]) => setFiltreOuvert((f) => (f?.colonne === colonne ? { ...f, valeurs } : f)))
      .catch(() => setFiltreOuvert((f) => (f?.colonne === colonne ? { ...f, valeurs: [] } : f)));
  }

  function enregistrer(ids: string[], colonne: string, valeur: string) {
    const avant = donnees;
    const cibles = new Set(ids);
    const maj = (l: LigneAffichee): LigneAffichee => {
      if (!cibles.has(l.id)) return l;
      const valeurs = { ...l.valeurs };
      if (valeur.trim()) valeurs[colonne] = valeur.trim();
      else delete valeurs[colonne];
      return { ...l, valeurs };
    };
    // Affichage mis à jour tout de suite ; la base suit (projection mise à jour juste après l'enregistrement).
    setDonnees((d) => ({ ...d, lignes: d.lignes.map(maj) }));
    setSelection((s) => new Map([...s].map(([id, l]) => [id, maj(l)])));
    demarrer(async () => {
      const r = await modifierCellules(ids, colonne, valeur);
      setMessage({ ok: r.ok, texte: r.message });
      if (!r.ok && !r.lignes && !/^Tableau modifié/.test(r.message)) setDonnees(avant);
    });
  }

  const toutesCochees = affichees.length > 0 && affichees.every((l) => selection.has(l.id));
  function basculerPage() {
    setSelection((s) => {
      const n = new Map(s);
      affichees.forEach((l) => (toutesCochees ? n.delete(l.id) : n.set(l.id, l)));
      return n;
    });
  }
  function basculer(l: LigneAffichee) {
    setSelection((s) => {
      const n = new Map(s);
      if (n.has(l.id)) n.delete(l.id);
      else n.set(l.id, l);
      return n;
    });
  }

  const colEmail = entetes.find((e) => champs[e] === "email");
  const colTel = entetes.find((e) => champs[e] === "telephone");
  const lignesSelection = [...selection.values()];
  async function copier(colonne: string, libelle: string) {
    const valeurs = [...new Set(lignesSelection.map((l) => affiche(colonne, l.valeurs[colonne])).filter(Boolean))];
    try {
      await navigator.clipboard.writeText(valeurs.join("; "));
      setMessage({ ok: true, texte: `${valeurs.length} ${libelle} copié(e)s : collez-les dans Outlook ou ailleurs.` });
    } catch {
      setMessage({ ok: false, texte: "Copie impossible dans ce navigateur." });
    }
  }
  const reinitialiser = () => { setFiltres({}); setRecherche(""); setRechercheEnvoyee(""); setRapides([]); setTri(criteresInitiaux.tri); setVueActive(""); setAvecCV(true); setPage(0); window.history.replaceState(null, "", "/consultants"); };

  return (
    <div className="flex h-full flex-col gap-4">
      {ficheOuverte && (
        <PanneauFiche id={ficheOuverte} onFermer={fermerFiche}
          apercu={(() => { const l = [...affichees, ...lignesSelection].find((x) => x.consultant_id === ficheOuverte); return l ? apercuDepuisLigne(ficheOuverte, l.valeurs, champs) : undefined; })()} />
      )}
      {/* En-tête : titre à gauche, actions à droite (« Excel » réservé aux administrateurs). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="titre-page">Consultants</h1>
          <p className="text-sm text-slate-500">
            {total.toLocaleString("fr-FR")} consultant(s){(nbFiltres > 0 || !!vueActive) && ` sur ${donnees.compteurs.tout.toLocaleString("fr-FR")}`}
            {chargement && <span className="ml-2 inline-flex items-center gap-1 text-marque-600"><span className="h-3 w-3 animate-spin rounded-full border-2 border-marque-200 border-t-marque-600" />mise à jour…</span>}
            <span className="hidden sm:inline"> · double-cliquez sur une cellule pour la modifier</span>
          </p>
        </div>
        <MenuActions ongletId={ongletId} criteres={criteres} nombre={total} estAdmin={estAdmin} />
      </div>

      {/* Recherche et filtres : un seul bouton « Filtres » ; seuls les filtres actifs s'affichent, en pastilles retirables. */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:max-w-xl">
            <IconeRecherche className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(0); }}
              placeholder="Rechercher : nom, compétence, ville, téléphone…" className="champ w-full py-2.5 pl-10" />
          </label>
          <PanneauFiltres
            vues={vues.map((o) => ({ cle: o.cle, nom: o.nom, nombre: o.cle ? nbParVue[o.cle] ?? 0 : null }))}
            vueActive={vueActive}
            onVue={(cle) => { setVueActive(cle); setPage(0); setSelection(new Map()); window.history.replaceState(null, "", cle ? `/consultants?vue=${cle}` : "/consultants"); }}
            rapides={rapides} onRapides={(r) => { setRapides(r); setPage(0); }} desactive={false}
            avecCV={avecCV} onAvecCV={(v) => { setAvecCV(v); setPage(0); }} />
        </div>
        {(vueActive || rapides.length > 0 || !avecCV || Object.keys(filtres).length > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {vueActive && <Pastille texte={vues.find((o) => o.cle === vueActive)?.nom ?? ""} onRetirer={() => { setVueActive(""); setPage(0); window.history.replaceState(null, "", "/consultants"); }} />}
            {rapides.map((f) => <Pastille key={f} texte={RAPIDES.find(([k]) => k === f)?.[1] ?? f} onRetirer={() => { setRapides((r) => r.filter((x) => x !== f)); setPage(0); }} />)}
            {!avecCV && <Pastille texte="Sans le texte des CV" onRetirer={() => setAvecCV(true)} />}
            {Object.keys(filtres).length > 0 && <Pastille texte={`${Object.keys(filtres).length} filtre(s) de colonne`} onRetirer={() => { setFiltres({}); setPage(0); }} />}
            <button className="lien text-sm" onClick={reinitialiser}>Tout effacer</button>
          </div>
        )}
      </div>

      {erreurLecture && <p className="text-sm text-red-700">La base n&apos;a pas répondu : modifiez un critère ou rechargez la page.</p>}

      {selection.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-marque-50 px-4 py-2.5 text-sm ring-1 ring-marque-200">
          <b className="text-marque-800">{selection.size} ligne(s) sélectionnée(s)</b>
          <button className="bouton-secondaire" onClick={() => setMasse(true)}><IconeCrayon className="h-4 w-4" />Modifier une colonne</button>
          {colEmail && <button className="bouton-secondaire" onClick={() => copier(colEmail, "email")}><IconeCopier className="h-4 w-4" />Copier les emails</button>}
          {colTel && <button className="bouton-secondaire" onClick={() => copier(colTel, "téléphone")}><IconeCopier className="h-4 w-4" />Copier les téléphones</button>}
          {estAdmin && <FormulaireExport ongletId={ongletId} ids={[...selection.keys()]} libelle="Exporter la sélection" secondaire />}
          {estAdmin && selection.size === 2 && (() => {
            // Deux lignes cochées, quelles qu'elles soient : deux fiches différentes → fusion des fiches ;
            // deux lignes de la même fiche (doublon dans l'Excel) → fusion des lignes.
            const [l1, l2] = lignesSelection;
            const ids = [...new Set([l1.consultant_id, l2.consultant_id].filter((x): x is string => !!x))];
            const lignesExcel = !l1.id.startsWith("fiche:") && !l2.id.startsWith("fiche:");
            if (ids.length === 2) return <Link href={`/alertes/fusion?a=${ids[0]}&b=${ids[1]}`} className="bouton-primaire"><IconeCopier className="h-4 w-4" />Fusionner ces 2 fiches</Link>;
            if (lignesExcel) {
              const [g, v] = l1.position <= l2.position ? [l1, l2] : [l2, l1];
              return <Link href={`/consultants/fusion-lignes?a=${g.id}&b=${v.id}`} className="bouton-primaire"><IconeCopier className="h-4 w-4" />Fusionner ces 2 lignes</Link>;
            }
            return null;
          })()}
          <button className="ml-auto text-marque-700 hover:underline" onClick={() => setSelection(new Map())}>Tout désélectionner</button>
        </div>
      )}

      {message && (
        <p className={`rounded-lg px-4 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message.texte}</p>
      )}

      {/* Téléphone : une fiche compacte par personne (appeler en un geste, ouvrir la fiche) ; le tableau complet reste sur ordinateur. */}
      <ul className="space-y-2 sm:hidden">
        {affichees.map((l) => {
          const v = (c?: ChampFiche) => { const e = c && entetes.find((x) => champs[x] === c); return e ? (l.valeurs[e] ?? "").trim() : ""; };
          const nom = [v("prenom"), v("nom")].filter(Boolean).join(" ") || v("nom_complet") || "—";
          const tel = v("telephone").replace(/[^\d+]/g, "");
          const extrait = l.par_cv && l.consultant_id ? donnees.extraits[l.consultant_id] : undefined;
          return (
            <li key={l.id} className="carte carte-cliquable p-3.5" onPointerDown={l.consultant_id ? () => prechargerFiche(l.consultant_id!) : undefined} onClick={(ev) => { if (l.consultant_id && !(ev.target as HTMLElement).closest("a, button")) setFicheOuverte(l.consultant_id); }}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-nuit">{nom}</div>
                  <div className="truncate text-sm text-slate-500">{v("intitule_poste") || "Poste non renseigné"}</div>
                  <div className="mt-1.5 flex min-w-0 flex-wrap gap-1.5 text-xs">
                    {v("disponibilite") && <span className={`${classePastille(v("disponibilite"))} !block max-w-full truncate`}>{v("disponibilite")}</span>}
                    {v("localisation") && <span className="pastille !block max-w-full truncate">📍 {v("localisation")}</span>}
                    {l.par_cv && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 font-bold text-violet-700">mot dans le CV</span>}
                  </div>
                </div>
                {tel && (
                  <div className="flex shrink-0 gap-2">
                    <BoutonWhatsApp telephone={tel} prenom={v("prenom")} libelle="" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm [&>svg]:h-5 [&>svg]:w-5" />
                    <a href={`tel:${tel}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-lg text-emerald-700 ring-1 ring-emerald-200" aria-label={`Appeler ${nom}`}>☎</a>
                  </div>
                )}
              </div>
              {extrait && <p className="mt-2 text-xs text-slate-500"><TexteSurligne texte={extrait.extrait} /></p>}
            </li>
          );
        })}
        {!affichees.length && <li className="carte p-6 text-center text-sm text-slate-500">Aucune ligne ne correspond aux filtres.</li>}
      </ul>

      <div className="carte hidden max-h-[calc(100vh-15rem)] overflow-auto rounded-2xl sm:block">
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
                        if (filtreOuvert?.colonne === e) setFiltreOuvert(null);
                        else ouvrirFiltre(e, Math.min(r.left, window.innerWidth - 300), r.bottom + 4);
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
              const extrait = l.par_cv && l.consultant_id ? donnees.extraits[l.consultant_id] : undefined;
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
                      <input type="checkbox" checked={cochee} onChange={() => basculer(l)} className="accent-marque-600" aria-label={`Ligne ${l.position}`} />
                      <span className="w-9 text-right text-[13px] tabular-nums text-slate-400">{l.position}</span>
                      {l.par_cv && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700" title="Le mot cherché figure dans le texte du CV de cette personne">mot dans le CV</span>}
                      {l.consultant_id ? (
                        <button type="button" onClick={() => setFicheOuverte(l.consultant_id)} title="Ouvrir la fiche" className="text-zinc-400 hover:text-marque-600">
                          <IconeFiche className="h-4 w-4" />
                        </button>
                      ) : <span className="w-4" />}
                      {l.consultant_id && l.documents?.word && (
                        <a href={l.documents.word} target="_blank" rel="noreferrer" title="Ouvrir le CV Word (SharePoint)"
                          className="rounded-md bg-marque-50 px-1.5 py-0.5 text-[10px] font-bold text-marque-700 hover:bg-marque-100">Word</a>
                      )}
                      {l.consultant_id && l.documents?.email && (
                        <a href={l.documents.email} target="_blank" rel="noreferrer" title="Ouvrir le CV reçu par email (SharePoint)"
                          className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100">CV reçu</a>
                      )}
                      {l.consultant_id && l.documents?.pdf && (
                        <a href={l.documents.pdf} target="_blank" rel="noreferrer" title="Ouvrir le PDF anonymisé (SharePoint)"
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

      {filtreOuvert && !filtreOuvert.valeurs && (
        <div style={{ left: Math.max(8, filtreOuvert.x), top: filtreOuvert.y }} className="verre fixed z-50 flex w-72 items-center gap-2 rounded-2xl bg-white/85 p-4 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-marque-200 border-t-marque-600" />Lecture des valeurs…
        </div>
      )}
      {filtreOuvert?.valeurs && (
        <MenuFiltre
          key={filtreOuvert.colonne}
          colonne={filtreOuvert.colonne}
          position={filtreOuvert}
          // Comme Excel : les choix proposés tiennent compte des autres filtres (calculés par la base).
          valeurs={filtreOuvert.valeurs}
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
          onValider={(colonne, valeur) => { setMasse(false); enregistrer([...selection.keys()], colonne, valeur); }}
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

const RAPIDES = [["disponibles", "Disponibles maintenant"], ["a_verifier", "Disponibilité à vérifier (> 3 mois)"], ["semaine", "Ajoutés cette semaine"], ["cv", "CV analysé"]] as const;

function Pastille({ texte, onRetirer }: { texte: string; onRetirer: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-marque-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-marque-700 ring-1 ring-marque-100">
      {texte}
      <button type="button" onClick={onRetirer} aria-label={`Retirer : ${texte}`} className="rounded-full px-1 text-marque-400 hover:text-marque-700">✕</button>
    </span>
  );
}

/** Bouton « Filtres » : vues (toute la base, arrivées du jour), filtres rapides et recherche dans les CV, dans un panneau qui s'ouvre au clic. */
function PanneauFiltres({ vues, vueActive, onVue, rapides, onRapides, desactive, avecCV, onAvecCV }: {
  vues: { cle: string; nom: string; nombre: number | null }[]; vueActive: string; onVue: (cle: string) => void;
  rapides: FiltreRapide[]; onRapides: (r: FiltreRapide[]) => void; desactive: boolean; avecCV: boolean; onAvecCV: (v: boolean) => void;
}) {
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
  const nbActifs = Number(!!vueActive) + rapides.length + Number(!avecCV);
  const ligne = "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-nuit hover:bg-slate-50";
  return (
    <div ref={boite} className="relative shrink-0">
      <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} className="bouton-secondaire py-2.5">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-500" aria-hidden><path d="M3 4.75A.75.75 0 013.75 4h12.5a.75.75 0 01.53 1.28L12 10.06v4.19a.75.75 0 01-.33.62l-2.5 1.67a.75.75 0 01-1.17-.62v-5.86L3.22 5.28A.75.75 0 013 4.75z" /></svg>
        Filtres{nbActifs > 0 && <span className="rounded-full bg-marque-600 px-1.5 text-xs font-bold text-white">{nbActifs}</span>}
      </button>
      {ouvert && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 space-y-3 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200">
          <div>
            <div className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Afficher</div>
            {vues.map((o) => (
              <label key={o.cle} className={ligne}>
                <input type="radio" name="vue" checked={o.cle === vueActive} onChange={() => onVue(o.cle)} className="accent-marque-600" />
                <span className="flex-1">{o.nom}</span>
                {o.cle && <span className="rounded-md bg-slate-100 px-1.5 text-xs font-bold text-slate-500">{o.nombre ?? "…"}</span>}
              </label>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-2">
            <div className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Filtrer</div>
            {RAPIDES.map(([f, libelle]) => (
              <label key={f} className={`${ligne} ${desactive ? "opacity-50" : ""}`}>
                <input type="checkbox" disabled={desactive} checked={rapides.includes(f)} onChange={(e) => onRapides(e.target.checked ? [...rapides, f] : rapides.filter((x) => x !== f))} className="h-4 w-4 accent-marque-600" />
                {libelle}
              </label>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-2">
            <label className={ligne}>
              <input type="checkbox" checked={avecCV} onChange={(e) => onAvecCV(e.target.checked)} className="h-4 w-4 accent-marque-600" />
              Chercher aussi le mot dans le texte des CV
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/** Actions de l'écran : « Nouveau consultant » bien visible ; menu « Excel » (export, import) pour les administrateurs. */
function MenuActions({ ongletId, criteres, nombre, estAdmin }: { ongletId: string; criteres: CriteresTableau; nombre: number; estAdmin: boolean }) {
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
  const element = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-nuit transition hover:bg-slate-50 disabled:opacity-50";
  return (
    <div className="flex shrink-0 items-center gap-2">
      {estAdmin && (
        <div ref={boite} className="relative">
          <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} className="bouton-secondaire">
            <IconeExport className="h-4 w-4" />Excel
            <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 text-slate-400 transition ${ouvert ? "rotate-180" : ""}`} aria-hidden><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
          </button>
          {ouvert && (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-200">
              <form method="post" action="/tableau/export">
                <input type="hidden" name="onglet" value={ongletId} />
                {/* Toutes les lignes retenues par la recherche et les filtres (retrouvées par la base au moment de l'export). */}
                <input type="hidden" name="criteres" value={JSON.stringify({ ...criteres, page: 0 })} />
                <button disabled={!nombre} className={element}>
                  <IconeExport className="h-4 w-4 shrink-0 text-marque-600" />
                  <span>Exporter <span className="text-slate-500">({nombre.toLocaleString("fr-FR")} lignes)</span></span>
                </button>
              </form>
              <Link href="/parametres/import" className={element}><IconeImport className="h-4 w-4 shrink-0 text-marque-600" />Importer un fichier</Link>
            </div>
          )}
        </div>
      )}
      <Link href="/consultants/nouveau" className="bouton-primaire"><IconePlus className="h-4 w-4" />Nouveau consultant</Link>
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
