'use strict';
const fs=require('node:fs'); const path=require('node:path');
const {decodeEntities,stripHtml,first,isNoMessage,recordsFromPayload,parseToken,cookieHeader,request}=require('./common');

function looksLikeImage(value){const s=String(value??'');return /<img\b|data:image\/|\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)|\/Image\//i.test(s);}
function absoluteUrl(value,base){let raw=String(value??'').trim();const m=raw.match(/(?:src|data-src)\s*=\s*["']([^"']+)["']/i);if(m)raw=m[1];raw=decodeEntities(raw);try{return new URL(raw,base).href}catch{return ''}}
function makeQuery(columns,orderColumn,start,length){return {columns,order:[{column:orderColumn,dir:'asc'}],start,length,search:{value:''}};}
function saveDebug(envKey,name,text){if(!/^(?:1|true|yes)$/i.test(process.env[envKey]||''))return;const dir=path.join(process.cwd(),'debug');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),text);}
function stateFromArea(area,fallback){const a=stripHtml(area).toUpperCase();if(/MAINE|\bME\b/.test(a))return 'ME';if(/NEW HAMPSHIRE|\bNH\b/.test(a))return 'NH';if(/VERMONT|\bVT\b/.test(a))return 'VT';return fallback;}
function normalize(record,index,cfg){
 const area=stripHtml(first(record,['area','region','district','state'])||''); const state=cfg.splitByArea?stateFromArea(area,cfg.state):cfg.state;
 const name=stripHtml(first(record,['description','name','locationName','location'])||`${cfg.label} sign ${index+1}`);
 const roadway=stripHtml(first(record,['roadwayName','roadway','routeName','route'])||''); const direction=stripHtml(first(record,['direction','travelDirection'])||'');
 const id=stripHtml(first(record,['id','messageSignId','deviceId','signId'])||Buffer.from(`${name}|${roadway}|${direction}`).toString('base64url').slice(0,24));
 const candidates=[first(record,['message','message1','phase1Message','phase1Text','messageText','displayMessage','phase1Image']),first(record,['message2','phase2Message','phase2Text','phase2Image']),first(record,['message3','phase3Message','phase3Text','phase3Image'])].filter(Boolean);
 const messages=[],imagePages=[];for(const c of candidates){if(isNoMessage(c))continue;if(looksLikeImage(c)){const u=absoluteUrl(c,cfg.baseUrl);if(u&&!/NO[_-]?MESSAGE/i.test(u))imagePages.push(u);}else{const t=stripHtml(c);if(t&&!isNoMessage(t))messages.push(t);}}
 const lat=Number(first(record,['latitude','lat'])),lon=Number(first(record,['longitude','lon','lng']));const status=stripHtml(first(record,['status','deviceStatus'])||'');const online=!/(offline|out of service|disabled)/i.test(status);
 return {id:`${state}-${id}`,state,agency:cfg.agency,district:area,name,roadway,direction,latitude:Number.isFinite(lat)?lat:null,longitude:Number.isFinite(lon)?lon:null,messages:[...new Set(messages)],imagePages:[...new Set(imagePages)],active:online&&(messages.length>0||imagePages.length>0),online,demo:false,lastUpdated:first(record,['lastUpdated','updated','modified']),sourceUrl:cfg.pageUrl};
}
function payloadTotal(payload){for(const k of ['recordsTotal','recordsFiltered','iTotalRecords','total','totalCount','count']){const n=Number(payload?.[k]);if(Number.isFinite(n)&&n>=0)return n;}return null;}
function dedupeRecords(records){const seen=new Set();return records.filter((r,i)=>{const key=String(first(r,['id','messageSignId','deviceId','signId'])||JSON.stringify(r));if(seen.has(key))return false;seen.add(key);return true;});}
function create511Adapter(cfg){return async function(){const sample=[{id:`${cfg.state}-DEMO-1`,state:cfg.state,agency:cfg.agency,district:'',name:`${cfg.label} sample sign`,roadway:'',direction:'',latitude:null,longitude:null,messages:[`${cfg.label.toUpperCase()} LIVE FEED FALLBACK`],imagePages:[],active:true,demo:true,sourceUrl:cfg.pageUrl}];try{
 const page=await request(cfg.pageUrl,{headers:{accept:'text/html,application/xhtml+xml'}});saveDebug(cfg.debugEnv,`${cfg.slug}-page.html`,page.text);const token=parseToken(page.text);if(!token)throw new Error(`${cfg.label} verification token not found`);const cookie=cookieHeader(page.response);
 const pageSize=Math.max(25,Math.min(500,Number(process.env.DMS_511_PAGE_SIZE||100)));const maxPages=Math.max(1,Math.min(200,Number(process.env.DMS_511_MAX_PAGES||100)));const all=[];let expected=null;let pages=0;
 for(let pageNo=0;pageNo<maxPages;pageNo++){
  const start=pageNo*pageSize;const query=makeQuery(cfg.columns,cfg.orderColumn,start,pageSize);const endpoint=`${cfg.baseUrl}/List/GetData/MessageSigns?query=${encodeURIComponent(JSON.stringify(query))}&lang=${encodeURIComponent(cfg.lang||'en-US')}`;
  const data=await request(endpoint,{headers:{accept:'application/json, text/javascript, */*; q=0.01',referer:cfg.pageUrl,'content-type':'application/json','x-requested-with':'XMLHttpRequest','__requestverificationtoken':token,...(cookie?{cookie}:{})}});saveDebug(cfg.debugEnv,`${cfg.slug}-data-${pageNo+1}.json`,data.text);
  let payload;try{payload=JSON.parse(data.text)}catch{throw new Error(`${cfg.label} returned non-JSON data`)}
  const records=recordsFromPayload(payload);pages++;if(expected===null)expected=payloadTotal(payload);if(!records.length)break;all.push(...records);
  if(records.length<pageSize)break;if(expected!==null&&all.length>=expected)break;
 }
 const records=dedupeRecords(all);const signs=records.map((r,i)=>normalize(r,i,cfg)).filter(s=>s.name||s.roadway);if(!signs.length)throw new Error(`${cfg.label} returned no recognizable signs`);
 return {signs,status:{state:cfg.statusCode||cfg.state,ok:true,mode:'live-session-endpoint',count:signs.length,note:`${pages} page${pages===1?'':'s'} fetched${expected!==null?`; source reported ${expected}`:''}`}};
 }catch(error){return {signs:sample,status:{state:cfg.statusCode||cfg.state,ok:false,mode:'sample-fallback',count:sample.length,error:error.message}};}}}
module.exports={create511Adapter};
