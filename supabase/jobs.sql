grant insert on public.training_candidates to authenticated;
create policy training_candidate_insert on public.training_candidates for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.training_members where user_id=(select auth.uid())));
grant insert on public.training_source_mappings to authenticated;
create policy training_unverified_mapping_insert on public.training_source_mappings for insert to authenticated with check(user_id=(select auth.uid()) and not verified and not writeback_enabled and exists(select 1 from public.training_members where user_id=(select auth.uid())));
-- Only a backend administrator can mark a mapping as verified and enable writes.
create function public.training_claim_sheet_jobs(p_limit integer default 3) returns setof public.training_sync_jobs language sql security invoker set search_path='' as $$
 with candidates as (
  select j.id from public.training_sync_jobs j
  where (j.status='pending' or (j.status='processing' and j.lease_until<now())) and j.next_attempt_at<=now()
  and not exists(select 1 from public.training_sync_jobs earlier where earlier.mapping_id=j.mapping_id and earlier.ordinal<j.ordinal and earlier.status<>'completed')
  order by j.ordinal for update skip locked limit least(greatest(p_limit,1),5)
 ) update public.training_sync_jobs j set status='processing',lease_until=now()+interval '5 minutes' from candidates c where j.id=c.id returning j.*;
$$;
revoke all on function public.training_claim_sheet_jobs(integer) from public,anon,authenticated;
grant execute on function public.training_claim_sheet_jobs(integer) to service_role;
