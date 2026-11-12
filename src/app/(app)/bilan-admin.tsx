import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { chargerBilanAdmin, type Echeance, type Etat } from "@/lib/admin/bilan";

const USAGES: Record<string, string> = {
  fiche_cv: "Lecture des CV", mission: "Fiches de poste", tri_email: "Tri des emails", analyse_approfondie: "Analyse approfondie",
  lecture_scan: "CV scannés", cv_unitech: "CV Unitech", recherche: "Recherche en conversation",
};
const ETATS: Record<Etat, { texte: string; classe: string; icone: string }> = {
  ok: { texte: "OK", classe: "pastille pastille-vert", icone: "✓" },
  retard: { texte: "En retard", classe: "pastille pastille-orange", icone: "!" },
  echec: { texte: "Échec", classe: "pastille pastille-rouge", icone: "✕" },
};

/** Bilan du jour (administrateurs) : tâches automatiques, échéances des secrets, consommation de l'IA. */
export default async function BilanAdmin() {
  const { supabase } = await exigerUtilisateur();
  const b = await chargerBilanAdmin(supabase);
  const aSurveiller = b.echeances.filter((e) => e.niveau !== "ok" && e.niveau !== "inconnu");
  const sansDate = b.echeances.filter((e) => e.niveau === "inconnu").length;
  const part = Math.min(100, (b.ia.mois / Math.max(b.ia.plafond, 0.01)) * 100);

  return (
    <section className={`carte p-6 ${b.problemes ? "ring-1 ring-amber-200" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-nuit">Bilan du jour · administrateurs</h2>
        <span className={b.problemes ? "pastille pastille-orange" : "pastille pastille-vert"}>
          {b.problemes ? `${b.problemes} point(s) à regarder` : "Tout fonctionne"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        {/* Tâches automatiques */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tâches automatiques</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {b.taches.map((t) => (
              <li key={t.nom} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-slate-700">{t.libelle}</span>
                  <span className="text-xs text-slate-400">{t.derniereReussite ? `Réussie ${quand(t.derniereReussite)}` : "Jamais réussie"}</span>
                </span>
                <span className={`${ETATS[t.etat].classe} shrink-0`}>{ETATS[t.etat].icone} {ETATS[t.etat].texte}</span>
              </li>
            ))}
          </ul>
          <p className={`mt-2 text-xs ${b.secoursPret ? "text-emerald-700" : "text-amber-700"}`}>
            {b.secoursPret ? "✓ Planificateur de secours (Supabase) actif" : "Planificateur de secours : clé à enregistrer dans Supabase"}
          </p>
          <Link href="/parametres/sante" className="mt-2 inline-block text-xs font-medium text-marque-600 hover:underline">Bilan de santé →</Link>
        </div>

        {/* Échéances des secrets */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Échéances des secrets</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {aSurveiller.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-700">{e.nom}</span><PastilleEcheance e={e} />
              </li>
            ))}
            {!aSurveiller.length && <li className="text-slate-500">Aucune échéance dans les 30 jours.</li>}
          </ul>
          {sansDate > 0 && <p className="mt-2 text-xs text-amber-700">{sansDate} date(s) à renseigner.</p>}
          <Link href="/parametres/echeances" className="mt-2 inline-block text-xs font-medium text-marque-600 hover:underline">Gérer les échéances →</Link>
        </div>

        {/* Consommation de l'IA */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Consommation de l&apos;IA</h3>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Chiffre valeur={b.ia.jour} libelle="aujourd'hui" />
            <Chiffre valeur={b.ia.semaine} libelle="7 jours" />
            <Chiffre valeur={b.ia.mois} libelle="ce mois" />
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-200/60">
            <div className={`h-2 rounded-full ${part >= 80 ? "bg-amber-500" : "bg-gradient-to-r from-marque-600 to-marque-400"}`} style={{ width: `${part}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{part.toFixed(0)} % du plafond mensuel ({b.ia.plafond} $)</p>
          {b.ia.parUsageSemaine.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
              {b.ia.parUsageSemaine.slice(0, 4).map((u) => <li key={u.usage} className="flex justify-between"><span>{USAGES[u.usage] ?? u.usage}</span><span className="tabular-nums">{u.cout.toFixed(2)} $</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function PastilleEcheance({ e }: { e: Echeance }) {
  if (e.niveau === "inconnu") return <span className="pastille shrink-0">Date à renseigner</span>;
  const date = new Date(`${e.expireLe}T12:00:00`).toLocaleDateString("fr-FR");
  if (e.niveau === "expire") return <span className="pastille pastille-rouge shrink-0">Expiré le {date}</span>;
  const classe = e.niveau === "urgent" ? "pastille pastille-rouge" : e.niveau === "bientot" ? "pastille pastille-orange" : "pastille pastille-vert";
  return <span className={`${classe} shrink-0`}>{date} · {e.joursRestants} j</span>;
}

function Chiffre({ valeur, libelle }: { valeur: number; libelle: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-2 py-2 ring-1 ring-white/80">
      <div className="text-base font-bold tabular-nums text-nuit sm:text-lg">{valeur.toFixed(2)} $</div>
      <div className="text-[11px] text-slate-500">{libelle}</div>
    </div>
  );
}

/** « aujourd'hui à 02:01 », « hier à 02:01 » ou « le 08/11 à 02:01 ». */
function quand(iso: string): string {
  const d = new Date(iso);
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const jour = (x: Date) => x.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const auj = new Date(Date.now());
  const hier = new Date(auj.getTime() - 86_400_000);
  if (jour(d) === jour(auj)) return `aujourd'hui à ${heure}`;
  if (jour(d) === jour(hier)) return `hier à ${heure}`;
  return `le ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" })} à ${heure}`;
}
