import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { formaterTelephone } from "@/lib/metier/telephone";

const PAR_PAGE = 50;

export default async function Consultants({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { supabase } = await exigerUtilisateur();
  const { q = "", page = "1" } = await searchParams;
  const numero = Math.max(1, Number(page) || 1);
  const { data: consultants, error } = await supabase.rpc("rechercher_consultants", {
    p_texte: q, p_limite: PAR_PAGE + 1, p_decalage: (numero - 1) * PAR_PAGE,
  });
  const lignes = (consultants ?? []).slice(0, PAR_PAGE);
  const suite = (consultants ?? []).length > PAR_PAGE;

  return (
    <div className="space-y-4">
      <h1 className="titre-page">Consultants</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Nom, trigramme, poste, compétence, mot du CV…"
          className="w-full max-w-xl champ" />
        <button className="bouton-primaire">Rechercher</button>
      </form>
      {error && <p className="text-sm text-red-700">Recherche impossible pour le moment.</p>}
      <div className="overflow-x-auto carte">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr><th className="p-3">Trigramme</th><th className="p-3">Prénom</th><th className="p-3">Nom</th><th className="p-3">Poste</th><th className="p-3">Disponibilité</th><th className="p-3">Téléphone</th><th className="p-3">Statut</th></tr>
          </thead>
          <tbody>
            {lignes.map((c: Record<string, string | null>) => (
              <tr key={c.id!} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="p-3 font-mono">{c.trigramme}</td>
                <td className="p-3"><Link href={`/consultants/${c.id}`} className="font-medium text-marque-700 hover:underline">{c.prenom}</Link></td>
                <td className="p-3"><Link href={`/consultants/${c.id}`} className="font-medium text-marque-700 hover:underline">{c.nom}</Link></td>
                <td className="p-3">{c.intitule_poste ?? "—"}</td>
                <td className="p-3">{c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR") : c.disponibilite ?? "—"}</td>
                <td className="whitespace-nowrap p-3">{formaterTelephone(c.telephone_e164) || c.telephone_brut || "—"}</td>
                <td className="p-3"><span className="pastille">{c.statut}</span></td>
              </tr>
            ))}
            {!lignes.length && <tr><td colSpan={7} className="p-6 text-center text-zinc-500">Aucun consultant trouvé.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 text-sm">
        {numero > 1 && <Link href={`/consultants?q=${encodeURIComponent(q)}&page=${numero - 1}`} className="underline">← Précédents</Link>}
        {suite && <Link href={`/consultants?q=${encodeURIComponent(q)}&page=${numero + 1}`} className="underline">Suivants →</Link>}
      </div>
    </div>
  );
}
