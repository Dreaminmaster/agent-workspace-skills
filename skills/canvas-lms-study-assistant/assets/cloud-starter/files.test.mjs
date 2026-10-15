import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDocxTables} from './files.mjs';
test('DOCX text keeps cells, paragraphs and nested table boundaries',()=>{
 const xml='<w:document><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Grade &amp; feedback</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:tc><w:tc><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Nested</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl></w:document>';
 const tables=extractDocxTables(xml);
 assert.equal(tables.length,2);assert.deepEqual(tables[0].rows,[['Grade & feedback\nSecond paragraph','Nested']]);assert.equal(tables[1].nested_depth,1);assert.deepEqual(tables[1].rows,[['Nested']]);
});

test('public Google export never sends school/Google credentials and rejects other hosts',async()=>{
 const {readPublicGoogleDocument}=await import('./files.mjs');const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);return calls===1?new Response('',{status:307,headers:{Location:'https://doc-a-b-docstext.googleusercontent.com/export'}}):new Response('Synthetic document',{headers:{'Content-Type':'text/plain'}});};
 try {const r=await readPublicGoogleDocument('https://docs.google.com/document/d/abcdefghijklmnopqrstuv/edit');assert.equal(r.status,'document_success');assert.equal(r.credentials_sent,false);calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:307,headers:{Location:'https://example.org'}});};await assert.rejects(readPublicGoogleDocument('https://docs.google.com/document/d/abcdefghijklmnopqrstuv/edit'));assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
