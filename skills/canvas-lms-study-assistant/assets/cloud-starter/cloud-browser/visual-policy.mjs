export const VISUAL_HOSTS=['cdn.jsdelivr.net','tessdata.projectnaptha.com'];
export function allowedVisualAsset(raw,method='GET'){
 if(method!=='GET')return false;
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return false;
 return u.hostname==='cdn.jsdelivr.net'&&/^\/npm\/tesseract\.js-core@6\.0\.0\/tesseract-core(?:-simd)?(?:-lstm)?\.wasm(?:\.js)?$/.test(u.pathname)||u.hostname==='tessdata.projectnaptha.com'&&/^\/4\.0\.0\/(?:eng|chi_sim)\.traineddata\.gz$/.test(u.pathname);
 }catch{return false;}
}
export function visualPages(value){
 if(value===undefined)return null;if(typeof value!=='string'||!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(value)||value.length>40)throw Error('invalid_visual_pages');
 const pages=new Set();for(const part of value.split(',')){const [a,b=a]=part.split('-').map(Number);if(a<1||b<a||b>200||b-a>2)throw Error('at_most_three_visual_pages');for(let p=a;p<=b;p++)pages.add(p);}
 if(pages.size>3)throw Error('at_most_three_visual_pages');return [...pages].sort((a,b)=>a-b);
}
