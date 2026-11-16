import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { activiteEquipe } from "@/lib/activite/stats";
import Rafraichir from "./rafraichir";

export const metadata = { title: "Activité de l'équipe" };
export const dynamic = "force-dynamic";

const PERIODES = [["jour", "Aujourd'hui", 0], ["7", "7 derniers jours", 6], ["30", "30 derniers jours", 29]] as const;

/** Activité de l'équipe (administrateurs) : recherches, fiches consultées et ajoutées, par personne et par jour. Mise à jour toutes les minutes. */
export default async function Activite({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  await exigerAdmin();
  const { periode = "jour" } = await searchParams;
  const choix = PERIODES.find(([k]) => k === periode) ?? PERIODES[0];
  const { personnes, jours } = await activiteEquipe(clientSupabaseAdmin(), choix[2]);
  const total = personnes.reduce((t, p) => ({ r: t.r + p.recherches, c: t.c + p.consultations, a: t.a + p.ajouts }), { r: 0, c: 0, a: 0 });
  const max = Math.max(1, ...jours.map((j) => j.recherches + j.consultations + j.ajouts));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-full bg-slate-100/90 p-1 text-sm font-semibold">
          {PERIODES.map(([k, l]) => (
            <Link key={k} href={`/parametres/activite?periode=${k}`} className={`rounded-full px-3.5 py-1.5 transition ${k === choix[0] ? "bg-white text-nuit shadow-sm" : "text-slate-500 hover:text-nuit"}`}>{l}</Link>
          ))}
        </nav>
        <Rafraichir />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Chiffre valeur={total.r} libelle="recherches" />
        <Chiffre valeur={total.c} libelle="fiches consultées" />
        <Chiffre valeur={total.a} libelle="fiches ajoutées" />
      </div>

      <section className="carte overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>{["Personne", "Recherches", "Fiches consultées", "Fiches ajoutées", "Modifications"].map((t, i) => <th key={t} className={`px-5 py-3 font-semibold ${i ? "text-right" : ""}`}>{t}</th>)}</tr>
          </thead>
          <tbody>
            {personnes.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-5 py-3"><span className="font-semibold text-nuit">{p.nom}</span> <span className="text-xs text-slate-400">{p.role === "admin" ? "administrateur" : "recruteur"}</span></td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold">{p.recherches}</td>
                <td className="px-5 py-3 text-right tabular-nums">{p.fichesConsultees} <span className="text-xs text-slate-400">({p.consultations} ouvertures)</span></td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold text-emerald-700">{p.ajouts}</td>
                <td className="px-5 py-3 text-right tabular-nums">{p.modifications}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {choix[2] > 0 && (
        <section className="carte space-y-2 p-5">
          <h2 className="titre-section">Jour par jour</h2>
          {jours.map((j) => (
            <div key={j.jour} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-slate-500">{new Date(`${j.jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
              <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-marque-500" style={{ width: `${(j.recherches / max) * 100}%` }} title={`${j.recherches} recherches`} />
                <div className="bg-sky-300" style={{ width: `${(j.consultations / max) * 100}%` }} title={`${j.consultations} consultations`} />
                <div className="bg-emerald-500" style={{ width: `${(j.ajouts / max) * 100}%` }} title={`${j.ajouts} fiches ajoutées`} />
              </div>
              <span className="w-56 shrink-0 text-right text-xs text-slate-500">{j.recherches} rech. · {j.consultations} consult. · {j.ajouts} ajouts</span>
            </div>
          ))}
          <p className="pt-1 text-xs text-slate-400"><span className="text-marque-600">■</span> recherches <span className="ml-2 text-sky-400">■</span> fiches consultées <span className="ml-2 text-emerald-600">■</span> fiches ajoutées</p>
        </section>
      )}
      <p className="text-xs text-slate-400">Recherches : section « Recherche » et barre de l&apos;écran Consultants (comptées depuis le 16/11/2026). Fiches ajoutées : saisies à la main et imports de fichier. Les CV reçus par email ou SharePoint sont ajoutés automatiquement et ne sont pas comptés ici.</p>
    </div>
  );
}

function Chiffre({ valeur, libelle }: { valeur: number; libelle: string }) {
  return (
    <div className="carte p-5">
      <div className="text-3xl font-extrabold tabular-nums text-nuit">{valeur.toLocaleString("fr-FR")}</div>
      <div className="text-sm text-slate-500">{libelle}</div>
    </div>
  );
}
