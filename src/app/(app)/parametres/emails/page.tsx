import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";
import { BOITE_CANDIDATURES } from "@/lib/emails/boite";
import { classePastille } from "@/lib/statuts";
import Bouton from "./bouton";
import RepriseDossier from "./reprise";

// Jusqu'à 25 emails par clic, avec lecture des CV par l'IA : jusqu'à 5 minutes.
export const maxDuration = 300;

const LIBELLES: Record<string, string> = {
  candidature_traitee: "Candidature enregistrée", non_candidature: "Ignoré (interne ou pas un CV)",
  sans_piece_jointe: "Ignoré (sans CV joint)", erreur: "Erreur", a_traiter: "À traiter",
};

export default async function CandidaturesEmail() {
  const { supabase, utilisateur } = await exigerAdmin();
  const { data: emails } = await supabase
    .from("emails_entrants").select("id, expediteur, recu_le, objet, statut, consultant_id")
    .order("recu_le", { ascending: false }).limit(100);

  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-zinc-600">
        Emails reçus en copie dans <b>{BOITE_CANDIDATURES}</b>. Chaque email n&apos;est lu qu&apos;une fois. Les emails internes
        et ceux sans CV joint sont ignorés sans IA ; un CV déjà reçu n&apos;est pas réanalysé. Seuls l&apos;expéditeur, la date et
        l&apos;objet sont conservés.
      </p>
      <Bouton />
      <RepriseDossier boiteParDefaut={utilisateur.email} />
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Reçu le</th><th className="p-3">Expéditeur</th><th className="p-3">Objet</th><th className="p-3">Résultat</th></tr>
          </thead>
          <tbody>
            {(emails ?? []).map((e) => (
              <tr key={e.id} className="border-t border-white/70">
                <td className="whitespace-nowrap p-3">{e.recu_le ? new Date(e.recu_le).toLocaleString("fr-FR") : "—"}</td>
                <td className="p-3">{e.expediteur ?? "—"}</td>
                <td className="p-3">{e.objet ?? "—"}</td>
                <td className="p-3">
                  <span className={classePastille(e.statut === "candidature_traitee" ? "disponible" : e.statut === "erreur" ? "alerte" : "inactif")}>{LIBELLES[e.statut] ?? e.statut}</span>
                  {e.consultant_id && <Link href={`/consultants/${e.consultant_id}`} className="ml-2 text-marque-700 hover:underline">fiche</Link>}
                </td>
              </tr>
            ))}
            {!emails?.length && <tr><td colSpan={4} className="p-6 text-center text-zinc-500">Aucun email traité pour l&apos;instant.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
