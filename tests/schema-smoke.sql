-- Run as a database administrator against a development copy. All test rows roll back.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.training_members limit 1),true);
set local role authenticated;
do $$
declare b uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 day jsonb:='{"id":"smoke-day","day":1,"title":"Smoke test","sport":"strength","exercises":[]}'::jsonb;
 p jsonb; result integer;
begin
 perform public.training_accept_programme(jsonb_build_object('id',v,'blockId',b,'title','Verification only','digest','test','origin','manual','acceptedAt',now(),'days',jsonb_build_array(day)),2);
 p:=jsonb_build_object('id',sid,'blockId',b,'versionId',v,'round',1,'dayId','smoke-day','day',1,'title','Smoke test','sport','strength','status','inProgress','startedAt',now(),'trainingDate','2026-11-17','timezone','Europe/Dublin','prescription',day,'exercises','[]'::jsonb,'revision',1);
 result:=public.training_apply_session(op,0,p); if result<>1 then raise exception 'Initial sync failed';end if;
 result:=public.training_apply_session(op,0,p); if result<>1 then raise exception 'Idempotency failed';end if;
 begin perform public.training_apply_session(gen_random_uuid(),0,p);raise exception 'Stale version accepted';exception when serialization_failure then null;end;
 begin perform public.training_apply_session(gen_random_uuid(),1,jsonb_set(jsonb_set(p,'{revision}','2'),'{prescription,title}','"changed"'));raise exception 'Frozen prescription modified';exception when raise_exception then if sqlerrm<>'Started prescription and identity are frozen' then raise;end if;end;
 begin perform public.training_apply_session(gen_random_uuid(),1,jsonb_set(jsonb_set(p,'{revision}','2'),'{sessionRpe}','8'));raise exception 'RPE 8 accepted';exception when check_violation then null;end;
 p:=jsonb_set(jsonb_set(p,'{id}',to_jsonb(gen_random_uuid()::text)),'{round}','2');perform public.training_apply_session(gen_random_uuid(),0,p);
 if (select count(*) from public.training_sessions where block_id=b)<>2 then raise exception 'Repeated session overwrote history';end if;
end $$;
rollback;

begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.training_members)<>0 or (select count(*) from public.training_candidates)<>0 or (select count(*) from public.training_sessions)<>0 then raise exception 'Unauthorised data exposure';end if;
end $$;
rollback;
