import { exigerAdmin } from "@/lib/acces-admin";
import FormulairePurge from "./formulaire";

/** Candidats sans contact depuis 24 mois (recommandation CNIL) : liste à confirmer avant effacement. */
export default async function Purge() {
  const { supabase } = await exigerAdmin();
  const limite = new Date(); limite.setMonth(limite.getMonth() - 24);
  const { data } = await supabase.from("consultants")
    .select("id, prenom, nom, trigramme, statut, dernier_contact_le, updated_at")
    .in("statut", ["candidat", "inactif"])
    .or(`dernier_contact_le.lt.${limite.toISOString()},and(dernier_contact_le.is.null,updated_at.lt.${limite.toISOString()})`)
    .order("dernier_contact_le", { ascending: true, nullsFirst: true }).limit(500);
  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-zinc-600">
        Candidats (hors consultants et personnes en mission) sans contact depuis plus de 24 mois. Rien n&apos;est effacé
        sans votre confirmation. Les fichiers SharePoint à supprimer à la main sont listés après l&apos;effacement.
      </p>
      <FormulairePurge fiches={(data ?? []).map((c) => ({ id: c.id, libelle: `${c.prenom} ${c.nom} (${c.trigramme})`, dernier: c.dernier_contact_le ?? c.updated_at }))} />
    </div>
  );
}
