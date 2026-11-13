import { Suspense } from "react";
import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { classementMission } from "@/lib/matching/classement";
import { FILTRE_MES_MISSIONS } from "@/lib/missions/responsables";
import { alerteVisible } from "@/lib/alertes/libelles";
import BilanAdmin from "./bilan-admin";
import { IconeAlerte, IconeMallette, IconePersonnes, IconePlus, IconeTableau } from "./icones";

const LIBELLES_ALERTES: Record<string, string> = {
  doublon_possible: "Doublons possibles", telephone_invalide: "Téléphones à vérifier", nom_manquant: "Noms manquants",
  cv_illisible: "CV à vérifier", association_douteuse: "Associations CV à vérifier", disponibilite_ancienne: "Disponibilités anciennes", autre: "Fiches à compléter",
};

export default async function Accueil() {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const compter = async (table: string, filtre?: [string, string]) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filtre) q = q.eq(filtre[0], filtre[1]);
    return (await q).count ?? 0;
  };
  // Tout est lu en même temps : l'accueil s'affiche en une fois.
  const estAdmin = utilisateur.role === "admin";
  const [consultants, cvs, { data: nouveaux }, { data: typesAlertes }, { data: missions }, missionsOuvertes] = await Promise.all([
    compter("consultants"),
    compter("documents", ["type", "word_nominatif"]),
    supabase.from("consultants").select("id, prenom, nom, intitule_poste, source, created_at").neq("source", "import_excel").gte("created_at", depuisJours(7))
      .order("created_at", { ascending: false }).limit(6),
    supabase.from("alertes").select("type").eq("statut", "ouverte").limit(5000),
    // Mes missions ouvertes (et celles à assigner), les plus récentes d'abord.
    supabase.from("missions").select("id, intitule, client, created_at, responsable_id").eq("statut", "ouverte").or(FILTRE_MES_MISSIONS(utilisateur.id))
      .order("created_at", { ascending: false }).limit(4),
    compter("missions", ["statut", "ouverte"]),
  ]);
  const parType = new Map<string, number>();
  // Les recruteurs ne voient que les cas qui les concernent (aucune alerte technique).
  for (const a of typesAlertes ?? []) if (alerteVisible(a.type, estAdmin)) parType.set(a.type, (parType.get(a.type) ?? 0) + 1);
  const alertes = [...parType.values()].reduce((t, n) => t + n, 0);
  const prenom = (utilisateur.nomAffiche ?? "").split(" ")[0];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-marque-500 via-marque-400 to-[#7d9be0] p-5 text-white sm:rounded-[2rem] sm:p-8 shadow-[0_30px_60px_-30px_rgba(31,69,163,0.6)]">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-white/70">Bonjour{prenom ? ` ${prenom}` : ""}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-[-0.03em] sm:text-4xl">Trouvez le bon consultant<br className="hidden sm:block" /> en une minute.</h1>
            <p className="mt-2 hidden max-w-xl text-white/75 sm:block">Collez le besoin du client : l&apos;outil classe les profils et explique chaque score.</p>
          </div>
          <Link href="/missions/nouvelle" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-semibold sm:w-auto text-nuit shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
            <IconePlus className="h-5 w-5" />Nouvelle mission
          </Link>
        </div>
      </div>

      {/* Bilan du jour : tâches automatiques, échéances des secrets, consommation IA (administrateurs) */}
      {estAdmin && <Suspense fallback={<div className="squelette h-48" />}><BilanAdmin /></Suspense>}

      {/* Chiffres clés */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tuile titre="Consultants" valeur={consultants} lien="/consultants" Icone={IconePersonnes} />
        <Tuile titre="CV en base" valeur={cvs} lien={estAdmin ? "/parametres/cv" : "/consultants"} Icone={IconeTableau} />
        <Tuile titre="Missions ouvertes" valeur={missionsOuvertes} lien="/missions?vue=toutes" Icone={IconeMallette} />
        <Tuile titre="Cas à vérifier" valeur={alertes} lien="/alertes" Icone={IconeAlerte} attention={alertes > 0} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        {/* Missions ouvertes et meilleurs profils */}
        <section className="carte p-6 xl:col-span-2">
          <EnTete titre="Mes missions" lien="/missions?vue=toutes" libelle="Voir aussi celles des autres" />
          <div className="mt-4 space-y-3">
            {(missions ?? []).map((m) => (
              <div key={m.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/missions/${m.id}`} className="font-semibold text-nuit hover:text-marque-600">{m.intitule}</Link>
                  <span className="flex items-center gap-2 text-xs text-slate-500">{m.client ?? ""}{!m.responsable_id && <span className="pastille pastille-orange">À assigner</span>}</span>
                </div>
                {/* Calculés à part : le tableau de bord s'affiche sans attendre le classement. */}
                <Suspense fallback={<div className="mt-3 grid gap-2 sm:grid-cols-3">{[0, 1, 2].map((k) => <div key={k} className="squelette h-14" />)}</div>}>
                  <MeilleursProfils missionId={m.id} />
                </Suspense>
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
            <h2 className="font-semibold text-nuit">Nouveaux profils · 7 derniers jours</h2>
            <p className="mt-0.5 text-xs text-slate-500">Reçus par email, déposés dans SharePoint ou saisis à la main. Cliquez sur un nom pour ouvrir sa fiche.</p>
            <ul className="mt-3 space-y-2">
              {(nouveaux ?? []).map((c) => (
                <li key={c.id}>
                  <Link href={`/consultants/${c.id}`} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-slate-50">
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
              {!nouveaux?.length && <li className="text-sm text-slate-500">Aucun nouveau profil cette semaine.</li>}
            </ul>
          </section>

          {/* Nouveaux profils ajoutés automatiquement à mes missions */}
          <Suspense fallback={null}><NouveauxPourMesMissions moi={utilisateur.id} /></Suspense>

          {/* Relances à faire */}
          <section className="carte p-6">
            <h2 className="font-semibold text-nuit">À relancer</h2>
            <p className="mt-0.5 text-xs text-slate-500">Consultants proposés, appelés ou envoyés au client sur vos missions, sans suite depuis plus de 7 jours.</p>
            <Suspense fallback={<div className="squelette mt-3 h-20" />}><RelancesAFaire moi={utilisateur.id} /></Suspense>
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

    </div>
  );
}

/** Les 3 meilleurs profils d'une mission ouverte (même calcul que l'écran de la mission, sans IA). */
async function MeilleursProfils({ missionId }: { missionId: string }) {
  const { supabase } = await exigerUtilisateur();
  const [classement, { data: suivis }] = await Promise.all([
    classementMission(supabase, missionId, 50).catch(() => []),
    supabase.from("propositions").select("consultant_id").eq("mission_id", missionId),
  ]);
  const dejaSuivis = new Set((suivis ?? []).map((p) => p.consultant_id));
  // Profils à appeler : très bien classés (80 et plus) et pas encore suivis sur cette mission.
  const aAppeler = classement.filter((c) => !c.resultat.elimine && c.resultat.score >= 80 && !dejaSuivis.has(c.consultant_id)).length;
  const meilleurs = classement.slice(0, 3);
  return (
    <>
    {aAppeler > 0 && (
      <Link href={`/missions/${missionId}`} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">
        📞 {aAppeler} profil(s) à 80 et plus à appeler
      </Link>
    )}
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {meilleurs.map((c) => (
        <Link key={c.consultant_id} href={`/consultants/${c.consultant_id}`}
          className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200/70 transition hover:bg-white">
          <Score valeur={c.resultat.score} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-nuit">{c.prenom} {c.nom}</div>
            <div className="truncate text-xs text-slate-500">{c.intitule_poste ?? "—"}</div>
          </div>
        </Link>
      ))}
      {!meilleurs.length && <p className="text-sm text-slate-500">Aucun profil classé pour l&apos;instant.</p>}
    </div>
    </>
  );
}

/** Nouveaux profils (CV reçus ou mis à jour) ajoutés automatiquement à mes missions ouvertes ces 7 derniers jours. */
async function NouveauxPourMesMissions({ moi }: { moi: string }) {
  const { supabase } = await exigerUtilisateur();
  const { data } = await supabase.from("propositions")
    .select("created_at, score, mission_id, consultant_id, consultants(prenom, nom, intitule_poste), missions!inner(intitule, responsable_id, statut)")
    .like("commentaire", "Ajouté automatiquement%").eq("statut", "propose").gte("created_at", depuisJours(7))
    .eq("missions.responsable_id", moi).eq("missions.statut", "ouverte").order("score", { ascending: false }).limit(6);
  if (!data?.length) return null;
  return (
    <section className="carte p-6 ring-1 ring-emerald-200">
      <h2 className="font-semibold text-nuit">Nouveaux profils pour vos missions</h2>
      <p className="mt-0.5 text-xs text-slate-500">CV reçus ces 7 derniers jours qui correspondent à une de vos missions ouvertes.</p>
      <ul className="mt-3 space-y-2 text-sm">
        {data.map((p) => {
          const c = p.consultants as unknown as { prenom: string; nom: string; intitule_poste: string | null } | null;
          const m = p.missions as unknown as { intitule: string } | null;
          return (
            <li key={`${p.mission_id}-${p.consultant_id}`}>
              <Link href={`/missions/${p.mission_id}`} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-slate-50">
                <Score valeur={Number(p.score ?? 0)} />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-nuit">{c?.prenom} {c?.nom}</div>
                  <div className="truncate text-xs text-slate-500">{m?.intitule}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SUIVIS: Record<string, string> = { propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client" };

/** Relances à faire : propositions sur mes missions restées sans suite depuis plus de 7 jours. */
async function RelancesAFaire({ moi }: { moi: string }) {
  const { supabase } = await exigerUtilisateur();
  const { data } = await supabase.from("propositions")
    .select("updated_at, statut, mission_id, consultant_id, consultants(prenom, nom), missions!inner(intitule, responsable_id, statut)")
    .in("statut", ["propose", "appele", "envoye_client"]).lt("updated_at", depuisJours(7))
    .eq("missions.responsable_id", moi).eq("missions.statut", "ouverte").order("updated_at").limit(8);
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {(data ?? []).map((p) => {
        const c = p.consultants as unknown as { prenom: string; nom: string } | null;
        const m = p.missions as unknown as { intitule: string } | null;
        const jours = Math.floor((Date.parse(new Date().toISOString()) - Date.parse(p.updated_at)) / 86_400_000);
        return (
          <li key={`${p.mission_id}-${p.consultant_id}`}>
            <Link href={`/missions/${p.mission_id}`} className="flex items-center justify-between gap-3 rounded-xl p-1.5 transition hover:bg-slate-50">
              <div className="min-w-0">
                <div className="truncate font-semibold text-nuit">{c?.prenom} {c?.nom}</div>
                <div className="truncate text-xs text-slate-500">{m?.intitule} · {SUIVIS[p.statut]}</div>
              </div>
              <span className="pastille pastille-orange shrink-0">{jours} j</span>
            </Link>
          </li>
        );
      })}
      {!data?.length && <li className="text-slate-500">Rien à relancer : tout est à jour.</li>}
    </ul>
  );
}

/** Date d'il y a N jours (ISO). */
function depuisJours(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
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

