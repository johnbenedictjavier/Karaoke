-- HimiGora custom account schema
--
-- This migrates the original Supabase Auth schema to custom accounts. The old
-- owner_id-based playlist is archived in the private schema before the new
-- account-owned playlist is created.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $pgcrypto_schema_check$
begin
  if (
    select namespaces.nspname
    from pg_catalog.pg_extension as extensions
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = extensions.extnamespace
    where extensions.extname = 'pgcrypto'
  ) is distinct from 'extensions' then
    raise exception 'pgcrypto must be installed in the extensions schema';
  end if;
end
$pgcrypto_schema_check$;

create schema if not exists private;

do $role_setup$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'karaoke_api') then
    create role karaoke_api
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  elsif exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'karaoke_api'
      and (
        rolcanlogin
        or rolinherit
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception 'Existing karaoke_api role has unsafe attributes';
  end if;
end
$role_setup$;

-- Membership permits repeatable changes to functions owned by the API role.
-- The migration role already owns the underlying tables.
grant karaoke_api to current_user with inherit true, set true;

-- The API role may own functions but cannot be selected by browser clients.
revoke karaoke_api from anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage, create on schema private to karaoke_api;
grant usage, create on schema public to karaoke_api;
grant usage on schema extensions to karaoke_api;

-- Archive the original auth.users-backed playlist table on the first migration.
-- The old owner_id values cannot be linked to custom accounts because the old
-- password identities are managed by Supabase Auth, so the archive is kept for
-- an administrator instead of being exposed through the new account API.
do $old_schema_cleanup$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'karaoke_entries'
      and column_name = 'owner_id'
  ) then
    execute '
      create table if not exists private.legacy_karaoke_entries as
      select * from public.karaoke_entries
    ';
    revoke all on table private.legacy_karaoke_entries from public, anon, authenticated, service_role;
    drop table public.karaoke_entries cascade;
  end if;
end
$old_schema_cleanup$;

drop function if exists public.set_karaoke_entry_updated_at();

create table if not exists public.accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  password_hash text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint account_name_length check (
    pg_catalog.char_length(
      pg_catalog.btrim(pg_catalog.regexp_replace(name, '[[:space:]]+', ' ', 'g'))
    ) between 1 and 40
  ),
  constraint normalized_account_name_length check (pg_catalog.char_length(normalized_name) between 1 and 40),
  constraint bcrypt_hash_format check (password_hash ~ '^\$2a\$12\$[./A-Za-z0-9]{53}$')
);

create table if not exists private.auth_config (
  singleton boolean primary key default true check (singleton),
  dummy_password_hash text not null
);

insert into private.auth_config (singleton, dummy_password_hash)
values (
  true,
  extensions.crypt(
    pg_catalog.encode(extensions.gen_random_bytes(24), 'hex'),
    extensions.gen_salt('bf', 12)
  )
)
on conflict (singleton) do nothing;

create table if not exists private.account_sessions (
  token_hash bytea primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  constraint session_token_hash_length check (pg_catalog.octet_length(token_hash) = 32),
  constraint session_expiry_after_creation check (expires_at > created_at)
);

create index if not exists account_sessions_account_idx
  on private.account_sessions (account_id);

create index if not exists account_sessions_expiry_idx
  on private.account_sessions (expires_at);

create table if not exists public.karaoke_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  karaoke_number text not null,
  song_title text not null,
  singer text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint karaoke_number_length check (
    pg_catalog.char_length(
      pg_catalog.btrim(pg_catalog.regexp_replace(karaoke_number, '[[:space:]]+', ' ', 'g'))
    ) between 1 and 24
  ),
  constraint song_title_length check (
    pg_catalog.char_length(
      pg_catalog.btrim(pg_catalog.regexp_replace(song_title, '[[:space:]]+', ' ', 'g'))
    ) between 1 and 120
  ),
  constraint singer_length check (
    pg_catalog.char_length(
      pg_catalog.btrim(pg_catalog.regexp_replace(singer, '[[:space:]]+', ' ', 'g'))
    ) between 1 and 100
  )
);

create index if not exists karaoke_entries_account_created_idx
  on public.karaoke_entries (account_id, created_at desc);

create table if not exists public.karaoke_sings (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  entry_id uuid not null references public.karaoke_entries (id) on delete cascade,
  sung_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index if not exists karaoke_sings_account_entry_idx
  on public.karaoke_sings (account_id, entry_id, sung_at desc);

alter table public.accounts enable row level security;
alter table private.auth_config enable row level security;
alter table private.account_sessions enable row level security;
alter table public.karaoke_entries enable row level security;
alter table public.karaoke_sings enable row level security;

drop policy if exists "Karaoke API manages accounts" on public.accounts;
create policy "Karaoke API manages accounts"
on public.accounts for all to karaoke_api
using (true) with check (true);

drop policy if exists "Karaoke API reads auth config" on private.auth_config;
create policy "Karaoke API reads auth config"
on private.auth_config for select to karaoke_api
using (true);

drop policy if exists "Karaoke API manages sessions" on private.account_sessions;
create policy "Karaoke API manages sessions"
on private.account_sessions for all to karaoke_api
using (true) with check (true);

drop policy if exists "Karaoke API manages entries" on public.karaoke_entries;
create policy "Karaoke API manages entries"
on public.karaoke_entries for all to karaoke_api
using (true) with check (true);

drop policy if exists "Karaoke API manages sings" on public.karaoke_sings;
create policy "Karaoke API manages sings"
on public.karaoke_sings for all to karaoke_api
using (true) with check (true);

revoke all on table public.accounts from public, anon, authenticated, service_role;
revoke all on table private.auth_config from public, anon, authenticated, service_role;
revoke all on table private.account_sessions from public, anon, authenticated, service_role;
revoke all on table public.karaoke_entries from public, anon, authenticated, service_role;
revoke all on table public.karaoke_sings from public, anon, authenticated, service_role;

grant select, insert on table public.accounts to karaoke_api;
grant select on table private.auth_config to karaoke_api;
grant select, insert, delete on table private.account_sessions to karaoke_api;
grant select, insert, update, delete on table public.karaoke_entries to karaoke_api;
grant select, insert, delete on table public.karaoke_sings to karaoke_api;

grant execute on function extensions.crypt(text, text) to karaoke_api;
grant execute on function extensions.gen_salt(text, integer) to karaoke_api;
grant execute on function extensions.gen_random_bytes(integer) to karaoke_api;
grant execute on function extensions.digest(text, text) to karaoke_api;
grant execute on function extensions.gen_random_uuid() to karaoke_api;

create or replace function private.normalize_account_name(p_name text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        normalize(coalesce(p_name, ''), NFKC),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  );
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

drop trigger if exists set_account_updated_at on public.accounts;
create trigger set_account_updated_at
before update on public.accounts
for each row execute function private.set_updated_at();

drop trigger if exists set_karaoke_entry_updated_at on public.karaoke_entries;
create trigger set_karaoke_entry_updated_at
before update on public.karaoke_entries
for each row execute function private.set_updated_at();

create or replace function private.create_account_session(p_account_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token text;
  v_expires_at timestamptz := pg_catalog.clock_timestamp() + interval '30 days';
begin
  delete from private.account_sessions as sessions
  where sessions.expires_at <= pg_catalog.clock_timestamp();

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.account_sessions (token_hash, account_id, expires_at)
  values (extensions.digest(v_token, 'sha256'), p_account_id, v_expires_at);

  return pg_catalog.jsonb_build_object(
    'session_token', v_token,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function private.account_id_for_session(p_session_token text)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select sessions.account_id
  into v_account_id
  from private.account_sessions as sessions
  where sessions.token_hash = extensions.digest(p_session_token, 'sha256')
    and sessions.expires_at > pg_catalog.now();

  return v_account_id;
end;
$$;

create or replace function public.register_account(p_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_normalized_name text;
  v_account public.accounts%rowtype;
  v_session jsonb;
begin
  v_name := pg_catalog.btrim(
    pg_catalog.regexp_replace(
      normalize(coalesce(p_name, ''), NFKC),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
  v_normalized_name := private.normalize_account_name(v_name);

  if pg_catalog.char_length(v_name) not between 1 and 40 then
    raise sqlstate 'PT400' using message = 'invalid_account_name';
  end if;

  if p_password is null
    or pg_catalog.char_length(p_password) < 6
    or pg_catalog.octet_length(p_password) > 72 then
    raise sqlstate 'PT400' using message = 'invalid_password_length';
  end if;

  begin
    insert into public.accounts (name, normalized_name, password_hash)
    values (
      v_name,
      v_normalized_name,
      extensions.crypt(p_password, extensions.gen_salt('bf', 12))
    )
    returning * into v_account;
  exception
    when unique_violation then
      raise sqlstate 'PT409' using message = 'account_name_taken';
  end;

  v_session := private.create_account_session(v_account.id);

  return v_session || pg_catalog.jsonb_build_object(
    'account', pg_catalog.jsonb_build_object(
      'id', v_account.id,
      'name', v_account.name,
      'created_at', v_account.created_at
    )
  );
end;
$$;

create or replace function public.login_account(p_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_name text := private.normalize_account_name(p_name);
  v_account public.accounts%rowtype;
  v_password_hash text;
  v_account_found boolean;
  v_password_matches boolean;
  v_session jsonb;
begin
  select accounts.*
  into v_account
  from public.accounts as accounts
  where accounts.normalized_name = v_normalized_name;

  v_account_found := found;

  if v_account_found then
    v_password_hash := v_account.password_hash;
  else
    select config.dummy_password_hash
    into v_password_hash
    from private.auth_config as config
    where config.singleton;
  end if;

  v_password_matches := extensions.crypt(
    coalesce(p_password, ''),
    v_password_hash
  ) = v_password_hash;

  if not v_account_found
    or p_password is null
    or pg_catalog.octet_length(p_password) > 72
    or not coalesce(v_password_matches, false) then
    raise sqlstate 'PT401' using message = 'invalid_name_or_password';
  end if;

  v_session := private.create_account_session(v_account.id);

  return v_session || pg_catalog.jsonb_build_object(
    'account', pg_catalog.jsonb_build_object(
      'id', v_account.id,
      'name', v_account.name,
      'created_at', v_account.created_at
    )
  );
end;
$$;

create or replace function public.logout_account(p_session_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_session_token ~ '^[0-9a-f]{64}$' then
    delete from private.account_sessions as sessions
    where sessions.token_hash = extensions.digest(p_session_token, 'sha256');
  end if;

  return true;
end;
$$;

create or replace function public.get_current_account(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := private.account_id_for_session(p_session_token);
  v_account jsonb;
begin
  if v_account_id is null then
    return null;
  end if;

  select pg_catalog.jsonb_build_object(
    'id', accounts.id,
    'name', accounts.name,
    'created_at', accounts.created_at
  )
  into v_account
  from public.accounts as accounts
  where accounts.id = v_account_id;

  return v_account;
end;
$$;

drop function if exists public.list_karaoke_entries(text);

create function public.list_karaoke_entries(p_session_token text)
returns table (
  id uuid,
  karaoke_number text,
  song_title text,
  singer text,
  created_at timestamptz,
  updated_at timestamptz,
  sing_count bigint,
  last_sung_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := private.account_id_for_session(p_session_token);
begin
  if v_account_id is null then
    raise sqlstate 'PT401' using message = 'invalid_or_expired_session';
  end if;

  return query
  select
    entries.id,
    entries.karaoke_number,
    entries.song_title,
    entries.singer,
    entries.created_at,
    entries.updated_at,
    (
      select pg_catalog.count(*)
      from public.karaoke_sings as sings
      where sings.entry_id = entries.id
        and sings.account_id = v_account_id
    ) as sing_count,
    (
      select pg_catalog.max(sings.sung_at)
      from public.karaoke_sings as sings
      where sings.entry_id = entries.id
        and sings.account_id = v_account_id
    ) as last_sung_at
  from public.karaoke_entries as entries
  where entries.account_id = v_account_id
  order by entries.created_at desc;
end;
$$;

create or replace function public.create_karaoke_entry(
  p_session_token text,
  p_karaoke_number text,
  p_song_title text,
  p_singer text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := private.account_id_for_session(p_session_token);
  v_number text := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_karaoke_number, ''), '[[:space:]]+', ' ', 'g')
  );
  v_song text := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_song_title, ''), '[[:space:]]+', ' ', 'g')
  );
  v_singer text := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_singer, ''), '[[:space:]]+', ' ', 'g')
  );
  v_entry public.karaoke_entries%rowtype;
begin
  if v_account_id is null then
    raise sqlstate 'PT401' using message = 'invalid_or_expired_session';
  end if;

  if pg_catalog.char_length(v_number) not between 1 and 24
    or pg_catalog.char_length(v_song) not between 1 and 120
    or pg_catalog.char_length(v_singer) not between 1 and 100 then
    raise sqlstate 'PT400' using message = 'invalid_karaoke_entry';
  end if;

  insert into public.karaoke_entries (account_id, karaoke_number, song_title, singer)
  values (v_account_id, v_number, v_song, v_singer)
  returning * into v_entry;

  return pg_catalog.jsonb_build_object(
    'id', v_entry.id,
    'karaoke_number', v_entry.karaoke_number,
    'song_title', v_entry.song_title,
    'singer', v_entry.singer,
    'created_at', v_entry.created_at,
    'updated_at', v_entry.updated_at,
    'sing_count', 0,
    'last_sung_at', null
  );
end;
$$;

create or replace function public.update_karaoke_entry(
  p_session_token text,
  p_entry_id uuid,
  p_karaoke_number text,
  p_song_title text,
  p_singer text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := private.account_id_for_session(p_session_token);
  v_number text := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_karaoke_number, ''), '[[:space:]]+', ' ', 'g')
  );
  v_song text := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_song_title, ''), '[[:space:]]+', ' ', 'g')
  );
  v_singer text := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_singer, ''), '[[:space:]]+', ' ', 'g')
  );
  v_entry public.karaoke_entries%rowtype;
begin
  if v_account_id is null then
    raise sqlstate 'PT401' using message = 'invalid_or_expired_session';
  end if;

  if p_entry_id is null
    or pg_catalog.char_length(v_number) not between 1 and 24
    or pg_catalog.char_length(v_song) not between 1 and 120
    or pg_catalog.char_length(v_singer) not between 1 and 100 then
    raise sqlstate 'PT400' using message = 'invalid_karaoke_entry';
  end if;

  update public.karaoke_entries as entries
  set karaoke_number = v_number,
      song_title = v_song,
      singer = v_singer
  where entries.id = p_entry_id
    and entries.account_id = v_account_id
  returning entries.* into v_entry;

  if not found then
    raise sqlstate 'PT404' using message = 'karaoke_entry_not_found';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_entry.id,
    'karaoke_number', v_entry.karaoke_number,
    'song_title', v_entry.song_title,
    'singer', v_entry.singer,
    'created_at', v_entry.created_at,
    'updated_at', v_entry.updated_at,
    'sing_count', (
      select pg_catalog.count(*)
      from public.karaoke_sings as sings
      where sings.entry_id = v_entry.id
        and sings.account_id = v_account_id
    ),
    'last_sung_at', (
      select pg_catalog.max(sings.sung_at)
      from public.karaoke_sings as sings
      where sings.entry_id = v_entry.id
        and sings.account_id = v_account_id
    )
  );
end;
$$;

create or replace function public.record_karaoke_sing(
  p_session_token text,
  p_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := private.account_id_for_session(p_session_token);
  v_entry public.karaoke_entries%rowtype;
begin
  if v_account_id is null then
    raise sqlstate 'PT401' using message = 'invalid_or_expired_session';
  end if;

  select entries.*
  into v_entry
  from public.karaoke_entries as entries
  where entries.id = p_entry_id
    and entries.account_id = v_account_id;

  if not found then
    raise sqlstate 'PT404' using message = 'karaoke_entry_not_found';
  end if;

  insert into public.karaoke_sings (account_id, entry_id)
  values (v_account_id, v_entry.id);

  return pg_catalog.jsonb_build_object(
    'id', v_entry.id,
    'karaoke_number', v_entry.karaoke_number,
    'song_title', v_entry.song_title,
    'singer', v_entry.singer,
    'created_at', v_entry.created_at,
    'updated_at', v_entry.updated_at,
    'sing_count', (
      select pg_catalog.count(*)
      from public.karaoke_sings as sings
      where sings.entry_id = v_entry.id
        and sings.account_id = v_account_id
    ),
    'last_sung_at', (
      select pg_catalog.max(sings.sung_at)
      from public.karaoke_sings as sings
      where sings.entry_id = v_entry.id
        and sings.account_id = v_account_id
    )
  );
end;
$$;

create or replace function public.delete_karaoke_entry(
  p_session_token text,
  p_entry_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := private.account_id_for_session(p_session_token);
begin
  if v_account_id is null then
    raise sqlstate 'PT401' using message = 'invalid_or_expired_session';
  end if;

  delete from public.karaoke_entries as entries
  where entries.id = p_entry_id
    and entries.account_id = v_account_id;

  if not found then
    raise sqlstate 'PT404' using message = 'karaoke_entry_not_found';
  end if;

  return true;
end;
$$;

alter function private.normalize_account_name(text) owner to karaoke_api;
alter function private.set_updated_at() owner to karaoke_api;
alter function private.create_account_session(uuid) owner to karaoke_api;
alter function private.account_id_for_session(text) owner to karaoke_api;
alter function public.register_account(text, text) owner to karaoke_api;
alter function public.login_account(text, text) owner to karaoke_api;
alter function public.logout_account(text) owner to karaoke_api;
alter function public.get_current_account(text) owner to karaoke_api;
alter function public.list_karaoke_entries(text) owner to karaoke_api;
alter function public.create_karaoke_entry(text, text, text, text) owner to karaoke_api;
alter function public.update_karaoke_entry(text, uuid, text, text, text) owner to karaoke_api;
alter function public.delete_karaoke_entry(text, uuid) owner to karaoke_api;
alter function public.record_karaoke_sing(text, uuid) owner to karaoke_api;

revoke all on function private.normalize_account_name(text) from public, anon, authenticated, service_role;
revoke all on function private.set_updated_at() from public, anon, authenticated, service_role;
revoke all on function private.create_account_session(uuid) from public, anon, authenticated, service_role;
revoke all on function private.account_id_for_session(text) from public, anon, authenticated, service_role;
revoke all on function public.register_account(text, text) from public, anon, authenticated, service_role;
revoke all on function public.login_account(text, text) from public, anon, authenticated, service_role;
revoke all on function public.logout_account(text) from public, anon, authenticated, service_role;
revoke all on function public.get_current_account(text) from public, anon, authenticated, service_role;
revoke all on function public.list_karaoke_entries(text) from public, anon, authenticated, service_role;
revoke all on function public.create_karaoke_entry(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_karaoke_entry(text, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_karaoke_entry(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_karaoke_sing(text, uuid) from public, anon, authenticated, service_role;

grant execute on function public.register_account(text, text) to anon;
grant execute on function public.login_account(text, text) to anon;
grant execute on function public.logout_account(text) to anon;
grant execute on function public.get_current_account(text) to anon;
grant execute on function public.list_karaoke_entries(text) to anon;
grant execute on function public.create_karaoke_entry(text, text, text, text) to anon;
grant execute on function public.update_karaoke_entry(text, uuid, text, text, text) to anon;
grant execute on function public.delete_karaoke_entry(text, uuid) to anon;
grant execute on function public.record_karaoke_sing(text, uuid) to anon;

revoke create on schema private from karaoke_api;
revoke create on schema public from karaoke_api;

notify pgrst, 'reload schema';

commit;
