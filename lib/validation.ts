import { CATEGORIES } from './types';
import type { AdminCommand, Employee, Problem, ProblemLink, Unavailability, UnmatchedQuery } from './types';
import { normalizeQuery } from './search';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(input:unknown):Record<string,unknown>{if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Data harus berupa objek.');return input as Record<string,unknown>;}
function text(value:unknown,label:string,max=200):string{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error(`${label} wajib diisi, maksimal ${max} karakter.`);return value.trim();}
function id(value:unknown):string{const result=text(value,'ID',36);if(!uuid.test(result))throw new Error('ID harus berupa UUID yang valid.');return result;}
function bool(value:unknown):boolean{if(typeof value!=='boolean')throw new Error('Status harus true atau false.');return value;}
function date(value:unknown):string{const result=text(value,'Tanggal',40);if(!/^\d{4}-\d{2}-\d{2}T/.test(result)||!Number.isFinite(Date.parse(result)))throw new Error('Tanggal tidak valid.');return new Date(result).toISOString();}
function nullableDate(value:unknown):string|null{return value===null?null:date(value);}
function minutes(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>525600)throw new Error('SLA harus bilangan bulat positif, maksimal satu tahun.');return value;}
export function safeUrl(value:string):boolean{try{if(value.length>2000)return false;const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}}
function url(value:unknown):string{const result=text(value,'URL',2000);if(!safeUrl(result))throw new Error('URL harus menggunakan HTTP atau HTTPS yang valid.');return result;}
export function validateQuery(input:unknown):string {const result=text(input,'Pencarian',500);if(!normalizeQuery(result))throw new Error('Masukkan kata pencarian.');return result;}
export function validateAdminCommand(input:unknown):AdminCommand {
 const command=object(input);
 if(command.type==='saveEmployee'){
  const p=object(command.employee);const email=text(p.email,'Email',254);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Email tidak valid.');const color=text(p.color,'Warna',7);if(!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Warna harus berupa kode hex 6 digit.');
  const employee:Employee={id:id(p.id),name:text(p.name,'Nama',100),department:text(p.department,'Departemen',100),email,chatUrl:url(p.chatUrl),color,isActive:bool(p.isActive)};return {type:'saveEmployee',employee};
 }
 if(command.type==='saveProblem'){
  const p=object(command.problem);if(!CATEGORIES.includes(p.category as never))throw new Error('Kategori tidak valid.');
  if(!Array.isArray(p.keywords)||p.keywords.length>50)throw new Error('Maksimal 50 kata kunci.');const keywords=[...new Set(p.keywords.map(k=>normalizeQuery(text(k,'Kata kunci',200))))];if(keywords.some(k=>!k))throw new Error('Kata kunci tidak boleh kosong.');
  if(!Array.isArray(p.links)||p.links.length>20)throw new Error('Maksimal 20 tautan.');
  const links:ProblemLink[]=p.links.map(item=>{const l=object(item);if(!['sop','form','ticket'].includes(l.kind as string))throw new Error('Jenis tautan tidak valid.');return {id:id(l.id),kind:l.kind as ProblemLink['kind'],label:text(l.label,'Label',100),url:url(l.url)};});if(new Set(links.map(l=>l.id)).size!==links.length)throw new Error('ID tautan harus unik.');
  const primaryPicId=id(p.primaryPicId),backupPicId=id(p.backupPicId);if(primaryPicId===backupPicId)throw new Error('PIC utama dan backup harus berbeda.');
  const responseSlaMinutes=minutes(p.responseSlaMinutes),resolutionSlaMinutes=minutes(p.resolutionSlaMinutes);if(resolutionSlaMinutes<responseSlaMinutes)throw new Error('SLA penyelesaian tidak boleh lebih pendek dari SLA respons.');
  const problem:Problem={id:id(p.id),title:text(p.title,'Judul',200),description:text(p.description,'Deskripsi',3000),category:p.category as Problem['category'],keywords,primaryPicId,backupPicId,responseSlaMinutes,resolutionSlaMinutes,links,isActive:bool(p.isActive)};return {type:'saveProblem',problem};
 }
 if(command.type==='saveAvailability'){
  const p=object(command.availability);if(!['leave','unavailable'].includes(p.kind as string))throw new Error('Jenis ketersediaan tidak valid.');const startsAt=date(p.startsAt),endsAt=date(p.endsAt);if(Date.parse(endsAt)<=Date.parse(startsAt))throw new Error('Akhir interval harus sesudah awal.');
  const availability:Unavailability={id:id(p.id),employeeId:id(p.employeeId),kind:p.kind as Unavailability['kind'],startsAt,endsAt,cancelledAt:nullableDate(p.cancelledAt)};return {type:'saveAvailability',availability};
 }
 if(command.type==='saveUnmatched'){
  const p=object(command.unmatched);if(!['open','resolved','ignored'].includes(p.status as string))throw new Error('Status pertanyaan tidak valid.');const normalizedQuery=normalizeQuery(text(p.normalizedQuery,'Pertanyaan',500));if(!normalizedQuery)throw new Error('Pertanyaan tidak boleh kosong.');const resolvedProblemId=p.resolvedProblemId===null?null:id(p.resolvedProblemId);const closedAt=nullableDate(p.closedAt);if(p.status==='resolved'&&!resolvedProblemId)throw new Error('Pilih masalah untuk pertanyaan yang diselesaikan.');if(p.status==='open'&&(closedAt||resolvedProblemId))throw new Error('Pertanyaan terbuka belum boleh memiliki waktu penutupan atau masalah terkait.');if(p.status!=='open'&&!closedAt)throw new Error('Pertanyaan tertutup memerlukan waktu penutupan.');if(typeof p.note!=='string'||p.note.length>2000)throw new Error('Catatan maksimal 2000 karakter.');
  const unmatched:UnmatchedQuery={id:id(p.id),normalizedQuery,status:p.status as UnmatchedQuery['status'],note:p.note,resolvedProblemId,createdAt:date(p.createdAt),closedAt};return {type:'saveUnmatched',unmatched};
 }
 throw new Error('Perintah admin tidak dikenal.');
}
