import { exigerAdmin } from "@/lib/acces-admin";
import { changerCampagne, supprimerModele } from "@/lib/relance/actions";
import { envoiActif } from "@/lib/relance/modele";
import Link from "next/link";
import Redaction from "./redaction";
import FormulaireModele from "./modele";

const LIBELLES: Record<string, string> = { preparee: "Préparé", en_cours: "Envoi en cours", terminee: "Envoyé", annulee: "Annulé" };
const STATUTS = ["a_envoyer", "envoye", "erreur", "repondu", "a_verifier", "desinscrit"];

/** Module Email : choisir des consultants, rédiger (ou partir d'un modèle), préparer puis lancer l'envoi et suivre les réponses. */
export default async function PageEmails({ searchParams }: { searchParams: Promise<{ onglet?: string; modele?: string; id?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { onglet = "envois", modele, id } = await searchParams;
  const [{ data: modeles }, { data: campagnes }] = await Promise.all([
    supabase.from("modeles_email").select("id, nom, objet, corps, type").order("nom"),
    supabase.from("campagnes_relance").select("id, objet, type, statut, nb_destinataires, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const stats = new Map<string, Record<string, number>>();
  if (onglet === "envois") await Promise.all((campagnes ?? []).map(async (c) => {
    const n = await Promise.all(STATUTS.map((st) => supabase.from("envois_relance").select("id", { count: "exact", head: true }).eq("campagne_id", c.id).eq("statut", st)));
    stats.set(c.id, Object.fromEntries(STATUTS.map((st, i) => [st, n[i].count ?? 0])));
  }));
  const actif = envoiActif();
  const ONGLETS = [["envois", "Envois", campagnes?.length ?? 0], ["rediger", "Rédiger", null], ["modeles", "Modèles", modeles?.length ?? 0], ["modele", id ? "Modifier le modèle" : "Créer un modèle", null]] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-nuit">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-marque-600 shadow-sm ring-1 ring-slate-200">✉️</span>
          Emails
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/emails?onglet=modele" className="bouton-secondaire px-4 py-2">+ Créer un modèle</Link>
          <Link href="/emails?onglet=rediger" className="bouton-primaire px-5 py-2.5">✍️ Rédiger un email</Link>
        </div>
      </div>

      <nav className="flex gap-6 overflow-x-auto border-b border-slate-200/80">
        {ONGLETS.map(([o, libelle, n]) => (
          <Link key={o} href={`/emails?onglet=${o}`} className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-[15px] font-semibold transition ${o === onglet ? "border-marque-600 text-nuit" : "border-transparent text-slate-500 hover:text-nuit"}`}>
            {libelle}
            {n !== null && <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${o === onglet ? "bg-marque-50 text-marque-700" : "bg-slate-100 text-slate-500"}`}>{n}</span>}
          </Link>
        ))}
      </nav>

      {!actif && (onglet === "envois" || onglet === "rediger") && (
        <div className="rounded-2xl bg-amber-50/90 px-5 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          L&apos;envoi n&apos;est pas encore branché sur la messagerie (Exchange) : vous pouvez tout préparer, mais aucun email ne peut partir pour l&apos;instant.
        </div>
      )}

      {onglet === "rediger" && <Redaction modeles={modeles ?? []} modeleInitial={modele} />}
      {onglet === "modele" && <FormulaireModele key={id ?? "nouveau"} modele={(modeles ?? []).find((m) => m.id === id)} />}

      {onglet === "modeles" && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(modeles ?? []).map((m) => (
            <article key={m.id} className="carte flex flex-col p-5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-nuit">{m.nom}</h3>
                <span className={m.type === "libre" ? "pastille" : "pastille pastille-vert"}>{m.type === "libre" ? "Email libre" : "Disponibilité"}</span>
              </div>
              <div className="mt-1 font-medium text-slate-600">{m.objet}</div>
              <p className="mt-2 line-clamp-4 flex-1 whitespace-pre-line text-slate-500">{m.corps}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <Link href={`/emails?onglet=rediger&modele=${m.id}`} className="bouton-primaire py-1.5 text-xs">Utiliser</Link>
                <Link href={`/emails?onglet=modele&id=${m.id}`} className="bouton-secondaire text-xs">Modifier</Link>
                <form action={supprimerModele} className="ml-auto"><input type="hidden" name="id" value={m.id} /><button className="text-xs text-slate-400 hover:text-red-700">Supprimer</button></form>
              </div>
            </article>
          ))}
          <Link href="/emails?onglet=modele" className="carte flex min-h-40 flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-200 p-5 text-sm text-slate-500 transition hover:border-marque-300 hover:text-marque-700">
            <span className="text-2xl">+</span>Créer un modèle
          </Link>
        </section>
      )}

      {onglet === "envois" && (
      <section className="space-y-3">
        {(campagnes ?? []).map((c) => {
          const s = stats.get(c.id) ?? {};
          const partis = (s.envoye ?? 0) + (s.repondu ?? 0) + (s.a_verifier ?? 0) + (s.desinscrit ?? 0);
          return (
            <div key={c.id} className="carte flex flex-wrap items-center gap-5 p-5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-nuit">{c.objet}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-slate-500">
                  {new Date(c.created_at).toLocaleDateString("fr-FR")} · {c.nb_destinataires} destinataire(s)
                  <span className="pastille">{LIBELLES[c.statut]}</span>
                  <span className="pastille">{c.type === "libre" ? "Email libre" : "Disponibilité"}</span>
                </div>
              </div>
              <Chiffre libelle="Envoyés" valeur={partis} sur={c.nb_destinataires} />
              <Chiffre libelle={c.type === "libre" ? "Réponses" : "Réponses appliquées"} valeur={s.repondu ?? 0} />
              {c.type !== "libre" && <Chiffre libelle="À vérifier" valeur={s.a_verifier ?? 0} />}
              <Chiffre libelle="Désinscrits" valeur={s.desinscrit ?? 0} />
              <Chiffre libelle="Erreurs" valeur={s.erreur ?? 0} />
              {(c.statut === "preparee" || c.statut === "en_cours") && (
                <form action={changerCampagne} className="flex gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  {c.statut === "preparee" && (
                    <button name="action" value="lancer" disabled={!actif} title={actif ? undefined : "Envoi pas encore branché (Exchange)"} className="bouton-primaire">Lancer l&apos;envoi</button>
                  )}
                  <button name="action" value="annuler" className="bouton-secondaire">Annuler</button>
                </form>
              )}
            </div>
          );
        })}
        {!campagnes?.length && (
          <div className="carte p-10 text-center text-sm text-slate-500">
            <p className="font-medium text-nuit">Aucun envoi pour l&apos;instant.</p>
            <p className="mt-1">Commencez par <Link href="/emails?onglet=rediger" className="lien">rédiger un email</Link>, à la main ou à partir d&apos;un <Link href="/emails?onglet=modeles" className="lien">modèle</Link>.</p>
          </div>
        )}
      </section>
      )}
    </div>
  );
}

function Chiffre({ libelle, valeur, sur }: { libelle: string; valeur: number; sur?: number }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold tabular-nums text-nuit">{valeur.toLocaleString("fr-FR")}{sur !== undefined && <span className="text-sm font-medium text-slate-400"> / {sur}</span>}</div>
      <div className="text-xs text-slate-500">{libelle}</div>
    </div>
  );
}
