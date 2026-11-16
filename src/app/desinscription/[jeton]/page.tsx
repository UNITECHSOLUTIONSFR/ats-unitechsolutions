import { notFound, redirect } from "next/navigation";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Lien de désinscription des emails de relance (page publique, sans connexion).
 * L'ouverture du lien n'enregistre rien : les antivirus de messagerie (Outlook Safe Links…) ouvrent les liens tout seuls.
 * La désinscription n'est enregistrée qu'au clic sur « Confirmer ».
 */
export default async function Desinscription({ params, searchParams }: { params: Promise<{ jeton: string }>; searchParams: Promise<{ fait?: string }> }) {
  const { jeton } = await params;
  const { fait } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(jeton)) notFound();

  async function confirmer() {
    "use server";
    if (!/^[0-9a-f-]{36}$/i.test(jeton)) return;
    const supabase = clientSupabaseAdmin();
    const { data: envoi } = await supabase.from("envois_relance").select("id, consultant_id").eq("jeton_desinscription", jeton).maybeSingle();
    if (envoi) {
      await supabase.from("consultants").update({ ne_plus_contacter: true, desinscrit_le: new Date().toISOString() }).eq("id", envoi.consultant_id);
      await supabase.from("envois_relance").update({ statut: "desinscrit" }).eq("id", envoi.id);
    }
    redirect(`/desinscription/${jeton}?fait=1`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="carte max-w-md p-8 text-center">
        {fait ? (
          <>
            <h1 className="text-xl font-bold text-nuit">C&apos;est noté</h1>
            <p className="mt-2 text-slate-600">Vous ne recevrez plus d&apos;emails de relance de la part d&apos;Unitech Solutions.</p>
          </>
        ) : (
          <form action={confirmer} className="space-y-4">
            <h1 className="text-xl font-bold text-nuit">Ne plus recevoir nos relances ?</h1>
            <p className="text-slate-600">Confirmez pour ne plus recevoir d&apos;emails de relance de la part d&apos;Unitech Solutions.</p>
            <button className="bouton-primaire mx-auto">Confirmer la désinscription</button>
          </form>
        )}
      </div>
    </main>
  );
}
