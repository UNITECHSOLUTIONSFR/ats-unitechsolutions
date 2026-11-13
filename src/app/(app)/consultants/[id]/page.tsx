import Link from "next/link";
import { BoutonWhatsApp } from "../../whatsapp";
import { notFound } from "next/navigation";
import { exigerUtilisateur, journaliser } from "@/lib/acces";
import { formaterTelephone } from "@/lib/metier/telephone";
import { modifierConsultant } from "@/lib/consultants/actions";
import BlocRGPD from "./rgpd";
import BlocCVUnitech from "./cv-unitech";

// Génération du CV Unitech (IA + SharePoint) : jusqu'à 2 minutes.
export const maxDuration = 120;
import { frise, type Evenement } from "@/lib/consultants/historique";

const COULEUR_EVENEMENT: Record<Evenement["type"], string> = {
  modification: "bg-marque-500", note: "bg-rose-400", email: "bg-amber-400", mission: "bg-emerald-500", document: "bg-sky-400", relance: "bg-violet-500", creation: "bg-slate-400",
};

const TYPES_DOC: Record<string, string> = { word_nominatif: "Word nominatif", pdf_anonyme: "PDF anonymisé", autre: "Autre" };
const STATUTS_PROPOSITION: Record<string, string> = {
  propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé",
};

export default async function FicheConsultant({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cv?: string }> }) {
  const { cv: avertissementCV } = await searchParams;
  const { id } = await params;
  const { utilisateur, supabase } = await exigerUtilisateur();
  const [{ data: c }, { data: profil }, { data: competences }, { data: documents }, { data: propositions }] = await Promise.all([
    supabase.from("consultants").select("*").eq("id", id).maybeSingle(),
    supabase.from("profils").select("annees_experience, seniorite, secteurs, langues, certifications, resume, modele").eq("consultant_id", id).maybeSingle(),
    supabase.from("consultant_competences").select("annees, niveau, competences(nom_canonique)").eq("consultant_id", id).order("annees", { ascending: false, nullsFirst: false }),
    supabase.from("documents").select("id, type, nom_fichier, url_web, modifie_sharepoint_le, statut_association").eq("consultant_id", id).eq("supprime_sharepoint", false),
    supabase.from("propositions").select("statut, score, updated_at, missions(id, intitule, client)").eq("consultant_id", id).order("updated_at", { ascending: false }),
  ]);
  if (!c) notFound();
  const [evenements, { data: missionsOuvertes }, { data: cvGeneres }] = await Promise.all([
    frise(supabase, id, c.created_at, c.source),
    supabase.from("missions").select("id, intitule, client").eq("statut", "ouverte").order("created_at", { ascending: false }),
    supabase.from("cv_unitech_generes").select("id, created_at, word_nom, word_url, pdf_nom, pdf_url, pdf_genere_le, dossier, missions(intitule, client)").eq("consultant_id", id).order("created_at", { ascending: false }).limit(10),
    journaliser(supabase, utilisateur.id, "consultation", id),
  ]);

  const { majDispo, dispoAncienne } = etatDisponibilite(c.disponibilite_maj_le);
  const pdf = (documents ?? []).find((d) => d.type === "pdf_anonyme");
  const cvUnitech = (cvGeneres ?? [])[0] as { pdf_url: string | null; pdf_nom: string | null; word_url: string; word_nom: string } | undefined;

  return (
    <div className="space-y-6">
      {avertissementCV && <p className="rounded-2xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">{avertissementCV.slice(0, 200)}</p>}
      {/* En-tête : identité et actions rapides */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-marque-500 via-marque-400 to-[#7d9be0] p-4 text-white sm:rounded-[2rem] sm:p-6 shadow-[0_30px_60px_-30px_rgba(31,69,163,0.6)]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-white/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3 sm:gap-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16 bg-white/20 text-xl font-bold ring-1 ring-white/30 backdrop-blur">
            {`${c.prenom?.[0] ?? ""}${c.nom?.[0] ?? ""}`.replace("—", "").toUpperCase() || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-2xl font-bold tracking-[-0.03em] sm:text-3xl">{c.prenom} {c.nom} <span className="font-mono text-base font-medium text-white/60">{c.trigramme}</span></h1>
            <p className="text-white/80">{c.intitule_poste ?? "Poste non renseigné"}{c.localisation ? ` · ${c.localisation}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium capitalize ring-1 ring-white/25">{c.statut === "en_mission" ? "candidat" : c.statut}</span>
              <span className={`rounded-full px-2.5 py-0.5 font-medium ring-1 ${dispoAncienne ? "bg-amber-400/30 ring-amber-200/50" : "bg-white/20 ring-white/25"}`}>
                {c.disponibilite ?? (c.disponible_le ? `Disponible le ${new Date(c.disponible_le).toLocaleDateString("fr-FR")}` : "Disponibilité non renseignée")}
              </span>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            {c.telephone_e164 && <a href={`tel:${c.telephone_e164}`} className="flex min-h-11 items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-nuit shadow-md hover:shadow-lg">☎ <span className="ml-1 sm:hidden">Appeler</span><span className="ml-1 hidden sm:inline">{formaterTelephone(c.telephone_e164)}</span></a>}
            <BoutonWhatsApp telephone={c.telephone_e164} prenom={c.prenom} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-md hover:brightness-95" />
            {c.email && <a href={`mailto:${c.email}`} className="flex min-h-11 items-center justify-center rounded-full bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-white/30 hover:bg-white/25">✉ Email</a>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <section className="space-y-4 lg:col-span-2">
          <div className="carte p-4 sm:p-6">
            <h2 className="titre-section">Profil</h2>
            {profil ? (
              <div className="mt-2 space-y-2 text-sm">
                <p className="text-slate-700">{profil.resume}</p>
                <p className="text-slate-600">
                  {profil.annees_experience ? `${profil.annees_experience} ans d'expérience` : ""}{profil.seniorite ? ` · ${profil.seniorite}` : ""}
                  {profil.secteurs?.length ? ` · Secteurs : ${profil.secteurs.join(", ")}` : ""}
                </p>
                {!!profil.certifications?.length && <p className="text-slate-600">Certifications : {profil.certifications.join(", ")}</p>}
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">CV pas encore analysé.</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(competences ?? []).map((k, i) => (
                <span key={i} className="pastille bg-marque-50/90 text-marque-700 ring-marque-100">
                  {(k.competences as unknown as { nom_canonique: string } | null)?.nom_canonique}{k.annees ? ` · ${k.annees} an(s)` : ""}
                </span>
              ))}
            </div>
          </div>

          <div className="carte p-6 text-sm">
            <h2 className="titre-section">Informations du fichier de suivi</h2>
            <ul className="mt-2 space-y-1">
              {c.email_2 && <li><span className="text-slate-500">Email 2 : </span>{c.email_2}</li>}
              {c.commentaire_email && <li><span className="text-slate-500">Commentaire email : </span>{c.commentaire_email}</li>}
              {c.experience && <li><span className="text-slate-500">Expérience : </span>{c.experience}</li>}
              {c.tjm_salaire && <li><span className="text-slate-500">TJM / Salaire : </span>{c.tjm_salaire}</li>}
              {c.linkedin && <li><span className="text-slate-500">LinkedIn : </span><Lien valeur={c.linkedin} /></li>}
              {c.cv_lien && <li><span className="text-slate-500">CV : </span><Lien valeur={c.cv_lien} /></li>}
            </ul>
            {(c.donnees_excel ?? []).map((d: { ligne: number; valeurs: Record<string, string> }) => (
              <details key={d.ligne} className="mt-2">
                <summary className="cursor-pointer text-slate-500">Toutes les colonnes du fichier de suivi</summary>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {Object.entries(d.valeurs).map(([k, v]) => (
                    <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="break-all">{v}</dd></div>
                  ))}
                </dl>
              </details>
            ))}
          </div>

          <div className="carte p-6">
            <h2 className="titre-section">Documents</h2>
            {/* CV Unitech le plus récent : le PDF s'il existe, sinon le Word ; « manquant » seulement s'il n'y a rien. */}
            {cvUnitech ? (
              <p className="mt-2 text-sm">
                <span className="text-slate-500">CV Unitech : </span>
                <a href={cvUnitech.pdf_url ?? cvUnitech.word_url} target="_blank" rel="noreferrer" className="lien break-all font-semibold">
                  {cvUnitech.pdf_url ? `PDF · ${cvUnitech.pdf_nom ?? "CV Unitech"}` : `Word · ${cvUnitech.word_nom}`}
                </a>
              </p>
            ) : !pdf && <p className="mt-2 text-sm text-amber-700">PDF anonymisé manquant</p>}
            <ul className="mt-2 space-y-1 text-sm">
              {(documents ?? []).map((d) => (
                <li key={d.id}>
                  <span className="text-slate-500">{TYPES_DOC[d.type]} : </span>
                  {d.url_web?.includes("sharepoint.com") ? <a href={d.url_web} target="_blank" rel="noreferrer" className="lien break-all">{d.nom_fichier}</a> : d.nom_fichier}
                </li>
              ))}
            </ul>
          </div>

          <div className="carte p-6">
            <h2 className="titre-section">Propositions</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(propositions ?? []).map((p, i) => {
                const m = p.missions as unknown as { id: string; intitule: string; client: string | null } | null;
                return (
                  <li key={i}>
                    <Link href={`/missions/${m?.id}`} className="hover:underline">{m?.intitule}</Link>
                    {m?.client ? ` (${m.client})` : ""} — {STATUTS_PROPOSITION[p.statut]}{p.score ? ` · score ${Math.round(p.score)}` : ""}
                  </li>
                );
              })}
              {!propositions?.length && <li className="text-slate-500">Aucune.</li>}
            </ul>
          </div>

          <div className="carte p-6">
            <h2 className="titre-section">Historique</h2>
            <ol className="mt-3 space-y-3 border-l border-slate-200 pl-5">
              {evenements.map((e, k) => (
                <li key={k} className="relative text-sm">
                  <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${COULEUR_EVENEMENT[e.type]}`} />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-nuit">{e.lien ? <Link href={e.lien} className="hover:underline">{e.titre}</Link> : e.titre}</span>
                    <span className="text-xs tabular-nums text-slate-400">{new Date(e.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  {e.detail && <div className="break-words text-slate-500 [overflow-wrap:anywhere]">{e.detail}</div>}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="space-y-4">
        <form action={modifierConsultant} className="space-y-3 carte p-6 text-sm">
          <h2 className="titre-section">Modifier la fiche</h2>
          <input type="hidden" name="id" value={c.id} />
          <Champ nom="telephone" libelle="Téléphone" valeur={formaterTelephone(c.telephone_e164) || c.telephone_brut} />
          <Champ nom="email" libelle="Email" valeur={c.email} />
          <Champ nom="intitule_poste" libelle="Intitulé de poste" valeur={c.intitule_poste} />
          <Champ nom="localisation" libelle="Localisation" valeur={c.localisation} />
          <label className="block">
            <span className="text-slate-600">Mobilité</span>
            <input name="mobilite" list="mobilites" defaultValue={c.mobilite ?? ""} placeholder="Ex. Île-de-France" className="champ mt-1 w-full" />
            <datalist id="mobilites">{MOBILITES.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <Champ nom="disponibilite" libelle="Disponibilité (texte)" valeur={c.disponibilite} />
          <Champ nom="disponible_le" libelle="Disponible le" valeur={c.disponible_le} type="date" />
          <p className={`text-xs ${dispoAncienne ? "text-amber-700" : "text-slate-500"}`}>
            {majDispo ? `Disponibilité mise à jour le ${majDispo.toLocaleDateString("fr-FR")}` : "Disponibilité jamais mise à jour"}
            {dispoAncienne ? " — à vérifier (plus de 3 mois)" : ""}
          </p>
          <label className="block">
            <span className="text-slate-600">Statut</span>
            <select name="statut" defaultValue={c.statut} className="champ mt-1 w-full">
              <option value="candidat">Candidat</option><option value="consultant">Consultant</option>
              <option value="inactif">Inactif</option>
            </select>
          </label>
          <label className="block">
            <span className="text-slate-600">Notes</span>
            <textarea name="notes" defaultValue={c.notes ?? ""} rows={4} className="champ mt-1 w-full" />
          </label>
          <button className="bouton-primaire w-full justify-center">Enregistrer</button>
        </form>
          <BlocCVUnitech consultantId={c.id} missions={missionsOuvertes ?? []} generes={(cvGeneres ?? []).map((g) => {
            const m = g.missions as unknown as { intitule: string; client: string | null } | null;
            return { id: g.id, date: g.created_at, mission: m ? `${m.intitule}${m.client ? ` · ${m.client}` : ""}` : null, dossier: g.dossier, word: { nom: g.word_nom, url: g.word_url }, pdf: g.pdf_url ? { nom: g.pdf_nom ?? "", url: g.pdf_url } : null, pdfLe: g.pdf_genere_le };
          })} />
          {utilisateur.role === "admin" && <BlocRGPD id={c.id} trigramme={c.trigramme} />}
        </div>
      </div>
    </div>
  );
}

/** Suggestions de mobilité (texte libre possible). */
const MOBILITES = ["Paris", "Île-de-France", "France", "Europe", "Monde entier", "Télétravail uniquement"];

function Champ({ nom, libelle, valeur, type = "text" }: { nom: string; libelle: string; valeur: string | null; type?: string }) {
  return (
    <label className="block">
      <span className="text-slate-600">{libelle}</span>
      <input name={nom} type={type} defaultValue={valeur ?? ""} className="champ mt-1 w-full" />
    </label>
  );
}

/** Disponibilité « ancienne » si elle n'a pas été mise à jour depuis plus de 3 mois. */
function etatDisponibilite(maj: string | null) {
  const majDispo = maj ? new Date(maj) : null;
  const dispoAncienne = !majDispo || Date.now() - majDispo.getTime() > 90 * 86_400_000;
  return { majDispo, dispoAncienne };
}

function Lien({ valeur }: { valeur: string }) {
  return /^https?:\/\//.test(valeur)
    ? <a href={valeur} target="_blank" rel="noreferrer" className="break-all text-marque-700 hover:underline">{valeur}</a>
    : <span className="break-all">{valeur}</span>;
}
