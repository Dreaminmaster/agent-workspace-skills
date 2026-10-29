export const SRES_ORIGIN='https://sres.sydney.edu.au';
export function safeReportLocation(raw){try{const u=new URL(raw);return ['https://canvas.sydney.edu.au',SRES_ORIGIN].includes(u.origin)?u.origin+u.pathname:null;}catch{return null;}}
export function boundedReport(text,tables=[]){return typeof text==='string'&&text.length<=50000&&Array.isArray(tables)&&JSON.stringify(tables).length<=50000?{text,tables}:null;}
