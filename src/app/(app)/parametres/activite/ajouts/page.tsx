import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { fichesAjoutees } from "@/lib/activite/stats";
import { formaterTelephone } from "@/lib/metier/telephone";

export const metadata = { title: "Fiches ajoutées" };
export const dynamic = "force-dynamic";

const PERIODES = [["jour", "Aujourd'hui", 0], ["7", "7 derniers jours", 6], ["30", "30 derniers jours", 29]] as const;
const ORIGINE: Record<string, string> = { manuel: "Saisie", import_annexe: "Import de fichier", email: "Email", sharepoint: "SharePoint" };

/** Liste des fiches ajoutées par une personne (ou toute l'équipe) sur la période choisie, depuis l'écran Activité. */
export default async function FichesAjoutees({ searchParams }: { searchParams: Promise<{ periode?: string; personne?: string }> }) {
  await exigerAdmin();
  const { periode = "jour", personne } = await searchParams;
  const choix = PERIODES.find(([k]) => k === periode) ?? PERIODES[0];
  const admin = clientSupabaseAdmin();
  const idPersonne = personne && /^[0-9a-f-]{36}$/.test(personne) ? personne : undefined;
  const [fiches, { data: utilisateurs }] = await Promise.all([
    fichesAjoutees(admin, choix[2], idPersonne),
    admin.from("utilisateurs").select("id, nom_affiche, email"),
  ]);
  const nomDe = new Map((utilisateurs ?? []).map((u) => [u.id as string, (u.nom_affiche as string | null) || String(u.email).split("@")[0]]));
  const qui = idPersonne ? nomDe.get(idPersonne) ?? "cette personne" : "toute l'équipe";
  const lien = (k: string) => `/parametres/activite/ajouts?periode=${k}${idPersonne ? `&personne=${idPersonne}` : ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/parametres/activite?periode=${choix[0]}`} className="text-sm font-medium text-marque-600 hover:underline">← Activité de l&apos;équipe</Link>
          <h2 className="mt-1 text-lg font-semibold text-nuit">Fiches ajoutées par {qui} · {choix[1].toLowerCase()}</h2>
          <p className="text-sm text-slate-500">{fiches.length.toLocaleString("fr-FR")} fiche(s) · saisies à la main et imports de fichier · les fiches supprimées ou fusionnées depuis n&apos;apparaissent plus</p>
        </div>
        <nav className="flex gap-1 rounded-full bg-slate-100/90 p-1 text-sm font-semibold">
          {PERIODES.map(([k, l]) => (
            <Link key={k} href={lien(k)} className={`rounded-full px-3.5 py-1.5 transition ${k === choix[0] ? "bg-white text-nuit shadow-sm" : "text-slate-500 hover:text-nuit"}`}>{l}</Link>
          ))}
        </nav>
      </div>

      <section className="carte overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>{["Consultant", "Poste", "Téléphone", "Email", "Ajoutée le", "Origine", ...(idPersonne ? [] : ["Par"])].map((t) => <th key={t} className="px-5 py-3 font-semibold">{t}</th>)}</tr>
          </thead>
          <tbody>
            {fiches.map((f) => (
              <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link href={`/consultants/${f.id}`} className="font-semibold text-nuit hover:text-marque-600">{f.prenom === "—" ? "" : f.prenom} {f.nom}</Link>
                  <span className="ml-1.5 font-mono text-xs text-slate-400">{f.trigramme}</span>
                </td>
                <td className="px-5 py-3 text-slate-600">{f.intitule_poste ?? "—"}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600">{formaterTelephone(f.telephone_e164) || "—"}</td>
                <td className="px-5 py-3 text-slate-600">{f.email ?? "—"}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600">{new Date(f.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</td>
                <td className="px-5 py-3"><span className="pastille">{ORIGINE[f.source] ?? f.source}</span></td>
                {!idPersonne && <td className="px-5 py-3 text-slate-600">{f.par ? nomDe.get(f.par) ?? "—" : "—"}</td>}
              </tr>
            ))}
            {!fiches.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Aucune fiche ajoutée sur cette période.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
