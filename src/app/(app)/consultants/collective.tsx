import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formaterTelephone } from "@/lib/metier/telephone";

const PAR_PAGE = 100;

/**
 * Onglet « Collective » de l'écran Consultants (décision du 24/11/2026) : les profils venus de Collective, du plus récent
 * au plus ancien, avec l'offre à laquelle ils ont postulé, leur CV (gardé dans l'outil) et leurs coordonnées.
 */
export default async function ListeCollective({ supabase, page }: { supabase: SupabaseClient; page: number }) {
  const { data, count } = await supabase.from("imports_collective")
    .select("application_id, consultant_id, offre, statut, created_at, consultants(prenom, nom, intitule_poste, email, telephone_e164, notes)", { count: "exact" })
    .order("created_at", { ascending: false }).range(page * PAR_PAGE, page * PAR_PAGE + PAR_PAGE - 1);
  const lignes = (data ?? []) as unknown as { application_id: string; consultant_id: string; offre: string | null; statut: string; created_at: string;
    consultants: { prenom: string; nom: string; intitule_poste: string | null; email: string | null; telephone_e164: string | null; notes: string | null } | null }[];
  const { data: docs } = lignes.length
    ? await supabase.from("documents").select("sharepoint_item_id, url_web").in("sharepoint_item_id", lignes.map((l) => `collective-cv:${l.application_id}`)).eq("supprime_sharepoint", false)
    : { data: [] };
  const cv = new Map((docs ?? []).map((d) => [String(d.sharepoint_item_id).replace("collective-cv:", ""), d.url_web as string | null]));
  const offre = (l: (typeof lignes)[number]) => l.offre ?? /Candidature Collective : (.+?)(?: \(note IA Collective|$)/.exec(l.consultants?.notes ?? "")?.[1] ?? "—";
  const total = count ?? 0;
  return (
    <div className="carte overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-4 py-3">Arrivée</th><th className="px-4 py-3">Consultant</th><th className="px-4 py-3">Offre Collective</th><th className="px-4 py-3">CV</th><th className="px-4 py-3">Coordonnées</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lignes.map((l) => {
            const c = l.consultants;
            const lien = cv.get(l.application_id);
            return (
              <tr key={l.application_id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(l.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</td>
                <td className="px-4 py-3">
                  <Link href={`/consultants/${l.consultant_id}`} className="lien font-semibold">{c ? `${c.prenom === "—" ? "" : c.prenom} ${c.nom}`.trim() : "—"}</Link>
                  {c?.intitule_poste && <div className="text-xs text-slate-500">{c.intitule_poste}</div>}
                </td>
                <td className="px-4 py-3">{offre(l)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {lien?.startsWith("/api/documents/") ? <a href={lien} target="_blank" rel="noreferrer" className="lien">Ouvrir le CV</a> : <span className="text-slate-400">en préparation</span>}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c?.email && <div><a href={`mailto:${c.email}`} className="lien">{c.email}</a></div>}
                  {c?.telephone_e164 && <div><a href={`tel:${c.telephone_e164}`} className="lien">{formaterTelephone(c.telephone_e164)}</a></div>}
                </td>
              </tr>
            );
          })}
          {!lignes.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucun profil venu de Collective pour l&apos;instant.</td></tr>}
        </tbody>
      </table>
      {total > PAR_PAGE && (
        <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-500">
          <span>{total} profils · page {page + 1} sur {Math.ceil(total / PAR_PAGE)}</span>
          <span className="flex gap-2">
            {page > 0 && <Link href={`/consultants?onglet=collective&page=${page - 1}`} className="bouton-secondaire">Précédente</Link>}
            {(page + 1) * PAR_PAGE < total && <Link href={`/consultants?onglet=collective&page=${page + 1}`} className="bouton-secondaire">Suivante</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
