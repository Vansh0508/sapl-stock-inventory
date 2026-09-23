-- Grant API role access to all public tables, views, and sequences.
--
-- The initial schema created the tables but never granted privileges to the
-- PostgREST roles, so every request with the publishable (anon) key failed
-- with "permission denied for table ..." (SQLSTATE 42501). This app talks to
-- Supabase with the anon key and has no per-user auth, so anon needs full CRUD.
-- There is no RLS on these tables; add policies later if auth is introduced.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- Ensure tables/sequences created by future migrations are accessible too.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
