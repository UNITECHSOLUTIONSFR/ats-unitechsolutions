import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { classementMission } from "@/lib/matching/classement";
import { FILTRE_MES_MISSIONS } from "@/lib/missions/responsables";
import { resumerRapport } from "@/lib/sync/resume";
import { TACHES } from "@/lib/sync/taches";
import { IconeAlerte, IconeMallette, IconePersonnes, IconePlus, IconeTableau } from "./icones";

const LIBELLES_ALERTES: Record<string, string> = {
  doublon_possible: "Doublons possibles", telephone_invalide: "Téléphones à vérifier", nom_manquant: "Noms manquants",
  cv_illisible: "CV illisibles", association_douteuse: "Associations CV à vérifier", disponibilite_ancienne: "Disponibilités anciennes", autre: "Autres",
};

export default async function Accueil() {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const compter = async (table: string, filtre?: [string, string]) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filtre) q = q.eq(filtre[0], filtre[1]);
    return (await q).count ?? 0;
  };
  const depuis = ilYa(24);
  // Tout est lu en même temps : l'accueil s'affiche en une fois.
  const [consultants, cvs, alertes, { data: nouveaux }, { data: typesAlertes }, { data: missions }, missionsOuvertes, { data: nuit }] = await Promise.all([
    compter("consultants"),
    compter("documents", ["type", "word_nominatif"]),
    compter("alertes", ["statut", "ouverte"]),
    supabase.from("consultants").select("id, prenom, nom, intitule_poste, source, created_at").neq("source", "import_excel").gte("created_at", ilYa(24 * 7))
      .order("created_at", { ascending: false }).limit(6),
    supabase.from("alertes").select("type").eq("statut", "ouverte").limit(5000),
    // Mes missions ouvertes (et celles à assigner), les plus récentes d'abord.
    supabase.from("missions").select("id, intitule, client, created_at, responsable_id").eq("statut", "ouverte").or(FILTRE_MES_MISSIONS(utilisateur.id))
      .order("created_at", { ascending: false }).limit(4),
    compter("missions", ["statut", "ouverte"]),
    supabase.from("executions").select("type, debut, statut, rapport").in("type", Object.values(TACHES).map((t) => t.type)).gte("debut", depuis)
      .order("debut", { ascending: false }).limit(6),
  ]);
  // Les 3 meilleurs profils de chaque mission ouverte (même calcul que l'écran de la mission, sans IA).
  const meilleurs = await Promise.all((missions ?? []).map((m) => classementMission(supabase, m.id, 3).catch(() => [])));
  const parType = new Map<string, number>();
  for (const a of typesAlertes ?? []) parType.set(a.type, (parType.get(a.type) ?? 0) + 1);
  const prenom = (utilisateur.nomAffiche ?? "").split(" ")[0];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-marque-500 via-marque-400 to-[#7d9be0] p-8 text-white shadow-[0_30px_60px_-30px_rgba(31,69,163,0.6)]">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-white/70">Bonjour{prenom ? ` ${prenom}` : ""}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Trouvez le bon consultant<br className="hidden sm:block" /> en une minute.</h1>
            <p className="mt-2 max-w-xl text-white/75">Collez le besoin du client : l&apos;outil classe les profils et explique chaque score.</p>
          </div>
          <Link href="/missions/nouvelle" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-nuit shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
            <IconePlus className="h-5 w-5" />Nouvelle mission
          </Link>
        </div>
      </div>

      {/* Chiffres clés */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tuile titre="Consultants" valeur={consultants} lien="/consultants" Icone={IconePersonnes} />
        <Tuile titre="CV Unitech (SharePoint)" valeur={cvs} lien={utilisateur.role === "admin" ? "/parametres/cv" : "/consultants"} Icone={IconeTableau} />
        <Tuile titre="Missions ouvertes" valeur={missionsOuvertes} lien="/missions?vue=toutes" Icone={IconeMallette} />
        <Tuile titre="Cas à vérifier" valeur={alertes} lien="/alertes" Icone={IconeAlerte} attention={alertes > 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Missions ouvertes et meilleurs profils */}
        <section className="carte p-6 xl:col-span-2">
          <EnTete titre="Mes missions" lien="/missions?vue=toutes" libelle="Voir aussi celles des autres" />
          <div className="mt-4 space-y-3">
            {(missions ?? []).map((m, i) => (
              <div key={m.id} className="rounded-2xl bg-white/60 p-4 ring-1 ring-white/80">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/missions/${m.id}`} className="font-semibold text-nuit hover:text-marque-600">{m.intitule}</Link>
                  <span className="flex items-center gap-2 text-xs text-slate-500">{m.client ?? ""}{!m.responsable_id && <span className="pastille pastille-orange">À assigner</span>}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {meilleurs[i].map((c) => (
                    <Link key={c.consultant_id} href={`/consultants/${c.consultant_id}`}
                      className="flex items-center gap-3 rounded-xl bg-white/70 p-2.5 ring-1 ring-white/80 transition hover:bg-white">
                      <Score valeur={c.resultat.score} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-nuit">{c.prenom} {c.nom}</div>
                        <div className="truncate text-xs text-slate-500">{c.intitule_poste ?? "—"}</div>
                      </div>
                    </Link>
                  ))}
                  {!meilleurs[i].length && <p className="text-sm text-slate-500">Aucun profil classé pour l&apos;instant.</p>}
                </div>
              </div>
            ))}
            {!missions?.length && (
              <p className="text-sm text-slate-500">Aucune mission ouverte pour vous. <Link href="/missions/nouvelle" className="lien">Saisir un besoin client</Link></p>
            )}
          </div>
        </section>

        <div className="space-y-6">
          {/* Nouvelles candidatures */}
          <section className="carte p-6">
            <EnTete titre="Nouvelles fiches (7 jours)" lien="/consultants" libelle="Voir" />
            <ul className="mt-3 space-y-2">
              {(nouveaux ?? []).map((c) => (
                <li key={c.id}>
                  <Link href={`/consultants/${c.id}`} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-white/70">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marque-400 to-marque-700 text-xs font-semibold text-white">
                      {`${c.prenom?.[0] ?? ""}${c.nom?.[0] ?? ""}`.replace("—", "").toUpperCase() || "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-nuit">{c.prenom} {c.nom}</div>
                      <div className="truncate text-xs text-slate-500">{c.intitule_poste ?? "—"}</div>
                    </div>
                    <span className="pastille">{c.source === "email" ? "email" : c.source === "sharepoint" ? "SharePoint" : "manuel"}</span>
                  </Link>
                </li>
              ))}
              {!nouveaux?.length && <li className="text-sm text-slate-500">Aucune nouvelle fiche cette semaine.</li>}
            </ul>
          </section>

          {/* Alertes à traiter */}
          <section className="carte p-6">
            <EnTete titre="À vérifier" lien="/alertes" libelle="Traiter" />
            <ul className="mt-3 space-y-1.5 text-sm">
              {[...parType.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                <li key={type} className="flex items-center justify-between">
                  <span className="text-slate-600">{LIBELLES_ALERTES[type] ?? type}</span>
                  <span className="pastille pastille-orange tabular-nums">{n.toLocaleString("fr-FR")}</span>
                </li>
              ))}
              {!parType.size && <li className="text-slate-500">Rien à vérifier.</li>}
            </ul>
          </section>
        </div>
      </div>

      {/* Rapport des traitements */}
      <section className="carte p-6">
        <h2 className="font-semibold text-nuit">Traitements des dernières 24 heures</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(nuit ?? []).map((e, k) => (
            <li key={k} className={e.statut === "echec" ? "text-red-700" : "text-slate-600"}>
              <span className="tabular-nums text-slate-400">{new Date(e.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>{" "}
              {resumerRapport(e.type, e.rapport as Record<string, unknown>)}
            </li>
          ))}
          {!nuit?.length && <li className="text-slate-500">Aucun traitement automatique depuis hier.</li>}
        </ul>
      </section>
    </div>
  );
}

function EnTete({ titre, lien, libelle }: { titre: string; lien: string; libelle: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-semibold text-nuit">{titre}</h2>
      <Link href={lien} className="text-sm font-medium text-marque-600 hover:underline">{libelle} →</Link>
    </div>
  );
}

function Score({ valeur }: { valeur: number }) {
  const couleur = valeur >= 75 ? "text-emerald-600" : valeur >= 50 ? "text-marque-600" : "text-slate-500";
  return <span className={`w-10 shrink-0 text-center text-lg font-bold tabular-nums ${couleur}`}>{Math.round(valeur)}</span>;
}

function Tuile({ titre, valeur, lien, Icone, attention }: {
  titre: string; valeur: number; lien: string; Icone: (p: { className?: string }) => React.ReactNode; attention?: boolean;
}) {
  return (
    <Link href={lien} className="carte-interactive flex items-center gap-4 p-5">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${attention ? "bg-amber-50 text-amber-600 ring-amber-100" : "bg-marque-50 text-marque-600 ring-marque-100"}`}>
        <Icone className="h-6 w-6" />
      </span>
      <div>
        <div className="text-3xl font-bold tracking-tight text-nuit tabular-nums">{valeur.toLocaleString("fr-FR")}</div>
        <div className="text-sm text-slate-500">{titre}</div>
      </div>
    </Link>
  );
}

/** Date d'il y a N heures. */
function ilYa(heures: number): string {
  return new Date(Date.now() - heures * 3_600_000).toISOString();
}
