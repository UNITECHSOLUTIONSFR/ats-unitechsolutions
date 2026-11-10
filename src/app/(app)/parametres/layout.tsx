import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";

export default async function LayoutParametres({ children }: { children: React.ReactNode }) {
  await exigerAdmin();
  return (
    <div className="space-y-4">
      <h1 className="titre-page">Paramètres</h1>
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/parametres" className="rounded-full bg-white/60 px-3.5 py-1.5 font-medium text-slate-600 ring-1 ring-white/80 transition hover:bg-white hover:text-nuit">Utilisateurs et droits</Link>
        <Link href="/parametres/import" className="rounded-full bg-white/60 px-3.5 py-1.5 font-medium text-slate-600 ring-1 ring-white/80 transition hover:bg-white hover:text-nuit">Import du fichier Excel</Link>
        <Link href="/parametres/cv" className="rounded-full bg-white/60 px-3.5 py-1.5 font-medium text-slate-600 ring-1 ring-white/80 transition hover:bg-white hover:text-nuit">CV SharePoint</Link>
        <Link href="/parametres/analyse-cv" className="rounded-full bg-white/60 px-3.5 py-1.5 font-medium text-slate-600 ring-1 ring-white/80 transition hover:bg-white hover:text-nuit">Analyse des CV</Link>
        <Link href="/parametres/emails" className="rounded-full bg-white/60 px-3.5 py-1.5 font-medium text-slate-600 ring-1 ring-white/80 transition hover:bg-white hover:text-nuit">Candidatures email</Link>
        <Link href="/parametres/synchronisations" className="rounded-full bg-white/60 px-3.5 py-1.5 font-medium text-slate-600 ring-1 ring-white/80 transition hover:bg-white hover:text-nuit">Synchronisations</Link>
        <Link href="/parametres/couts" className="rounded-full bg-white/60 px-3.5 py-1.5 font-medium text-slate-600 ring-1 ring-white/80 transition hover:bg-white hover:text-nuit">Coûts et réglages</Link>
        <Link href="/parametres/rgpd" className="rounded-full bg-white/60 px-3.5 py-1.5 font-medium text-slate-600 ring-1 ring-white/80 transition hover:bg-white hover:text-nuit">RGPD : purge à 24 mois</Link>
      </nav>
      {children}
    </div>
  );
}
