// Exercises the userscript against sanitized Instagram request/response contracts.
module.exports = ({test, environment, until, settle, photo, stack, timeline, cover, assert, key}) => {
 const page = (items, cursor, more) => ({data:{xdt_api__v1__feed__user_timeline_graphql_connection:{edges:items.map(node=>({node})),page_info:{end_cursor:cursor,has_next_page:more}}}});
 const request = (e, after=null, username='alice') => e.w.fetch('/api/graphql', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','X-FB-Friendly-Name':'PolarisProfilePosts'}, body:new URLSearchParams({doc_id:'observed-document',variables:JSON.stringify({username,after,first:12,data:{count:12},providerFlag:true}),lsd:'session-lsd',extra:'preserved'}).toString()});
 const vars = options => JSON.parse(new URLSearchParams(options.body).get('variables'));

 test('Captured profile cursors load every page without native scrolling',async()=>{
  const e=environment({fetcher:async(_url,options)=>Response.json(vars(options).after===null?page([photo('PIN','50'),stack('NEW','300',3)],'cursor-1',true):vars(options).after==='cursor-1'?page([photo('MID','200')],'cursor-2',true):page([photo('OLD','100')],null,false))});
  try{await request(e);await settle();e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();await e.test.loadNextPage();assert.deepEqual(Array.from(e.test.state.media,m=>m.shortcode),['PIN','NEW','NEW','NEW','MID','OLD']);assert.equal(e.test.state.exhausted,true);assert.deepEqual(e.calls.map(([,o])=>vars(o).after),[null,'cursor-1','cursor-2']);const body=new URLSearchParams(e.calls[1][1].body);assert.equal(body.get('doc_id'),'observed-document');assert.equal(body.get('extra'),'preserved');assert.equal(vars(e.calls[1][1]).providerFlag,true)}finally{e.close()}
 });
 test('Modern ordered timeline stubs resolve every collaborative post',async()=>{
  const modern={data:{node:{username:'alice',polaris_ordered_timeline_connection:{edges:[{node:{code:'COAUTHOR',pk:'123',media_type:8,carousel_media_count:3,user:{username:'bob'},display_uri:'https://images.cdninstagram.com/stub.jpg'}}],page_info:{has_next_page:false,end_cursor:null}}}}};
  const full=stack('COAUTHOR','123',3);full.user.username='bob';
  const e=environment({boot:modern,fetcher:async()=>Response.json({items:[full]})});
  try{e.open();await until(()=>!e.test.state.starting);assert.equal(e.test.state.media.length,3);assert(e.test.state.media.every(m=>m.shortcode==='COAUTHOR'));assert.equal(e.test.state.exhausted,true)}finally{e.close()}
 });
 test('Terminal tagged and unrelated profile responses cannot exhaust the profile',async()=>{
  const e=environment({boot:page([photo('FIRST','300')],'cursor-1',true)});
  try{e.open();await until(()=>!e.test.state.loading);const unrelated={data:{xdt_api__v1__usertags__user_id__connection:{edges:[{node:photo('TAGGED','200')}],page_info:{has_next_page:false,end_cursor:null}}}};e.test.ingestPayload(unrelated,e.test.detectRoute());e.test.ingestPayload(timeline([photo('FOREIGN','100','bob')],false),e.test.detectRoute());assert.equal(e.test.native.pageInfo.more,true);assert.equal(e.test.native.items.has('TAGGED'),false);assert.equal(e.test.native.items.has('FOREIGN'),false);await e.test.loadNextPage();assert.equal(e.test.state.exhausted,false)}finally{e.close()}
 });
 test('A response explicitly requested for another username cannot enter the collection',async()=>{
  const e=environment({fetcher:async()=>Response.json(page([photo('FOREIGNCOLLAB','1')],null,false))});
  try{await request(e,null,'bob');await settle();e.test.scanPageData();assert.equal(e.test.native.items.size,0);assert.notEqual(e.test.native.pageInfo?.more,false)}finally{e.close()}
 });
 test('A disconnected terminal response does not skip a missing middle cursor',async()=>{
  const e=environment({fetcher:async(_url,o)=>Response.json(vars(o).after===null?page([photo('FIRST','300')],'one',true):vars(o).after==='one'?page([photo('MIDDLE','200')],'two',true):page([photo('LAST','100')],null,false))});
  try{await request(e);await request(e,'two');await settle();e.open();await until(()=>!e.test.state.loading);assert.equal(e.test.state.exhausted,false);await e.test.loadNextPage();assert.deepEqual(Array.from(e.test.state.media,m=>m.shortcode),['FIRST','MIDDLE','LAST']);assert.equal(e.test.state.exhausted,true);assert(e.calls.some(([,o])=>vars(o).after==='one'))}finally{e.close()}
 });
 test('A captured bottom page restarts at the root to recover unseen newer posts',async()=>{
  const e=environment({fetcher:async(_url,o)=>Response.json(vars(o).after===null?page([photo('TOP','300')],'middle',true):page([photo('BOTTOM','100')],null,false))});
  try{await request(e,'middle');await settle();e.open();await until(()=>!e.test.state.loading);if(!e.test.state.exhausted)await e.test.loadNextPage();assert.deepEqual(Array.from(e.test.state.media,m=>m.shortcode),['TOP','BOTTOM']);assert(e.calls.some(([,o])=>vars(o).after===null));assert.equal(e.test.state.exhausted,true)}finally{e.close()}
 });
 test('Repeated cursors pause as incomplete instead of reporting a verified end',async()=>{
  const e=environment({fetcher:async(_url,o)=>Response.json(page([photo(vars(o).after?'SECOND':'FIRST',vars(o).after?'100':'200')],'same',true))});
  try{await request(e);await settle();e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();await e.test.loadNextPage();assert.equal(e.test.state.exhausted,false);assert.equal(e.test.state.autoPaused,true);assert.doesNotMatch(e.root.querySelector('.status').textContent,/end reached|\bcomplete:/i);assert(e.calls.length>=2&&e.calls.length<=4)}finally{e.close()}
 });
 test('Unconsumed profile posts are retained above the old 600-post cache cap',async()=>{
  const e=environment({boot:page(Array.from({length:605},(_,i)=>photo(`POST${i}`,String(1000+i))),null,false)});
  try{e.open();await until(()=>!e.test.state.loading);assert.equal(e.test.state.postGroups.size,605);assert.equal(e.test.state.media.length,605);assert.equal(e.test.state.media[0].shortcode,'POST0')}finally{e.close()}
 });
 test('Auto-load crawls the full profile without scrolling the gallery sentinel',async()=>{
  const e=environment({autoLoad:true,fetcher:async(_url,o)=>Response.json(vars(o).after===null?page([photo('FIRST','300')],'one',true):vars(o).after==='one'?page([photo('MIDDLE','200')],'two',true):page([photo('LAST','100')],null,false))});
  try{e.open();await request(e);await until(()=>e.test.state.exhausted&&!e.test.state.loading);assert.equal(e.test.state.media.length,3);assert.deepEqual(e.calls.map(([,o])=>vars(o).after),[null,'one','two'])}finally{e.close()}
 });
 test('Stopping Load all prevents automatic crawling from continuing behind Stop',async()=>{
  let resolve;
  const e=environment({autoLoad:true,fetcher:async(_url,o)=>vars(o).after===null?Response.json(page([photo('FIRST','200')],'one',true)):new Promise(r=>{resolve=r})});
  try{await request(e);await settle();e.open();await until(()=>!e.test.state.starting);e.root.querySelector('[data-action="load-all"]').click();await until(()=>Boolean(resolve));e.root.querySelector('[data-action="load-all"]').click();resolve(Response.json(page([photo('SECOND','100')],'two',true)));await settle(30);assert.equal(e.calls.length,2);assert.equal(e.test.state.autoPaused,true);assert.equal(e.test.state.exhausted,false)}finally{e.close()}
 });
 test('The page limit pauses scanning without claiming the profile is exhausted',async()=>{
  const gm=new Map([[key,JSON.stringify({autoLoad:false,maxPages:1})]]),e=environment({gm,boot:page([photo('FIRST','200')],'one',true)});
  try{e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();assert.equal(e.test.state.exhausted,false);assert.equal(e.test.state.autoPaused,true);assert.match(e.root.querySelector('.status').textContent,/limit/)}finally{e.close()}
 });
 test('All five sorts preserve the full media set including pins and collaborative carousels',async()=>{
  const co=stack('COLLAB','300',3);co.user.username='bob';const boot={data:{user:{username:'alice',edge_owner_to_timeline_media:{edges:[{node:photo('PIN','50')},{node:co},{node:photo('OLD','100')}],page_info:{has_next_page:false,end_cursor:null}}}}};
  const e=environment({boot});
  try{e.open();await until(()=>!e.test.state.loading);const select=e.root.querySelector('[data-setting="sort"]');for(const value of ['profile','newest','oldest','largest','smallest']){select.value=value;select.dispatchEvent(new e.w.Event('change',{bubbles:true}));assert.deepEqual(Array.from(e.test.state.media,m=>m.id).sort(),['COLLAB:0','COLLAB:1','COLLAB:2','OLD:0','PIN:0']);assert.equal(e.root.querySelectorAll('.media-card').length,5)}assert.equal(e.calls.length,0)}finally{e.close()}
 });
 test('Complementary partial carousel snapshots preserve every known slide',async()=>{
  const full=stack('PARTS','123',4),e=environment({boot:page([{...full,carousel_media:full.carousel_media.slice(0,2)}],null,false),fetcher:async()=>Response.json({items:[]})});
  try{e.open();await until(()=>!e.test.state.loading);e.test.ingestPayload(page([{...full,carousel_media:full.carousel_media.slice(2)}],null,false),e.test.detectRoute());assert.deepEqual(Array.from(e.test.state.media,m=>m.mediaId),['223','224','225','226']);assert.equal(JSON.parse(e.test.diagnosticReport()).incompletePosts,0)}finally{e.close()}
 });
 test('A terminal page arriving during slow detail retrieval renders its new posts immediately',async()=>{
  let resolve;
  const e=environment({fetcher:async(_url,o)=>new URLSearchParams(o.body).get('doc_id')!=='observed-document'?new Promise(r=>{resolve=r}):Response.json(vars(o).after===null?page([{...stack('FIRST','200',3),carousel_media:stack('FIRST','200',3).carousel_media.slice(0,1)}],'one',true):page([photo('LAST','100')],null,false))});
  try{await request(e);await settle();e.open();await until(()=>Boolean(resolve));await request(e,'one');await settle();assert(e.test.state.media.some(m=>m.shortcode==='LAST'));resolve(Response.json({items:[stack('FIRST','200',3)]}));await until(()=>!e.test.state.loading);assert.equal(e.test.state.media.length,4);assert.equal(e.test.state.exhausted,true)}finally{e.close()}
 });
 test('Captured XHR bodies and request headers paginate without altering the native request',async()=>{
  const e=environment({fakeXHR:true,fetcher:async(_url,o)=>Response.json(page([photo('NEXT','100')],null,false))});
  try{const xhr=new e.w.XMLHttpRequest();xhr.open('POST','/api/graphql');const body=new URLSearchParams({doc_id:'xhr-document',variables:JSON.stringify({username:'alice',after:null,first:12})}).toString();xhr.send(body);xhr.respond(page([photo('FIRST','200')],'one',true));assert.equal(xhr.body,body);e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();assert.deepEqual(Array.from(e.test.state.media,m=>m.shortcode),['FIRST','NEXT']);assert.equal(new URLSearchParams(e.calls[0][1].body).get('doc_id'),'xhr-document');assert.equal(vars(e.calls[0][1]).after,'one')}finally{e.close()}
 });
 test('Capturing a Request body never consumes it before native fetch',async()=>{
  let received;
  const e=environment({fetcher:async(input,o)=>{if(!o)received=await input.text();return Response.json(page([photo(o?'NEXT':'FIRST',o?'100':'200')],o?null:'one',!o))}});
  try{const body=new URLSearchParams({doc_id:'request-document',variables:JSON.stringify({username:'alice',after:null,first:12})}).toString();const input=new Request('https://www.instagram.com/api/graphql',{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded','X-FB-LSD':'secret-lsd'}});await e.w.fetch(input);assert.equal(received,body);assert.equal(input.bodyUsed,true);await settle();e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();assert.equal(e.test.state.media.length,2);assert.equal(vars(e.calls[1][1]).after,'one');assert.equal(e.calls[1][1].headers['x-fb-lsd'],'secret-lsd');assert.doesNotMatch(e.test.diagnosticReport(),/secret-lsd|request-document/)}finally{e.close()}
 });
 test('REST profile replay preserves query parameters and advances max_id',async()=>{
  const e=environment({fetcher:async url=>Response.json({items:[photo(new URL(url,'https://www.instagram.com').searchParams.has('max_id')?'NEXT':'FIRST','100')],more_available:!new URL(url,'https://www.instagram.com').searchParams.has('max_id'),next_max_id:'rest-cursor'})});
  try{await e.w.fetch('/api/v1/feed/user/alice/?count=12&exclude_comment=true');await settle();e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();assert.equal(e.test.state.media.length,2);const url=new URL(e.calls[1][0]);assert.equal(url.searchParams.get('max_id'),'rest-cursor');assert.equal(url.searchParams.get('count'),'12');assert.equal(url.searchParams.get('exclude_comment'),'true');assert.equal(e.test.state.exhausted,true)}finally{e.close()}
 });
 test('Nested max_id profile replay preserves provider fields',async()=>{
  const e=environment({fetcher:async(_url,o)=>Response.json(vars(o).data.max_id?page([photo('NEXT','100')],null,false):page([photo('FIRST','200')],'one',true))});
  try{await e.w.fetch('/graphql/query',{method:'POST',body:new URLSearchParams({doc_id:'nested-document',variables:JSON.stringify({username:'alice',data:{count:12,max_id:null,include_relationship_info:true}})}).toString()});await settle();e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();assert.equal(e.test.state.media.length,2);assert.equal(vars(e.calls[1][1]).data.max_id,'one');assert.equal(vars(e.calls[1][1]).data.include_relationship_info,true)}finally{e.close()}
 });
 test('Profile pagination retries a transient server failure and retains prior media',async()=>{
  let failures=0;
  const e=environment({fetcher:async(_url,o)=>vars(o).after===null?Response.json(page([photo('FIRST','200')],'one',true)):failures++===0?new Response('',{status:503}):Response.json(page([photo('NEXT','100')],null,false))});
  try{await request(e);await settle();e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();assert.deepEqual(Array.from(e.test.state.media,m=>m.shortcode),['FIRST','NEXT']);assert.equal(e.calls.length,3);assert.equal(e.test.state.exhausted,true)}finally{e.close()}
 });
 test('Rate-limited profile pagination pauses automatically with its collection intact',async()=>{
  const e=environment({autoLoad:true,fetcher:async(_url,o)=>vars(o).after===null?Response.json(page([photo('FIRST','200')],'one',true)):new Response('',{status:429})});
  try{await request(e);await settle();e.open();await until(()=>e.test.state.autoPaused&&!e.test.state.loading);await settle(30);assert.equal(e.calls.length,2);assert.equal(e.test.state.media.length,1);assert.equal(e.test.state.exhausted,false);assert.equal(JSON.parse(e.test.diagnosticReport()).profileComplete,false);assert.match(e.root.querySelector('.status').textContent,/429/)}finally{e.close()}
 });
 test('Closing during cursor replay cancels it without accepting a stale next page',async()=>{
  let resolve;
  const e=environment({autoLoad:true,fetcher:async(_url,o)=>vars(o).after===null?Response.json(page([photo('FIRST','200')],'one',true)):new Promise(r=>{resolve=r})});
  try{await request(e);await settle();e.open();await until(()=>Boolean(resolve));e.root.querySelector('[data-action="close"]').click();resolve(Response.json(page([photo('STALE','100')],null,false)));await settle(30);assert.equal(e.test.state.media.length,1);assert.equal(e.test.state.loading,false);assert.equal(e.calls.length,2);assert.equal(e.root.querySelectorAll('.toast.error').length,0)}finally{e.close()}
 });
 test('An advertised coverage gap remains incomplete even when the feed reports end',async()=>{
  const boot={data:{user:{username:'alice',media_count:5,edge_owner_to_timeline_media:{count:5,edges:[{node:photo('ONLY','100')}],page_info:{has_next_page:false,end_cursor:null}}}}};
  const e=environment({boot});
  try{e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();const report=JSON.parse(e.test.diagnosticReport());assert.equal(e.test.state.exhausted,false);assert.equal(report.feedEndObserved,true);assert.equal(report.coverageGap,4);assert.equal(report.profileComplete,false);assert.equal(e.test.state.autoPaused,true);assert.match(e.root.querySelector('.status').textContent,/incomplete/i)}finally{e.close()}
 });
 test('The page limit counts replayed pages even when live ingestion already rendered them',async()=>{
  const gm=new Map([[key,JSON.stringify({autoLoad:false,maxPages:2})]]),e=environment({gm,fetcher:async(_url,o)=>Response.json(vars(o).after===null?page([photo('FIRST','300')],'one',true):vars(o).after==='one'?page([photo('SECOND','200')],'two',true):page([photo('THIRD','100')],null,false))});
  try{await request(e);await settle();e.open();await until(()=>!e.test.state.loading);await e.test.loadNextPage();await e.test.loadNextPage();assert.equal(e.calls.length,2);assert.equal(e.test.state.media.length,2);assert.equal(e.test.state.exhausted,false);assert.equal(e.test.state.autoPaused,true)}finally{e.close()}
 });
 test('Rescanning old boot data cannot replace a newer live profile frontier',async()=>{
  const e=environment({boot:page([photo('OLD','100')],null,false),fetcher:async()=>Response.json(page([photo('NEW','200')],'one',true))});
  try{e.test.scanPageData();await request(e);await settle();e.test.native.scripts=new WeakSet();e.test.scanPageData();assert.equal(e.test.native.pageInfo.more,true);assert.equal(e.test.native.pageInfo.cursor,'one');assert.deepEqual(Array.from(e.test.native.profileOrder.keys()),['NEW','OLD'])}finally{e.close()}
 });
 test('Late live pages clear a waiting state even when their posts were rendered on ingestion',async()=>{
  let working=false;
  const e=environment({autoLoad:true,fetcher:async(_url,o)=>vars(o).after===null?Response.json(page([photo('FIRST','200')],'one',true)):working?Response.json(page([photo('LAST','100')],null,false)):new Response('',{status:503})});
  try{await request(e);await settle();e.open();await until(()=>e.test.state.autoPaused&&!e.test.state.loading);working=true;await request(e,'one');await until(()=>e.test.state.exhausted&&!e.test.state.loading);assert.equal(e.test.state.media.length,2);assert.equal(e.test.state.autoPaused,false)}finally{e.close()}
 });
 test('Per-page counts cannot shrink the profile metadata coverage target',async()=>{
  const boot={data:{user:{username:'alice',media_count:36}}};
  const e=environment({boot,fetcher:async()=>Response.json({data:{xdt_api__v1__feed__user_timeline_graphql_connection:{count:12,edges:[{node:photo('ONLY','100')}],page_info:{has_next_page:false,end_cursor:null}}}})});
  try{e.test.scanPageData();await request(e);await settle();e.open();await until(()=>!e.test.state.loading);assert.equal(JSON.parse(e.test.diagnosticReport()).expectedPosts,36);assert.equal(e.test.state.exhausted,false)}finally{e.close()}
 });
 test('Profile metadata from a captured page request supplies the coverage target',async()=>{
  const e=environment({fetcher:async()=>Response.json({data:{user:{username:'alice',id:'777',media_count:36}}})});
  try{await e.w.fetch('/api/v1/users/web_profile_info/?username=alice');await settle();assert.equal(JSON.parse(e.test.diagnosticReport()).expectedPosts,36)}finally{e.close()}
 });
 test('A newly discovered DOM row is reconciled once rather than once per preview',async()=>{
  const e=environment({boot:page([photo('FIRST','100')],null,false)});
  try{e.open();await until(()=>!e.test.state.loading);let reconciliations=0;const ui=e.test.ui(),sync=ui.syncViewer;ui.syncViewer=(...args)=>{reconciliations++;sync(...args)};e.w.document.querySelector('main').innerHTML=cover('NEXT1')+cover('NEXT2')+cover('NEXT3');e.test.scanVisibleMedia();assert.equal(reconciliations,1);assert.equal(e.test.state.postGroups.size,4)}finally{e.close()}
 });
};
