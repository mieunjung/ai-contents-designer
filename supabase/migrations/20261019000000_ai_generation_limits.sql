create table if not exists public.ai_generation_usage (
  usage_date date not null,
  bucket text not null check (bucket in ('global', 'client')),
  bucket_key text not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (usage_date, bucket, bucket_key)
);

alter table public.ai_generation_usage enable row level security;
revoke all on table public.ai_generation_usage from public, anon, authenticated;
grant all on table public.ai_generation_usage to service_role;

create or replace function public.consume_ai_generation_quota(p_client_hash text)
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

  delete from public.ai_generation_usage
  where usage_date < v_day - 7;

  select request_count into v_global_count
  from public.ai_generation_usage
  where usage_date = v_day and bucket = 'global' and bucket_key = 'all';

  if coalesce(v_global_count, 0) >= 100 then
    return 'daily_limit';
  end if;

  select request_count into v_client_count
  from public.ai_generation_usage
  where usage_date = v_day and bucket = 'client' and bucket_key = p_client_hash;

  if coalesce(v_client_count, 0) >= 8 then
    return 'client_limit';
  end if;

  insert into public.ai_generation_usage (usage_date, bucket, bucket_key, request_count)
  values
    (v_day, 'global', 'all', 1),
    (v_day, 'client', p_client_hash, 1)
  on conflict (usage_date, bucket, bucket_key)
  do update set request_count = public.ai_generation_usage.request_count + 1;

  return 'ok';
end;
$$;

revoke all on function public.consume_ai_generation_quota(text) from public, anon, authenticated;
grant execute on function public.consume_ai_generation_quota(text) to service_role;
