import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import catalog from '@/data/catalog.json';
import artwork from '@/data/artwork.json';
import releaseDates from '@/data/release-dates.json';
const noStore={'Cache-Control':'no-store'};
const dates=releaseDates as Record<string,{firstReleaseDate?:string;nextReleaseDate?:string;lastReleaseDate?:string}>;
function dated(record:{id:string}){return {...record,...(dates[record.id]||{})}}
function config(){return env as unknown as {SHEET_BRIDGE_URL?:string;SHEET_BRIDGE_SECRET?:string}}
async function bridge(payload:Record<string,unknown>){
 const c=config();if(!c.SHEET_BRIDGE_URL||!c.SHEET_BRIDGE_SECRET)throw new Error('not_connected');
 const url=new URL(c.SHEET_BRIDGE_URL);if(url.hostname!=='script.google.com'||!url.pathname.startsWith('/macros/s/')||!url.pathname.endsWith('/exec'))throw new Error('invalid_connection');
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,secret:c.SHEET_BRIDGE_SECRET}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error('sheet_unavailable');let j;try{j=await r.json() as {ok:boolean;error?:string;rows?:unknown[][];availability?:unknown[][]}}catch{throw new Error('invalid_response')}
 if(!j.ok)throw new Error(j.error||'sheet_unavailable');return j;
}
export async function GET(){
 if(!await getChatGPTUser())return Response.json({error:'Please sign in to view your watchlist.'},{status:401,headers:noStore});
 const c=config();const snapshot=(catalog as Array<{id:string}>).map(dated);if(!c.SHEET_BRIDGE_URL)return Response.json({titles:snapshot,connected:false,snapshot:true},{headers:noStore});
 try{const j=await bridge({action:'read'});const av=j.availability||[];
 const titles=(j.rows||[]).slice(1).filter(r=>r[0]).map(r=>({id:r[12],title:r[0],serviceHint:r[1]||'',type:r[2]||'',year:r[3]||'',status:r[7]||'Want to Watch',notes:r[9]||'',availability:r[16]||'needs_review',matchStatus:r[17]||'needs_review',checkedAt:r[20]||'',sourceUrl:r[19]||'',downloadableHint:r[26]||'',...((artwork as Record<string,unknown>)[String(r[12])]||{poster:null,overview:'',genres:[]}),firstReleaseDate:r[22]||dates[String(r[12])]?.firstReleaseDate||'',nextReleaseDate:r[23]||dates[String(r[12])]?.nextReleaseDate||'',lastReleaseDate:r[24]||dates[String(r[12])]?.lastReleaseDate||'',providers:av.slice(1).filter(p=>p[0]===r[12]&&p[3]==='US'&&['flatrate','free','ads'].includes(String(p[6]))).map(p=>({provider_id:p[4],provider_name:p[5],access_type:p[6]}))}));
 return Response.json({titles,connected:true,snapshot:false},{headers:noStore});
 }catch{return Response.json({error:'Could not reach Google Sheets. Your saved list is unchanged. Try again.',titles:snapshot,connected:false,snapshot:true},{status:502,headers:noStore})}
}
export async function POST(request:Request){
 if(!await getChatGPTUser())return Response.json({error:'Please sign in before saving.'},{status:401});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 let b;try{b=await request.json() as Record<string,unknown>}catch{return Response.json({error:'Invalid request.'},{status:400})}
 if(!config().SHEET_BRIDGE_URL)return Response.json({error:'Connect Google Sheets before saving. Your entry is still here.'},{status:503});
 const statuses=['Want to Watch','Watching','Watched','Dropped'];
 if(b.action==='add'){
 if(typeof b.title!=='string'||!b.title.trim()||b.title.length>250||typeof b.id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.id))return Response.json({error:'Enter a title (up to 250 characters).'},{status:400});
 b={action:'add',id:b.id,title:b.title.trim(),serviceHint:typeof b.serviceHint==='string'?b.serviceHint.trim().slice(0,150):''};
 }else if(b.action==='status'){
 if(typeof b.id!=='string'||!statuses.includes(String(b.status)))return Response.json({error:'Choose a valid watch status.'},{status:400});b={action:'status',id:b.id,status:b.status};
 }else return Response.json({error:'Unknown action.'},{status:400});
 try{await bridge(b);return Response.json({ok:true},{headers:noStore})}catch{return Response.json({error:'Google Sheets did not confirm the save. Keep this entry and retry.'},{status:502,headers:noStore})}
}
