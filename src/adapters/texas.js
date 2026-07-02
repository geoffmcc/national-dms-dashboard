'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fetchText } = require('../http');

const DISTRICTS = ['ABL','AMA','ATL','AUS','BMT','BWD','BRY','CHS','CRP','DAL','ELP','FTW','HOU','LRD','LBB','LFK','ODA','PAR','PHR','SJT','SAT','TYL','WAC','WFS','YKM'];
const sample = [{ id:'TX-DEMO-SAT-1', state:'TX', agency:'TxDOT', district:'SAT', name:'I-35 NB near Loop 410', roadway:'I-35', direction:'Northbound', latitude:29.515, longitude:-98.396, messages:['TEXAS ENDPOINT FALLBACK','LIVE RESPONSE COULD NOT BE PARSED'], active:true, demo:true, sourceUrl:'https://its.txdot.gov/its/District/SAT/dms-messages' }];

function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeMulti(value) {
  // TxDOT returns NTCIP MULTI strings. Keep only the visible message text.
  // [nl] = new line, [np] = new page; the remaining bracketed tokens control
  // fonts, colors, justification, timing, graphics, spacing, and flashing.
  return decodeEntities(String(value ?? ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[(?:np|newpage)\d*\]/gi, '\n\n')
    .replace(/\[(?:nl|newline)\d*\]/gi, '\n')
    .replace(/\[[^\]\r\n]*\]/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clean(value) {
  return decodeMulti(value);
}

function isEmptyMessage(value) {
  const s = clean(value);
  return !s || /NO\s+MESSAGE\s+IS\s+CURRENTLY\s+DISPLAYED|NO\s+MESSAGE|NOT\s+DISPLAYING|BLANK/i.test(s);
}

function getCaseInsensitive(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  const keys = Object.keys(obj);
  for (const name of names) {
    const key = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (key !== undefined) return obj[key];
  }
  return undefined;
}

function firstUseful(obj, names) {
  for (const name of names) {
    const value = getCaseInsensitive(obj, [name]);
    if (value !== undefined && value !== null && clean(value)) return value;
  }
  return undefined;
}

function messageValues(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(messageValues);
  if (typeof value === 'object') {
    const ordered = ['message','messageText','text','displayText','pageText','value','description'];
    const direct = firstUseful(value, ordered);
    if (direct !== undefined) return messageValues(direct);
    return Object.values(value).flatMap(messageValues);
  }
  const raw = clean(value);
  if (!raw || isEmptyMessage(raw)) return [];
  return raw
    // MULTI [np] tokens have already become blank-line page separators.
    // Pipes and semicolons are retained as legacy fallbacks for other feeds.
    .split(/\n{2,}|\s*\|\s*|\s*;\s*(?=[A-Z0-9])/)
    .map(clean)
    .filter(Boolean)
    .filter(x => !isEmptyMessage(x));
}

function probableRoadway(text) {
  const m = clean(text).match(/\b(?:IH|I|US|SH|SL|FM|RM|BU|LP)[-\s]*\d+[A-Z]?\b/i);
  return m ? m[0].replace(/\s+/g, '') : '';
}

function probableDirection(text) {
  const m = clean(text).match(/\b(NORTHBOUND|SOUTHBOUND|EASTBOUND|WESTBOUND|NB|SB|EB|WB)\b/i);
  if (!m) return '';
  return ({NB:'Northbound',SB:'Southbound',EB:'Eastbound',WB:'Westbound'})[m[1].toUpperCase()] || (m[1][0].toUpperCase()+m[1].slice(1).toLowerCase());
}

function recordLooksLikeSign(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  const joined = keys.join(' ');
  const hasIdentity = /(dms|device|sign|location|roadway|route|name|description)/.test(joined);
  const hasMessage = /(message|display|text|msg|page)/.test(joined);
  return hasIdentity && hasMessage;
}

function collectRecords(value, out = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(v => collectRecords(v, out, seen));
    return out;
  }
  if (recordLooksLikeSign(value)) out.push(value);
  Object.values(value).forEach(v => collectRecords(v, out, seen));
  return out;
}

function normalizeRecord(obj, district, index) {
  const nameValue = firstUseful(obj, [
    'dmsName','deviceName','signName','name','locationName','location','description','deviceLocation','dmsLocation'
  ]);
  const roadwayValue = firstUseful(obj, ['roadway','route','routeName','highway','roadName','road']);
  const directionValue = firstUseful(obj, ['direction','travelDirection','dir']);
  const messageValue = firstUseful(obj, [
    'currentMessage','dmsMessage','messageText','displayMessage','message','messages','msg','signMessage','messagePages','pages'
  ]);
  const statusValue = firstUseful(obj, ['status','deviceStatus','dmsStatus','onlineStatus','isOnline']);
  const idValue = firstUseful(obj, ['dmsId','deviceId','signId','id','deviceNumber','assetId']);
  const latValue = firstUseful(obj, ['latitude','lat','y']);
  const lonValue = firstUseful(obj, ['longitude','lon','lng','x']);

  const context = [nameValue, roadwayValue, directionValue].map(clean).filter(Boolean).join(' ');
  const name = clean(nameValue) || context || `TxDOT ${district} sign ${index + 1}`;
  const messages = messageValues(messageValue);
  const statusText = clean(statusValue).toLowerCase();
  const online = statusValue === undefined || statusValue === null || statusValue === true || !/(offline|out of service|false|0)/.test(statusText);
  const identity = clean(idValue) || Buffer.from(name).toString('base64url').slice(0, 20) || String(index + 1);

  return {
    id: `TX-${district}-${identity}`,
    state: 'TX',
    agency: 'TxDOT',
    district,
    name,
    roadway: clean(roadwayValue) || probableRoadway(context),
    direction: clean(directionValue) || probableDirection(context),
    latitude: Number.isFinite(Number(latValue)) ? Number(latValue) : null,
    longitude: Number.isFinite(Number(lonValue)) ? Number(lonValue) : null,
    messages,
    active: online && messages.length > 0,
    online,
    demo: false,
    sourceUrl: `https://its.txdot.gov/its/District/${district}/dms-messages`
  };
}

function parseJsonPayload(text, district) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }

  // ASP.NET endpoints sometimes JSON-encode the actual payload as a string.
  for (let i = 0; i < 3 && typeof data === 'string'; i++) {
    const trimmed = data.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) break;
    try { data = JSON.parse(trimmed); } catch { break; }
  }

  const records = collectRecords(data);
  const signs = records.map((r, i) => normalizeRecord(r, district, i));
  const unique = new Map();
  for (const sign of signs) {
    const key = `${sign.id}|${sign.name}|${sign.messages.join('|')}`;
    if (!unique.has(key)) unique.set(key, sign);
  }
  return [...unique.values()];
}

function parseHtmlPayload(text, district) {
  const rendered = htmlToText(text);
  const chunks = rendered.split(/(?=Status\s*:\s*Device\s+(?:Online|Offline))/i);
  const signs = [];

  chunks.forEach((chunk, i) => {
    if (!/Status\s*:\s*Device\s+(?:Online|Offline)/i.test(chunk)) return;
    const lines = chunk.split('\n').map(clean).filter(Boolean);
    const statusLine = lines.find(x => /Status\s*:\s*Device/i.test(x)) || '';
    const online = !/Offline/i.test(statusLine);
    const messageStart = lines.findIndex(x => /^Message\s*:?/i.test(x));
    let messages = [];
    if (messageStart >= 0) {
      messages = messageValues(lines.slice(messageStart).join('\n').replace(/^Message\s*:?/i, ''));
    }
    const locationLine = lines.find(x => /(?:IH|I|US|SH|SL|FM|RM|BU|LP)[-\s]*\d+/i.test(x)) || lines[0] || `TxDOT ${district} sign ${i + 1}`;
    signs.push({
      id:`TX-${district}-${i + 1}-${Buffer.from(locationLine).toString('base64url').slice(0,12)}`,
      state:'TX', agency:'TxDOT', district, name:locationLine,
      roadway:probableRoadway(locationLine), direction:probableDirection(locationLine),
      latitude:null, longitude:null, messages, active:online && messages.length > 0,
      online, demo:false, sourceUrl:`https://its.txdot.gov/its/District/${district}/dms-messages`
    });
  });
  return signs;
}

function saveDebug(district, body, contentType) {
  if (!/^(?:1|true|yes)$/i.test(process.env.TXDOT_DEBUG || '')) return;
  const dir = path.join(process.cwd(), 'debug');
  fs.mkdirSync(dir, { recursive:true });
  fs.writeFileSync(path.join(dir, `txdot-${district}-endpoint.txt`), body);
  fs.writeFileSync(path.join(dir, `txdot-${district}-metadata.txt`), `content-type: ${contentType || 'unknown'}\nbytes: ${Buffer.byteLength(body)}\n`);
}

function parseHtmlCardsLegacy(text, district) {
  const rendered = htmlToText(text);
  const out = [];
  const re = /([\s\S]{0,1000}?)Status\s*:\s*Device\s+(Online|Offline)/gi;
  let m; let i = 0;
  while ((m = re.exec(rendered))) {
    const lines = m[1].split('\n').map(clean).filter(Boolean);
    const name = lines.find(x => /(?:IH|I|US|SH|SL|FM|RM|BU|LP)[-\s]*\d+/i.test(x)) || lines[0] || `TxDOT ${district} sign ${++i}`;
    const messageLines = lines.filter(x => x !== name && !/^Status/i.test(x));
    const messages = messageValues(messageLines.join('\n'));
    out.push({
      id:`TX-${district}-${++i}-${Buffer.from(name).toString('base64url').slice(0,12)}`,
      state:'TX', agency:'TxDOT', district, name, roadway:probableRoadway(name), direction:probableDirection(name),
      latitude:null, longitude:null, messages, active:/Online/i.test(m[2]) && messages.length > 0,
      online:/Online/i.test(m[2]), demo:false, sourceUrl:`https://its.txdot.gov/its/District/${district}/dms-messages`
    });
  }
  return out;
}

async function oneDistrict(district) {
  const endpoint = `https://its.txdot.gov/its/DistrictIts/GetDmsListByDistrict?districtCode=${encodeURIComponent(district)}`;
  const referer = `https://its.txdot.gov/its/District/${district}/dms-messages`;
  const { text, response } = await fetchText(endpoint, {
    accept:'*/*',
    headers:{
      referer,
      'x-requested-with':'XMLHttpRequest',
      'content-type':'application/json; charset=utf-8'
    }
  });
  saveDebug(district, text, response.headers.get('content-type'));

  let signs = parseJsonPayload(text, district);
  if (!signs.length) signs = parseHtmlPayload(text, district);
  return signs;
}

async function fetchTexas() {
  let requested = (process.env.TXDOT_DISTRICTS || 'SAT').toUpperCase().split(',').map(x => x.trim()).filter(Boolean);
  if (requested.includes('ALL')) requested = DISTRICTS;
  requested = requested.filter(x => DISTRICTS.includes(x));
  if (!requested.length) requested = ['SAT'];

  const signs = [];
  const errors = [];
  for (let i = 0; i < requested.length; i += 4) {
    const batch = requested.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map(oneDistrict));
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') signs.push(...r.value);
      else errors.push(`${batch[j]}: ${r.reason.message}`);
    });
  }

  if (!signs.length) {
    return {
      signs: sample,
      status:{
        state:'TX', ok:false, mode:'sample-fallback', count:sample.length, districts:requested,
        error:errors.join(' | ') || 'TxDOT endpoint returned data, but no signs were recognized. Set TXDOT_DEBUG=1 and inspect debug/txdot-SAT-endpoint.txt.'
      }
    };
  }

  return {
    signs,
    status:{ state:'TX', ok:errors.length===0, mode:'live-endpoint', count:signs.length, districts:requested, errors }
  };
}

module.exports = { fetchTexas, parseJsonPayload, parseHtmlPayload, parseHtmlCards: parseHtmlCardsLegacy, htmlToText, DISTRICTS };
