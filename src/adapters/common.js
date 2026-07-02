'use strict';

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function stripHtml(value) {
  return decodeEntities(String(value ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
  return !normalized || /^(?:NO MESSAGE|NO ACTIVE MESSAGE|BLANK|NONE|N\/?A|NULL)$/.test(normalized);
}
function cleanMulti(value) {
  return decodeEntities(String(value ?? '')).replace(/\[np[^\]]*\]/gi, '\f').replace(/\[nl[^\]]*\]/gi, '\n').replace(/\[[^\]]*\]/g, '')
    .replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}
function splitPages(value) {
  const cleaned = cleanMulti(value);
  return cleaned.split(/\f|\n\s*(?:-{2,}\s*)?PAGE(?:\s*-{2,})?\s*\n/i).map(stripHtml).filter(v => !isNoMessage(v));
}
function recordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['data','Data','aaData','items','results','messageSigns','features','dms']) if (Array.isArray(payload[key])) return payload[key];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && (!value.length || typeof value[0] === 'object')) return value;
    if (value && typeof value === 'object') { const nested=recordsFromPayload(value); if(nested.length) return nested; }
  }
  return [];
}
function parseToken(html) {
  for (const p of [/<input[^>]+name=["']__RequestVerificationToken["'][^>]+value=["']([^"']+)["']/i,/<input[^>]+value=["']([^"']+)["'][^>]+name=["']__RequestVerificationToken["']/i,/__RequestVerificationToken["']?\s*[:=]\s*["']([^"']+)["']/i]) { const m=html.match(p); if(m) return decodeEntities(m[1]); }
  return '';
}
function cookieHeader(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  const raw=response.headers.get('set-cookie') || '';
  return raw.split(/,(?=[^;,]+=)/).map(v=>v.split(';')[0]).filter(Boolean).join('; ');
}
async function request(url, options={}, timeout=25000) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
  try { const response=await fetch(url,{...options,headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36',...(options.headers||{})},signal:controller.signal}); const text=await response.text(); if(!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0,180)}`); return {response,text}; }
  finally { clearTimeout(timer); }
}
module.exports={decodeEntities,stripHtml,first,isNoMessage,cleanMulti,splitPages,recordsFromPayload,parseToken,cookieHeader,request};
