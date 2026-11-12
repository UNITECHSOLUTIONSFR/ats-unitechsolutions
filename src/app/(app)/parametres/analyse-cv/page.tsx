import { exigerAdmin } from "@/lib/acces-admin";
import { COUT_ESTIME_PAR_CV, cvAAnalyser } from "@/lib/analyse-cv/selection";
import Boutons from "./boutons";
import { changerDepotCVUnitech } from "@/lib/cv-unitech/actions";

// Téléchargement et envoi d'environ 500 CV : jusqu'à 5 minutes.
export const maxDuration = 300;

export default async function AnalyseCV() {
  const { supabase } = await exigerAdmin();
  const { data: reglage } = await supabase.from("reglages").select("valeur").eq("cle", "cv_unitech_depot_metier").maybeSingle();
  const depotMetier = reglage?.valeur === true;
  const [aFaire, { count: analyses }, { data: enCours }, { data: derniere }] = await Promise.all([
    cvAAnalyser(supabase),
    supabase.from("profils").select("*", { count: "exact", head: true }),
    supabase.from("executions").select("id").eq("type", "analyse_cv").eq("statut", "en_cours").limit(1),
    supabase.from("executions").select("fin, rapport").eq("type", "analyse_cv").eq("statut", "termine").order("fin", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const r = derniere?.rapport as { enregistres?: number; echecs?: number; cout_usd?: number } | undefined;

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-zinc-600">
        L&apos;IA lit une fois chaque CV Word Unitech relié à une fiche et en tire les compétences, les années d&apos;expérience
        et la séniorité. Le matching des missions s&apos;appuie ensuite sur ces fiches, sans relire les CV.
      </p>
      <div className="carte grid gap-2 p-5 text-sm sm:grid-cols-3">
        <div><div className="text-2xl font-semibold">{analyses ?? 0}</div><div className="text-zinc-500">CV déjà analysés</div></div>
        <div><div className="text-2xl font-semibold">{aFaire.length}</div><div className="text-zinc-500">CV à analyser</div></div>
        <div><div className="text-2xl font-semibold">{(aFaire.length * COUT_ESTIME_PAR_CV).toFixed(2)} $</div><div className="text-zinc-500">coût estimé</div></div>
      </div>
      {r && (
        <p className="text-sm text-zinc-500">
          Dernière analyse : {r.enregistres} CV enregistrés, {r.echecs} en échec, coût réel {Number(r.cout_usd ?? 0).toFixed(2)} $.
        </p>
      )}
      <Boutons enCours={!!enCours?.length} aFaire={aFaire.length} />
      <form action={changerDepotCVUnitech} className="carte flex flex-wrap items-center justify-between gap-4 p-5 text-sm">
        <input type="hidden" name="actif" value={depotMetier ? "0" : "1"} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-nuit">CV Unitech automatiques pour les candidatures email</div>
          <p className="text-slate-500">
            {depotMetier
              ? "Actif : chaque nuit, les CV reçus par email reçoivent leur Word et leur PDF Unitech, dans le dossier métier de SharePoint."
              : "Inactif : les CV Unitech se génèrent à la demande (fiche ou mission), toujours dans le dossier métier. Activez pour traiter aussi les candidatures email chaque nuit."}
          </p>
        </div>
        <button className={depotMetier ? "bouton-secondaire" : "bouton-primaire"}>{depotMetier ? "Désactiver" : "Activer chaque nuit"}</button>
      </form>
    </div>
  );
}
