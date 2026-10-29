const valid = new Set(['ok','auth_required','owner_action_required','not_found','denied','unsupported','partial','error']);
export function evidence({provider, title, url, text = '', items = [], status = 'ok', limits = []}) {
  if (!valid.has(status)) throw new Error('Bad status');
  return {provider, title, url, text, items, status, limitations:limits, read_at:new Date().toISOString(), provenance:{provider,url}};
}
export function failure(provider,status,reason,url=null) {
  return evidence({provider,title:reason,url,text:'',status,limits:[reason]});
}
export function combine(results) {
  return {status:results.every(x=>x.status==='ok')?'ok':'partial',items:results,source_count:results.length, timestamp:new Date().toISOString()};
}
