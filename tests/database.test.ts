import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import type { AppData, CurrentUser, SearchLog } from '../lib/types';

const admin='90000000-0000-4000-8000-000000000001';
const employee='90000000-0000-4000-8000-000000000002';
const disabled='90000000-0000-4000-8000-000000000003';
const pic=(i:number)=>`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const request=(i:number)=>`80000000-0000-4000-8000-${String(i).padStart(12,'0')}`;

test('PostgreSQL migration, permissions, RPC transactions and snapshots',async t=>{
 const db=new PGlite({extensions:{pg_trgm}});
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(await readFile('supabase/migrations/001_initial.sql','utf8'));
 await db.exec(await readFile('supabase/seed.sql','utf8'));
 await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'admin@demo.example.com','{"name":"Admin","role":"admin"}'),($2,'employee@demo.example.com','{}'),($3,'disabled@demo.example.com','{"role":"admin"}')`,[admin,employee,disabled]);
 await db.query(`update public.users set is_active=true,role=case when id=$1 then 'admin' else 'employee' end where id in($1,$2)`,[admin,employee]);
 const asUser=async(id:string,role='authenticated')=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);await db.exec(`set role ${role}`);};
 const bootstrap=async()=>{const r=await db.query<{value:{user:CurrentUser;data:AppData}}>('select public.app_bootstrap() value');return r.rows[0].value;};
 const search=async(query:string,id:number)=>{const r=await db.query<{value:SearchLog}>('select public.search_problems($1,$2::uuid) value',[query,request(id)]);return r.rows[0].value;};
 const mutate=async(command:unknown)=>{const r=await db.query<{value:AppData}>('select public.admin_mutate($1::jsonb) value',[JSON.stringify(command)]);return r.rows[0].value;};

 await t.test('nine tables and idempotent seed; signup metadata never grants access',async()=>{
  const r=await db.query<{count:number}>(`select count(*)::int count from pg_tables where schemaname='public'`);assert.equal(r.rows[0].count,9);
  await db.exec(await readFile('supabase/seed.sql','utf8'));
  const u=await db.query<{role:string;is_active:boolean}>('select role,is_active from public.users where id=$1',[disabled]);assert.deepEqual(u.rows[0],{role:'employee',is_active:false});
 });
 await t.test('anonymous and inactive sessions rejected; private helpers inaccessible',async()=>{
  await asUser('', 'anon');await assert.rejects(bootstrap,/permission denied/);
  await asUser(disabled);await assert.rejects(bootstrap,/Akun tidak aktif/);await assert.rejects(()=>search('wifi',1),/Akun tidak aktif/);
  await asUser(employee);await assert.rejects(()=>db.query('select public.app_data()'),/permission denied/);
 });
 await t.test('employee reads catalog but no absence or logs, cannot elevate role',async()=>{
  await asUser(employee);const b=await bootstrap();assert.equal(b.user.role,'employee');assert.equal(b.data.problems.length,12);assert.equal(b.data.employees.length,8);
  assert.deepEqual(b.data.unavailability,[]);assert.deepEqual(b.data.searchLogs,[]);assert.deepEqual(b.data.unmatchedQueries,[]);
  for(const table of ['unavailability','search_logs','search_results','unmatched_queries'])assert.equal((await db.query(`select * from public.${table}`)).rows.length,0);
  await assert.rejects(()=>db.query(`update public.users set role='admin' where id=$1`,[employee]),/permission denied/);
  await assert.rejects(()=>mutate({type:'saveUnmatched',unmatched:{}}),/Admin diperlukan/);
 });
 let first:SearchLog;
 await t.test('exact keyword dedup, backup routing and absence privacy',async()=>{
  await asUser(employee);first=await search('akses Figma',2);
  const row=first.results.find(r=>r.problem.id.endsWith('000000000002'))!;assert.ok(row);assert.equal(row.matchMethod,'exact');assert.equal(row.routingStatus,'backup');assert.equal(row.effectivePic?.id,pic(4));assert.equal(row.primaryAvailable,false);
  assert.equal(first.results.filter(r=>r.problem.id===row.problem.id).length,1);
  assert.ok(!JSON.stringify(first).includes('startsAt'));assert.ok(!JSON.stringify(first).includes('cancelledAt'));
 });
 await t.test('phrase, fuzzy and short keyword boundaries',async()=>{
  const phrase=await search('tolong akses figma sekarang',3);assert.equal(phrase.results[0].matchMethod,'phrase');
  const fuzzy=await search('reimburs',4);assert.ok(fuzzy.results.some(r=>r.problem.id.endsWith('000000000003')&&r.matchMethod==='fuzzy'));
  const short=await search('AC',5);assert.ok(short.results.some(r=>r.problem.id.endsWith('000000000001')));
  const partial=await search('a',6);assert.equal(partial.outcome,'unmatched');
 });
 await t.test('request retries reuse immutable result; other user or query cannot reuse id',async()=>{
  assert.deepEqual(await search('AKSES FIGMA',2),first!);
  await assert.rejects(()=>search('wifi',2),/Request ID telah dipakai/);
  await asUser(admin);await assert.rejects(()=>search('akses figma',2),/Request ID telah dipakai/);
 });
 await t.test('admin sees private records; constraints and invalid mutation rollback atomically',async()=>{
  await asUser(admin);const b=await bootstrap();assert.equal(b.data.unavailability.length,1);assert.ok(b.data.searchLogs.length>=5);
  const original=b.data.problems.find(p=>p.id.endsWith('000000000002'))!;
  await assert.rejects(()=>mutate({type:'saveProblem',problem:{...original,title:'Must rollback',links:[{id:'30000000-0000-4000-8000-000000000099',kind:'sop',label:'Unsafe',url:'javascript:alert(1)'}]}}),/check constraint/);
  assert.deepEqual((await bootstrap()).data.problems.find(p=>p.id===original.id),original);
  await assert.rejects(()=>mutate({type:'saveProblem',problem:{...original,backupPicId:original.primaryPicId}}),/check constraint/);
  await assert.rejects(()=>mutate({type:'saveProblem',problem:{...original,responseSlaMinutes:0}}),/check constraint/);
  await assert.rejects(()=>mutate({type:'saveAvailability',availability:{id:request(50),employeeId:pic(1),kind:'leave',startsAt:'2026-10-06T12:00:00Z',endsAt:'2026-10-06T11:00:00Z',cancelledAt:null}}),/check constraint/);
 });
 await t.test('both unavailable stays matched; old log snapshot stays unchanged',async()=>{
  const now=Date.now();await mutate({type:'saveAvailability',availability:{id:request(51),employeeId:pic(4),kind:'unavailable',startsAt:new Date(now-3600000).toISOString(),endsAt:new Date(now+3600000).toISOString(),cancelledAt:null}});
  const next=await search('akses figma',7);const row=next.results.find(r=>r.problem.id.endsWith('000000000002'))!;assert.equal(row.routingStatus,'unavailable');assert.equal(row.effectivePic,null);assert.equal(next.outcome,'matched');assert.equal(next.unmatchedQueryId,null);
  await asUser(employee);assert.deepEqual(await search('akses figma',2),first!);
 });
 await t.test('unmatched normalized aggregation, counts and resolution FK validation',async()=>{
  await asUser(employee);const a=await search('zzqxy tidak dikenal',8);const b=await search('ZZQXY tidak dikenal!',9);assert.equal(a.outcome,'unmatched');assert.equal(a.unmatchedQueryId,b.unmatchedQueryId);
  await asUser(admin);const data=(await bootstrap()).data;assert.equal(data.searchLogs.filter(l=>l.unmatchedQueryId===a.unmatchedQueryId).length,2);
  const unmatched=data.unmatchedQueries.find(u=>u.id===a.unmatchedQueryId)!;
  await assert.rejects(()=>mutate({type:'saveUnmatched',unmatched:{...unmatched,status:'resolved',resolvedProblemId:null}}),/check constraint/);
  await assert.rejects(()=>mutate({type:'saveUnmatched',unmatched:{...unmatched,status:'resolved',resolvedProblemId:request(99)}}),/foreign key/);
  const resolved=await mutate({type:'saveUnmatched',unmatched:{...unmatched,status:'resolved',resolvedProblemId:data.problems[0].id,note:'Ditambahkan keyword'}});assert.equal(resolved.unmatchedQueries.find(u=>u.id===unmatched.id)?.status,'resolved');
 });
 await t.test('search failure rolls back the log, results and unmatched together',async()=>{
  await db.exec('reset role');
  await db.exec(`create function pg_temp.reject_result() returns trigger language plpgsql as $$ begin raise exception 'Injected result failure'; end $$;
   create trigger test_result_failure before insert on public.search_results for each row execute function pg_temp.reject_result();`);
  await asUser(employee);await assert.rejects(()=>search('wifi',52),/Injected result failure/);
  await db.exec('reset role');assert.equal((await db.query('select id from public.search_logs where id=$1',[request(52)])).rows.length,0);
  await db.exec('drop trigger test_result_failure on public.search_results');
 });
 await t.test('employee upsert preserves optional auth relation; inactive catalog hidden',async()=>{
  await db.exec('reset role');await db.query('update public.employees set user_id=$1 where id=$2',[employee,pic(1)]);
  await asUser(admin);const e=(await bootstrap()).data.employees.find(e=>e.id===pic(1))!;
  await mutate({type:'saveEmployee',employee:{...e,isActive:false}});
  await asUser(employee);assert.ok((await bootstrap()).data.employees.some(e=>e.id===pic(1)&&!e.isActive));assert.equal((await db.query('select * from public.employees where id=$1',[pic(1)])).rows.length,0);
  const inactive=await search('ac bocor',53);assert.equal(inactive.results.find(r=>r.problem.id.endsWith('000000000001'))!.routingStatus,'backup');
  await db.exec('reset role');assert.equal((await db.query<{user_id:string}>('select user_id from public.employees where id=$1',[pic(1)])).rows[0].user_id,employee);
  await asUser(admin);await mutate({type:'saveEmployee',employee:e});
 });
 await t.test('direct admin RPC rejects malformed values and infinite intervals',async()=>{
  await asUser(admin);const data=(await bootstrap()).data;const e=data.employees[0],p=data.problems[0],a=data.unavailability[0];
  await assert.rejects(()=>mutate({type:'saveEmployee',employee:{...e,isActive:'yes'}}),/wajib boolean/);
  await assert.rejects(()=>mutate({type:'saveEmployee',employee:{...e,color:'red'}}),/check constraint/);
  await assert.rejects(()=>mutate({type:'saveEmployee',employee:{...e,email:'invalid'}}),/check constraint/);
  await assert.rejects(()=>mutate({type:'saveProblem',problem:{...p,description:'x'.repeat(3001)}}),/check constraint/);
  await assert.rejects(()=>mutate({type:'saveProblem',problem:{...p,responseSlaMinutes:'30'}}),/wajib number/);
  await assert.rejects(()=>mutate({type:'saveProblem',problem:{...p,keywords:[123]}}),/Keyword wajib string/);
  await assert.rejects(()=>mutate({type:'saveAvailability',availability:{...a,startsAt:'-infinity',endsAt:'infinity'}}),/check constraint/);
  await assert.rejects(()=>mutate({type:'saveAvailability',availability:{...a,cancelledAt:'infinity'}}),/check constraint/);
 });
 await t.test('resolved unmatched reopens same group; ignored stays ignored',async()=>{
  await asUser(admin);const group=(await bootstrap()).data.unmatchedQueries.find(u=>u.normalizedQuery==='zzqxy tidak dikenal')!;
  assert.equal(group.status,'resolved');await asUser(employee);const repeated=await search('zzqxy tidak dikenal',54);assert.equal(repeated.unmatchedQueryId,group.id);
  await asUser(admin);const reopened=(await bootstrap()).data.unmatchedQueries.find(u=>u.id===group.id)!;
  assert.equal(reopened.status,'open');assert.equal(reopened.closedAt,null);assert.equal(reopened.resolvedProblemId,null);assert.equal(reopened.note,group.note);assert.equal(reopened.createdAt,group.createdAt);
  await assert.rejects(()=>mutate({type:'saveUnmatched',unmatched:{...reopened,note:'x'.repeat(2001)}}),/check constraint/);
  await mutate({type:'saveUnmatched',unmatched:{...reopened,status:'ignored'}});
  await asUser(employee);assert.equal((await search('zzqxy tidak dikenal',55)).unmatchedQueryId,group.id);
  await asUser(admin);assert.equal((await bootstrap()).data.unmatchedQueries.find(u=>u.id===group.id)?.status,'ignored');
 });
 await t.test('cancelled absence restores primary; deactivated session cannot retry',async()=>{
  await asUser(admin);const leave=(await bootstrap()).data.unavailability.find(u=>u.employeeId===pic(3))!;
  await mutate({type:'saveAvailability',availability:{...leave,cancelledAt:new Date().toISOString()}});
  await asUser(employee);const result=await search('akses figma',10);assert.equal(result.results.find(r=>r.problem.id.endsWith('000000000002'))!.routingStatus,'primary');
  await db.exec('reset role');await db.query('update public.users set is_active=false where id=$1',[employee]);await asUser(employee);await assert.rejects(()=>search('akses figma',2),/Akun tidak aktif/);assert.equal((await db.query('select * from public.problems')).rows.length,0);
 });
 await t.test('auth deletion preserves logs and immutable snapshots without cross-user replay',async()=>{
  await db.exec('reset role');const before=(await db.query<{count:number}>('select count(*)::int count from public.search_logs where user_id=$1',[employee])).rows[0].count;
  await db.query('delete from auth.users where id=$1',[employee]);
  const preserved=await db.query<{user_id:string|null;snapshot:unknown}>('select l.user_id,r.snapshot from public.search_logs l join public.search_results r on r.search_log_id=l.id where l.id=$1 order by r.rank',[request(2)]);
  assert.equal(preserved.rows[0].user_id,null);assert.deepEqual(preserved.rows.map(r=>r.snapshot),first!.results);
  assert.equal((await db.query<{count:number}>('select count(*)::int count from public.search_logs where user_id is null')).rows[0].count,before);
  await asUser(admin);await assert.rejects(()=>search('akses figma',2),/Request ID telah dipakai/);
 });
 }finally{await db.close();}
});
