'use strict';
const { request, splitPages, isNoMessage, stripHtml } = require('./common');
const BASE='https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/DMS_View/FeatureServer';
const PAGE='https://data.iowadot.gov/maps/5f82da56fd6343119501e6a5847ac49e/about';

function normalize(feature,index){
  const a=feature.attributes||feature.properties||{};
  const raw=a.NTCIP || a.msgtext || a.msghtml || '';
  const messages=isNoMessage(raw)?[]:splitPages(raw);
  const lat=Number(a.lat_ ?? a.latitude);
  const lon=Number(a.long_ ?? a.longitude);
  const type=stripHtml(a.SignType||'');
  return {
    id:`IA-${a.FID ?? index}`, state:'IA', agency:'Iowa DOT', district:type,
    name:stripHtml(a.DeviceName||`Iowa sign ${index+1}`), roadway:stripHtml(a.Route||''),
    direction:stripHtml(a.Direction||'').toUpperCase(), latitude:Number.isFinite(lat)?lat:null,
    longitude:Number.isFinite(lon)?lon:null, messages, imagePages:[], active:messages.length>0,
    online:true, demo:false, lastUpdated:a.EditDate||null, sourceUrl:PAGE,
    signType:type, specialDisplay:/arrow|chevron/i.test(`${type} ${a.msgtext||''}`)
  };
}
async function fetchIowa(){
  try{
    const url=`${BASE}/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json`;
    const {text}=await request(url,{headers:{accept:'application/json'}});
    const payload=JSON.parse(text); if(payload.error) throw Error(payload.error.message||'ArcGIS error');
    const signs=(payload.features||[]).map(normalize);
    if(!signs.length) throw Error('Iowa returned no active-layer signs');
    return {signs,status:{state:'IA',ok:true,mode:'live-arcgis',count:signs.length}};
  }catch(error){return {signs:[],status:{state:'IA',ok:false,mode:'unavailable',count:0,error:error.message}};}
}
module.exports={fetchIowa,normalize};
