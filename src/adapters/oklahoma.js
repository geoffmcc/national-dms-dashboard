'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { request, stripHtml, splitPages, isNoMessage } = require('./common');

const URL = 'https://oktraffic.org/api/Signs';
const PAGE = 'https://oktraffic.org/';

const FILTER = {
  include: [
    {
      relation: 'device',
      scope: {
        include: {
          relation: 'address',
          scope: {
            fields: ['name', 'city', 'latitude', 'longitude', 'direction']
          }
        }
      }
    },
    {
      relation: 'signType',
      scope: { fields: ['modulePerLine'] }
    },
    {
      relation: 'dmsStatus',
      scope: { fields: ['message', 'recordTime'] }
    }
  ]
};

function debugEnabled() {
  return /^(?:1|true|yes)$/i.test(process.env.OKTRAFFIC_DEBUG || '');
}

function saveDebug(text) {
  if (!debugEnabled()) return;
  const dir = path.join(process.cwd(), 'debug');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'oktraffic-signs.json'), text);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestStatus(record) {
  const candidates = [
    ...asArray(record.dmsStatus),
    ...asArray(record.dmsStatuses),
    ...asArray(record.status),
    ...asArray(record.statuses)
  ].filter(Boolean);

  if (!candidates.length) return {};
  return candidates.sort((a, b) => {
    const at = Date.parse(a.recordTime || a.updatedAt || a.lastUpdated || 0) || 0;
    const bt = Date.parse(b.recordTime || b.updatedAt || b.lastUpdated || 0) || 0;
    return bt - at;
  })[0];
}

function normalizeMessage(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('\f');
  if (value && typeof value === 'object') {
    return value.message || value.text || value.value || value.displayMessage || '';
  }
  return value == null ? '' : String(value);
}

function fetchAddress(record) {
  const device = record.device || record.Device || {};
  const address = device.address || device.Address || record.address || record.Address || {};
  return { device, address };
}

function toSign(record, index) {
  const { device, address } = fetchAddress(record);
  const status = latestStatus(record);
  const rawMessage = normalizeMessage(
    status.message ?? status.displayMessage ?? record.message ?? record.displayMessage
  );
  const messages = isNoMessage(rawMessage) ? [] : splitPages(rawMessage);

  const latitude = num(address.latitude ?? address.lat ?? device.latitude ?? record.latitude);
  const longitude = num(address.longitude ?? address.lng ?? address.lon ?? device.longitude ?? record.longitude);

  const deviceName = stripHtml(address.name || device.name || record.name || record.description || `Oklahoma DMS ${index + 1}`);
  const city = stripHtml(address.city || device.city || record.city || '');
  const direction = stripHtml(address.direction || device.direction || record.direction || '');
  const roadway = stripHtml(record.roadway || record.route || record.roadName || device.roadway || device.route || '');
  const signType = record.signType || record.SignType || {};
  const id = record.id ?? record.signId ?? device.id ?? index;

  return {
    id: `OK-${id}`,
    state: 'OK',
    agency: 'Oklahoma DOT / OKTraffic',
    district: city,
    name: deviceName,
    roadway,
    direction,
    latitude,
    longitude,
    messages,
    imagePages: [],
    active: messages.length > 0,
    online: true,
    demo: false,
    lastUpdated: status.recordTime || status.updatedAt || record.updatedAt || null,
    sourceUrl: PAGE,
    metadata: {
      signType: record.signType?.name || record.signTypeName || '',
      modulePerLine: signType.modulePerLine ?? null
    }
  };
}

async function fetchOklahoma() {
  try {
    const { text } = await request(URL, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        filter: JSON.stringify(FILTER),
        referer: PAGE
      }
    });

    saveDebug(text);
    const payload = JSON.parse(text);
    const records = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.results)
          ? payload.results
          : [];

    const signs = records
      .map(toSign)
      .filter(sign => sign.name || sign.roadway || sign.messages.length || sign.latitude !== null);

    if (!signs.length) {
      throw new Error('Oklahoma Signs endpoint returned no recognizable DMS records; set OKTRAFFIC_DEBUG=1 and inspect debug/oktraffic-signs.json');
    }

    return {
      signs,
      status: {
        state: 'OK',
        ok: true,
        mode: 'live-json-endpoint',
        count: signs.length,
        note: 'Public OKTraffic Signs endpoint'
      }
    };
  } catch (error) {
    return {
      signs: [],
      status: {
        state: 'OK',
        ok: false,
        mode: 'unavailable',
        count: 0,
        error: error.message
      }
    };
  }
}

module.exports = { fetchOklahoma, toSign, FILTER };
