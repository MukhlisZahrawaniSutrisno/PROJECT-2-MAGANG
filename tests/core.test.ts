import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedData } from '../lib/seed';
import { searchProblems, isEmployeeAvailable, normalizeQuery } from '../lib/search';
import { applyDemoCommand, recordDemoSearch } from '../lib/demo-store';
import { validateAdminCommand, validateQuery, safeUrl } from '../lib/validation';
const now = new Date('2026-10-07T09:00:00Z');
test('normalized search matches AC and Figma backup with immutable snapshots', () => {
 const data=createSeedData(now);
 assert.equal(normalizeQuery('  AC   BOCOR! '),'ac bocor');
 assert.equal(searchProblems(data,'AC bocor',now)[0].problem.category,'Fasilitas');
 const figma=searchProblems(data,'akses Figma',now)[0];
 assert.equal(figma.routingStatus,'backup');
 const recorded=recordDemoSearch(data,'akses Figma','00000000-0000-4000-8000-000000000999',now);
 const changed=applyDemoCommand(recorded.data,{type:'saveEmployee',employee:{...figma.primaryPic,name:'Nama baru'}});
 assert.equal(changed.searchLogs[0].results[0].primaryPic.name,figma.primaryPic.name);
 assert.equal(data.searchLogs.length+1,changed.searchLogs.length);
});
test('availability is half open, cancelled intervals ignored, inactive PIC unavailable',()=>{
 const data=createSeedData(now); const interval=data.unavailability[0];
 assert.equal(isEmployeeAvailable(data,interval.employeeId,new Date(interval.startsAt)),false);
 assert.equal(isEmployeeAvailable(data,interval.employeeId,new Date(interval.endsAt)),true);
 interval.cancelledAt=now.toISOString(); assert.equal(isEmployeeAvailable(data,interval.employeeId,now),true);
 data.employees.find(e=>e.id===interval.employeeId)!.isActive=false;
 assert.equal(isEmployeeAvailable(data,interval.employeeId,now),false);
});
test('matching supports typo, multi results, no noise and unmatched idempotency',()=>{
 const data=createSeedData(now);
 assert.ok(searchProblems(data,'reimburs',now).length);
 assert.ok(searchProblems(data,'wifi vpn',now).length>=2);
 assert.equal(searchProblems(data,'zxqv zzzzzz',now).length,0);
 const id='00000000-0000-4000-8000-000000000998';
 const first=recordDemoSearch(data,'zxqv zzzzzz',id,now);
 assert.equal(first.log.outcome,'unmatched');
 const again=recordDemoSearch(first.data,'zxqv zzzzzz',id,now);
 assert.equal(again.data.searchLogs.length,first.data.searchLogs.length);
 assert.equal(again.data.unmatchedQueries.length,first.data.unmatchedQueries.length);
});
test('validators reject malicious and invalid data and normalize duplicate keywords',()=>{
 const data=createSeedData(now); const problem=data.problems[0];
 assert.equal(safeUrl('javascript:alert(1)'),false);
 assert.throws(()=>validateQuery(' '.repeat(5)));
 assert.throws(()=>validateQuery('a'.repeat(501)));
 assert.throws(()=>validateAdminCommand({type:'saveProblem',problem:{...problem,backupPicId:problem.primaryPicId}}));
 assert.throws(()=>validateAdminCommand({type:'saveProblem',problem:{...problem,responseSlaMinutes:0}}));
 assert.throws(()=>validateAdminCommand({type:'saveEmployee',employee:{...data.employees[0],color:'red'}}));
 assert.throws(()=>applyDemoCommand(data,{type:'saveProblem',problem:{...problem,primaryPicId:'00000000-0000-4000-8000-000000000997'}}));
 const command=validateAdminCommand({type:'saveProblem',problem:{...problem,keywords:['AC bocor',' ac BOCOR ']}});
 assert.equal(command.type,'saveProblem'); if(command.type==='saveProblem') assert.deepEqual(command.problem.keywords,['ac bocor']);
});

test('both PIC unavailable, cancelled leave and SLA boundaries',async()=>{
 const {formatSla}=await import('../lib/search'); const data=createSeedData(now);const problem=data.problems[1];
 data.employees.find(e=>e.id===problem.backupPicId)!.isActive=false;
 assert.equal(searchProblems(data,'akses figma',now)[0].routingStatus,'unavailable');
 assert.equal(formatSla(30),'30 menit');assert.equal(formatSla(90),'1 jam 30 menit');assert.equal(formatSla(1440),'1 hari');
});
test('storage corruption is surfaced and failed saves never report success',async()=>{
 const {loadDemoData,saveDemoData,STORAGE_KEY}=await import('../lib/demo-store');
 let stored:string|null=null;let fail=false;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:(key:string)=>{assert.equal(key,STORAGE_KEY);return stored;},setItem:(_key:string,value:string)=>{if(fail)throw new Error('quota');stored=value;}}}});
 try{
  const data=createSeedData(now);assert.equal(loadDemoData().problems.length,12);saveDemoData(data);assert.equal(loadDemoData().searchLogs.length,data.searchLogs.length);
  stored='not json';assert.throws(()=>loadDemoData(),/Reset/);
  const bad=createSeedData(now);bad.searchLogs[0].results[0].effectivePic={...bad.searchLogs[0].results[0].effectivePic!,chatUrl:'javascript:alert(1)'};stored=JSON.stringify(bad);assert.throws(()=>loadDemoData(),/Reset/);
  fail=true;assert.throws(()=>saveDemoData(data),/belum tersimpan/);
 }finally{Reflect.deleteProperty(globalThis,'window');}
});

test('resolved unmatched query reopens same group while ignored stays ignored',()=>{
 for(const status of ['resolved','ignored'] as const){
  const first=recordDemoSearch(createSeedData(now),'zxqv unieke',undefined,now);const group=first.data.unmatchedQueries.find(u=>u.id===first.log.unmatchedQueryId)!;
  const closed=applyDemoCommand(first.data,{type:'saveUnmatched',unmatched:{...group,status,note:'Catatan dipertahankan',closedAt:now.toISOString(),resolvedProblemId:status==='resolved'?first.data.problems[0].id:null}});
  const repeat=recordDemoSearch(closed,' ZXQV  UNIEKE! ',undefined,new Date(now.getTime()+60000));
  assert.equal(repeat.data.unmatchedQueries.length,first.data.unmatchedQueries.length);assert.equal(repeat.log.unmatchedQueryId,group.id);
  const updated=repeat.data.unmatchedQueries.find(u=>u.id===group.id)!;
  assert.equal(updated.status,status==='resolved'?'open':'ignored');assert.equal(updated.note,'Catatan dipertahankan');assert.equal(updated.createdAt,group.createdAt);
  assert.equal(updated.resolvedProblemId,null);assert.equal(updated.closedAt,status==='resolved'?null:now.toISOString());
 }
});
test('stored duplicate normalized unmatched group is rejected',async()=>{
 const {loadDemoData}=await import('../lib/demo-store');const data=createSeedData(now);
 data.unmatchedQueries.push({...data.unmatchedQueries[0],id:'60000000-0000-4000-8000-000000000999'});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:()=>JSON.stringify(data)}}});
 try{assert.throws(()=>loadDemoData(),/Reset/);}finally{Reflect.deleteProperty(globalThis,'window');}
});
