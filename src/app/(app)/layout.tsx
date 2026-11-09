import Link from "next/link";
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
    <div className="flex min-h-full flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <Link href="/" className="font-semibold">ATS Unitech</Link>
          <Link href="/missions" className="hover:underline">Missions</Link>
          <Link href="/consultants" className="hover:underline">Consultants</Link>
          {utilisateur.role === "admin" && <Link href="/parametres" className="hover:underline">Paramètres</Link>}
          <span className="ml-auto text-zinc-500">
            {utilisateur.nomAffiche ?? utilisateur.email} · {utilisateur.role === "admin" ? "administrateur" : "recruteur"}
          </span>
          <BoutonDeconnexion />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

function Message({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-xl font-semibold">{titre}</h1>
        <div className="mt-2 text-zinc-600">{children}</div>
      </div>
    </main>
  );
}

function BoutonDeconnexion() {
  return (
    <form action="/auth/deconnexion" method="post">
      <button className="rounded-lg border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50">Se déconnecter</button>
    </form>
  );
}
