'use strict';

const { request, stripHtml, isNoMessage } = require('./common');

const FEED = 'https://www.nittec.org/content/json/nittec.js';
const PAGE = 'https://www.nittec.org/traffic_map/';

// Physical U.S.-side approach signs serving Canada-bound traffic in the
// Buffalo-Niagara corridor. These remain border signs even when the current
// message is generic (weather, safety, road work, etc.).
const INTERNATIONAL_BORDER_APPROACH_IDS = new Set([
  7,    // I-190 North before Ogden/Dingens St.
  18,   // I-190 North before Sheridan Dr.
  325,  // I-190 North before Hamburg St.
  716,  // I-190 North before Niagara St.
  717,  // I-190 North between Niagara St. and Peace Bridge
  766,  // I-190 North before Peace Bridge Exit
  767,  // Exit 9 Niagara Street ramp at Peace Bridge split
  768   // Exit 9 Peace Bridge Authority ramp
]);

function numericEntries(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).sort(([a], [b]) => Number(a) - Number(b));
}

function parsePages(phases) {
  return numericEntries(phases)
    .map(([, lines]) => numericEntries(lines)
      .map(([, line]) => stripHtml(line))
      .filter(Boolean)
      .join('\n')
      .trim())
    .filter(page => !isNoMessage(page));
}

function normalize(record, index) {
  const messages = parsePages(record.phs);
  const status = String(record.s || '').trim().toUpperCase();
  const online = !/(?:NOT IN SERVICE|OFFLINE|OUT OF SERVICE|FAILED|ERROR)/i.test(status);
  const latitude = Number(record.la);
  const longitude = Number(record.lo);
  const agency = stripHtml(record.a || 'NITTEC');

  return {
    id: `NITTEC-${record.i ?? index}`,
    state: 'NY',
    agency,
    district: 'NITTEC Buffalo–Niagara',
    name: stripHtml(record.n || record.d || `NITTEC sign ${index + 1}`),
    roadway: stripHtml(record.l || record.d || ''),
    direction: '',
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    messages,
    imagePages: [],
    active: online && messages.length > 0,
    online,
    demo: false,
    lastUpdated: record.ts || null,
    sourceUrl: PAGE,
    source: 'NITTEC',
    description: stripHtml(record.d || ''),
    pageDurationMs: Number.isFinite(Number(record.du)) ? Number(record.du) : null,
    borderApproach: INTERNATIONAL_BORDER_APPROACH_IDS.has(Number(record.i))
  };
}

async function fetchNittec() {
  try {
    const cacheBuster = Date.now();
    const { text } = await request(`${FEED}?${cacheBuster}`, {
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        referer: PAGE,
        'x-requested-with': 'XMLHttpRequest'
      }
    });

    const payload = JSON.parse(text);
    const container = Array.isArray(payload.vms) ? payload.vms[0] : payload.vms;
    const records = container && typeof container === 'object' ? Object.values(container) : [];
    const signs = records.map(normalize);

    if (!signs.length) throw new Error('NITTEC returned no VMS records');

    return {
      signs,
      status: {
        state: 'NITTEC',
        ok: true,
        mode: 'live-json-feed',
        count: signs.length
      }
    };
  } catch (error) {
    return {
      signs: [],
      status: {
        state: 'NITTEC',
        ok: false,
        mode: 'unavailable',
        count: 0,
        error: error.message
      }
    };
  }
}

module.exports = { fetchNittec, normalize, parsePages };
