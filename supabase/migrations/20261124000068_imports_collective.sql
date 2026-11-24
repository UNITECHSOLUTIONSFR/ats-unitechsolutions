-- Candidats Collective (24/11/2026) : chaque CV passe par le circuit normal d'un CV ajouté à la main (fichier lu une fois,
-- parcours rempli par l'IA). File d'attente traitée par le serveur (tâche « collective »), qui seul a les accès.
create table if not exists public.imports_collective (
  application_id text primary key,
  consultant_id uuid not null references public.consultants(id) on delete cascade,
  cv_lien text not null,
  nom_fichier text not null,
  offre text,
  statut text not null default 'a_traiter' check (statut in ('a_traiter', 'fait', 'erreur')),
  message text,
  traite_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.imports_collective enable row level security;
drop policy if exists imports_collective_lecture on public.imports_collective;
create policy imports_collective_lecture on public.imports_collective for select to authenticated using ((select est_utilisateur_actif()));

-- La tâche « collective » peut être lancée par le planificateur de la base.
create or replace function public.lancer_tache_planifiee(p_tache text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  if p_tache not in ('excel', 'cv', 'emails', 'sauvegarde', 'trello', 'matching', 'excel_lecture', 'collective') then
    raise exception 'Tâche inconnue : %', p_tache;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if v_secret is null or v_secret = '' then
    return; -- secret pas encore enregistré : rien n'est lancé
  end if;
  perform net.http_get(
    url := 'https://ats-unitechsolutions.vercel.app/api/cron/' || p_tache,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 330000
  );
end;
$$;
