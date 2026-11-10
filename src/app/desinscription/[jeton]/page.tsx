import { notFound } from "next/navigation";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";

/** Lien de désinscription des emails de relance (page publique, sans connexion). */
export default async function Desinscription({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jeton)) notFound();
  const supabase = clientSupabaseAdmin();
  const { data: envoi } = await supabase.from("envois_relance").select("id, consultant_id").eq("jeton_desinscription", jeton).maybeSingle();
  if (envoi) {
    await supabase.from("consultants").update({ ne_plus_contacter: true, desinscrit_le: new Date().toISOString() }).eq("id", envoi.consultant_id);
    await supabase.from("envois_relance").update({ statut: "desinscrit" }).eq("id", envoi.id);
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="carte max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-nuit">C&apos;est noté</h1>
        <p className="mt-2 text-slate-600">Vous ne recevrez plus d&apos;emails de relance de la part d&apos;Unitech Solutions.</p>
      </div>
    </main>
  );
}
