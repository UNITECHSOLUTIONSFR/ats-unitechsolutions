import { exigerAdmin } from "@/lib/acces-admin";
import { changerCampagne, supprimerModele } from "@/lib/relance/actions";
import { envoiActif } from "@/lib/relance/modele";
import Redaction from "./redaction";

const LIBELLES: Record<string, string> = { preparee: "Préparé", en_cours: "Envoi en cours", terminee: "Envoyé", annulee: "Annulé" };
const STATUTS = ["a_envoyer", "envoye", "erreur", "repondu", "a_verifier", "desinscrit"];

/** Module Email : choisir des consultants, rédiger (ou partir d'un modèle), préparer puis lancer l'envoi et suivre les réponses. */
export default async function PageEmails() {
  const { supabase } = await exigerAdmin();
  const [{ data: modeles }, { data: campagnes }] = await Promise.all([
    supabase.from("modeles_email").select("id, nom, objet, corps, type").order("nom"),
    supabase.from("campagnes_relance").select("id, objet, type, statut, nb_destinataires, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const stats = new Map<string, Record<string, number>>();
  await Promise.all((campagnes ?? []).map(async (c) => {
    const n = await Promise.all(STATUTS.map((st) => supabase.from("envois_relance").select("id", { count: "exact", head: true }).eq("campagne_id", c.id).eq("statut", st)));
    stats.set(c.id, Object.fromEntries(STATUTS.map((st, i) => [st, n[i].count ?? 0])));
  }));
  const actif = envoiActif();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titre-page">Emails</h1>
        <p className="sous-titre mt-1">Écrivez à une sélection de consultants. Pour une demande de disponibilité, les réponses mettent à jour la fiche, le tableau et le fichier Excel automatiquement.</p>
      </div>
      {!actif && (
        <div className="rounded-2xl bg-amber-50/90 px-5 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          L&apos;envoi n&apos;est pas encore branché sur la messagerie (Exchange) : vous pouvez tout préparer, mais aucun email ne peut partir pour l&apos;instant.
        </div>
      )}

      <Redaction modeles={modeles ?? []} />

      <section className="space-y-3">
        <h2 className="font-semibold text-nuit">Envois</h2>
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
        {!campagnes?.length && <p className="text-sm text-slate-500">Aucun envoi pour l&apos;instant.</p>}
      </section>

      {!!modeles?.length && (
        <section className="space-y-3">
          <h2 className="font-semibold text-nuit">Modèles</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modeles.map((m) => (
              <div key={m.id} className="carte flex items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-nuit">{m.nom}</div>
                  <div className="truncate text-slate-500">{m.objet}</div>
                </div>
                <form action={supprimerModele}><input type="hidden" name="id" value={m.id} /><button className="text-xs text-slate-400 hover:text-red-700">Supprimer</button></form>
              </div>
            ))}
          </div>
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
