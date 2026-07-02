'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = 'https://511ga.org';
const PAGE_URL = `${BASE_URL}/messagesigns`;
const DATA_URL = `${BASE_URL}/List/GetData/MessageSigns`;

const sample = [{
  id:'GA-DEMO-1', state:'GA', agency:'Georgia DOT / 511GA', district:'',
  name:'Georgia sample sign', roadway:'I-75', direction:'',
  latitude:null, longitude:null,
  messages:['GEORGIA LIVE FEED FALLBACK'], imagePages:[],
  active:true, demo:true, sourceUrl:PAGE_URL
}];

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripHtml(value) {
  return decodeEntities(String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function first(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  const keys = Object.keys(obj);
  for (const name of names) {
    const key = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (key !== undefined && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') return obj[key];
  }
}

function isNoMessage(value) {
  const normalized = stripHtml(value).toUpperCase().replace(/[\s_-]+/g, ' ').trim();
  return /^(?:NO MESSAGE|NO ACTIVE MESSAGE|BLANK|NONE|N\/?A)$/.test(normalized);
}

function looksLikeImage(value) {
  const s = String(value ?? '');
  return /<img\b|data:image\/|\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)|\/Image\//i.test(s);
}

function absoluteUrl(value) {
  if (!value) return '';
  let raw = String(value).trim();
  const src = raw.match(/(?:src|data-src)\s*=\s*["']([^"']+)["']/i);
  if (src) raw = src[1];
  raw = decodeEntities(raw);
  if (/^data:image\//i.test(raw)) return raw;
  try { return new URL(raw, BASE_URL).href; } catch { return ''; }
}

function extractPages(record) {
  const candidates = [
    first(record,['message','message1','phase1Message','phase1Text','messageText','displayMessage','phase1Image']),
    first(record,['message2','phase2Message','phase2Text','phase2Image']),
    first(record,['message3','phase3Message','phase3Text','phase3Image'])
  ].filter(Boolean);

  const messages=[];
  const imagePages=[];
  for (const candidate of candidates) {
    if (isNoMessage(candidate)) continue;
    if (looksLikeImage(candidate)) {
      const url=absoluteUrl(candidate);
      if (url && !/NO[_-]?MESSAGE/i.test(url)) imagePages.push(url);
    } else {
      const text=stripHtml(candidate);
      if (text && !isNoMessage(text)) messages.push(text);
    }
  }
  return {
    messages:messages.filter((x,i,a)=>a.indexOf(x)===i),
    imagePages:imagePages.filter((x,i,a)=>a.indexOf(x)===i)
  };
}

function normalize(record, index) {
  const description = stripHtml(first(record,['description','name','locationName','location']) || `511GA sign ${index + 1}`);
  const roadway = stripHtml(first(record,['roadwayName','roadway','routeName','route']) || '');
  const direction = stripHtml(first(record,['direction','travelDirection']) || '');
  const area = stripHtml(first(record,['area','region','district']) || '');
  const id = stripHtml(first(record,['id','messageSignId','deviceId','signId']) || Buffer.from(`${description}|${roadway}|${direction}`).toString('base64url').slice(0,24));
  const latitudeRaw = first(record,['latitude','lat']);
  const longitudeRaw = first(record,['longitude','lon','lng']);
  const {messages,imagePages}=extractPages(record);
  const status=stripHtml(first(record,['status','deviceStatus']) || '');
  const online=!/(offline|out of service|disabled)/i.test(status);
  return {
    id:`GA-${id}`, state:'GA', agency:'Georgia DOT / 511GA', district:area,
    name:description, roadway, direction,
    latitude:Number.isFinite(Number(latitudeRaw)) ? Number(latitudeRaw) : null,
    longitude:Number.isFinite(Number(longitudeRaw)) ? Number(longitudeRaw) : null,
    messages,imagePages,active:online && (messages.length>0 || imagePages.length>0),
    online,demo:false,lastUpdated:first(record,['lastUpdated','updated','modified']),sourceUrl:PAGE_URL
  };
}

function parseToken(html) {
  const patterns=[
    /<input[^>]+name=["']__RequestVerificationToken["'][^>]+value=["']([^"']+)["']/i,
    /<input[^>]+value=["']([^"']+)["'][^>]+name=["']__RequestVerificationToken["']/i,
    /__RequestVerificationToken["']?\s*[:=]\s*["']([^"']+)["']/i
  ];
  for (const pattern of patterns) { const match=html.match(pattern); if(match) return decodeEntities(match[1]); }
  return '';
}

function cookieHeader(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  const raw=response.headers.get('set-cookie') || '';
  return raw.split(/,(?=[^;,]+=)/).map(v=>v.split(';')[0]).filter(Boolean).join('; ');
}

function makeQuery() {
  return {
    columns:[
      {data:null,name:''},{name:'description'},{name:'roadwayName'},{name:'direction'},
      {name:'message'},{name:'lastUpdated'},{data:6,name:''}
    ],
    order:[{column:2,dir:'asc'}],start:0,
    length:Number(process.env.GA511_LIMIT || 5000),search:{value:''}
  };
}

function saveDebug(name,text) {
  if(!/^(?:1|true|yes)$/i.test(process.env.GA511_DEBUG || '')) return;
  const dir=path.join(process.cwd(),'debug');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),text);
}

async function request(url,options={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Number(process.env.GA511_TIMEOUT_MS || 20000));
  try {
    const response=await fetch(url,{...options,headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36',...(options.headers||{})},signal:controller.signal});
    const text=await response.text();
    if(!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0,180)}`);
    return {response,text};
  } finally {clearTimeout(timer);}
}

function recordsFromPayload(payload) {
  if(Array.isArray(payload)) return payload;
  if(!payload || typeof payload!=='object') return [];
  for(const key of ['data','Data','aaData','items','results','messageSigns']) if(Array.isArray(payload[key])) return payload[key];
  for(const value of Object.values(payload)) if(Array.isArray(value)&&value.length&&typeof value[0]==='object') return value;
  return [];
}

async function fetchGeorgia() {
  try {
    const page=await request(PAGE_URL,{headers:{accept:'text/html,application/xhtml+xml'}});
    saveDebug('511ga-page.html',page.text);
    const token=parseToken(page.text);
    if(!token) throw new Error('511GA verification token was not found on the public page');
    const cookie=cookieHeader(page.response);
    const endpoint=`${DATA_URL}?query=${encodeURIComponent(JSON.stringify(makeQuery()))}&lang=en-US`;
    const data=await request(endpoint,{headers:{
      accept:'application/json, text/javascript, */*; q=0.01',
      referer:PAGE_URL,
      'content-type':'application/json',
      'x-requested-with':'XMLHttpRequest',
      '__requestverificationtoken':token,
      ...(cookie?{cookie}:{})
    }});
    saveDebug('511ga-data.json',data.text);
    let payload; try{payload=JSON.parse(data.text);}catch{throw new Error(`511GA returned non-JSON data: ${stripHtml(data.text).slice(0,120)}`);}
    const records=recordsFromPayload(payload);
    const signs=records.map(normalize).filter(s=>s.name||s.roadway);
    if(!signs.length) throw new Error('511GA returned no recognizable message-sign records; set GA511_DEBUG=1 and inspect debug/511ga-data.json');
    return {signs,status:{state:'GA',ok:true,mode:'live-session-endpoint',count:signs.length}};
  } catch(error) {
    return {signs:sample,status:{state:'GA',ok:false,mode:'sample-fallback',count:sample.length,error:error.message}};
  }
}

module.exports={fetchGeorgia,parseToken,recordsFromPayload,normalize,isNoMessage};
