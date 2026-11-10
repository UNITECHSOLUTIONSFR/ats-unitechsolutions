import Link from "next/link";
import { COULEURS, SECTIONS } from "@/lib/parametres/sections";

/** Accueil des paramètres : une carte par section, regroupées par thème. */
export default function Parametres() {
  const groupes = [...new Set(SECTIONS.map((s) => s.groupe))];
  return (
    <div className="space-y-6">
      {groupes.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><span className={`h-2 w-2 rounded-full ${COULEURS[g].liseré}`} />{g}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SECTIONS.filter((s) => s.groupe === g).map((s) => (
              <Link key={s.href} href={s.href} className="carte-interactive group relative flex items-start gap-4 overflow-hidden p-5">
                <span className={`absolute inset-y-0 left-0 w-1 ${COULEURS[g].liseré}`} />
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${COULEURS[g].fond} text-xl shadow-md`} aria-hidden>{s.icone}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-nuit">{s.titre}</div>
                  <p className="mt-1 text-sm text-slate-500">{s.texte}</p>
                </div>
                <span className={`mt-0.5 text-slate-300 transition group-hover:translate-x-0.5 ${COULEURS[g].texte}`}>→</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
