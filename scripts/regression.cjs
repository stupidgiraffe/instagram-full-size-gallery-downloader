const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(new URL('../instagram-full-size-gallery-downloader.user.js', require('node:url').pathToFileURL(__filename)), 'utf8');
const key = 'igFullSizeGallery.v2.settings';
const tests = [];
const test = (name, run) => tests.push({ name, run });
const settle = async (n = 8) => { for (let i=0;i<n;i++) await new Promise(resolve => setImmediate(resolve)); };
function photo(code, id, username='alice', url=`https://images.cdninstagram.com/${code}.jpg?oh=signed&oe=future`) {
 return { code, pk:id, user:{username}, media_type:1, image_versions2:{candidates:[{url,width:1080,height:1350}]}, original_width:1080, original_height:1350 };
}
function timeline(items, more=true) {
 return {data:{xdt_api__v1__feed__user_timeline_graphql_connection:{edges:items.map(node=>({node})),page_info:{end_cursor:more?'next123':null,has_next_page:more}}}};
}
function environment({script=source,boot=null,html='',gm=new Map(),local=new Map(),fetcher=async()=>new Response('',{status:404}),instrument=true,fakeXHR=false}={}) {
 const dom = new JSDOM(`<!doctype html><html><body>${boot?`<script type="application/json" data-sjs>${JSON.stringify(boot)}</script>`:''}<main>${html}</main></body></html>`,{url:'https://www.instagram.com/alice/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window, calls=[],menus=new Map();
 let time=Date.now();
 w.Date.now=()=>time;
 w.setTimeout=(fn,delay=0,...args)=>setTimeout(()=>{time+=delay;fn(...args)},0);
 w.setInterval=()=>0;
 w.GM_getValue=(k,fallback)=>gm.get(k)??fallback;
 w.GM_setValue=(k,v)=>gm.set(k,v);
 w.GM_registerMenuCommand=(label,fn)=>menus.set(label,fn);
 for (const [k,v] of local) w.localStorage.setItem(k,v);
 w.fetch=async(...args)=>{calls.push(args);return fetcher(...args)};
 if(fakeXHR) w.XMLHttpRequest=class extends w.EventTarget {
  open(method,url){this.method=method;this.url=url}
  send(body){this.body=body}
  respond(payload,status=200){this.status=status;this.responseType='';this.responseText=JSON.stringify(payload);this.dispatchEvent(new w.Event('load'))}
 };
 w.scrollTo=()=>{};
 w.HTMLElement.prototype.scrollTo=function({top}){this.scrollTop=top};
 w.IntersectionObserver=class{constructor(fn){this.fn=fn}observe(){}disconnect(){}};
 let code=script;
 if(instrument && code.includes('  installResponseCapture();')) code=code.replace('  installResponseCapture();', '  win.__test = {state, native, ui:()=>ui, detectRoute, resetSession, startSession, fetchPage, loadNextPage, scanPageData, scanVisibleMedia, ingestPayload, extractPage, saveSettings, setSourceWithFallback, normalizeMediaUrl, diagnosticReport, downloadEntry};\n  installResponseCapture();');
 w.eval(code);
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const root=w.document.getElementById('ig-full-size-gallery-host').shadowRoot;
 return {w,dom,calls,gm,menus,root,test:w.__test,open:()=>root.querySelector('.launcher').click(),close:()=>dom.window.close()};
}
test('Full userscript loads boot media and carousel while all REST calls would return 404',async()=>{
 const first=photo('A','101'); const carousel={code:'B',pk:'102',user:{username:'alice'},carousel_media:[photo('','201'),photo('','202')]};
 const e=environment({boot:{require:[['loader',null,{result:timeline([first,carousel],false)}]]},instrument:false});
 try{e.open();await settle();assert.equal(e.root.querySelectorAll('.media-card').length,3);assert.equal(e.calls.length,0);assert.match(e.root.querySelector('.status').textContent,/end reached/);assert.equal(e.root.querySelector('.media-frame img').src,first.image_versions2.candidates[0].url)}finally{e.close()}
});
test('Captures live GraphQL without consuming or modifying the original response',async()=>{
 const payload=timeline([photo('C','103')],false);const e=environment({fetcher:async()=>Response.json(payload)});
 try{const options={method:'POST',body:'variables=unchanged'};const response=await e.w.fetch('https://www.instagram.com/graphql/query',options);assert.deepEqual(await response.json(),payload);await settle();e.open();await settle();assert.equal(e.root.querySelectorAll('.media-card').length,1);assert.strictEqual(e.calls[0][1],options);assert.equal(e.calls.length,1);assert.equal(e.test.native.responses,1)}finally{e.close()}
});
test('Skips account lookups and loads visible thumbnails when no JSON is available',async()=>{
 const e=environment({html:'<a href="/p/DOM1/"><img src="https://images.cdninstagram.com/small.jpg?oh=ok&amp;oe=later" srcset="https://images.cdninstagram.com/large.jpg?oh=ok&amp;oe=later 1080w, https://images.cdninstagram.com/small.jpg?oh=ok&amp;oe=later 300w" width="300" height="400"></a><a href="/bob/"><img alt="profile picture" src="https://images.cdninstagram.com/avatar.jpg"></a>'});
 try{e.open();await settle();assert.equal(e.root.querySelectorAll('.media-card').length,1);assert.equal(e.calls.length,0);assert.match(e.root.querySelector('.media-frame img').src,/large.jpg/);assert.match(e.root.querySelector('.status').textContent,/previews/)}finally{e.close()}
});
test('Full media upgrades a DOM preview without duplicating it and expands carousels',async()=>{
 const e=environment({html:'<a href="/p/D/"><img src="https://images.cdninstagram.com/preview.jpg" width="300" height="400"></a>'});
 try{e.open();await settle();const raw={code:'D',pk:'105',user:{username:'alice'},carousel_media:[photo('','205','alice','https://images.cdninstagram.com/full.jpg'),photo('','206')]};e.test.ingestPayload(timeline([raw],false),e.test.detectRoute());await e.test.loadNextPage();assert.equal(e.test.state.media.length,2);assert.equal(e.root.querySelectorAll('.media-card').length,2);assert.match(e.root.querySelector('.media-frame img').src,/full.jpg/);assert.equal(e.test.state.media[0].preview,false)}finally{e.close()}
});
test('Native scroll supplies the second page without constructing an endpoint',async()=>{
 const e=environment({boot:timeline([photo('A','101')])});
 try{e.open();await settle();e.w.scrollTo=()=>e.test.ingestPayload(timeline([photo('B','102')],false),e.test.detectRoute());await e.test.loadNextPage();assert.equal(e.test.state.media.length,2);assert.equal(e.calls.length,0);assert.equal(e.test.state.exhausted,true)}finally{e.close()}
});
test('No progress pauses autoload and permits explicit retry instead of marking end',async()=>{
 const e=environment();
 try{e.open();await new Promise(resolve=>setTimeout(resolve,100));assert.equal(e.test.state.loading,false);assert.equal(e.test.state.autoPaused,true);assert.equal(e.test.state.exhausted,false);assert.equal(e.calls.length,0);e.test.ingestPayload(timeline([photo('A','101')],false),e.test.detectRoute());await e.test.loadNextPage();assert.equal(e.test.state.media.length,1);assert.equal(e.test.state.autoPaused,false)}finally{e.close()}
});
test('Late profile responses are discarded after SPA navigation',async()=>{
 let resolve;const e=environment({fetcher:()=>new Promise(r=>resolve=r)});
 try{const pending=e.w.fetch('/graphql/query');e.w.history.pushState({},'', '/bob/');await settle();resolve(Response.json(timeline([photo('OLD','101')],false)));await pending;await settle();e.test.scanPageData(e.test.detectRoute());assert.equal(e.test.native.items.size,0);assert.notEqual(e.test.native.pageInfo?.more,false)}finally{e.close()}
});
test('Foreign profile boot data cannot mark the active profile exhausted',async()=>{
 const e=environment({boot:timeline([photo('BOB','901','bob')],false)});
 try{e.test.scanPageData();assert.equal(e.test.native.items.size,0);assert.equal(e.test.native.pageInfo,null)}finally{e.close()}
});
test('Closing the gallery cancels waiting without stale error or another request',async()=>{
 const e=environment();
 try{e.open();await settle(2);e.root.querySelector('[data-action="close"]').click();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(e.test.state.opened,false);assert.equal(e.test.state.loading,false);assert.equal(e.calls.length,0);assert.equal(e.root.querySelectorAll('.toast.error').length,0)}finally{e.close()}
});
test('Controls remain hidden across close, reopening, and a fresh script instance',async()=>{
 const gm=new Map();const e=environment({gm,boot:timeline([photo('A','101')],false)});
 try{e.open();await settle();e.root.querySelector('[data-action="toggle-controls"]').click();assert.equal(e.root.querySelector('.lightbox').classList.contains('controls-hidden'),true);e.root.querySelector('[data-action="close"]').click();e.open();assert.equal(e.root.querySelector('.lightbox').classList.contains('controls-hidden'),true)}finally{e.close()}
 const second=environment({gm,boot:timeline([photo('A','101')],false)});
 try{second.open();await settle();assert.equal(second.root.querySelector('.lightbox').classList.contains('controls-hidden'),true);assert.equal(second.root.querySelector('.viewer-controls-toggle').getAttribute('aria-pressed'),'true')}finally{second.close()}
});
test('Newer local settings recover after userscript storage write failure',async()=>{
 const gm=new Map([[key,JSON.stringify({hideViewerControls:false,_savedAt:1})]]);const local=new Map([[key,JSON.stringify({hideViewerControls:true,_savedAt:2})]]);const e=environment({gm,local});
 try{assert.equal(e.test.state.settings.hideViewerControls,true);e.w.GM_setValue=()=>Promise.reject(new Error('denied'));e.test.saveSettings();await settle();assert.equal(JSON.parse(e.w.localStorage.getItem(key)).hideViewerControls,true)}finally{e.close()}
});
test('Broken image refreshes a signed URL once and retains its query parameters',async()=>{
 const old=photo('A','101','alice','https://images.cdninstagram.com/expired.jpg?oh=old&oe=old'); const fresh=photo('A','101','alice','https://images.cdninstagram.com/fresh.jpg?oh=NEW%2Bsig&oe=9999');
 const e=environment({boot:timeline([old],false),fetcher:async()=>Response.json({items:[fresh]})});
 try{e.open();await settle();const image=e.root.querySelector('.media-frame img');image.dispatchEvent(new e.w.Event('error'));await settle(20);assert.equal(image.src,fresh.image_versions2.candidates[0].url);assert.equal(e.calls.length,1);assert.match(e.calls[0][0],/media\/101\/info/);image.dispatchEvent(new e.w.Event('error'));await settle();image.dispatchEvent(new e.w.Event('error'));await settle();assert.equal(e.calls.length,1);assert.equal(e.test.state.stats.failures,1)}finally{e.close()}
});
test('HTTP 404 on media refresh is terminal, with no transport retry loop',async()=>{
 const e=environment({boot:timeline([photo('A','101')],false)});
 try{e.open();await settle();const image=e.root.querySelector('.media-frame img');image.dispatchEvent(new e.w.Event('error'));await settle(20);assert.equal(e.calls.length,1);assert.equal(e.test.state.stats.failures,1);assert.match(e.test.diagnosticReport(),/404/)}finally{e.close()}
});
test('Captures the XHR transport while leaving requests and responses intact',async()=>{
 const e=environment({fakeXHR:true});
 try{const xhr=new e.w.XMLHttpRequest();xhr.open('POST','/graphql/query/');xhr.send('variables=original');const payload=timeline([photo('XHR','107')],false);xhr.respond(payload);assert.equal(xhr.body,'variables=original');assert.deepEqual(JSON.parse(xhr.responseText),payload);e.open();await settle();assert.equal(e.test.state.media.length,1);assert.equal(e.calls.length,0);assert.equal(e.test.native.responses,1)}finally{e.close()}
});
test('Reset from userscript menu restores the persisted controls setting in the UI',async()=>{
 const e=environment({gm:new Map([[key,JSON.stringify({hideViewerControls:true})]])});
 try{assert.equal(e.root.querySelector('.lightbox').classList.contains('controls-hidden'),true);e.menus.get('Reset gallery settings')();assert.equal(e.root.querySelector('.lightbox').classList.contains('controls-hidden'),false);assert.equal(JSON.parse(e.gm.get(key)).hideViewerControls,false)}finally{e.close()}
});
test('REST and GraphQL extraction preserve pagination flags',async()=>{
 const e=environment();try{assert.equal(e.test.extractPage(timeline([photo('A','101')])).cursor,'next123');assert.equal(e.test.extractPage(timeline([photo('A','101')],false)).more,false);assert.equal(e.test.extractPage({items:[],next_max_id:'abc',more_available:false}).more,false)}finally{e.close()}
});
test('Card preview opens the viewer with the same signed source and saved footer state',async()=>{
 const item=photo('VIEW','101');const e=environment({boot:timeline([item],false),gm:new Map([[key,JSON.stringify({hideViewerControls:true})]])});
 try{e.open();await settle();e.root.querySelector('.media-frame img').click();assert.equal(e.root.querySelector('.lightbox').classList.contains('hidden'),false);assert.equal(e.root.querySelector('.viewer-media img').src,item.image_versions2.candidates[0].url);assert.equal(e.root.querySelector('.lightbox').classList.contains('controls-hidden'),true);e.root.querySelector('[data-action="viewer-close"]').click();assert.equal(e.root.querySelector('.lightbox').classList.contains('hidden'),true)}finally{e.close()}
});
test('Manager download retains signed URL and prevents a concurrent duplicate',async()=>{
 const e=environment({boot:timeline([photo('A','101')],false)});
 try{e.open();await settle();const downloads=[];e.w.GM_download=options=>downloads.push(options);const entry=e.test.state.media[0];const pending=e.test.downloadEntry(entry);await e.test.downloadEntry(entry);assert.equal(downloads.length,1);assert.equal(downloads[0].url,entry.mediaUrl);assert.equal(downloads[0].name,'alice_A.jpg');assert.equal(entry.downloadState,'running');downloads[0].onload();await pending;assert.equal(entry.downloadState,'done')}finally{e.close()}
});
test('Disabled manager downloads save image and video blobs instead of opening remote URLs',async()=>{
 const video={...photo('VIDEO','102'),media_type:2,video_versions:[{url:'https://images.cdninstagram.com/video.mp4?oh=keep',width:1080,height:1920}]};
 const e=environment({boot:timeline([photo('A','101'),video],false)});
 try{e.open();await settle();const requests=[],saved=[],blobs=[];let opened=0;e.w.open=()=>opened++;e.w.GM_download=o=>o.onerror({error:'not_enabled'});e.w.GM_xmlhttpRequest=o=>{requests.push(o);o.onload({status:200,response:new e.w.Blob(['media bytes'],{type:o.url.includes('.mp4')?'video/mp4':'image/jpeg'})})};e.w.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:download'};e.w.URL.revokeObjectURL=()=>{};e.w.HTMLAnchorElement.prototype.click=function(){saved.push({href:this.href,name:this.download})};for(const entry of e.test.state.media) await e.test.downloadEntry(entry);assert.equal(opened,0);assert.equal(requests.length,2);assert.equal(blobs.length,2);assert.deepEqual(saved.map(s=>s.name),['alice_A.jpg','alice_VIDEO.mp4']);assert(saved.every(s=>s.href==='blob:download'));assert(e.test.state.media.every(entry=>entry.downloadState==='done'))}finally{e.close()}
});
test('Expired download refreshes once and downloads the new URL',async()=>{
 const fresh=photo('A','101','alice','https://images.cdninstagram.com/fresh.jpg?oh=NEW%2Bsig&oe=9999');const e=environment({boot:timeline([photo('A','101')],false),fetcher:async()=>Response.json({items:[fresh]})});
 try{e.open();await settle();const downloads=[];e.w.GM_download=o=>{downloads.push(o.url);o.url.includes('/fresh.jpg')?o.onload():o.onerror()};e.w.GM_xmlhttpRequest=o=>o.onload({status:404});await e.test.downloadEntry(e.test.state.media[0]);assert.equal(e.calls.length,1);assert.deepEqual(downloads,[photo('A','101').image_versions2.candidates[0].url,fresh.image_versions2.candidates[0].url]);assert.equal(e.test.state.media[0].downloadState,'done')}finally{e.close()}
});
test('Rejected downloads and HTML responses never report success or open a new tab',async()=>{
 const e=environment({boot:timeline([photo('A','101')],false)});
 try{e.open();await settle();let opened=0,saved=0;e.w.open=()=>opened++;e.w.HTMLAnchorElement.prototype.click=()=>saved++;e.w.GM_download=o=>o.onerror();e.w.GM_xmlhttpRequest=o=>o.onload({status:200,response:new e.w.Blob(['login page'],{type:'text/html'})});await e.test.downloadEntry(e.test.state.media[0]);assert.equal(opened,0);assert.equal(saved,0);assert.equal(e.test.state.media[0].downloadState,'idle');assert.match(e.root.querySelector('.toast.error').textContent,/Download failed/);assert.equal(e.root.querySelectorAll('.toast.success').length,0)}finally{e.close()}
});
(async()=>{let failed=0;for(const {name,run}of tests){try{await run();console.log('PASS '+name)}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack)}}console.log(`${tests.length-failed}/${tests.length} passed`);process.exitCode=failed?1:0})()
