import Link from "next/link";
import { SECTIONS } from "@/lib/parametres/sections";

/** Accueil des paramètres : une carte par section, regroupées par thème. */
export default function Parametres() {
  const groupes = [...new Set(SECTIONS.map((s) => s.groupe))];
  return (
    <div className="space-y-6">
      {groupes.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{g}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SECTIONS.filter((s) => s.groupe === g).map((s) => (
              <Link key={s.href} href={s.href} className="carte-interactive group flex items-start justify-between gap-3 p-5">
                <div>
                  <div className="font-semibold text-nuit">{s.titre}</div>
                  <p className="mt-1 text-sm text-slate-500">{s.texte}</p>
                </div>
                <span className="mt-0.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-marque-600">→</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
