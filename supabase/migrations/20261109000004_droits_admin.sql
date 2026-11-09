-- Les administrateurs peuvent tracer leurs imports dans le journal des traitements.
create policy executions_admin_creation on executions for insert to authenticated with check (est_admin());
create policy executions_admin_maj on executions for update to authenticated using (est_admin()) with check (est_admin());
