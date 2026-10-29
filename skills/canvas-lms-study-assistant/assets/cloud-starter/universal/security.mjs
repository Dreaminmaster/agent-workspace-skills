export class Denied extends Error {}
export function urlOf(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))throw Error();return u;}catch{throw new Denied('Invalid HTTPS URL');}}
