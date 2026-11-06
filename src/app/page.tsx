import { configSupabase } from "@/lib/supabase/config";
import { utilisateurConnecte } from "@/lib/supabase/serveur";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  if (!configSupabase()) {
    return (
      <Cadre>
        <h1 className="text-xl font-semibold">ATS Unitech Solution</h1>
        <p className="mt-2 text-zinc-600">
          L&apos;application est en ligne, mais pas encore reliée à sa base de données (configuration en cours).
        </p>
      </Cadre>
    );
  }

  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return (
      <Cadre>
        <h1 className="text-xl font-semibold">Accès non autorisé</h1>
        <p className="mt-2 text-zinc-600">
          Votre compte n&apos;a pas (ou plus) accès à cet outil. Contactez un administrateur.
        </p>
        <BoutonDeconnexion />
      </Cadre>
    );
  }

  return (
    <Cadre>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Bonjour {utilisateur.nomAffiche ?? utilisateur.email}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Rôle : {utilisateur.role === "admin" ? "administrateur" : "recruteur"}
          </p>
        </div>
        <BoutonDeconnexion />
      </div>
      <p className="mt-8 text-zinc-600">Les consultants et les missions arrivent bientôt ici.</p>
    </Cadre>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">{children}</div>
    </main>
  );
}

function BoutonDeconnexion() {
  return (
    <form action="/auth/deconnexion" method="post" className="mt-4">
      <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">Se déconnecter</button>
    </form>
  );
}
