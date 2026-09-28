-- Run this file once in the Supabase SQL Editor for the karaokeHub project.

create table if not exists public.karaoke_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  karaoke_number text not null,
  song_title text not null,
  singer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint karaoke_number_length check (char_length(btrim(karaoke_number)) between 1 and 24),
  constraint song_title_length check (char_length(btrim(song_title)) between 1 and 120),
  constraint singer_length check (char_length(btrim(singer)) between 1 and 100)
);

create index if not exists karaoke_entries_owner_created_idx
  on public.karaoke_entries (owner_id, created_at desc);

create or replace function public.set_karaoke_entry_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_karaoke_entry_updated_at on public.karaoke_entries;
create trigger set_karaoke_entry_updated_at
before update on public.karaoke_entries
for each row
execute function public.set_karaoke_entry_updated_at();

alter table public.karaoke_entries enable row level security;

revoke all on table public.karaoke_entries from anon;
grant select, insert, update, delete on table public.karaoke_entries to authenticated;

drop policy if exists "Users can read their karaoke entries" on public.karaoke_entries;
create policy "Users can read their karaoke entries"
on public.karaoke_entries
for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Users can create their karaoke entries" on public.karaoke_entries;
create policy "Users can create their karaoke entries"
on public.karaoke_entries
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can update their karaoke entries" on public.karaoke_entries;
create policy "Users can update their karaoke entries"
on public.karaoke_entries
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can delete their karaoke entries" on public.karaoke_entries;
create policy "Users can delete their karaoke entries"
on public.karaoke_entries
for delete
to authenticated
using ((select auth.uid()) = owner_id);
