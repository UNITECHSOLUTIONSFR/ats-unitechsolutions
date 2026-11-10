import MenuLateral from "./menu-lateral";
import BoutonRetour from "./bouton-retour";
import { PrechargementConsultants } from "./consultants/chargeur";
import { configSupabase } from "@/lib/supabase/config";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clientSupabaseServeur, codeAttendu, utilisateurConnecte } from "@/lib/supabase/serveur";

export const dynamic = "force-dynamic";

export default async function LayoutApplication({ children }: { children: React.ReactNode }) {
  if (!configSupabase()) {
    return (
      <Message titre="ATS Unitech Solution">
        L&apos;application est en ligne, mais pas encore reliée à sa base de données (configuration en cours).
      </Message>
    );
  }
  // Double authentification : un compte qui l'a activée doit saisir son code avant d'accéder à l'outil.
  if (await codeAttendu()) redirect("/verification");
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return (
      <Message titre="Accès non autorisé">
        Votre compte n&apos;a pas (ou plus) accès à cet outil. Contactez un administrateur.
        <BoutonDeconnexion />
      </Message>
    );
  }

  const supabase = await clientSupabaseServeur();
  const aal = supabase ? (await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data : null;
  const sans2FA = utilisateur.role === "admin" && aal?.nextLevel !== "aal2";

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <MenuLateral nom={utilisateur.nomAffiche ?? utilisateur.email.split("@")[0]} email={utilisateur.email} estAdmin={utilisateur.role === "admin"} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-7 lg:pl-4 lg:pr-8">
        {sans2FA && (
          <Link href="/parametres/securite" className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-amber-50/90 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200 hover:bg-amber-50">
            <span>🔐 Protégez votre compte administrateur : activez la double authentification.</span><span className="font-semibold">Activer →</span>
          </Link>
        )}
        <BoutonRetour />{children}
      </main>
      <PrechargementConsultants />
    </div>
  );
}

function Message({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl carte p-8">
        <h1 className="text-xl font-semibold">{titre}</h1>
        <div className="mt-2 text-zinc-600">{children}</div>
      </div>
    </main>
  );
}

function BoutonDeconnexion() {
  return (
    <form action="/auth/deconnexion" method="post">
      <button className="bouton-secondaire mt-4">Se déconnecter</button>
    </form>
  );
}
