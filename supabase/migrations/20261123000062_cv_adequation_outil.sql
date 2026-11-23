-- CV Unitech (décision du 23/11/2026) : SharePoint ne garde que le CV Word de base du consultant et son premier PDF.
-- Les CV d'adéquation suivants (Word et PDF) restent dans l'outil, dans un espace de fichiers privé (Supabase Storage),
-- téléchargeables depuis la fiche. Lecture et écriture uniquement par le serveur (clé secrète) : aucune règle d'accès publique.
alter table public.cv_unitech_generes
  add column if not exists stockage text not null default 'sharepoint' check (stockage in ('sharepoint', 'outil')),
  add column if not exists word_chemin text,
  add column if not exists pdf_chemin text;

comment on column public.cv_unitech_generes.stockage is 'sharepoint = CV de base (Word + premier PDF dans SharePoint) ; outil = adéquation gardée dans l''outil';

-- Espace privé des CV d'adéquation (seulement sur Supabase : la base de test n'a pas de schéma « storage »).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('cv-adequation', 'cv-adequation', false, 10485760,
      array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
    on conflict (id) do nothing;
  end if;
end $$;
