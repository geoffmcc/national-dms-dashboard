'use strict';
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const {cleanMulti,splitPages,isNoMessage}=require('./src/adapters/common');
const {normalize:normalizeIowa}=require('./src/adapters/iowa');
const {parseHtmlCards}=require('./src/adapters/texas');

test('MULTI line and page controls are normalized',()=>{
  assert.equal(cleanMulti('[fo1]ONE[nl3]TWO[np][pt40o0]THREE'),'ONE\nTWO\fTHREE');
  assert.deepEqual(splitPages('[fo1]ONE[nl3]TWO[np][pt40o0]THREE'),['ONE\nTWO','THREE']);
});
test('blank sentinels are inactive',()=>{assert.equal(isNoMessage('NO_MESSAGE'),true);assert.equal(isNoMessage('ROAD CLOSED'),false);});
test('Iowa uses NTCIP pages and supplied coordinates',()=>{
 const s=normalizeIowa({attributes:{FID:1,DeviceName:'Test',Direction:'w',Route:'I 80',lat_:'41.5',long_:'-93.5',NTCIP:'[fo1]PAGE ONE[np][fo1]PAGE TWO'}},0);
 assert.deepEqual(s.messages,['PAGE ONE','PAGE TWO']);assert.equal(s.longitude,-93.5);
});
test('Texas basic status card pattern still parses',()=>{
 const x=parseHtmlCards('<div>IH 35 NB AT LOOP 410</div><div>CRASH AHEAD; USE CAUTION</div><div>Status: Device Online Beacon: Off</div>','SAT');
 assert.equal(x.length,1);assert.match(x[0].messages[0],/CRASH AHEAD/);
});

const { toSign: toOklahomaSign } = require('./src/adapters/oklahoma');
const okFixture = toOklahomaSign({
  id: 12,
  device: { address: { name: 'I-44 EB at Example', city: 'Tulsa', latitude: 36.1, longitude: -95.9, direction: 'Eastbound' } },
  signType: { modulePerLine: 3 },
  dmsStatus: { message: '[fo1]ROAD WORK[nl]AHEAD[np]USE CAUTION', recordTime: '2026-07-02T12:00:00Z' }
}, 0);
assert.equal(okFixture.state, 'OK');
assert.equal(okFixture.messages.length, 2);
assert.equal(okFixture.messages[0], 'ROAD WORK\nAHEAD');
assert.equal(okFixture.messages[1], 'USE CAUTION');
assert.equal(okFixture.latitude, 36.1);

const { parsePages: parseNittecPages, normalize: normalizeNittec } = require('./src/adapters/nittec');

test('NITTEC parser preserves ordered pages and lines', () => {
  const pages = parseNittecPages({
    '2': { '1': ' USE', '2': ' ALTERNATE', '3': ' ROUTE' },
    '1': { '1': ' RAMP TO', '2': ' EX 14 VULCAN', '3': ' CLOSED' }
  });
  assert.deepEqual(pages, ['RAMP TO\nEX 14 VULCAN\nCLOSED', 'USE\nALTERNATE\nROUTE']);
});

test('NITTEC blank and out-of-service signs are inactive', () => {
  const sign = normalizeNittec({ i: 434, s: 'NOT IN SERVICE', phs: { '1': { '1': ' ' } } }, 0);
  assert.equal(sign.active, false);
  assert.equal(sign.online, false);
  assert.deepEqual(sign.messages, []);
});


test('NITTEC physical border-approach signs are tagged regardless of message text', () => {
  const sign = normalizeNittec({
    i: 18,
    n: '190N Sheridan Dr.',
    d: 'I-190 North before Sheridan Dr.',
    l: 'I-190 North',
    s: 'OK',
    phs: { '1': { '1': 'DRIVE SOBER', '2': 'OR GET', '3': 'PULLED OVER' } }
  }, 0);
  assert.equal(sign.borderApproach, true);
});

test('ordinary NITTEC signs are not physically tagged as border approaches', () => {
  const sign = normalizeNittec({
    i: 4,
    n: '290E Main St.',
    d: 'I-290 East between Sheridan Dr. and Main St.',
    l: 'I-290 East',
    s: 'OK',
    phs: { '1': { '1': 'DRIVE SOBER' } }
  }, 0);
  assert.equal(sign.borderApproach, false);
});


const { enrich } = require('./src/service');

test('AMBER and Silver alerts share one combined category and filter flag', () => {
  const amber = enrich({name:'Test', roadway:'I-94', district:'', messages:['AMBER ALERT VEHICLE ABC123'], active:true});
  const silver = enrich({name:'I-94 EB @ 30th St', roadway:'I-94', district:'WI', messages:['SILVER ALERT VEHICLE XYZ789'], active:true});
  assert.equal(amber.amber, true);
  assert.equal(silver.amber, true);
  assert.equal(amber.publicSafetyAlert, true);
  assert.equal(silver.publicSafetyAlert, true);
  assert.ok(amber.categories.includes('AMBER / Silver Alert'));
  assert.ok(silver.categories.includes('AMBER / Silver Alert'));
  assert.equal(silver.categories.includes('Emergency alert'), false);
});


test('controlled public-safety alert phrases are caught without matching generic alerts', () => {
  const ashanti = enrich({name:'Test', roadway:'I-85', district:'', messages:['ASHANTI ALERT VEHICLE ABC123'], active:true});
  const endangered = enrich({name:'Test', roadway:'US 1', district:'', messages:['ENDANGERED MISSING ADULT'], active:true});
  const traffic = enrich({name:'Test', roadway:'I-90', district:'', messages:['TRAFFIC ALERT CRASH AHEAD'], active:true});
  assert.equal(ashanti.publicSafetyAlert, true);
  assert.equal(endangered.publicSafetyAlert, true);
  assert.equal(traffic.publicSafetyAlert, false);
  assert.ok(ashanti.categories.includes('Public Safety Alert'));
});


test('frontend exposes separate Public Safety and AMBER / Silver checkboxes', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  assert.match(html, /id="publicSafety"/);
  assert.match(html, /id="amberSilver"/);
  assert.match(app, /!amberSilver\|\|s\.amber/);
});
