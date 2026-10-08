import type { AdminCommand, AppData, SearchLog } from './types';
import { createSeedData } from './seed';
import { normalizeQuery, searchProblems } from './search';
import { validateAdminCommand, validateQuery } from './validation';
export const STORAGE_KEY='whose-job-demo-v1';
function assertReferences(data:AppData,command:AdminCommand):void {
 if(command.type==='saveProblem'&&(!data.employees.some(e=>e.id===command.problem.primaryPicId)||!data.employees.some(e=>e.id===command.problem.backupPicId)))throw new Error('PIC tidak ditemukan. Pilih pegawai yang terdaftar.');
 if(command.type==='saveAvailability'&&!data.employees.some(e=>e.id===command.availability.employeeId))throw new Error('Pegawai tidak ditemukan.');
 if(command.type==='saveUnmatched'&&command.unmatched.resolvedProblemId&&!data.problems.some(p=>p.id===command.unmatched.resolvedProblemId))throw new Error('Masalah terkait tidak ditemukan.');
}
export function applyDemoCommand(data:AppData,input:AdminCommand):AppData {
 const command=validateAdminCommand(input);assertReferences(data,command);const next=structuredClone(data);
 const upsert=<T extends {id:string}>(rows:T[],item:T)=>{const index=rows.findIndex(row=>row.id===item.id);if(index<0)rows.push(item);else rows[index]=item;};
 switch(command.type){case 'saveEmployee':upsert(next.employees,command.employee);break;case 'saveProblem':upsert(next.problems,command.problem);break;case 'saveAvailability':upsert(next.unavailability,command.availability);break;case 'saveUnmatched':{const old=next.unmatchedQueries.find(u=>u.id===command.unmatched.id);if(!old)throw new Error('Pertanyaan belum ditemukan.');if(old.normalizedQuery!==command.unmatched.normalizedQuery||old.createdAt!==command.unmatched.createdAt)throw new Error('Identitas pertanyaan tidak boleh diubah.');upsert(next.unmatchedQueries,command.unmatched);break;}}
 return next;
}
export function recordDemoSearch(data:AppData,input:string,requestId=crypto.randomUUID(),now=new Date()):{data:AppData;log:SearchLog} {
 const query=validateQuery(input);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))throw new Error('ID pencarian tidak valid.');
 const previous=data.searchLogs.find(l=>l.id===requestId);if(previous){if(previous.normalizedQuery!==normalizeQuery(query))throw new Error('ID pencarian sudah digunakan untuk pertanyaan lain.');return {data,log:previous};}
 const started=performance.now();const next=structuredClone(data);const results=structuredClone(searchProblems(next,query,now));const normalizedQuery=normalizeQuery(query);let unmatchedQueryId:string|null=null;
 if(!results.length){let item=next.unmatchedQueries.find(u=>u.normalizedQuery===normalizedQuery);if(!item){item={id:crypto.randomUUID(),normalizedQuery,status:'open',note:'',resolvedProblemId:null,createdAt:now.toISOString(),closedAt:null};next.unmatchedQueries.unshift(item);}else if(item.status==='resolved'){item.status='open';item.closedAt=null;item.resolvedProblemId=null;}unmatchedQueryId=item.id;}
 const log:SearchLog={id:requestId,query,normalizedQuery,searchedAt:now.toISOString(),outcome:results.length?'matched':'unmatched',durationMs:Math.max(0,Math.round(performance.now()-started)),unmatchedQueryId,results};next.searchLogs.unshift(log);return {data:next,log};
}
function validateStoredData(input:unknown):AppData {
 if(!input||typeof input!=='object')throw new Error('Data demo rusak.');const data=input as AppData;
 if(data.schemaVersion!==1||!['employees','problems','unavailability','searchLogs','unmatchedQueries'].every(key=>Array.isArray((data as unknown as Record<string,unknown>)[key])))throw new Error('Format data demo tidak dikenal.');
 if([data.employees,data.problems,data.unavailability,data.searchLogs,data.unmatchedQueries].some(rows=>rows.length>20000))throw new Error('Data demo terlalu besar.');
 for(const rows of [data.employees,data.problems,data.unavailability,data.searchLogs,data.unmatchedQueries]){if(rows.some(r=>!r||typeof r!=='object')||new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('ID data demo rusak atau duplikat.');}
 if(new Set(data.unmatchedQueries.map(u=>normalizeQuery(u.normalizedQuery))).size!==data.unmatchedQueries.length)throw new Error('Pertanyaan tanpa hasil harus memiliki grup unik.');
 for(const employee of data.employees)validateAdminCommand({type:'saveEmployee',employee});
 for(const problem of data.problems){const cmd=validateAdminCommand({type:'saveProblem',problem});assertReferences(data,cmd);}
 for(const availability of data.unavailability){const cmd=validateAdminCommand({type:'saveAvailability',availability});assertReferences(data,cmd);}
 for(const unmatched of data.unmatchedQueries){const cmd=validateAdminCommand({type:'saveUnmatched',unmatched});assertReferences(data,cmd);}
 for(const log of data.searchLogs){validateQuery(log.query);if(typeof log.id!=='string'||!Number.isFinite(Date.parse(log.searchedAt))||log.normalizedQuery!==normalizeQuery(log.query)||!['matched','unmatched','error'].includes(log.outcome)||!Number.isFinite(log.durationMs)||log.durationMs<0||!Array.isArray(log.results)||(log.outcome==='matched'&&log.results.length===0)||(log.outcome!=='matched'&&log.results.length!==0))throw new Error('Riwayat pencarian demo rusak.');if(log.unmatchedQueryId&&!data.unmatchedQueries.some(u=>u.id===log.unmatchedQueryId))throw new Error('Referensi pertanyaan demo rusak.');for(const result of log.results){validateAdminCommand({type:'saveProblem',problem:result.problem});validateAdminCommand({type:'saveEmployee',employee:result.primaryPic});validateAdminCommand({type:'saveEmployee',employee:result.backupPic});if(result.effectivePic)validateAdminCommand({type:'saveEmployee',employee:result.effectivePic});const expected=result.primaryAvailable?result.primaryPic:result.backupAvailable?result.backupPic:null;if(result.effectivePic?.id!==expected?.id||result.primaryPic.id!==result.problem.primaryPicId||result.backupPic.id!==result.problem.backupPicId||result.routingStatus!==(result.primaryAvailable?'primary':result.backupAvailable?'backup':'unavailable'))throw new Error('Routing snapshot demo rusak.');if(typeof result.primaryAvailable!=='boolean'||typeof result.backupAvailable!=='boolean'||!['primary','backup','unavailable'].includes(result.routingStatus)||!['exact','phrase','fuzzy'].includes(result.matchMethod)||typeof result.matchScore!=='number'||!Number.isFinite(result.matchScore)||result.matchScore<0||result.matchScore>100)throw new Error('Snapshot pencarian demo rusak.');}}
 return data;
}
export function loadDemoData():AppData {
 if(typeof window==='undefined')return createSeedData();
 try{const raw=window.localStorage.getItem(STORAGE_KEY);return raw===null?createSeedData():validateStoredData(JSON.parse(raw));}catch{throw new Error('Data demo tidak dapat dibaca. Reset data demo untuk memulai ulang.');}
}
export function saveDemoData(data:AppData):void {
 if(typeof window==='undefined')throw new Error('Penyimpanan demo hanya tersedia di browser.');
 try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch{throw new Error('Perubahan belum tersimpan. Penyimpanan browser penuh atau tidak tersedia.');}
}


