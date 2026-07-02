'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PAGE_URL = 'https://www.511pa.com/messagesigns';
const DATA_URL = 'https://www.511pa.com/List/GetData/MessageSigns';

const sample = [{
  id:'PA-DEMO-1', state:'PA', agency:'PennDOT / 511PA', district:'',
  name:'Pennsylvania sample sign', roadway:'I-90', direction:'',
  latitude:null, longitude:null,
  messages:['PENNSYLVANIA LIVE FEED FALLBACK'], imagePages:[],
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

function absoluteUrl(value) {
  if (!value) return '';
  let raw = String(value).trim();
  const src = raw.match(/(?:src|data-src)\s*=\s*["']([^"']+)["']/i);
  if (src) raw = src[1];
  raw = decodeEntities(raw);
  if (/^data:image\//i.test(raw)) return raw;
  try { return new URL(raw, 'https://www.511pa.com').href; } catch { return ''; }
}

function looksLikeImage(value) {
  const s = String(value ?? '');
  return /<img\b|data:image\/|\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)|\/Image\//i.test(s);
}

function isNoMessage(value) {
  const normalized = stripHtml(value)
    .toUpperCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
  return /^(?:NO MESSAGE|NO ACTIVE MESSAGE|BLANK|NONE|N\/?A)$/.test(normalized);
}

function isNoMessageImage(value) {
  const decoded = decodeEntities(String(value ?? '')).toUpperCase();
  return /(?:^|[\/_-])NO[_-]?MESSAGE(?:[\/_?.-]|$)/.test(decoded);
}

function extractPages(record) {
  const imageCandidates = [
    first(record,['phase1Image','messageImage','image1','phaseOneImage']),
    first(record,['phase2Image','message2Image','image2','phaseTwoImage']),
    first(record,['phase3Image','message3Image','image3'])
  ].filter(Boolean);
  const imagePages = imageCandidates
    .filter(looksLikeImage)
    .filter(candidate => !isNoMessageImage(candidate))
    .map(absoluteUrl)
    .filter(Boolean);

  const textCandidates = [
    first(record,['message','message1','phase1Message','phase1Text','messageText','displayMessage']),
    first(record,['message2','phase2Message','phase2Text']),
    first(record,['message3','phase3Message','phase3Text'])
  ].filter(Boolean);

  // Some 511PA responses put plain text in phase*Image despite the field name.
  for (const candidate of imageCandidates) {
    if (!looksLikeImage(candidate)) textCandidates.push(candidate);
  }

  const messages = textCandidates
    .map(stripHtml)
    .filter(Boolean)
    .filter(message => !isNoMessage(message))
    .filter((x,i,a)=>a.indexOf(x)===i);
  return { messages, imagePages };
}

function normalize(record, index) {
  const name = stripHtml(first(record,['name','locationName','description','location']) || `511PA sign ${index + 1}`);
  const roadway = stripHtml(first(record,['roadwayName','roadway','routeName','route']) || '');
  const direction = stripHtml(first(record,['direction','travelDirection']) || '');
  const area = stripHtml(first(record,['area','region','district']) || '');
  const id = stripHtml(first(record,['id','messageSignId','deviceId','signId']) || Buffer.from(`${name}|${roadway}|${direction}`).toString('base64url').slice(0,24));
  const latitudeRaw = first(record,['latitude','lat']);
  const longitudeRaw = first(record,['longitude','lon','lng']);
  const { messages, imagePages } = extractPages(record);
  const status = stripHtml(first(record,['status','deviceStatus']) || '');
  const online = !/(offline|out of service|disabled)/i.test(status);
  return {
    id:`PA-${id}`, state:'PA', agency:'PennDOT / 511PA', district:area,
    name, roadway, direction,
    latitude:Number.isFinite(Number(latitudeRaw)) ? Number(latitudeRaw) : null,
    longitude:Number.isFinite(Number(longitudeRaw)) ? Number(longitudeRaw) : null,
    messages, imagePages, active:online && (messages.length > 0 || imagePages.length > 0),
    online, demo:false, lastUpdated:first(record,['lastUpdated','updated','modified']), sourceUrl:PAGE_URL
  };
}

function parseToken(html) {
  const patterns = [
    /<input[^>]+name=["']__RequestVerificationToken["'][^>]+value=["']([^"']+)["']/i,
    /<input[^>]+value=["']([^"']+)["'][^>]+name=["']__RequestVerificationToken["']/i,
    /__RequestVerificationToken["']?\s*[:=]\s*["']([^"']+)["']/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]);
  }
  return '';
}

function cookieHeader(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  }
  const raw = response.headers.get('set-cookie') || '';
  return raw.split(/,(?=[^;,]+=)/).map(v=>v.split(';')[0]).filter(Boolean).join('; ');
}

function makeQuery() {
  return {
    columns:[
      {data:null,name:''}, {name:'area',s:true}, {name:'name'}, {name:'roadwayName'},
      {name:'direction'}, {data:'phase1Image',name:'message'},
      {data:'phase2Image',name:'message2'}, {name:'lastUpdated'}, {data:8,name:''}
    ],
    order:[{column:1,dir:'asc'}], start:0,
    length:Number(process.env.PA511_LIMIT || 5000), search:{value:''}
  };
}

function saveDebug(name, text) {
  if (!/^(?:1|true|yes)$/i.test(process.env.PA511_DEBUG || '')) return;
  const dir = path.join(process.cwd(),'debug');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,name),text);
}

async function request(url, options={}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), Number(process.env.PA511_TIMEOUT_MS || 20000));
  try {
    const response = await fetch(url, {
      ...options,
      headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36',
        ...(options.headers || {})
      },
      signal:controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0,180)}`);
    return {response,text};
  } finally { clearTimeout(timer); }
}

function recordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['data','Data','aaData','items','results','messageSigns']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && value.length && typeof value[0] === 'object') return value;
  }
  return [];
}

async function fetchPennsylvania() {
  try {
    const page = await request(PAGE_URL, {headers:{accept:'text/html,application/xhtml+xml'}});
    saveDebug('511pa-page.html',page.text);
    const token = parseToken(page.text);
    if (!token) throw new Error('511PA verification token was not found on the public page');
    const cookie = cookieHeader(page.response);
    const endpoint = `${DATA_URL}?query=${encodeURIComponent(JSON.stringify(makeQuery()))}&lang=en-US`;
    const data = await request(endpoint, {headers:{
      accept:'application/json, text/javascript, */*; q=0.01',
      referer:'https://www.511pa.com/messagesigns?start=0&length=25&order%5Bi%5D=1&order%5Bdir%5D=asc',
      'content-type':'application/json',
      'x-requested-with':'XMLHttpRequest',
      '__RequestVerificationToken':token,
      ...(cookie ? {cookie} : {})
    }});
    saveDebug('511pa-data.json',data.text);
    let payload;
    try { payload=JSON.parse(data.text); } catch { throw new Error(`511PA returned non-JSON data: ${stripHtml(data.text).slice(0,120)}`); }
    const records=recordsFromPayload(payload);
    const signs=records.map(normalize).filter(s=>s.name || s.roadway);
    if (!signs.length) throw new Error('511PA returned no recognizable message-sign records; set PA511_DEBUG=1 and inspect debug/511pa-data.json');
    return {signs,status:{state:'PA',ok:true,mode:'live-session-endpoint',count:signs.length}};
  } catch (error) {
    return {signs:sample,status:{state:'PA',ok:false,mode:'sample-fallback',count:sample.length,error:error.message}};
  }
}

module.exports={fetchPennsylvania,parseToken,recordsFromPayload,normalize,isNoMessage};
