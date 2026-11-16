import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAdmin } from "@/lib/acces-admin";
import FormulaireFusion, { type ChampFusion } from "./formulaire";
import { formaterTelephone } from "@/lib/metier/telephone";

const CHAMPS: [string, string][] = [
  ["prenom", "Prénom"], ["nom", "Nom"], ["trigramme", "Trigramme"], ["email", "Email"], ["email_2", "Email 2"], ["telephone_e164", "Téléphone"],
  ["intitule_poste", "Poste"], ["localisation", "Localisation"], ["disponibilite", "Disponibilité"], ["disponible_le", "Disponible le"],
  ["statut", "Statut"], ["linkedin", "LinkedIn"], ["tjm_salaire", "TJM / salaire"], ["experience", "Expérience"], ["notes", "Notes"],
];

/** Doublon possible : les deux fiches côte à côte ; on choisit la valeur à garder pour chaque champ, puis on fusionne. */
export default async function Fusion({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { a, b } = await searchParams;
  if (!a || !b || a === b) notFound();
  const [{ data: fiches }, ...comptes] = await Promise.all([
    supabase.from("consultants").select("*").in("id", [a, b]),
    ...[a, b].flatMap((id) => [
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("consultant_id", id),
      supabase.from("propositions").select("id", { count: "exact", head: true }).eq("consultant_id", id),
    ]),
  ]);
  const A = fiches?.find((f) => f.id === a), B = fiches?.find((f) => f.id === b);
  if (!A || !B) return <div className="carte p-8 text-center text-slate-500">L&apos;une des deux fiches n&apos;existe plus (déjà fusionnée ou supprimée). <Link href="/alertes" className="lien">Retour aux cas à vérifier</Link></div>;
  // On garde par défaut la fiche la plus ancienne (souvent celle de l'Excel).
  const [garde, autre] = new Date(A.created_at) <= new Date(B.created_at) ? [A, B] : [B, A];
  const n = (i: number) => comptes[i].count ?? 0;
  const [docsG, propsG, docsA, propsA] = garde.id === a ? [n(0), n(1), n(2), n(3)] : [n(2), n(3), n(0), n(1)];
  const aff = (k: string, v: unknown) => (v === null || v === undefined || v === "" ? "" : k === "telephone_e164" ? formaterTelephone(String(v)) : k === "disponible_le" ? String(v).slice(0, 10) : String(v));

  const TYPES: Record<string, ChampFusion["type"]> = { notes: "long", disponible_le: "date", statut: "statut" };
  const champs: ChampFusion[] = CHAMPS.map(([k, libelle]) => ({ cle: k, libelle, garde: aff(k, garde[k]), autre: aff(k, autre[k]), type: TYPES[k] ?? "texte" }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="titre-page">Fusionner deux fiches</h1>
        <p className="sous-titre mt-1">Pour chaque champ, choisissez ou saisissez la valeur à garder. Documents, compétences, missions, lignes du tableau et historique sont réunis sur une seule fiche ; l&apos;autre est supprimée (suppression tracée).</p>
      </div>
      <FormulaireFusion gardeId={garde.id} autreId={autre.id} champs={champs} entetes={{
        garde: <>Fiche gardée · <Link href={`/consultants/${garde.id}`} className="lien">ouvrir</Link> <span className="font-normal">({docsG} document(s), {propsG} mission(s))</span></>,
        autre: <>Fiche fusionnée · <Link href={`/consultants/${autre.id}`} className="lien">ouvrir</Link> <span className="font-normal">({docsA} document(s), {propsA} mission(s))</span></>,
      }} />
    </div>
  );
}
