import test from 'node:test';
import assert from 'node:assert/strict';
import {compareContent} from './compare.mjs';
const api={title:'Lesson',html_url:'https://canvas.sydney.edu.au/courses/1/pages/lesson',body_text:'First meaningful paragraph.\n\nSecond meaningful paragraph with a deadline.',structure:{paragraphs:['First meaningful paragraph.','Second meaningful paragraph with a deadline.'],headings:[{level:2,text:'Requirements'}],table_rows:['Task Due Friday']},resources:[]};
const browser={title:'Lesson: course',source_url:api.html_url,text:api.body_text,headings:[{level:2,text:'Requirements'}],tables:[[['Task','Due Friday']]],links:[]};
test('content comparison preserves missing requirements and table rows',()=>{
 assert.equal(compareContent(api,browser).status,'PASS');
 const missing=compareContent(api,{...browser,text:'First meaningful paragraph.',tables:[]});assert.equal(missing.status,'PARTIAL');assert.equal(missing.missing_paragraphs.length,1);assert.equal(missing.missing_table_rows.length,1);
 assert.equal(compareContent(api,{...browser,source_url:'https://canvas.sydney.edu.au/courses/2/pages/lesson'}).status,'FAIL');
});
