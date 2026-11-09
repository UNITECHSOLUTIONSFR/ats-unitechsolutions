import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";

export default async function LayoutParametres({ children }: { children: React.ReactNode }) {
  await exigerAdmin();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Paramètres</h1>
      <nav className="flex gap-2 text-sm">
        <Link href="/parametres" className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-300 hover:bg-zinc-50">Utilisateurs et droits</Link>
        <Link href="/parametres/import" className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-300 hover:bg-zinc-50">Import du fichier Excel</Link>
      </nav>
      {children}
    </div>
  );
}
