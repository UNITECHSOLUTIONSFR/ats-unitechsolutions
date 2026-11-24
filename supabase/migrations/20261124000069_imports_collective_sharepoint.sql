-- Candidats Collective : le CV est aussi déposé dans SharePoint, comme un CV ajouté à la main (décision du 24/11/2026).
alter table public.imports_collective add column if not exists depose_le timestamptz;
