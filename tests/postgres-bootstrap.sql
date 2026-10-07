do $bootstrap$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'karaoke_migrator') then
    create role karaoke_migrator login password 'migration' createrole inherit;
  end if;
end
$bootstrap$;

alter role service_role bypassrls;
grant create on database postgres to karaoke_migrator;
grant usage, create on schema public to karaoke_migrator with grant option;

-- Seed the original Auth-owned table so the migration's first-run archive path
-- is exercised by CI.
set role karaoke_migrator;

create table public.karaoke_entries (
  id uuid primary key,
  owner_id uuid not null,
  karaoke_number text not null,
  song_title text not null,
  singer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.karaoke_entries (
  id,
  owner_id,
  karaoke_number,
  song_title,
  singer
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'legacy-1',
  'Legacy Song',
  'Legacy Singer'
);

reset role;

-- Approximate Supabase's permissive defaults so the migration must revoke them.
alter default privileges for role karaoke_migrator in schema public
grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges for role karaoke_migrator in schema public
grant execute on functions to public, anon, authenticated, service_role;
