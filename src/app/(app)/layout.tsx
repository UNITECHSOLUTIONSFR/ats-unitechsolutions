import MenuLateral from "./menu-lateral";
import BoutonRetour from "./bouton-retour";
import { configSupabase } from "@/lib/supabase/config";
import { utilisateurConnecte } from "@/lib/supabase/serveur";

export const dynamic = "force-dynamic";

export default async function LayoutApplication({ children }: { children: React.ReactNode }) {
  if (!configSupabase()) {
    return (
      <Message titre="ATS Unitech Solution">
        L&apos;application est en ligne, mais pas encore reliée à sa base de données (configuration en cours).
      </Message>
    );
  }
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return (
      <Message titre="Accès non autorisé">
        Votre compte n&apos;a pas (ou plus) accès à cet outil. Contactez un administrateur.
        <BoutonDeconnexion />
      </Message>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <MenuLateral nom={utilisateur.nomAffiche ?? utilisateur.email.split("@")[0]} email={utilisateur.email} estAdmin={utilisateur.role === "admin"} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8"><BoutonRetour />{children}</main>
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
