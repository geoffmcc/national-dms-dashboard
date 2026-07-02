'use strict';
const { fetchTexas } = require('./adapters/texas');
const { fetchPA, fetchGA, fetchNY, fetchLA, fetchWI, fetchAZ, fetchNE, fetchAK, fetchNV, fetchFL, fetchID, fetchNC, fetchCAKern } = require('./adapters/more511');
const { fetchMaryland } = require('./adapters/maryland');
const { fetchVirginia } = require('./adapters/virginia');
const { fetchIowa } = require('./adapters/iowa');
const { fetchOklahoma } = require('./adapters/oklahoma');
const { fetchAlabama } = require('./adapters/alabama');
const { fetchNittec } = require('./adapters/nittec');

let cached=null,cachedAt=0,refreshPromise=null;
const adapters=[
  fetchNY,fetchTexas,fetchPA,fetchGA,fetchLA,fetchWI,fetchAZ,
  fetchMaryland,fetchVirginia,fetchNE,fetchAK,fetchNV,fetchFL,fetchID,fetchNC,
  fetchCAKern,fetchIowa,fetchOklahoma,fetchNittec,fetchAlabama
];

const PUBLIC_SAFETY_ALERT_RX=/\b(?:AMBER|SILVER|ASHANTI|GOLD|BLUE|CLEAR|PURPLE|GREEN|EBONY|FEATHER)\s+ALERT\b|\bCHILD\s+(?:ABDUCTION|MISSING)\b|\bMISSING\s+CHILD\b|\b(?:ENDANGERED\s+MISSING|MISSING\s+ENDANGERED)\s+(?:PERSON|ADULT|CHILD)\b|\bMISSING\s+INDIGENOUS\s+PERSON\s+ALERT\b|\bENDANGERED\s+MISSING\s+ADVISORY\b/i;
const CATEGORY_RULES=[
  ['AMBER / Silver Alert',/\b(?:AMBER|SILVER)\s+ALERT\b|\bCHILD\s+(?:ABDUCTION|MISSING)\b|\bMISSING\s+CHILD\b/i],
  ['Public Safety Alert',PUBLIC_SAFETY_ALERT_RX],
  ['Emergency alert',/EVACUAT(?:E|ION)|EMERGENCY|CIVIL\s+ALERT/i],
  ['Crash / incident',/\b(?:CRASH|ACCIDENT|COLLISION|INCIDENT|WRECK)\b/i],
  ['Closure',/\b(?:CLOSED|CLOSURE|SHUT\s*DOWN|ROAD\s+CLOSED)\b/i],
  ['Lane restriction',/\b(?:LANE|SHOULDER)\b.*\b(?:CLOSED|BLOCKED|ONLY)|\b(?:LEFT|RIGHT|CENTER)\s+LANE\b/i],
  ['Detour',/\bDETOUR\b|ALTERNATE\s+ROUTE/i],
  ['Construction / roadwork',/\b(?:ROADWORK|CONSTRUCTION|WORK\s+ZONE|PAVING|MAINTENANCE)\b/i],
  ['Congestion / delays',/\b(?:DELAY|DELAYS|SLOW\s+TRAFFIC|CONGESTION|BACKUP|HEAVY\s+TRAFFIC|STOPPED\s+TRAFFIC)\b/i],
  ['Weather',/\b(?:SNOW|ICE|ICY|FOG|WIND|FLOOD|RAIN|STORM|TORNADO|HURRICANE|BLIZZARD|WHITEOUT|WEATHER)\b/i],
  ['Travel time',/\b\d+\s*(?:MIN|MINS|MINUTES)\b|TRAVEL\s+TIME/i],
  ['International border / customs',/\b(?:CUSTOMS|PORT\s+OF\s+ENTRY|CANADA|MEXICO|MEXICAN|CANADIAN|NEXUS|SENTRI|PASSPORT|BORDER\s+WAIT|CUSTOMS\s+WAIT|INTERNATIONAL\s+(?:BRIDGE|BORDER|CROSSING)|US[-\s]?(?:CANADA|MEXICO)\s+BORDER)\b/i],
  ['Safety message',/\b(?:BUCKLE\s+UP|SEAT\s*BELT|DON'T\s+TEXT|DO\s+NOT\s+TEXT|DRIVE\s+SOBER|MOVE\s+OVER|SLOW\s+DOWN|WATCH\s+FOR|ARRIVE\s+ALIVE)\b/i]
];
function messageText(sign){return [sign.name,sign.roadway,sign.district,...(sign.messages||[])].filter(Boolean).join(' \n ');}
function enrich(sign){
  const text=messageText(sign);const categories=CATEGORY_RULES.filter(([,rx])=>rx.test(text)).map(([name])=>name);
  if(!categories.length&&sign.active)categories.push('Other');
  const amber=categories.includes('AMBER / Silver Alert');
  const publicSafetyAlert=PUBLIC_SAFETY_ALERT_RX.test(text);
  const border=Boolean(sign.borderApproach)||categories.includes('International border / customs');
  if(border&&!categories.includes('International border / customs'))categories.push('International border / customs');
  return {...sign,categories:[...new Set(categories)],amber,publicSafetyAlert,border};
}

async function refreshData(){
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
    const settled=await Promise.all(adapters.map(fn=>fn()));
    const signs=settled.flatMap(x=>x.signs||[]).map(enrich).sort((a,b)=>a.state.localeCompare(b.state)||String(a.name).localeCompare(String(b.name)));
    const refreshSeconds=Math.max(60,Number(process.env.AUTO_REFRESH_SECONDS||120));
    cached={generatedAt:new Date().toISOString(),nextRefreshAt:new Date(Date.now()+refreshSeconds*1000).toISOString(),refreshSeconds,signs,sources:settled.map(x=>x.status),totals:{signs:signs.length,active:signs.filter(x=>x.active).length,states:new Set(signs.map(x=>x.state)).size,amber:signs.filter(x=>x.amber).length,publicSafetyAlerts:signs.filter(x=>x.publicSafetyAlert).length,border:signs.filter(x=>x.border).length}};
    cachedAt=Date.now();return cached;
  })().finally(()=>{refreshPromise=null});
  return refreshPromise;
}
async function getDashboardData({force=false}={}){
  const ttl=Math.max(30,Number(process.env.CACHE_SECONDS||90))*1000;
  if(force||!cached||Date.now()-cachedAt>=ttl)await refreshData();
  return {...cached,cache:{hit:!force,ageSeconds:Math.round((Date.now()-cachedAt)/1000)}};
}
function startAutoRefresh(){
  const seconds=Math.max(60,Number(process.env.AUTO_REFRESH_SECONDS||120));
  setInterval(()=>refreshData().catch(error=>console.error('Background refresh failed:',error.message)),seconds*1000).unref();
}
module.exports={getDashboardData,startAutoRefresh,refreshData,enrich};
