export const normalize = text => String(text||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").normalize('NFKC').replace(/\s+/g,' ').trim();
export function compareContent(api,browser) {
 const a=normalize(api.body_text),b=normalize(browser.text);
 const paragraphs=(api.structure?.paragraphs || String(api.body_text||'').split(/\n\s*\n/)).map(normalize).filter(Boolean);
 let cursor=0;const missing=[];for(const p of paragraphs){const at=b.indexOf(p,cursor);if(at<0)missing.push(p);else cursor=at+p.length;}
 const paragraph_order_preserved=missing.length===0;
 const expectedLinks=(api.resources||[]).filter(r=>r.type==='a'&&r.url?.startsWith('https://canvas.sydney.edu.au/')).map(r=>r.url.split(/[?#]/)[0]);
 const actualLinks=new Set((browser.links||[]).map(r=>r.url.split(/[?#]/)[0]));
 const missingLinks=expectedLinks.filter(url=>!actualLinks.has(url));
 const canonical=url=>{try{const u=new URL(url);return u.origin+u.pathname;}catch{return null;}};
 const same_resource=canonical(api.html_url)===canonical(browser.source_url);
 const title_matches=!!api.title && (browser.title===api.title || browser.title?.startsWith(api.title+': '));
 const headings=(api.structure?.headings||[]).map(h=>normalize(h.text));
 const actualHeadings=(browser.headings||[]).map(h=>normalize(h.text));
 const missingHeadings=headings.filter(h=>!actualHeadings.includes(h));
 const rows=(api.structure?.table_rows||[]).map(normalize).filter(Boolean);
 const browserRows=(browser.tables||[]).flat().map(cells=>normalize(cells.join(' ')));
 const missingRows=rows.filter(row=>!browserRows.includes(row));
 const full_equal=!!a&&a===b;
 return {status:!a?'NOT_TESTED':!same_resource||!title_matches?'FAIL':missingHeadings.length||missingRows.length||missing.length||missingLinks.length||browser.dynamic_content_pending?'PARTIAL':full_equal?'PASS':'PARTIAL',same_resource,title_matches,paragraph_order_preserved,missing_headings:missingHeadings,missing_table_rows:missingRows,full_normalized_equal:full_equal,api_chars:a.length,browser_chars:b.length,api_paragraphs:paragraphs.length,matched_paragraphs:paragraphs.length-missing.length,missing_paragraphs:missing,missing_canvas_links:missingLinks,notice:'Only whitespace, Unicode compatibility and HTML entities normalized. Browser navigation, hidden or unselected tabs and embed/file contents are not silently removed or treated as read.'};
}
