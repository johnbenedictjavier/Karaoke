create temporary table auth_test_context (
  key text primary key,
  value text not null
);

grant select, insert, update, delete on table auth_test_context to anon;

set role anon;

insert into auth_test_context (key, value)
select 'alice_token', result ->> 'session_token'
from (select public.register_account('Alice Singer', 'correct horse battery') as result) as registration;

insert into auth_test_context (key, value)
select 'bob_token', result ->> 'session_token'
from (select public.register_account('Bob Singer', 'another secure password') as result) as registration;

insert into auth_test_context (key, value)
select 'alice_entry_id', result ->> 'id'
from (
  select public.create_karaoke_entry(
    (select value from auth_test_context where key = 'alice_token'),
    '0012',
    'Dancing Queen',
    'ABBA'
  ) as result
  ) as created_entry;

select public.record_karaoke_sing(
  (select value from auth_test_context where key = 'alice_token'),
  (select value::uuid from auth_test_context where key = 'alice_entry_id')
);

select public.record_karaoke_sing(
  (select value from auth_test_context where key = 'alice_token'),
  (select value::uuid from auth_test_context where key = 'alice_entry_id')
);

do $integration_test$
declare
  v_alice_token text := (select value from auth_test_context where key = 'alice_token');
  v_bob_token text := (select value from auth_test_context where key = 'bob_token');
  v_alice_entry_id uuid := (select value::uuid from auth_test_context where key = 'alice_entry_id');
begin
  if pg_catalog.char_length(v_alice_token) <> 64 then
    raise exception 'Registration did not return a 64-character token';
  end if;

  if public.get_current_account(v_alice_token) ->> 'name' <> 'Alice Singer' then
    raise exception 'Session did not resolve the correct account';
  end if;

  if (select pg_catalog.count(*) from public.list_karaoke_entries(v_alice_token)) <> 1 then
    raise exception 'Alice should see exactly one entry';
  end if;

  if (select sing_count from public.list_karaoke_entries(v_alice_token)) <> 2 then
    raise exception 'Alice should have two recorded sings';
  end if;

  if (select pg_catalog.count(*) from public.list_karaoke_entries(v_bob_token)) <> 0 then
    raise exception 'Bob can see another account playlist';
  end if;

  begin
    perform public.update_karaoke_entry(
      v_bob_token,
      v_alice_entry_id,
      '0013',
      'Changed',
      'Wrong account'
    );
    raise exception 'Cross-account update unexpectedly succeeded';
  exception
    when sqlstate 'PT404' then null;
  end;

  begin
    perform public.record_karaoke_sing(v_bob_token, v_alice_entry_id);
    raise exception 'Cross-account sing unexpectedly succeeded';
  exception
    when sqlstate 'PT404' then null;
  end;

  if public.update_karaoke_entry(
    v_alice_token,
    v_alice_entry_id,
    '0013',
    'Dancing Queen (Live)',
    'ABBA'
  ) ->> 'song_title' <> 'Dancing Queen (Live)' then
    raise exception 'Same-account update failed';
  end if;

  begin
    perform public.login_account('Alice Singer', 'wrong password');
    raise exception 'Invalid password unexpectedly succeeded';
  exception
    when sqlstate 'PT401' then null;
  end;

  begin
    perform public.register_account('  ALICE   SINGER ', 'different password');
    raise exception 'Duplicate normalized account unexpectedly succeeded';
  exception
    when sqlstate 'PT409' then null;
  end;

  begin
    perform 1 from public.accounts;
    raise exception 'Anon direct account access unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  perform public.logout_account(v_alice_token);
  if public.get_current_account(v_alice_token) is not null then
    raise exception 'Logged-out token remains valid';
  end if;

  if public.login_account('alice singer', 'correct horse battery') ->> 'session_token' is null then
    raise exception 'Valid case-insensitive login failed';
  end if;

  if not public.delete_karaoke_entry(v_bob_token, (
    select (public.create_karaoke_entry(v_bob_token, '88', 'One More Song', 'Bob')) ->> 'id'
  )::uuid) then
    raise exception 'Same-account delete failed';
  end if;
end
$integration_test$;

reset role;

do $legacy_archive_test$
begin
  if not exists (
    select 1
    from private.legacy_karaoke_entries
    where id = '00000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'The original playlist row was not archived';
  end if;
end
$legacy_archive_test$;

do $security_test$
declare
  v_role text;
  v_table text;
  v_privilege text;
begin
  if exists (
    select 1
    from public.accounts
    where password_hash in ('correct horse battery', 'another secure password')
  ) then
    raise exception 'A plaintext password was stored';
  end if;

  if exists (
    select 1
    from public.accounts
    where password_hash !~ '^\$2a\$12\$[./A-Za-z0-9]{53}$'
  ) then
    raise exception 'An account has an unsupported password hash';
  end if;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_table in array array[
      'public.accounts',
      'public.karaoke_entries',
      'public.karaoke_sings',
      'private.auth_config',
      'private.account_sessions'
    ] loop
      foreach v_privilege in array array['select', 'insert', 'update', 'delete'] loop
        if pg_catalog.has_table_privilege(v_role, v_table, v_privilege) then
          raise exception '% has direct % access to %', v_role, v_privilege, v_table;
        end if;
      end loop;
    end loop;

    if pg_catalog.has_schema_privilege(v_role, 'private', 'usage') then
      raise exception '% has access to the private schema', v_role;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'karaoke_api'
      and not rolcanlogin
      and not rolinherit
      and not rolsuper
      and not rolcreatedb
      and not rolcreaterole
      and not rolreplication
      and not rolbypassrls
  ) then
    raise exception 'karaoke_api has unsafe role attributes';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('public', 'private')
       and relations.relname in ('accounts', 'karaoke_entries', 'karaoke_sings', 'auth_config', 'account_sessions')
      and not relations.relrowsecurity
  ) then
    raise exception 'A protected table does not have RLS enabled';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles as owners on owners.oid = functions.proowner
    where namespaces.nspname = 'public'
      and functions.proname in (
        'register_account',
        'login_account',
        'logout_account',
        'get_current_account',
        'list_karaoke_entries',
        'create_karaoke_entry',
        'update_karaoke_entry',
        'delete_karaoke_entry',
        'record_karaoke_sing'
      )
      and (owners.rolname <> 'karaoke_api' or not functions.prosecdef)
  ) then
    raise exception 'A public RPC has the wrong owner or security mode';
  end if;

  if not pg_catalog.has_function_privilege(
    'anon',
    'public.login_account(text,text)',
    'execute'
  ) then
    raise exception 'Anon cannot execute the login RPC';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.login_account(text,text)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'public.login_account(text,text)',
    'execute'
  ) then
    raise exception 'A non-anon client role can execute the login RPC';
  end if;
end
$security_test$;
