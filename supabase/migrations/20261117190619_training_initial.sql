-- Training is isolated from other applications by names, ownership and membership.
create table public.training_members (user_id uuid primary key references auth.users(id), created_at timestamptz not null default now());
alter table public.training_members enable row level security;
grant select on public.training_members to authenticated;
create policy training_member_self on public.training_members for select to authenticated using (user_id=(select auth.uid()));

create table public.training_blocks (
 id uuid primary key, user_id uuid not null references public.training_members(user_id), title text not null,
 sequence_length integer not null check(sequence_length between 1 and 100), round_count integer not null check(round_count between 1 and 52),
 active_version_id uuid, archived boolean not null default false, created_at timestamptz not null default now(), unique(id,user_id)
);
create table public.training_versions (
 id uuid primary key, user_id uuid not null references public.training_members(user_id), block_id uuid not null,
 digest text not null, prescription jsonb not null, created_at timestamptz not null default now(),
 foreign key(block_id,user_id) references public.training_blocks(id,user_id), unique(id,user_id), unique(id,block_id,user_id)
);
alter table public.training_blocks add constraint training_active_version foreign key(active_version_id,id,user_id) references public.training_versions(id,block_id,user_id) deferrable initially deferred;
create table public.training_rounds (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.training_members(user_id), block_id uuid not null,
 round_number integer not null check(round_number between 1 and 52), created_at timestamptz not null default now(),
 foreign key(block_id,user_id) references public.training_blocks(id,user_id), unique(block_id,round_number,user_id)
);
create table public.training_sessions (
 id uuid primary key, user_id uuid not null references public.training_members(user_id), block_id uuid not null, version_id uuid not null,
 round_number integer not null, day_id text not null, status text not null check(status in ('inProgress','completed','skipped')),
 scheduled_date date, training_date date not null, timezone text not null, started_at timestamptz not null, finished_at timestamptz,
 session_rpe integer check(session_rpe between 1 and 7), revision integer not null check(revision>0), payload jsonb not null,
 updated_at timestamptz not null default now(),
 foreign key(version_id,block_id,user_id) references public.training_versions(id,block_id,user_id),
 foreign key(block_id,round_number,user_id) references public.training_rounds(block_id,round_number,user_id), unique(id,user_id)
);
create table public.training_operations (
 id uuid primary key, user_id uuid not null references public.training_members(user_id), session_id uuid not null,
 applied_revision integer not null, created_at timestamptz not null default now(), foreign key(session_id,user_id) references public.training_sessions(id,user_id)
);
create table public.training_media (
 id uuid primary key, user_id uuid not null references public.training_members(user_id), session_id uuid not null, set_id uuid not null,
 object_path text not null unique, mime_type text not null check(mime_type in ('video/mp4','video/quicktime','video/mov','video/webm')),
 bytes bigint not null check(bytes>0 and bytes<=52428800), status text not null check(status in ('pending','uploaded')),
 created_at timestamptz not null default now(), foreign key(session_id,user_id) references public.training_sessions(id,user_id), unique(id,user_id),
 check(split_part(object_path,'/',1)=user_id::text and split_part(object_path,'/',2)=session_id::text and split_part(object_path,'/',3)=set_id::text)
);
create table public.training_shares (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.training_members(user_id),
 token_hash text not null unique check(length(token_hash)=64), session_id uuid not null, media_ids uuid[] not null,
 revoked_at timestamptz, expires_at timestamptz, created_at timestamptz not null default now(),
 foreign key(session_id,user_id) references public.training_sessions(id,user_id)
);
create table public.training_candidates (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.training_members(user_id), sheet_id bigint not null,
 prescription jsonb not null, captured_at timestamptz not null default now()
);
create table public.training_source_mappings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.training_members(user_id), block_id uuid not null,
 round_number integer not null, mapping jsonb not null, verified boolean not null default false, writeback_enabled boolean not null default false,
 created_at timestamptz not null default now(), foreign key(block_id,user_id) references public.training_blocks(id,user_id), unique(id,user_id)
);
create table public.training_sync_jobs (
 id uuid primary key, user_id uuid not null references public.training_members(user_id), session_id uuid not null, mapping_id uuid not null,
 idempotency_key text not null unique, ordinal bigint generated always as identity, payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','completed','held')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(), lease_until timestamptz, error text,
 created_at timestamptz not null default now(), foreign key(session_id,user_id) references public.training_sessions(id,user_id),
 foreign key(mapping_id,user_id) references public.training_source_mappings(id,user_id)
);
create table public.training_external_activities (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.training_members(user_id), provider text not null check(provider in ('garmin','file')),
 external_id text not null, activity jsonb not null, matched_session_id uuid, dismissed boolean not null default false,
 created_at timestamptz not null default now(), foreign key(matched_session_id,user_id) references public.training_sessions(id,user_id), unique(user_id,provider,external_id)
);

do $$ declare t text; begin
 foreach t in array array['training_blocks','training_versions','training_rounds','training_sessions','training_operations','training_media','training_shares','training_candidates','training_source_mappings','training_sync_jobs','training_external_activities'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy training_owner_read on public.%I for select to authenticated using (user_id=(select auth.uid()) and exists(select 1 from public.training_members where user_id=(select auth.uid())))',t);
 end loop;
end $$;
-- Invoker RPCs need table permissions. RLS remains the authority on every mutation.
do $$ declare t text; begin
 foreach t in array array['training_blocks','training_rounds','training_sessions','training_operations','training_versions','training_media','training_shares','training_external_activities'] loop
   execute format('grant insert on public.%I to authenticated',t);
   execute format('create policy training_owner_insert on public.%I for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.training_members where user_id=(select auth.uid())))',t);
 end loop;
 foreach t in array array['training_blocks','training_sessions','training_media','training_shares','training_external_activities'] loop
   execute format('grant update on public.%I to authenticated',t);
   execute format('create policy training_owner_update on public.%I for update to authenticated using (user_id=(select auth.uid()) and exists(select 1 from public.training_members where user_id=(select auth.uid()))) with check (user_id=(select auth.uid()) and exists(select 1 from public.training_members where user_id=(select auth.uid())))',t);
 end loop;
end $$;
-- Version rows and operation receipts cannot be updated or deleted by clients.
create function public.training_immutable_version() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Accepted prescription versions are immutable'; end $$;
create trigger training_version_immutable before update or delete on public.training_versions for each row execute function public.training_immutable_version();
revoke all on function public.training_immutable_version() from public,anon,authenticated;

create function public.training_check_session() returns trigger language plpgsql set search_path='' as $$
declare e jsonb; s jsonb;
begin
 if tg_op='UPDATE' then
  if new.user_id<>old.user_id or new.block_id<>old.block_id or new.version_id<>old.version_id or new.round_number<>old.round_number or new.day_id<>old.day_id or new.started_at<>old.started_at or new.payload->'prescription' is distinct from old.payload->'prescription' then raise exception 'Started prescription and identity are frozen'; end if;
  if new.revision<>old.revision+1 then raise exception using errcode='40001',message='Session version conflict'; end if;
 end if;
 if new.payload->>'id'<>new.id::text or (new.payload->>'revision')::integer<>new.revision then raise exception 'Invalid session identity'; end if;
 if length(new.payload::text)>500000 then raise exception 'Session too large'; end if;
 for e in select value from jsonb_array_elements(new.payload->'exercises') loop
  for s in select value from jsonb_array_elements(e->'sets') loop
   if s->>'rpe' is not null and ((s->>'rpe')::numeric<1 or (s->>'rpe')::numeric>10) then raise exception 'Set RPE must be 1-10';end if;
   if (s->>'load')::numeric<0 or (s->>'reps')::numeric<0 then raise exception 'Training values must be non-negative';end if;
  end loop;
 end loop;
 return new;
end $$;
create trigger training_session_check before insert or update on public.training_sessions for each row execute function public.training_check_session();
revoke all on function public.training_check_session() from public,anon,authenticated;

create function public.training_accept_programme(p_version jsonb,p_rounds integer) returns uuid language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); block uuid:=(p_version->>'blockId')::uuid; version uuid:=(p_version->>'id')::uuid; n integer:=jsonb_array_length(p_version->'days');
begin
 if owner_id is null or not exists(select 1 from public.training_members where user_id=owner_id) then raise exception 'Training account not authorised';end if;
 if p_rounds not between 1 and 52 or n not between 1 and 100 then raise exception 'Invalid sequence or round count';end if;
 insert into public.training_blocks(id,user_id,title,sequence_length,round_count) values(block,owner_id,p_version->>'title',n,p_rounds) on conflict(id) do nothing;
 insert into public.training_versions(id,user_id,block_id,digest,prescription) values(version,owner_id,block,p_version->>'digest',p_version);
 update public.training_blocks set title=p_version->>'title',sequence_length=n,round_count=p_rounds,active_version_id=version where id=block and user_id=owner_id;
 return version;
end $$;
revoke all on function public.training_accept_programme(jsonb,integer) from public,anon;
grant execute on function public.training_accept_programme(jsonb,integer) to authenticated;

create function public.training_apply_session(p_operation uuid,p_expected integer,p_session jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); session_id uuid:=(p_session->>'id')::uuid; block uuid:=(p_session->>'blockId')::uuid; version uuid:=(p_session->>'versionId')::uuid; current_revision integer; result_revision integer; frozen jsonb;
begin
 if owner_id is null or not exists(select 1 from public.training_members where user_id=owner_id) then raise exception 'Training account not authorised';end if;
 perform pg_advisory_xact_lock(hashtextextended(session_id::text,0));
 select applied_revision into result_revision from public.training_operations where id=p_operation and user_id=owner_id;
 if found then return result_revision;end if;
 select revision into current_revision from public.training_sessions where id=session_id and user_id=owner_id for update;
 if coalesce(current_revision,0)<>p_expected then raise exception using errcode='40001',message='Session version conflict';end if;
 if (p_session->>'revision')::integer<>p_expected+1 then raise exception 'Invalid operation revision';end if;
 if not exists(select 1 from public.training_blocks where id=block and user_id=owner_id) and (p_session->>'day')::integer=0 then
  insert into public.training_blocks(id,user_id,title,sequence_length,round_count,archived) values(block,owner_id,'Other training',1,1,true);
  insert into public.training_versions(id,user_id,block_id,digest,prescription) values(version,owner_id,block,'manual',jsonb_build_object('id',version,'blockId',block,'title','Other training','acceptedAt',now(),'digest','manual','origin','manual','days',jsonb_build_array(p_session->'prescription')));
 end if;
 if p_expected=0 then
  select prescription into frozen from public.training_versions where id=version and user_id=owner_id;
  if frozen is null or not exists(select 1 from jsonb_array_elements(frozen->'days') d where d=p_session->'prescription') then raise exception 'Prescription does not match accepted version';end if;
 end if;
 insert into public.training_rounds(user_id,block_id,round_number) values(owner_id,block,(p_session->>'round')::integer) on conflict(block_id,round_number,user_id) do nothing;
 insert into public.training_sessions(id,user_id,block_id,version_id,round_number,day_id,status,scheduled_date,training_date,timezone,started_at,finished_at,session_rpe,revision,payload)
 values(session_id,owner_id,block,version,(p_session->>'round')::integer,p_session->>'dayId',p_session->>'status',nullif(p_session->>'scheduledDate','')::date,(p_session->>'trainingDate')::date,p_session->>'timezone',(p_session->>'startedAt')::timestamptz,(p_session->>'finishedAt')::timestamptz,(p_session->>'sessionRpe')::integer,p_expected+1,p_session)
 on conflict(id) do update set status=excluded.status,scheduled_date=excluded.scheduled_date,training_date=excluded.training_date,finished_at=excluded.finished_at,session_rpe=excluded.session_rpe,revision=excluded.revision,payload=excluded.payload,updated_at=now();
 insert into public.training_operations(id,user_id,session_id,applied_revision) values(p_operation,owner_id,session_id,p_expected+1);
 return p_expected+1;
end $$;
revoke all on function public.training_apply_session(uuid,integer,jsonb) from public,anon;
grant execute on function public.training_apply_session(uuid,integer,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('training-videos','training-videos',false,52428800,array['video/mp4','video/quicktime','video/mov','video/webm']);
create policy training_video_read on storage.objects for select to authenticated using(bucket_id='training-videos' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.training_members where user_id=(select auth.uid())));
create policy training_video_insert on storage.objects for insert to authenticated with check(bucket_id='training-videos' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.training_media m where m.object_path=name and m.user_id=(select auth.uid())));
-- Files are append-only. Resumable retries target the original upload; replacement needs a fresh object ID.
create index training_sessions_owner_date on public.training_sessions(user_id,training_date desc);
create index training_versions_block on public.training_versions(block_id,user_id);
create index training_media_session on public.training_media(session_id,user_id);
create index training_jobs_due on public.training_sync_jobs(status,next_attempt_at,ordinal);
create index training_activities_match on public.training_external_activities(matched_session_id,user_id);
