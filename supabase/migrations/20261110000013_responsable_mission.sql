-- Un responsable par mission, choisi parmi les personnes invitées (admins et recruteurs). Vide = « À assigner ».
alter table missions add column if not exists responsable_id uuid references utilisateurs (id) on delete set null;
create index if not exists missions_responsable_idx on missions (responsable_id);

-- Seul un administrateur peut assigner ou réassigner une mission (les traitements serveur, sans session, restent possibles).
create or replace function missions_responsable_reserve_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.responsable_id is distinct from old.responsable_id and auth.uid() is not null and not est_admin() then
    raise exception 'Seul un administrateur peut assigner une mission.';
  end if;
  return new;
end $$;
drop trigger if exists missions_responsable_admin on missions;
create trigger missions_responsable_admin before update on missions
  for each row execute function missions_responsable_reserve_admin();

-- Liste des responsables possibles (nom affiché seulement), lisible par toute personne invitée et active.
create or replace function responsables_possibles() returns table (id uuid, nom text, email text)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(nullif(u.nom_affiche, ''), split_part(u.email, '@', 1)), u.email
  from utilisateurs u
  where u.actif and est_utilisateur_actif()
  order by 2;
$$;
revoke all on function responsables_possibles() from public;
grant execute on function responsables_possibles() to authenticated;
