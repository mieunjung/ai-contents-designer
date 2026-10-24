insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scratch-projects',
  'scratch-projects',
  true,
  52428800,
  array['application/x.scratch.sb3']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category = 'game'),
  title text not null check (char_length(title) between 1 and 50),
  content text not null check (char_length(content) between 1 and 500),
  file_path text not null unique check (file_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sb3$'),
  created_at timestamptz not null default now()
);

alter table public.board_posts enable row level security;
revoke all on table public.board_posts from public, anon, authenticated;
grant select on table public.board_posts to anon, authenticated;

create policy "Anyone can read public board posts"
on public.board_posts
for select
to anon, authenticated
using (true);

create table public.scratch_upload_usage (
  usage_date date not null,
  bucket text not null check (bucket in ('global', 'client')),
  bucket_key text not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (usage_date, bucket, bucket_key)
);

alter table public.scratch_upload_usage enable row level security;
revoke all on table public.scratch_upload_usage from public, anon, authenticated;
grant all on table public.scratch_upload_usage to service_role;

create or replace function public.consume_scratch_upload_quota(p_client_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (pg_catalog.now() at time zone 'utc')::date;
  v_global_count integer;
  v_client_count integer;
begin
  if p_client_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid client hash';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_day::text));

  delete from public.scratch_upload_usage
  where usage_date < v_day - 7;

  select request_count into v_global_count
  from public.scratch_upload_usage
  where usage_date = v_day and bucket = 'global' and bucket_key = 'all';

  if coalesce(v_global_count, 0) >= 200 then
    return 'daily_limit';
  end if;

  select request_count into v_client_count
  from public.scratch_upload_usage
  where usage_date = v_day and bucket = 'client' and bucket_key = p_client_hash;

  if coalesce(v_client_count, 0) >= 10 then
    return 'client_limit';
  end if;

  insert into public.scratch_upload_usage (usage_date, bucket, bucket_key, request_count)
  values
    (v_day, 'global', 'all', 1),
    (v_day, 'client', p_client_hash, 1)
  on conflict (usage_date, bucket, bucket_key)
  do update set request_count = public.scratch_upload_usage.request_count + 1;

  return 'ok';
end;
$$;

revoke all on function public.consume_scratch_upload_quota(text) from public, anon, authenticated;
grant execute on function public.consume_scratch_upload_quota(text) to service_role;
