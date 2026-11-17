-- New mapping records only; existing blocks and jobs are preserved.
create or replace function public.training_accept_programme(p_version jsonb,p_rounds integer) returns uuid language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); block uuid:=(p_version->>'blockId')::uuid; version uuid:=(p_version->>'id')::uuid; n integer:=jsonb_array_length(p_version->'days');
begin
 if owner_id is null or not exists(select 1 from public.training_members where user_id=owner_id) then raise exception 'Training account not authorised';end if;
 if p_rounds not between 1 and 52 or n not between 1 and 100 then raise exception 'Invalid sequence or round count';end if;
 insert into public.training_blocks(id,user_id,title,sequence_length,round_count) values(block,owner_id,p_version->>'title',n,p_rounds) on conflict(id) do nothing;
 insert into public.training_versions(id,user_id,block_id,digest,prescription) values(version,owner_id,block,p_version->>'digest',p_version);
 update public.training_blocks set title=p_version->>'title',sequence_length=n,round_count=p_rounds,active_version_id=version where id=block and user_id=owner_id;
 if p_version->'source' is not null and p_version->'source'<>'null'::jsonb then
  insert into public.training_source_mappings(user_id,block_id,round_number,mapping) values(owner_id,block,coalesce((p_version->'source'->>'round')::integer,1),p_version->'source');
 end if;
 return version;
end $$;
