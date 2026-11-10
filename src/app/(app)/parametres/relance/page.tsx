import { notFound } from "next/navigation";
import { exigerAdmin } from "@/lib/acces-admin";
import { changerCampagne } from "@/lib/relance/actions";
import { CORPS_PAR_DEFAUT, OBJET_PAR_DEFAUT, relanceActive, rendreMessage } from "@/lib/relance/modele";
import FormulaireCampagne from "./formulaire";

const LIBELLES: Record<string, string> = { preparee: "Préparée", en_cours: "Envoi en cours", terminee: "Envoyée", annulee: "Annulée" };

/** Relance des disponibilités : préparer, lancer et suivre les envois. Invisible tant que la fonctionnalité n'est pas activée. */
export default async function PageRelance() {
  if (!relanceActive()) notFound();
  const { supabase } = await exigerAdmin();
  const { data: campagnes } = await supabase.from("campagnes_relance").select("id, objet, statut, nb_destinataires, created_at, lancee_le").order("created_at", { ascending: false }).limit(20);
  const stats = new Map<string, Record<string, number>>();
  const STATUTS = ["a_envoyer", "envoye", "erreur", "repondu", "a_verifier", "desinscrit"];
  await Promise.all((campagnes ?? []).map(async (c) => {
    // Comptages côté base (une campagne peut compter des milliers d'envois).
    const n = await Promise.all(STATUTS.map((st) => supabase.from("envois_relance").select("id", { count: "exact", head: true }).eq("campagne_id", c.id).eq("statut", st)));
    stats.set(c.id, Object.fromEntries(STATUTS.map((st, i) => [st, n[i].count ?? 0])));
  }));
  const apercu = rendreMessage(CORPS_PAR_DEFAUT, { prenom: "Marie", nom: "Dupont" }, "https://ats-unitechsolutions.vercel.app/desinscription/…");

  return (
    <div className="space-y-6">
      <section className="carte p-6">
        <h2 className="text-lg font-semibold text-nuit">Relancer les consultants sur leur disponibilité</h2>
        <p className="sous-titre mt-1">Les réponses sont lues automatiquement : la disponibilité est mise à jour sur la fiche, dans le tableau et dans le fichier Excel. Seuls les cas incompréhensibles arrivent dans « Cas à vérifier ».</p>
        <FormulaireCampagne objet={OBJET_PAR_DEFAUT} corps={CORPS_PAR_DEFAUT} apercu={apercu} />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-nuit">Campagnes</h2>
        {(campagnes ?? []).map((c) => {
          const s = stats.get(c.id) ?? {};
          const envoyes = (s.envoye ?? 0) + (s.repondu ?? 0) + (s.a_verifier ?? 0) + (s.desinscrit ?? 0);
          return (
            <div key={c.id} className="carte flex flex-wrap items-center gap-4 p-5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-nuit">{c.objet}</div>
                <div className="text-slate-500">{new Date(c.created_at).toLocaleDateString("fr-FR")} · {c.nb_destinataires} destinataire(s) · <span className="pastille">{LIBELLES[c.statut]}</span></div>
              </div>
              <Chiffre libelle="Envoyés" valeur={envoyes} sur={c.nb_destinataires} />
              <Chiffre libelle="Réponses appliquées" valeur={s.repondu ?? 0} />
              <Chiffre libelle="À vérifier" valeur={s.a_verifier ?? 0} />
              <Chiffre libelle="Désinscrits" valeur={s.desinscrit ?? 0} />
              <Chiffre libelle="Erreurs" valeur={s.erreur ?? 0} />
              {(c.statut === "preparee" || c.statut === "en_cours") && (
                <form action={changerCampagne} className="flex gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  {c.statut === "preparee" && <button name="action" value="lancer" className="bouton-primaire">Lancer l&apos;envoi</button>}
                  <button name="action" value="annuler" className="bouton-secondaire">Annuler</button>
                </form>
              )}
            </div>
          );
        })}
        {!campagnes?.length && <p className="text-sm text-slate-500">Aucune campagne pour l&apos;instant.</p>}
      </section>
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
