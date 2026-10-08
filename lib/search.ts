import type { AppData, SearchResult } from './types';
export function normalizeQuery(query:string):string {
 return query.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
export function isEmployeeAvailable(data:AppData,employeeId:string,now=new Date()):boolean {
 const employee=data.employees.find(e=>e.id===employeeId);
 return !!employee?.isActive && !data.unavailability.some(a=>a.employeeId===employeeId&&!a.cancelledAt&&Date.parse(a.startsAt)<=now.getTime()&&now.getTime()<Date.parse(a.endsAt));
}
function distance(a:string,b:string):number {
 let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;} return row[b.length];
}
export function searchProblems(data:AppData,query:string,now=new Date()):SearchResult[] {
 const normalized=normalizeQuery(query); if(!normalized) return [];
 const stop=new Set(['yang','untuk','saya','mau','tidak','bisa','ada','tolong','di','ke','dan','bagaimana']);
 const tokens=normalized.split(' ').filter(t=>!stop.has(t)); if(!tokens.length) return [];
 const results:SearchResult[]=[];
 for(const problem of data.problems.filter(p=>p.isActive)){
  const phrases=[problem.title,...problem.keywords].map(normalizeQuery);
  const words=new Set(phrases.flatMap(p=>p.split(' ')));
  let score=0; let method:SearchResult['matchMethod']='phrase';
  if(phrases.includes(normalized)){score=100;method='exact';}
  else {const contained=phrases.filter(p=>p.length>=3&&(` ${normalized} `.includes(` ${p} `)||` ${p} `.includes(` ${normalized} `))); if(contained.length) score=80+Math.min(normalized.length,15);
   const matched=tokens.filter(t=>words.has(t)).length; if(matched) score=Math.max(score,40+40*matched/tokens.length);
   if(!score){const fuzzy=tokens.filter(t=>t.length>=4&&Array.from(words).some(w=>w.length>=4&&distance(t,w)<=(Math.max(t.length,w.length)>7?2:1)));if(fuzzy.length){score=25+20*fuzzy.length/tokens.length;method='fuzzy';}}
  }
  if(!score) continue;
  const primaryPic=data.employees.find(e=>e.id===problem.primaryPicId),backupPic=data.employees.find(e=>e.id===problem.backupPicId);if(!primaryPic||!backupPic) continue;
  const primaryAvailable=isEmployeeAvailable(data,primaryPic.id,now),backupAvailable=isEmployeeAvailable(data,backupPic.id,now);
  results.push({problem,primaryPic,backupPic,effectivePic:primaryAvailable?primaryPic:backupAvailable?backupPic:null,primaryAvailable,backupAvailable,routingStatus:primaryAvailable?'primary':backupAvailable?'backup':'unavailable',matchScore:score,matchMethod:method});
 }
 return results.sort((a,b)=>b.matchScore-a.matchScore||a.problem.title.localeCompare(b.problem.title,'id'));
}
export function formatSla(minutes:number):string {
 if(minutes<60) return `${minutes} menit`; if(minutes<1440) return `${Math.floor(minutes/60)} jam${minutes%60?` ${minutes%60} menit`:''}`;
 return `${Math.floor(minutes/1440)} hari${minutes%1440?` ${formatSla(minutes%1440)}`:''}`;
}
