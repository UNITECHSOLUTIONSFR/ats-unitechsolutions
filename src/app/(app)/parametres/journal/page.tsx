import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";

const ACTIONS: Record<string, { libelle: string; classe: string }> = {
  consultation: { libelle: "Consultation", classe: "pastille" },
  creation: { libelle: "Création", classe: "pastille pastille-vert" },
  modification: { libelle: "Modification", classe: "pastille bg-marque-50/90 text-marque-700 ring-marque-100" },
  export: { libelle: "Export", classe: "pastille pastille-orange" },
  suppression: { libelle: "Suppression", classe: "pastille pastille-rouge" },
};
const PAR_PAGE = 100;

/** Journal d'accès (RGPD) : qui a consulté, modifié, exporté ou supprimé quelle fiche, et quand. */
export default async function Journal({ searchParams }: { searchParams: Promise<{ action?: string; qui?: string; page?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { action, qui, page = "0" } = await searchParams;
  const n = Math.max(0, Number(page) || 0);
  let q = supabase.from("journal_acces").select("id, created_at, action, utilisateur_id, consultant_id, details", { count: "exact" })
    .order("created_at", { ascending: false }).range(n * PAR_PAGE, n * PAR_PAGE + PAR_PAGE - 1);
  if (action && ACTIONS[action]) q = q.eq("action", action);
  if (qui) q = qui === "auto" ? q.is("utilisateur_id", null) : q.eq("utilisateur_id", qui);
  const [{ data: lignes, count }, { data: utilisateurs }] = await Promise.all([q, supabase.from("utilisateurs").select("id, email, nom_affiche")]);
  const ids = [...new Set((lignes ?? []).map((l) => l.consultant_id).filter(Boolean))] as string[];
  const { data: fiches } = ids.length ? await supabase.from("consultants").select("id, prenom, nom").in("id", ids) : { data: [] };
  const nomFiche = new Map((fiches ?? []).map((f) => [f.id, `${f.prenom === "—" ? "" : f.prenom} ${f.nom}`.trim()]));
  const nomUtilisateur = new Map((utilisateurs ?? []).map((u) => [u.id, u.nom_affiche || u.email.split("@")[0]]));
  const lien = (p: Record<string, string | undefined>) => `/parametres/journal?${new URLSearchParams(Object.entries({ action, qui, ...p }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div className="space-y-4">
      <div className="carte flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs font-semibold text-slate-400">Action</span>
          <Filtre href={lien({ action: undefined, page: undefined })} actif={!action}>Toutes</Filtre>
          {Object.entries(ACTIONS).map(([k, v]) => <Filtre key={k} href={lien({ action: k, page: undefined })} actif={action === k}>{v.libelle}</Filtre>)}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs font-semibold text-slate-400">Par</span>
          <Filtre href={lien({ qui: undefined, page: undefined })} actif={!qui}>Tout le monde</Filtre>
          {(utilisateurs ?? []).map((u) => <Filtre key={u.id} href={lien({ qui: u.id, page: undefined })} actif={qui === u.id}>{nomUtilisateur.get(u.id)}</Filtre>)}
          <Filtre href={lien({ qui: "auto", page: undefined })} actif={qui === "auto"}>Traitements automatiques</Filtre>
        </div>
      </div>
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Action</th><th className="p-3">Par</th><th className="p-3">Fiche</th><th className="p-3">Détail</th></tr></thead>
          <tbody>
            {(lignes ?? []).map((l) => {
              const d = l.details as Record<string, unknown>;
              const supprimee = l.action === "suppression" ? `${d.prenom ?? ""} ${d.nom ?? ""}`.trim() : "";
              return (
                <tr key={l.id} className="border-t border-white/70 align-top">
                  <td className="whitespace-nowrap p-3 tabular-nums text-slate-500">{new Date(l.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="p-3"><span className={ACTIONS[l.action]?.classe ?? "pastille"}>{ACTIONS[l.action]?.libelle ?? l.action}</span></td>
                  <td className="p-3 text-nuit">{l.utilisateur_id ? nomUtilisateur.get(l.utilisateur_id) ?? "Ancien compte" : "Automatique"}</td>
                  <td className="p-3">
                    {l.consultant_id && nomFiche.has(l.consultant_id)
                      ? <Link href={`/consultants/${l.consultant_id}`} className="lien">{nomFiche.get(l.consultant_id) || "Fiche"}</Link>
                      : <span className="text-slate-500">{supprimee || (l.consultant_id ? "Fiche supprimée" : "—")}</span>}
                  </td>
                  <td className="max-w-md truncate p-3 text-xs text-slate-500" title={JSON.stringify(d)}>{resumer(d)}</td>
                </tr>
              );
            })}
            {!lignes?.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Aucune entrée.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{(count ?? 0).toLocaleString("fr-FR")} entrée(s)</span>
        <div className="flex gap-2">
          {n > 0 && <Link href={lien({ page: String(n - 1) })} className="bouton-secondaire">← Plus récentes</Link>}
          {(count ?? 0) > (n + 1) * PAR_PAGE && <Link href={lien({ page: String(n + 1) })} className="bouton-secondaire">Plus anciennes →</Link>}
        </div>
      </div>
    </div>
  );
}

function resumer(d: Record<string, unknown>): string {
  if (d.champs) return `Champs : ${(d.champs as string[]).join(", ")}`;
  if (d.motif) return String(d.motif);
  if (d.ecran) return `Écran : ${String(d.ecran)}`;
  if (d.mission_assignee) return "Mission assignée";
  if (d.proposition) return "Suivi d'une proposition";
  if (d.rgpd) return `RGPD : ${String(d.rgpd)}`;
  const cles = Object.keys(d).filter((k) => !["prenom", "nom", "trigramme"].includes(k));
  return cles.length ? cles.join(", ") : "";
}

function Filtre({ href, actif, children }: { href: string; actif: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`rounded-full px-3 py-1 font-medium transition ${actif ? "bg-nuit text-white" : "text-slate-500 hover:bg-white hover:text-nuit"}`}>{children}</Link>;
}
