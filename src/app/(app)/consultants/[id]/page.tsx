import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur, journaliser } from "@/lib/acces";
import { formaterTelephone } from "@/lib/metier/telephone";
import { modifierConsultant } from "@/lib/consultants/actions";
import BlocRGPD from "./rgpd";

const TYPES_DOC: Record<string, string> = { word_nominatif: "Word nominatif", pdf_anonyme: "PDF anonymisé", autre: "Autre" };
const STATUTS_PROPOSITION: Record<string, string> = {
  propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé",
};

export default async function FicheConsultant({ params }: { params: Promise<{ id: string }> }) {
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
  await journaliser(supabase, utilisateur.id, "consultation", id);

  const { majDispo, dispoAncienne } = etatDisponibilite(c.disponibilite_maj_le);
  const pdf = (documents ?? []).find((d) => d.type === "pdf_anonyme");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titre-page">{c.prenom} {c.nom} <span className="font-mono text-lg text-zinc-500">{c.trigramme}</span></h1>
        <p className="text-zinc-600">{c.intitule_poste ?? "—"} · {c.statut}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="carte p-5">
            <h2 className="font-semibold">Profil</h2>
            {profil ? (
              <div className="mt-2 space-y-2 text-sm">
                <p>{profil.resume}</p>
                <p className="text-zinc-600">
                  {profil.annees_experience ? `${profil.annees_experience} ans d'expérience` : ""}{profil.seniorite ? ` · ${profil.seniorite}` : ""}
                  {profil.secteurs?.length ? ` · Secteurs : ${profil.secteurs.join(", ")}` : ""}
                </p>
                {!!profil.certifications?.length && <p className="text-zinc-600">Certifications : {profil.certifications.join(", ")}</p>}
              </div>
            ) : <p className="mt-2 text-sm text-zinc-500">CV pas encore analysé.</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(competences ?? []).map((k, i) => (
                <span key={i} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                  {(k.competences as unknown as { nom_canonique: string } | null)?.nom_canonique}{k.annees ? ` · ${k.annees} an(s)` : ""}
                </span>
              ))}
            </div>
          </div>

          <div className="carte p-5 text-sm">
            <h2 className="font-semibold">Informations du fichier de suivi</h2>
            <ul className="mt-2 space-y-1">
              {c.email_2 && <li><span className="text-zinc-500">Email 2 : </span>{c.email_2}</li>}
              {c.commentaire_email && <li><span className="text-zinc-500">Commentaire email : </span>{c.commentaire_email}</li>}
              {c.experience && <li><span className="text-zinc-500">Expérience : </span>{c.experience}</li>}
              {c.tjm_salaire && <li><span className="text-zinc-500">TJM / Salaire : </span>{c.tjm_salaire}</li>}
              {c.linkedin && <li><span className="text-zinc-500">LinkedIn : </span><Lien valeur={c.linkedin} /></li>}
              {c.cv_lien && <li><span className="text-zinc-500">CV : </span><Lien valeur={c.cv_lien} /></li>}
            </ul>
            {(c.donnees_excel ?? []).map((d: { ligne: number; valeurs: Record<string, string> }) => (
              <details key={d.ligne} className="mt-2">
                <summary className="cursor-pointer text-zinc-500">Ligne {d.ligne} du fichier Excel (toutes les colonnes)</summary>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {Object.entries(d.valeurs).map(([k, v]) => (
                    <div key={k} className="contents"><dt className="text-zinc-500">{k}</dt><dd className="break-all">{v}</dd></div>
                  ))}
                </dl>
              </details>
            ))}
          </div>

          <div className="carte p-5">
            <h2 className="font-semibold">Documents (SharePoint)</h2>
            {!pdf && <p className="mt-2 text-sm text-amber-700">PDF anonymisé manquant</p>}
            <ul className="mt-2 space-y-1 text-sm">
              {(documents ?? []).map((d) => (
                <li key={d.id}>
                  <span className="text-zinc-500">{TYPES_DOC[d.type]} : </span>
                  {d.url_web ? <a href={d.url_web} target="_blank" rel="noreferrer" className="text-marque-700 hover:underline">{d.nom_fichier}</a> : d.nom_fichier}
                </li>
              ))}
            </ul>
          </div>

          <div className="carte p-5">
            <h2 className="font-semibold">Propositions</h2>
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
              {!propositions?.length && <li className="text-zinc-500">Aucune.</li>}
            </ul>
          </div>
        </section>

        <div className="space-y-4">
        <form action={modifierConsultant} className="space-y-3 carte p-5 text-sm">
          <h2 className="font-semibold">Coordonnées et suivi</h2>
          <input type="hidden" name="id" value={c.id} />
          <Champ nom="telephone" libelle="Téléphone" valeur={formaterTelephone(c.telephone_e164) || c.telephone_brut} />
          <Champ nom="email" libelle="Email" valeur={c.email} />
          <Champ nom="intitule_poste" libelle="Intitulé de poste" valeur={c.intitule_poste} />
          <Champ nom="localisation" libelle="Localisation" valeur={c.localisation} />
          <Champ nom="disponibilite" libelle="Disponibilité (texte)" valeur={c.disponibilite} />
          <Champ nom="disponible_le" libelle="Disponible le" valeur={c.disponible_le} type="date" />
          <p className={`text-xs ${dispoAncienne ? "text-amber-700" : "text-zinc-500"}`}>
            {majDispo ? `Disponibilité mise à jour le ${majDispo.toLocaleDateString("fr-FR")}` : "Disponibilité jamais mise à jour"}
            {dispoAncienne ? " — à vérifier (plus de 3 mois)" : ""}
          </p>
          <label className="block">
            <span className="text-zinc-600">Statut</span>
            <select name="statut" defaultValue={c.statut} className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5">
              <option value="candidat">Candidat</option><option value="consultant">Consultant</option>
              <option value="en_mission">En mission</option><option value="inactif">Inactif</option>
            </select>
          </label>
          <label className="block">
            <span className="text-zinc-600">Notes</span>
            <textarea name="notes" defaultValue={c.notes ?? ""} rows={4} className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5" />
          </label>
          <button className="bouton-primaire w-full justify-center">Enregistrer</button>
        </form>
          {utilisateur.role === "admin" && <BlocRGPD id={c.id} trigramme={c.trigramme} />}
        </div>
      </div>
    </div>
  );
}

function Champ({ nom, libelle, valeur, type = "text" }: { nom: string; libelle: string; valeur: string | null; type?: string }) {
  return (
    <label className="block">
      <span className="text-zinc-600">{libelle}</span>
      <input name={nom} type={type} defaultValue={valeur ?? ""} className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5" />
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
