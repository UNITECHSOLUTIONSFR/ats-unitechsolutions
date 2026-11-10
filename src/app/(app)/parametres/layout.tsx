import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";

export default async function LayoutParametres({ children }: { children: React.ReactNode }) {
  await exigerAdmin();
  return (
    <div className="space-y-4">
      <h1 className="titre-page">Paramètres</h1>
      <nav className="flex gap-2 text-sm">
        <Link href="/parametres" className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-300 hover:bg-zinc-50">Utilisateurs et droits</Link>
        <Link href="/parametres/import" className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-300 hover:bg-zinc-50">Import du fichier Excel</Link>
        <Link href="/parametres/analyse-cv" className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-300 hover:bg-zinc-50">Analyse des CV</Link>
        <Link href="/parametres/emails" className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-300 hover:bg-zinc-50">Candidatures email</Link>
        <Link href="/parametres/synchronisations" className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-300 hover:bg-zinc-50">Synchronisations</Link>
      </nav>
      {children}
    </div>
  );
}
