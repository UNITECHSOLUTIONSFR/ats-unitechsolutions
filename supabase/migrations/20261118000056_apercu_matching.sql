-- Matching v2 en « mise en ligne invisible » (18/11/2026) : calculé à côté, sans rien changer aux écrans, jusqu'à validation.
insert into public.reglages (cle, valeur) values ('matching_v2', 'false'::jsonb) on conflict (cle) do nothing;

create table if not exists public.apercu_matching (
  mission_id uuid primary key references public.missions(id) on delete cascade,
  criteres jsonb,
  eligibles integer,
  premiers jsonb,      -- 5 premiers profils : nom, poste, note, raison
  proches jsonb,       -- profils proches : nom, poste, critères absents
  erreur text,
  calcule_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists apercu_matching_maj_updated_at on public.apercu_matching;
create trigger apercu_matching_maj_updated_at before update on public.apercu_matching for each row execute function maj_updated_at();
alter table public.apercu_matching enable row level security; -- aucune règle : lisible par le serveur seulement
