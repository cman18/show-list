import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';

const noStore={'Cache-Control':'no-store'};
type TmdbResult={id:number;media_type?:'movie'|'tv';title?:string;name?:string;release_date?:string;first_air_date?:string;poster_path?:string|null};
type Provider={provider_id:number;provider_name:string;access_type:'flatrate'|'free'|'ads'};

function token(){const value=(env as unknown as {TMDB_API_READ_ACCESS_TOKEN?:string;TMDB_API_KEY?:string}).TMDB_API_READ_ACCESS_TOKEN||(env as unknown as {TMDB_API_KEY?:string}).TMDB_API_KEY;return value||null}
async function tmdb(path:string){const accessToken=token();if(!accessToken)throw new Error('search_unavailable');const r=await fetch(`https://api.themoviedb.org/3${path}`,{headers:accessToken.includes('.')?{Authorization:`Bearer ${accessToken}`}:{},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('search_unavailable');return r.json() as Promise<unknown>}
function releaseYear(result:TmdbResult){return (result.release_date||result.first_air_date||'').slice(0,4)}
export async function GET(request:Request){
 if(!await getChatGPTUser())return Response.json({error:'Please sign in to search.'},{status:401,headers:noStore});
 const query=new URL(request.url).searchParams.get('q')?.trim()||'';if(query.length<2||query.length>120)return Response.json({error:'Enter at least two characters.'},{status:400,headers:noStore});
 try{
  const found=await tmdb(`/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`) as {results?:TmdbResult[]};
  const matches=(found.results||[]).filter(r=>(r.media_type==='movie'||r.media_type==='tv')&&(r.title||r.name)).slice(0,6);
  const titles=await Promise.all(matches.map(async r=>{
   const mediaType=r.media_type==='tv'?'tv':'movie';
   const watching=await tmdb(`/${mediaType}/${r.id}/watch/providers`) as {results?:{US?:Record<string,Array<{provider_id:number;provider_name:string}>>}};
   const us=watching.results?.US||{};const providers=(['flatrate','free','ads'] as const).flatMap(accessType=>(us[accessType]||[]).map(provider=>({...provider,access_type:accessType}))).filter((provider,index,all)=>all.findIndex(p=>p.provider_id===provider.provider_id&&p.access_type===provider.access_type)===index) as Provider[];
   return {tmdbId:r.id,title:r.title||r.name||'',type:mediaType==='tv'?'Series':'Movie',year:releaseYear(r),poster:r.poster_path?`https://image.tmdb.org/t/p/w342${r.poster_path}`:null,providers,available:providers.length>0};
  }));
  return Response.json({titles},{headers:noStore});
 }catch{return Response.json({error:'Could not search streaming services right now. Try again shortly.'},{status:502,headers:noStore})}
}
