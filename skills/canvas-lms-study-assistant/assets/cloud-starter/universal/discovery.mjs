import { urlOf } from './security.mjs';
/** Source discovery never follows links by itself. New domains require owner approval/configuration. */
export function classifyLinkedResource(url) {
  let u;try{u=urlOf(url)}catch{return {provider:'unknown',status:'denied',reason:'Not HTTPS'}}
  const host=u.hostname.toLowerCase();
  if(host==='canvas.sydney.edu.au'){
    if(/\/external_tools\/retrieve$/.test(u.pathname))return {provider:'lti',status:'inspection_required',reason:'Inspect iframe URL before launching'};
    if(/\/files\/\d+(?:\/download)?$/.test(u.pathname))return {provider:'canvas',capability:'file'};
    return {provider:'canvas',capability:'page'};
  }
  if(host==='sres.sydney.edu.au')return {provider:'sres',capability:'student_portal'};
  if(host==='notion.so'||host.endsWith('.notion.so'))return {provider:'notion',capability:'search',status:'connector_required'};
  if(host==='v3.pebblepad.com.au'||host==='pebblepad.com.au')return {provider:'pebblepad',capability:'own_portfolio',status:'owner_browser_required'};
  return {provider:'unknown',status:'owner_action_required',hostname:host,reason:'Unrecognised provider; do not auto-authenticate/fetch'};
}
export function discoverFromCanvasResources(resources){
  const output=[];const seen=new Set();for(const resource of resources||[]){if(!resource?.url||seen.has(resource.url))continue;seen.add(resource.url);output.push({url:resource.url,...classifyLinkedResource(resource.url)});}return output;
}
