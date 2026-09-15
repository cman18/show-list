export type Provider={provider_id:number;provider_name:string;access_type:string};
export type Title={id:string;title:string;serviceHint:string;type:string;year:string|number;status:string;notes:string;availability:string;matchStatus:string;checkedAt:string;sourceUrl:string;poster:string|null;overview:string;genres:string[];providers:Provider[];firstReleaseDate?:string;nextReleaseDate?:string;lastReleaseDate?:string};

export function localToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dayDistance(date:string,today:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return Infinity;return Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000)}
export function releaseCue(title:Title,today:string){
 const next=title.type==='Series'?(title.nextReleaseDate||''):title.firstReleaseDate||'';
 const distance=dayDistance(next,today);
 if(distance>=0&&distance<=90)return {rank:0,date:next,label:title.type==='Series'&&title.firstReleaseDate!==next?'Next episode':'Releases soon'};
 const recent=title.type==='Series'?(title.lastReleaseDate||title.firstReleaseDate||''):title.firstReleaseDate||'';
 const elapsed=dayDistance(recent,today);
 if(elapsed<=0&&elapsed>=-30)return {rank:1,date:recent,label:title.type==='Series'&&title.firstReleaseDate!==recent?'New episode':'Just released'};
 return {rank:2,date:'',label:''};
}
export function sortByRelease(rows:Title[],today:string){return rows.map((title,index)=>({title,index,cue:releaseCue(title,today)})).sort((a,b)=>a.cue.rank-b.cue.rank||(a.cue.rank===0?a.cue.date.localeCompare(b.cue.date):a.cue.rank===1?b.cue.date.localeCompare(a.cue.date):0)||a.index-b.index).map(x=>x.title)}
export function displayDate(date:string){const [y,m,d]=date.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
