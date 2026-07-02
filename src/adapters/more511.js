'use strict';
const { create511Adapter } = require('./511platform');

const configs = [
  { name:'Pennsylvania', state:'PA', baseUrl:'https://www.511pa.com', agency:'PennDOT / 511PA', columns:[{data:null,name:''},{name:'area',s:true},{name:'name'},{name:'roadwayName'},{name:'direction'},{data:'phase1Image',name:'message'},{data:'phase2Image',name:'message2'},{name:'lastUpdated'},{data:8,name:''}], orderColumn:1 },
  { name:'Georgia', state:'GA', baseUrl:'https://511ga.org', agency:'Georgia DOT / 511GA', columns:[{data:null,name:''},{name:'description'},{name:'roadwayName'},{name:'direction'},{name:'message'},{name:'lastUpdated'},{data:6,name:''}], orderColumn:2 },
  { name:'New York', state:'NY', baseUrl:'https://511ny.org', agency:'NYSDOT / 511NY', lang:'en', columns:[{data:null,name:''},{name:'area'},{name:'roadwayName'},{name:'direction'},{data:'phase1Image',name:'message'},{data:'phase2Image',name:'message2'},{name:'lastUpdated'},{data:7,name:''}], orderColumn:1 },
  { name:'Louisiana', state:'LA', baseUrl:'https://www.511la.org', agency:'Louisiana DOTD / 511LA', columns:[{data:null,name:''},{name:'name'},{name:'roadwayName'},{name:'direction'},{name:'message'},{name:'message2'},{name:'lastUpdated'}], orderColumn:1 },
  { name:'Wisconsin', state:'WI', baseUrl:'https://511wi.gov', agency:'Wisconsin DOT / 511WI', columns:[{data:null,name:''},{name:'area',s:true},{name:'roadwayName',s:true},{name:'direction',s:true},{name:'name',s:true},{data:'phase1Image',name:'message'},{data:'phase2Image',name:'message2'},{name:'lastUpdated'},{data:8,name:''}], orderColumn:1 },
  { name:'Arizona', state:'AZ', baseUrl:'https://www.az511.com', agency:'Arizona DOT / AZ511', columns:[{data:null,name:''},{name:'name'},{name:'roadwayName'},{name:'direction'},{name:'message'},{name:'message2'},{name:'lastUpdated'}], orderColumn:1 },
  { name:'New England 511', state:'NE', statusCode:'ME/NH/VT', splitByArea:true, baseUrl:'https://newengland511.org', agency:'New England 511', columns:[{data:null,name:''},{name:'area'},{name:'name',s:true},{name:'roadwayName'},{name:'direction'},{name:'message'},{name:'message2'},{name:'lastUpdated'},{data:8,name:''}], orderColumn:1 },
  { name:'Alaska', state:'AK', baseUrl:'https://511.alaska.gov', agency:'Alaska DOT / 511 Alaska', columns:[{data:null,name:''},{name:'roadwayName'},{name:'direction'},{name:'message'},{name:'message2'},{name:'lastUpdated'}], orderColumn:1 },
  { name:'Nevada', state:'NV', baseUrl:'https://www.nvroads.com', agency:'Nevada DOT / NV Roads', columns:[{data:null,name:''},{name:'area'},{name:'roadwayName'},{name:'direction'},{name:'description',s:true},{name:'message'},{name:'lastUpdated'},{data:7,name:''}], orderColumn:1 },
  { name:'Florida', state:'FL', baseUrl:'https://fl511.com', agency:'Florida DOT / FL511', columns:[{data:null,name:''},{name:'region'},{name:'county'},{name:'roadwayName'},{name:'direction'},{name:'name'},{data:'phase1Image',name:'message'},{data:'phase2Image',name:'message2'},{name:'lastUpdated'}], orderColumn:1 },
  { name:'Idaho', state:'ID', baseUrl:'https://511.idaho.gov', agency:'Idaho Transportation Department / 511 Idaho', columns:[{data:null,name:''},{name:'description',s:true},{name:'roadwayName'},{name:'direction'},{name:'message'},{name:'lastUpdated'},{data:6,name:''}], orderColumn:2 },
  { name:'North Carolina', state:'NC', baseUrl:'https://www.drivenc.gov', agency:'NCDOT / DriveNC', columns:[{data:null,name:''},{name:'area'},{name:'roadwayName'},{name:'direction'},{name:'description',s:true},{name:'message'},{name:'lastUpdated'},{data:7,name:''}], orderColumn:1 },
  { name:'Kern County, California', state:'CA', statusCode:'CA (Kern)', baseUrl:'https://www.kern511.com', agency:'Kern511', lang:'en', columns:[{data:null,name:''},{name:'roadwayName'},{name:'name',s:true},{name:'direction'},{name:'message'},{name:'message2'},{name:'lastUpdated'}], orderColumn:1 }
].map(c => ({
  ...c,
  label:c.name,
  pageUrl:`${c.baseUrl}/messagesigns`,
  slug:c.state.toLowerCase().replace('/','-') + (c.statusCode ? '-regional' : ''),
  debugEnv:`${c.state.replace(/\W/g,'')}511_DEBUG`
}));

const adapters = Object.fromEntries(configs.map(c => [`fetch${c.state.replace(/\W/g,'')}${c.statusCode === 'CA (Kern)' ? 'Kern' : ''}`, create511Adapter(c)]));
module.exports = adapters;
