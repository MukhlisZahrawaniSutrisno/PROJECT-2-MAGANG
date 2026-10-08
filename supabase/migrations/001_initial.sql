begin;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create function public.normalize_query(value text) returns text language sql immutable strict set search_path='' as $$ select trim(regexp_replace(lower(value),'[^[:alnum:]]+',' ','g')) $$;
create table public.users(id uuid primary key references auth.users(id) on delete cascade,display_name text not null,email text not null,role text not null default 'employee' check(role in('employee','admin')),is_active boolean not null default false);
create table public.employees(id uuid primary key default gen_random_uuid(),user_id uuid unique references public.users(id) on delete set null,name text not null check(length(trim(name)) between 1 and 100),department text not null check(length(trim(department)) between 1 and 100),email text not null check(length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),chat_url text not null check(length(chat_url)<=2000 and chat_url ~ '^https?://[^/@[:space:]]+([/?#]|$)'),color text not null default '#2563eb' check(color ~ '^#[0-9a-fA-F]{6}$'),is_active boolean not null default true);
create table public.problems(id uuid primary key default gen_random_uuid(),title text not null check(length(trim(title)) between 1 and 200),description text not null check(length(trim(description)) between 1 and 3000),category text not null check(category in('IT & tools','Fasilitas','Keuangan','People Ops')),primary_pic_id uuid not null references public.employees(id),backup_pic_id uuid not null references public.employees(id),response_sla_minutes integer not null check(response_sla_minutes>0),resolution_sla_minutes integer not null check(resolution_sla_minutes>0),is_active boolean not null default true,check(primary_pic_id<>backup_pic_id),check(resolution_sla_minutes>=response_sla_minutes and resolution_sla_minutes<=525600));
create table public.problem_keywords(id uuid primary key default gen_random_uuid(),problem_id uuid not null references public.problems(id) on delete cascade,keyword text not null,normalized_keyword text generated always as(public.normalize_query(keyword)) stored,check(length(public.normalize_query(keyword)) between 1 and 200),unique(problem_id,normalized_keyword));
create table public.problem_links(id uuid primary key default gen_random_uuid(),problem_id uuid not null references public.problems(id) on delete cascade,kind text not null check(kind in('sop','form','ticket')),label text not null check(length(trim(label))>0),url text not null check(length(url)<=2000 and url ~ '^https?://[^/@[:space:]]+([/?#]|$)'));
create table public.unavailability(id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id),kind text not null check(kind in('leave','unavailable')),starts_at timestamptz not null,ends_at timestamptz not null,cancelled_at timestamptz,check(ends_at>starts_at),check(isfinite(starts_at) and isfinite(ends_at) and (cancelled_at is null or isfinite(cancelled_at))));
create table public.unmatched_queries(id uuid primary key default gen_random_uuid(),normalized_query text not null unique check(length(normalized_query) between 1 and 500),status text not null default 'open' check(status in('open','resolved','ignored')),note text not null default '' check(length(note)<=2000),resolved_problem_id uuid references public.problems(id),created_at timestamptz not null default now(),closed_at timestamptz,check((status='open' and closed_at is null and resolved_problem_id is null) or(status<>'open' and closed_at is not null)),check(status<>'resolved' or resolved_problem_id is not null));
create table public.search_logs(id uuid primary key,user_id uuid references public.users(id) on delete set null,query text not null,normalized_query text not null,searched_at timestamptz not null default now(),outcome text not null check(outcome in('matched','unmatched','error')),duration_ms integer not null default 0 check(duration_ms>=0),unmatched_query_id uuid references public.unmatched_queries(id) on delete restrict,check(length(normalized_query) between 1 and 500),check((outcome='unmatched')=(unmatched_query_id is not null)));
create table public.search_results(id uuid primary key default gen_random_uuid(),search_log_id uuid not null references public.search_logs(id) on delete cascade,problem_id uuid not null references public.problems(id),snapshot jsonb not null,rank integer not null check(rank>0),unique(search_log_id,problem_id),unique(search_log_id,rank));
-- Mutable records carry audit timestamps; search logs and result snapshots are immutable.
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at:=clock_timestamp(); return new; end $$;
do $$ declare tab text; begin foreach tab in array array['users','employees','problems','problem_keywords','problem_links','unavailability','unmatched_queries'] loop
 if tab<>'unmatched_queries' then execute format('alter table public.%I add column created_at timestamptz not null default now()',tab); end if;
 execute format('alter table public.%I add column updated_at timestamptz not null default now()',tab);
 execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',tab);
end loop; end $$;
create function public.require_json_fields(value jsonb,string_fields text[],boolean_fields text[] default '{}',number_fields text[] default '{}',nullable_fields text[] default '{}') returns void language plpgsql set search_path='' as $$
declare field text;
begin
 if jsonb_typeof(value) is distinct from 'object' then raise exception 'Objek JSON diperlukan' using errcode='22023'; end if;
 foreach field in array string_fields loop if jsonb_typeof(value->field) is distinct from 'string' then raise exception 'Field % wajib string',field using errcode='22023'; end if; end loop;
 foreach field in array boolean_fields loop if jsonb_typeof(value->field) is distinct from 'boolean' then raise exception 'Field % wajib boolean',field using errcode='22023'; end if; end loop;
 foreach field in array number_fields loop if jsonb_typeof(value->field) is distinct from 'number' then raise exception 'Field % wajib number',field using errcode='22023'; end if; end loop;
 foreach field in array nullable_fields loop if not(value ? field) or jsonb_typeof(value->field) not in('string','null') then raise exception 'Field % wajib string atau null',field using errcode='22023'; end if; end loop;
end $$;
revoke all on function public.touch_updated_at(),public.require_json_fields(jsonb,text[],text[],text[],text[]) from public,anon,authenticated;
create index keywords_trgm on public.problem_keywords using gin(normalized_keyword extensions.gin_trgm_ops);
create index problems_primary on public.problems(primary_pic_id);
create index problems_backup on public.problems(backup_pic_id);
create index links_problem on public.problem_links(problem_id);
create index availability_window on public.unavailability(employee_id,starts_at,ends_at) where cancelled_at is null;
create index logs_user_time on public.search_logs(user_id,searched_at desc);
create index logs_unmatched on public.search_logs(unmatched_query_id);
create index results_problem on public.search_results(problem_id);
create function public.is_active_user() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.users where id=auth.uid() and is_active) $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.users where id=auth.uid() and is_active and role='admin') $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.users(id,display_name,email) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'name',''),split_part(new.email,'@',1),'Karyawan'),coalesce(new.email,'')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
do $$ declare tab text; begin foreach tab in array array['users','employees','problems','problem_keywords','problem_links','unavailability','search_logs','search_results','unmatched_queries'] loop execute format('alter table public.%I enable row level security',tab); execute format('revoke all on public.%I from anon,authenticated',tab); execute format('grant select on public.%I to authenticated',tab); end loop; end $$;
create policy users_read on public.users for select to authenticated using(public.is_active_user() and(id=auth.uid() or public.is_admin()));
create policy employees_read on public.employees for select to authenticated using(public.is_active_user() and(is_active or public.is_admin()));
create policy problems_read on public.problems for select to authenticated using(public.is_active_user() and(is_active or public.is_admin()));
create policy keywords_read on public.problem_keywords for select to authenticated using(exists(select 1 from public.problems p where p.id=problem_id));
create policy links_read on public.problem_links for select to authenticated using(exists(select 1 from public.problems p where p.id=problem_id));
create policy availability_read on public.unavailability for select to authenticated using(public.is_admin());
create policy logs_read on public.search_logs for select to authenticated using(public.is_admin());
create policy results_read on public.search_results for select to authenticated using(public.is_admin());
create policy unmatched_read on public.unmatched_queries for select to authenticated using(public.is_admin());
create function public.employee_json(e public.employees) returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object('id',e.id,'name',e.name,'department',e.department,'email',e.email,'chatUrl',e.chat_url,'color',e.color,'isActive',e.is_active) $$;
create function public.problem_json(p public.problems) returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object('id',p.id,'title',p.title,'description',p.description,'category',p.category,'primaryPicId',p.primary_pic_id,'backupPicId',p.backup_pic_id,'responseSlaMinutes',p.response_sla_minutes,'resolutionSlaMinutes',p.resolution_sla_minutes,'isActive',p.is_active,'keywords',coalesce((select jsonb_agg(k.keyword order by k.keyword) from public.problem_keywords k where k.problem_id=p.id),'[]'::jsonb),'links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'label',l.label,'url',l.url) order by l.id) from public.problem_links l where l.problem_id=p.id),'[]'::jsonb)) $$;
create function public.search_log_json(l public.search_logs) returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object('id',l.id,'query',l.query,'normalizedQuery',l.normalized_query,'searchedAt',l.searched_at,'outcome',l.outcome,'durationMs',l.duration_ms,'unmatchedQueryId',l.unmatched_query_id,'results',coalesce((select jsonb_agg(r.snapshot order by r.rank) from public.search_results r where r.search_log_id=l.id),'[]'::jsonb)) $$;
create function public.app_data() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',1,
 'employees',coalesce((select jsonb_agg(public.employee_json(e) order by e.name) from public.employees e where e.is_active or public.is_admin() or exists(select 1 from public.problems p where p.is_active and e.id in(p.primary_pic_id,p.backup_pic_id))),'[]'::jsonb),
 'problems',coalesce((select jsonb_agg(public.problem_json(p) order by p.title) from public.problems p where p.is_active or public.is_admin()),'[]'::jsonb),
 'unavailability',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'employeeId',u.employee_id,'kind',u.kind,'startsAt',u.starts_at,'endsAt',u.ends_at,'cancelledAt',u.cancelled_at) order by u.starts_at) from public.unavailability u where public.is_admin()),'[]'::jsonb),
 'searchLogs',coalesce((select jsonb_agg(public.search_log_json(l) order by l.searched_at desc) from public.search_logs l where public.is_admin()),'[]'::jsonb),
 'unmatchedQueries',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'normalizedQuery',u.normalized_query,'status',u.status,'note',u.note,'resolvedProblemId',u.resolved_problem_id,'createdAt',u.created_at,'closedAt',u.closed_at) order by u.created_at desc) from public.unmatched_queries u where public.is_admin()),'[]'::jsonb)) $$;
create function public.app_bootstrap() returns jsonb language plpgsql stable security definer set search_path='' as $$ declare u public.users; begin select * into u from public.users where id=auth.uid() and is_active; if not found then raise exception 'Akun tidak aktif' using errcode='42501'; end if; return jsonb_build_object('user',jsonb_build_object('id',u.id,'name',u.display_name,'email',u.email,'role',u.role),'data',public.app_data()); end $$;
create function public.search_problems(p_query text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q text; uid uuid:=auth.uid(); started timestamptz:=clock_timestamp(); searched timestamptz:=now(); old public.search_logs; logrow public.search_logs; unmatched_id uuid; matches integer:=0; rec record; primary_ok boolean; backup_ok boolean; snapshot jsonb;
begin
 if not public.is_active_user() then raise exception 'Akun tidak aktif' using errcode='42501'; end if;
 q:=public.normalize_query(p_query);
 if p_request_id is null or p_query is null or length(p_query)>500 or length(q)<1 then raise exception 'Query tidak valid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into old from public.search_logs where id=p_request_id;
 if found then if old.user_id is distinct from uid or old.normalized_query<>q then raise exception 'Request ID telah dipakai' using errcode='22023'; end if; return public.search_log_json(old); end if;
 insert into public.search_logs(id,user_id,query,normalized_query,outcome,searched_at) values(p_request_id,uid,trim(p_query),q,'matched',searched);
 for rec in
  with candidates as (
   select p.id,term.value,
    case when term.value=q then 1.0 when position(' '||q||' ' in ' '||term.value||' ')>0 or position(' '||term.value||' ' in ' '||q||' ')>0 then 0.85 else extensions.similarity(term.value,q)::numeric end score,
    case when term.value=q then 'exact' when position(' '||q||' ' in ' '||term.value||' ')>0 or position(' '||term.value||' ' in ' '||q||' ')>0 then 'phrase' else 'fuzzy' end method
   from public.problems p cross join lateral(select public.normalize_query(p.title) value union select k.normalized_keyword from public.problem_keywords k where k.problem_id=p.id) term where p.is_active
  ), ranked as(select *,row_number() over(partition by id order by score desc,method) rn from candidates where method in('exact','phrase') or(length(q)>=3 and score>=0.3))
  select p.id,r.score,r.method,public.problem_json(p) problem,
   public.employee_json(pr) primary_pic,public.employee_json(bk) backup_pic,
   pr.is_active and not exists(select 1 from public.unavailability a where a.employee_id=pr.id and a.cancelled_at is null and a.starts_at<=searched and a.ends_at>searched) primary_available,
   bk.is_active and not exists(select 1 from public.unavailability a where a.employee_id=bk.id and a.cancelled_at is null and a.starts_at<=searched and a.ends_at>searched) backup_available
  from ranked r join public.problems p on p.id=r.id join public.employees pr on pr.id=p.primary_pic_id join public.employees bk on bk.id=p.backup_pic_id
  where rn=1 order by score desc,p.title,p.id limit 20
 loop
  primary_ok:=rec.primary_available; backup_ok:=rec.backup_available;
  snapshot:=jsonb_build_object('problem',rec.problem,'primaryPic',rec.primary_pic,'backupPic',rec.backup_pic,
   'effectivePic',case when primary_ok then rec.primary_pic when backup_ok then rec.backup_pic else null end,
   'primaryAvailable',primary_ok,'backupAvailable',backup_ok,'routingStatus',case when primary_ok then 'primary' when backup_ok then 'backup' else 'unavailable' end,
   'matchScore',rec.score*100,'matchMethod',rec.method);
  matches:=matches+1;
  insert into public.search_results(search_log_id,problem_id,snapshot,rank) values(p_request_id,rec.id,snapshot,matches);
 end loop;
 if matches=0 then insert into public.unmatched_queries(normalized_query) values(q) on conflict(normalized_query) do update set status=case when unmatched_queries.status='resolved' then 'open' else unmatched_queries.status end,closed_at=case when unmatched_queries.status='resolved' then null else unmatched_queries.closed_at end,resolved_problem_id=case when unmatched_queries.status='resolved' then null else unmatched_queries.resolved_problem_id end returning id into unmatched_id; update public.search_logs set outcome='unmatched',unmatched_query_id=unmatched_id where id=p_request_id; end if;
 update public.search_logs set duration_ms=greatest(0,floor(extract(epoch from clock_timestamp()-started)*1000)::integer) where id=p_request_id returning * into logrow;
 return public.search_log_json(logrow);
end $$;
create function public.admin_mutate(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare value jsonb; item jsonb; entity_id uuid;
begin
 if not public.is_admin() then raise exception 'Admin diperlukan' using errcode='42501'; end if;
 case p_command->>'type'
 when 'saveEmployee' then
  value:=p_command->'employee'; perform public.require_json_fields(value,array['id','name','department','email','chatUrl','color'],array['isActive']); entity_id:=(value->>'id')::uuid;
  insert into public.employees(id,name,department,email,chat_url,color,is_active) values(entity_id,value->>'name',value->>'department',value->>'email',value->>'chatUrl',value->>'color',(value->>'isActive')::boolean) on conflict(id) do update set name=excluded.name,department=excluded.department,email=excluded.email,chat_url=excluded.chat_url,color=excluded.color,is_active=excluded.is_active;
 when 'saveProblem' then
  value:=p_command->'problem'; perform public.require_json_fields(value,array['id','title','description','category','primaryPicId','backupPicId'],array['isActive'],array['responseSlaMinutes','resolutionSlaMinutes']); entity_id:=(value->>'id')::uuid;
  if jsonb_typeof(value->'keywords') is distinct from 'array' or jsonb_typeof(value->'links') is distinct from 'array' then raise exception 'Keywords dan links wajib berupa array' using errcode='22023'; end if;
  if jsonb_array_length(value->'keywords')>50 or jsonb_array_length(value->'links')>20 then raise exception 'Terlalu banyak keywords atau links' using errcode='22023'; end if;
  insert into public.problems(id,title,description,category,primary_pic_id,backup_pic_id,response_sla_minutes,resolution_sla_minutes,is_active) values(entity_id,value->>'title',value->>'description',value->>'category',(value->>'primaryPicId')::uuid,(value->>'backupPicId')::uuid,(value->>'responseSlaMinutes')::integer,(value->>'resolutionSlaMinutes')::integer,(value->>'isActive')::boolean) on conflict(id) do update set title=excluded.title,description=excluded.description,category=excluded.category,primary_pic_id=excluded.primary_pic_id,backup_pic_id=excluded.backup_pic_id,response_sla_minutes=excluded.response_sla_minutes,resolution_sla_minutes=excluded.resolution_sla_minutes,is_active=excluded.is_active;
  delete from public.problem_keywords where problem_id=entity_id;
  for item in select * from jsonb_array_elements(value->'keywords') loop if jsonb_typeof(item)<>'string' then raise exception 'Keyword wajib string' using errcode='22023'; end if; insert into public.problem_keywords(problem_id,keyword) values(entity_id,item#>>'{}') on conflict(problem_id,normalized_keyword) do nothing; end loop;
  delete from public.problem_links where problem_id=entity_id;
  for item in select * from jsonb_array_elements(value->'links') loop perform public.require_json_fields(item,array['id','kind','label','url']); insert into public.problem_links(id,problem_id,kind,label,url) values((item->>'id')::uuid,entity_id,item->>'kind',item->>'label',item->>'url'); end loop;
 when 'saveAvailability' then
  value:=p_command->'availability'; perform public.require_json_fields(value,array['id','employeeId','kind','startsAt','endsAt'],nullable_fields=>array['cancelledAt']);
  insert into public.unavailability(id,employee_id,kind,starts_at,ends_at,cancelled_at) values((value->>'id')::uuid,(value->>'employeeId')::uuid,value->>'kind',(value->>'startsAt')::timestamptz,(value->>'endsAt')::timestamptz,(value->>'cancelledAt')::timestamptz) on conflict(id) do update set employee_id=excluded.employee_id,kind=excluded.kind,starts_at=excluded.starts_at,ends_at=excluded.ends_at,cancelled_at=excluded.cancelled_at;
 when 'saveUnmatched' then
  value:=p_command->'unmatched'; perform public.require_json_fields(value,array['id','status','note'],nullable_fields=>array['resolvedProblemId']);
  update public.unmatched_queries set status=value->>'status',note=value->>'note',resolved_problem_id=(value->>'resolvedProblemId')::uuid,closed_at=case when value->>'status'='open' then null else coalesce(closed_at,now()) end where id=(value->>'id')::uuid;
  if not found then raise exception 'Unmatched tidak ditemukan' using errcode='22023'; end if;
 else raise exception 'Perintah tidak valid' using errcode='22023'; end case;
 return public.app_data();
end $$;
-- Private JSON helpers bypass RLS only inside audited entry points.
revoke all on function public.normalize_query(text),public.is_active_user(),public.is_admin(),public.handle_new_user(),public.employee_json(public.employees),public.problem_json(public.problems),public.search_log_json(public.search_logs),public.app_data(),public.app_bootstrap(),public.search_problems(text,uuid),public.admin_mutate(jsonb) from public,anon,authenticated;
grant execute on function public.is_active_user(),public.is_admin(),public.normalize_query(text),public.app_bootstrap(),public.search_problems(text,uuid),public.admin_mutate(jsonb) to authenticated;
commit;
