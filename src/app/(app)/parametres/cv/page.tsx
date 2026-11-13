import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";
import { rattacherCV } from "@/lib/consultants/rattachement";

interface Doc {
  id: string;
  consultant_id: string | null;
  nom_fichier: string;
  url_web: string | null;
  metier_dossier: string | null;
  document_associe_id: string | null;
  association_details: { versions_pdf?: number } | null;
}

/** CV SharePoint rapprochés : chaque Word Unitech avec son PDF anonymisé et la fiche consultant. */
export default async function PageCV({ searchParams }: { searchParams: Promise<{ q?: string; filtre?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { q = "", filtre = "tous" } = await searchParams;

  const tous: (Doc & { type: string })[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data } = await supabase
      .from("documents")
      .select("id, type, consultant_id, nom_fichier, url_web, metier_dossier, document_associe_id, association_details")
      .eq("supprime_sharepoint", false)
      .range(debut, debut + 999);
    tous.push(...((data ?? []) as (Doc & { type: string })[]));
    if (!data || data.length < 1000) break;
  }
  const parId = new Map(tous.map((d) => [d.id, d]));
  const ids = [...new Set(tous.map((d) => d.consultant_id).filter(Boolean))] as string[];
  const fiches = new Map<string, { prenom: string; nom: string; trigramme: string }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from("consultants").select("id, prenom, nom, trigramme").in("id", ids.slice(i, i + 300));
    for (const c of data ?? []) fiches.set(c.id, c);
  }

  const terme = q.trim().toLowerCase();
  const lignes = tous
    .filter((d) => d.type === "word_nominatif")
    .map((w) => ({ w, pdf: w.document_associe_id ? parId.get(w.document_associe_id) : undefined, fiche: w.consultant_id ? fiches.get(w.consultant_id) : undefined }))
    .filter((l) => (filtre === "sans_fiche" ? !l.fiche : filtre === "sans_pdf" ? !l.pdf : filtre === "versions" ? (l.w.association_details?.versions_pdf ?? 1) > 1 : true))
    .filter((l) => !terme || [l.w.nom_fichier, l.w.metier_dossier, l.fiche?.nom, l.fiche?.prenom].some((x) => x?.toLowerCase().includes(terme)))
    .sort((a, b) => (a.w.metier_dossier ?? "").localeCompare(b.w.metier_dossier ?? "") || a.w.nom_fichier.localeCompare(b.w.nom_fichier));

  const filtres = [["tous", "Tous"], ["sans_fiche", "Sans fiche consultant"], ["sans_pdf", "PDF anonymisé manquant"], ["versions", "Plusieurs versions PDF"]];
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-nuit">CV SharePoint</h2>
      <p className="text-sm text-zinc-600">Chaque CV Word Unitech, son PDF anonymisé et la fiche consultant correspondante. Les fichiers restent dans SharePoint.</p>
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Nom, métier, fichier…" className="champ w-full max-w-md" />
        <input type="hidden" name="filtre" value={filtre} />
        <button className="bouton-primaire">Rechercher</button>
        {filtres.map(([v, l]) => (
          <Link key={v} href={`/parametres/cv?filtre=${v}&q=${encodeURIComponent(q)}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${filtre === v ? "bg-nuit text-white shadow-md" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200/70 hover:bg-white"}`}>{l}</Link>
        ))}
      </form>
      <p className="text-sm text-zinc-500">{lignes.length} CV</p>
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Métier</th><th className="p-3">Fiche consultant</th><th className="p-3">CV Word Unitech</th><th className="p-3">PDF anonymisé</th></tr>
          </thead>
          <tbody>
            {lignes.map(({ w, pdf, fiche }) => (
              <tr key={w.id} className="border-t border-white/70 align-top hover:bg-slate-50">
                <td className="p-3 text-zinc-600">{w.metier_dossier ?? "—"}</td>
                <td className="p-3">
                  {fiche ? (
                    <Link href={`/consultants/${w.consultant_id}`} className="font-medium text-marque-700 hover:underline">
                      {fiche.prenom} {fiche.nom} <span className="font-mono text-xs text-zinc-500">{fiche.trigramme}</span>
                    </Link>
                  ) : (
                    <form action={rattacherCV} className="flex items-center gap-1">
                      <input type="hidden" name="document_id" value={w.id} />
                      <input name="fiche" placeholder="Prénom Nom ou trigramme" className="champ w-44 px-2 py-1" />
                      <button className="bouton-secondaire">Rattacher</button>
                    </form>
                  )}
                </td>
                <td className="p-3">{w.url_web ? <a href={w.url_web} target="_blank" rel="noreferrer" className="text-marque-700 hover:underline">{w.nom_fichier}</a> : w.nom_fichier}</td>
                <td className="p-3">
                  {pdf ? <a href={pdf.url_web ?? "#"} target="_blank" rel="noreferrer" className="text-marque-700 hover:underline">{pdf.nom_fichier}</a> : <span className="text-amber-700">PDF anonymisé manquant</span>}
                  {(w.association_details?.versions_pdf ?? 1) > 1 && <div className="text-xs text-zinc-500">{w.association_details!.versions_pdf} versions — la plus récente affichée</div>}
                </td>
              </tr>
            ))}
            {!lignes.length && <tr><td colSpan={4} className="p-6 text-center text-zinc-500">Aucun CV.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
