// Real Chromium, real fetch/Headers/IntersectionObserver, sanitized Instagram
// responses. All network traffic is intercepted; no account is used.
const { chromium } = require('playwright');
const { readFileSync, mkdirSync } = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../instagram-full-size-gallery-downloader.user.js'), 'utf8');
const totalPosts = Number(process.env.IG_BROWSER_POSTS || 36);
const expected = new Map([[36,{media:54,pages:3,details:9,requests:12}],[216,{media:324,pages:18,details:54,requests:72}]]).get(totalPosts);
assert(expected,'Use the documented 36-post or 216-post fixture');
const image = (id, index=0) => ({pk:String(100000+id*10+index),media_type:1,image_versions2:{candidates:[{url:`https://images.cdninstagram.com/${id}-${index}.svg`,width:1080,height:1350}]}});
const posts = Array.from({length:totalPosts},(_,id)=>({
 ...image(id),code:`POST${id}`,user:{username:id%5===0?'coauthor':'alice'},
 taken_at:id===0?100:100000-id,caption:{text:`Fixture post ${id}`},
 ...(id%4===0?{media_type:8,carousel_media_count:3,carousel_media:[image(id,0),image(id,1),image(id,2)]}:{})
}));
const partial = post => post.carousel_media ? {...post,carousel_media:post.carousel_media.slice(0,1)} : post;
const feed = page => ({data:{node:{username:'alice',pk:'777',media_count:totalPosts,polaris_ordered_timeline_connection:{
 edges:posts.slice(page*12,page*12+12).map(post=>({node:partial(post)})),
 page_info:{has_next_page:page<expected.pages-1,end_cursor:page<expected.pages-1?`page-${page+1}`:null}
}}}});

(async()=>{
 const started=Date.now();
 const browser = await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.IG_CHROMIUM_EXECUTABLE?{executablePath:process.env.IG_CHROMIUM_EXECUTABLE}:{})});
 try{
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  const requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='images.cdninstagram.com')return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#677b94"/><text x="100" y="200" font-size="72" fill="white">${url.pathname}</text></svg>`});
   if(url.pathname==='/api/graphql'||url.pathname==='/graphql/query'){
    const form=new URLSearchParams(req.postData()),variables=JSON.parse(form.get('variables'));
    if(variables.shortcode){
     requests.push({type:'details',code:variables.shortcode});
     return route.fulfill({json:{data:{xdt_api__v1__media__shortcode__web_info:{items:[posts.find(post=>post.code===variables.shortcode)]}}}});
    }
    assert.equal(form.get('doc_id'),'browser-observed-document');
    assert.equal(variables.username,'alice');
    assert.equal(variables.providerFlag,true);
    const index=variables.after?Number(variables.after.split('-')[1]):0;
    requests.push({type:'profile',cursor:variables.after});
    return route.fulfill({json:feed(index)});
   }
   if(url.pathname==='/alice/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><main><h1>Sanitized profile fixture</h1></main><script>
    window.__nativeReady=false;
    setTimeout(async()=>{const request=new Request(new URL('/api/graphql',location.href),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-FB-Friendly-Name':'PolarisProfilePosts'},body:new URLSearchParams({doc_id:'browser-observed-document',variables:JSON.stringify({username:'alice',after:null,first:12,providerFlag:true})})});await fetch(request);window.__requestConsumed=request.bodyUsed;window.__nativeReady=true},900);
   </script></body></html>`});
   return route.abort();
  });
  await page.addInitScript(()=>{
   window.GM_getValue=(_key,fallback)=>fallback;
   window.GM_setValue=()=>{};
   window.GM_registerMenuCommand=()=>{};
   window.GM_setClipboard=value=>{window.__clipboard=value};
  });
  await page.addInitScript({content:source});
  await page.goto('https://www.instagram.com/alice/');
  await page.locator('.launcher').click();
  assert.equal(await page.evaluate(()=>window.__nativeReady),false,'Must open before Instagram returns its first posts');
  await page.waitForFunction(mediaCount=>{
   const root=document.querySelector('#ig-full-size-gallery-host')?.shadowRoot;
   return root?.querySelectorAll('.media-card').length===mediaCount && root.querySelector('.status').textContent.includes('end reached');
  },expected.media,{timeout:60000});
  await page.locator('[data-action="diagnostics"]').click();
  const report=await page.evaluate(()=>JSON.parse(window.__clipboard));
  assert.equal(report.version,'2.2.0');
  assert.equal(report.profileComplete,true);
  assert.equal(report.discoveredPosts,totalPosts);
  assert.equal(report.renderedMedia,expected.media);
  assert.equal(report.coverageGap,0);
  assert.equal(report.incompletePosts,0);
  assert.equal(await page.evaluate(()=>window.__requestConsumed),true);
  assert.deepEqual(requests.filter(req=>req.type==='profile').map(req=>req.cursor),[null,...Array.from({length:expected.pages-1},(_,i)=>`page-${i+1}`)]);
  assert.equal(requests.filter(req=>req.type==='details').length,expected.details);

  const imageSet=()=>page.locator('.media-card img').evaluateAll(images=>images.map(image=>image.src).sort());
  const originals=await imageSet();
  assert.equal(new Set(originals).size,expected.media);
  for(const sort of ['newest','oldest','largest','smallest','profile']){
   await page.locator('[data-setting="sort"]').selectOption(sort);
   assert.deepEqual(await imageSet(),originals);
  }
  assert.match(await page.locator('.media-card img').first().getAttribute('src'),/\/0-0.svg$/);
  await page.locator('[data-setting="sort"]').selectOption('newest');
  assert.match(await page.locator('.media-card img').first().getAttribute('src'),/\/1-0.svg$/);
  assert.equal(requests.length,expected.requests,'Sorting must not fetch or change membership');
  await page.locator('.card-meta').first().click();
  await page.locator('[data-action="zoom-in"]').click();
  await page.locator('[data-action="next"]').click();
  assert.match(await page.locator('.viewer-media img').getAttribute('style'),/scale\(1.25\)/);
  await page.locator('[data-action="viewer-close"]').click();
  const output=process.env.IG_BROWSER_ARTIFACTS;
  if(output){mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`profile-v2.2.0-${totalPosts}.png`)});}
  await page.locator('[data-action="close"]').click();
  await page.locator('.launcher').click();
  assert.equal(await page.locator('.media-card').count(),expected.media);
  assert.equal(requests.length,expected.requests);
  assert.deepEqual(errors,[]);
  console.log(`PASS Chromium (${((Date.now()-started)/1000).toFixed(1)}s): immediate startup, ${expected.pages} cursor pages, ${totalPosts} posts/${expected.media} slides, collaborative posts, all sorts, pins, zoom, close/reopen; no page errors.`);
  await context.close();
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
