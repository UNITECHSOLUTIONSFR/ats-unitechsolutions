-- Dates d'expiration ou de renouvellement des secrets et accès (jamais leur valeur) : rappel 30 et 7 jours avant.
create table if not exists echeances_secrets (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null,
  ou_renouveler text,
  expire_le     date,
  note          text,
  par           uuid references utilisateurs (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table echeances_secrets enable row level security;
create policy echeances_admin on echeances_secrets for all to authenticated using (est_admin()) with check (est_admin());
grant select, insert, update, delete on echeances_secrets to authenticated;
create trigger echeances_secrets_maj before update on echeances_secrets for each row execute function maj_updated_at();

insert into echeances_secrets (nom, ou_renouveler, note)
select * from (values
  ('Secret de l''application Microsoft (Entra)', 'Entra › Inscriptions d''applications › ATS Unitech – Synchronisation › Certificats et secrets', 'Expire à la date choisie à sa création. Nouveau secret à reporter dans Vercel (MS_CLIENT_SECRET).'),
  ('Clé API de l''IA (Anthropic)', 'console.anthropic.com › API Keys (et Billing pour le crédit)', 'N''expire pas d''elle-même : surveiller le crédit et la carte bancaire.'),
  ('Clé secrète Supabase', 'Supabase › Project Settings › API Keys', 'N''expire pas d''elle-même : à changer en cas de fuite (à reporter dans Vercel).'),
  ('Clé des tâches planifiées (CRON_SECRET)', 'Vercel (Environment Variables) et GitHub (Secrets › Actions)', 'Même valeur aux deux endroits. N''expire pas d''elle-même.'),
  ('Abonnements (Supabase Pro, Vercel, GitHub)', 'Pages de facturation de chaque service', 'Date de renouvellement ou de fin de la carte bancaire.')
) as v(nom, ou_renouveler, note)
where not exists (select 1 from echeances_secrets);
