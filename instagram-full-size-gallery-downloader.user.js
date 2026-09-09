// ==UserScript==
// @name         Instagram Full-Size Gallery & Downloader
// @namespace    https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader
// @author       William Harris; based on the original script by driver8
// @license      AGPL-3.0-or-later
// @description  Rebuilds Instagram into an uncropped full-size photo and video gallery with smooth zoom, continuous browsing, load-all, and direct downloads.
// @homepageURL  https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader
// @supportURL   https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader/issues
// @contributionURL https://buymeacoffee.com/stupidgiraffe
// @compatible   firefox
// @compatible   chrome
// @compatible   edge
// @compatible   brave
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @version      2.1.6
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      instagram.com
// @connect      www.instagram.com
// @connect      i.instagram.com
// @connect      *.cdninstagram.com
// @connect      *.fbcdn.net
// @run-at       document-start
// ==/UserScript==

/*
 * Instagram Full-Size Gallery & Downloader
 *
 * Based on “Instagram full-size media scroll wall” by driver8.
 * Modern gallery rewrite and maintenance by William Harris, 2026.
 * Development assisted by AI tooling.
 *
 * This program is free software licensed under the GNU Affero General
 * Public License, version 3 or any later version. See LICENSE.
 */

(() => {
  'use strict';

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const doc = document;
  const APP_ID = '936619743392459';
  const ASBD_ID = '198387';
  const STORAGE_KEY = 'igFullSizeGallery.v2.settings';

  const DEFAULTS = Object.freeze({
    layout: 'fit',          // fit | masonry | classic | contact
    imageSize: 'large',     // medium | large | huge
    filter: 'all',          // all | image | video
    captions: false,
    autoLoad: true,
    thumbnailMode: 'contain', // contain | crop
    theme: 'dark',
    maxPages: 0,            // 0 = unlimited
    videoVolume: 0.02,
    launcherPosition: 'bottom-right',
    viewerSize: 'compact', // compact | comfortable | large
    hideViewerControls: false,
  });

  const state = {
    settings: loadSettings(),
    routeKey: '',
    generation: 0,
    mode: 'profile',
    username: '',
    userId: '',
    nextCursor: null,
    hasMore: false,
    exhausted: false,
    loading: false,
    loadAll: false,
    opened: false,
    pagesLoaded: 0,
    media: [],
    seenMedia: new Set(),
    seenCursors: new Set(),
    controller: null,
    observer: null,
    lightboxIndex: -1,
    starting: false,
    autoPaused: false,
    nativeConsumed: new Map(),
    nativeStep: 0,
    mediaById: new Map(),
    stats: {
      images: 0,
      videos: 0,
      carousels: 0,
      ads: 0,
      duplicates: 0,
      failures: 0,
    },
  };

  let ui = null;

  function loadSettings() {
    const candidates = [];
    function accept(raw) {
      try {
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (value && typeof value === 'object' && !Array.isArray(value) && !value.then) candidates.push(value);
      } catch (_) {}
    }
    try { if (typeof GM_getValue === 'function') accept(GM_getValue(STORAGE_KEY, '')); } catch (_) {}
    try { accept(localStorage.getItem(STORAGE_KEY)); } catch (_) {}
    candidates.sort((a, b) => (Number(b._savedAt) || 0) - (Number(a._savedAt) || 0));
    const stored = candidates[0] || {};
    if (typeof stored.hideViewerControls !== 'boolean') {
      if (typeof stored.hideGalleryControls === 'boolean') stored.hideViewerControls = stored.hideGalleryControls;
      else if (typeof stored.hideControls === 'boolean') stored.hideViewerControls = stored.hideControls;
      else if (typeof stored.controlsHidden === 'boolean') stored.hideViewerControls = stored.controlsHidden;
    }
    return { ...DEFAULTS, ...stored };
  }

  function saveSettings() {
    state.settings._savedAt = Math.max(Date.now(), (Number(state.settings._savedAt) || 0) + 1);
    const raw = JSON.stringify(state.settings);
    try { localStorage.setItem(STORAGE_KEY, raw); } catch (_) {}
    try {
      if (typeof GM_setValue === 'function') {
        const result = GM_setValue(STORAGE_KEY, raw);
        if (result?.catch) result.catch(() => {});
      }
    } catch (_) {}
  }

  function ready(fn) {
    if (doc.body) fn();
    else doc.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  function getCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return doc.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`))?.[1] || '';
  }

  function headers() {
    const result = {
      Accept: 'application/json, text/plain, */*',
      'X-IG-App-ID': String(win._sharedData?.config?.instagramWebDesktopFBAppId || APP_ID),
      'X-ASBD-ID': String(win._sharedData?.config?.ASBD_ID || ASBD_ID),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const csrf = win._sharedData?.config?.csrf_token || getCookie('csrftoken');
    if (csrf) result['X-CSRFToken'] = csrf;
    const claim = win._sharedData?.config?.www_claim || win.__initialData?.wwwClaim;
    if (claim) result['X-IG-WWW-Claim'] = claim;
    return result;
  }

  function gmJson(url, options = {}) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest unavailable'));
        return;
      }
      if (options.signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const request = GM_xmlhttpRequest({
        method: options.method || 'GET',
        url,
        headers: options.headers || {},
        data: options.body instanceof URLSearchParams ? options.body.toString() : options.body,
        responseType: 'json',
        timeout: 30000,
        onload: response => {
          if (response.status < 200 || response.status >= 300) {
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            reject(error);
            return;
          }
          try {
            const value = response.response ?? JSON.parse(response.responseText);
            resolve(value);
          } catch (error) {
            reject(new Error(`Invalid JSON: ${error.message}`));
          }
        },
        onerror: () => reject(new Error('NetworkError while requesting Instagram data')),
        ontimeout: () => reject(new Error('Instagram request timed out')),
        onabort: () => reject(new DOMException('Aborted', 'AbortError')),
      });
      options.signal?.addEventListener('abort', () => request.abort?.(), { once: true });
    });
  }

  async function requestJson(url, options = {}) {
    try {
      const response = await (originalFetch || win.fetch.bind(win))(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        credentials: 'include',
        signal: options.signal,
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (error?.status) throw error;
      return gmJson(url, options);
    }
  }

  function detectRoute() {
    const path = location.pathname;
    if (/^\/?$/.test(path)) return { mode: 'home', username: '', key: `home:${location.href}` };
    if (/^\/(p|reel|tv)\//.test(path)) return { mode: 'post', username: '', key: `post:${path}` };
    if (/^\/explore\//.test(path)) return { mode: 'explore', username: '', key: `explore:${path}` };

    const username = decodeURIComponent(path.match(/^\/([^/?#]+)/)?.[1] || '');
    const reserved = new Set(['accounts', 'direct', 'stories', 'about', 'developer']);
    const clean = reserved.has(username) ? '' : username;
    const tagged = /\/tagged\/?$/.test(path);
    return {
      mode: tagged ? 'tagged' : 'profile',
      username: clean,
      key: `${tagged ? 'tagged' : 'profile'}:${clean}:${path}`,
    };
  }

  const VERSION = '2.1.6';
  const native = {
    key: '', items: new Map(), scripts: new WeakSet(), sequence: 0,
    pageInfo: null, requests: 0, responses: 0, errors: [], hooks: [],
  };
  const originalFetch = typeof win.fetch === 'function' ? win.fetch.bind(win) : null;
  const refreshRequests = new Map();
  const mediaBindings = new WeakMap();

  function routeCache(route = detectRoute()) {
    if (native.key !== route.key) {
      native.key = route.key;
      native.items.clear();
      native.scripts = new WeakSet();
      native.pageInfo = null;
      native.sequence = 0;
    }
    return native;
  }

  function mediaMatchesRoute(media, route) {
    if (!media || typeof media !== 'object') return false;
    const code = media.code || media.shortcode;
    const owner = media.user || media.owner;
    if (route.mode === 'profile') return String(owner?.username || '').toLowerCase() === route.username.toLowerCase();
    if (route.mode === 'post') return code === location.pathname.match(/^\/(?:p|reel|tv)\/([^/?#]+)/)?.[1];
    return route.mode === 'home' || route.mode === 'tagged';
  }

  function isMediaNode(value) {
    return Boolean(value && (value.code || value.shortcode || value.pk || value.id) && (
      value.image_versions2 || value.display_url || value.video_versions || value.video_url
      || value.carousel_media || value.edge_sidecar_to_children || value.carousel_media_items
    ));
  }

  function mediaSignature(media) {
    return JSON.stringify(media);
  }

  function cacheMedia(media, route, source) {
    if (detectRoute().key !== route.key) return;
    const cache = routeCache(route);
    const key = String(media.code || media.shortcode || media.pk || media.id || '');
    if (!key) return;
    const previous = cache.items.get(key);
    if (previous && !previous.media.__preview && media.__preview) return;
    const signature = mediaSignature(media);
    if (previous?.signature === signature) return;
    cache.items.set(key, { media, signature, source });
    cache.sequence += 1;
    if (cache.items.size > 600) cache.items.delete(cache.items.keys().next().value);
  }

  function parsePayload(text) {
    if (typeof text !== 'string' || text.length > 12_000_000) return [];
    const clean = text.trim().replace(/^for\s*\(;;\)\s*;\s*/, '').replace(/^\)\]\}',?\s*/, '');
    try { return [JSON.parse(clean)]; } catch (_) {}
    const values = [];
    for (const line of clean.split('\n')) {
      try { values.push(JSON.parse(line)); } catch (_) {}
    }
    return values;
  }

  function ingestPayload(value, route, source = 'network') {
    if (detectRoute().key !== route.key) return;
    routeCache(route);
    const visited = new WeakSet();
    let remaining = 24000;
    function walk(node, path = '', depth = 0, inFeed = false) {
      if (!node || depth > 45 || --remaining < 0) return;
      if (typeof node === 'string') {
        if (node.length < 4_000_000 && /^[\[{]/.test(node.trim()) && /image_versions2|display_url|carousel_media/.test(node)) {
          for (const parsed of parsePayload(node)) walk(parsed, path, depth + 1, inFeed);
        }
        return;
      }
      if (typeof node !== 'object' || visited.has(node)) return;
      visited.add(node);
      const feed = inFeed || /timeline|usertags|tagged|edge_owner_to_timeline_media/.test(path);
      const eligible = items => source === 'network' || items.some(item => mediaMatchesRoute(item.node || item.media || item, route));
      if (node.page_info && Array.isArray(node.edges) && feed && eligible(node.edges)) {
        const info = node.page_info;
        if (typeof info.has_next_page === 'boolean' && (source === 'network' || native.pageInfo === null)) native.pageInfo = { more: info.has_next_page, cursor: info.end_cursor || null };
      }
      if (typeof node.more_available === 'boolean' && (Array.isArray(node.items) || Array.isArray(node.feed_items)) && eligible(node.items || node.feed_items)) {
        if (source === 'network' || native.pageInfo === null) native.pageInfo = { more: node.more_available, cursor: node.next_max_id || null };
      }
      if (isMediaNode(node)) {
        if (mediaMatchesRoute(node, route) && (route.mode !== 'tagged' || feed || source === 'network')) cacheMedia(node, route, source);
        return;
      }
      for (const [key, child] of Object.entries(node)) {
        if (/suggested|recommend|chaining|reels_tray/.test(key)) continue;
        walk(child, `${path}.${key}`, depth + 1, feed);
      }
    }
    walk(value);
  }

  function scanPageData(route = detectRoute()) {
    routeCache(route);
    for (const script of doc.querySelectorAll('script[type="application/json"], script[data-sjs]')) {
      if (native.scripts.has(script) || !script.textContent) continue;
      native.scripts.add(script);
      for (const value of parsePayload(script.textContent)) ingestPayload(value, route, 'page data');
    }
  }

  function normalizeMediaUrl(value) {
    if (typeof value !== 'string') return '';
    const decoded = value.replace(/&amp;/g, '&').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
    try {
      const url = new URL(decoded, location.href);
      return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  function scanVisibleMedia(route = detectRoute()) {
    if (route.key !== detectRoute().key) return;
    routeCache(route);
    const groups = new Map();
    const selectors = route.mode === 'post' ? 'article img, article video, main img, main video' : 'main a[href] img, main a[href] video, article img, article video';
    for (const element of doc.querySelectorAll(selectors)) {
      if (element.closest('#ig-full-size-gallery-host')) continue;
      const article = element.closest('article');
      let anchor = element.closest('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
      if (!anchor && article) anchor = article.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
      const code = (anchor?.href || (route.mode === 'post' ? location.href : '')).match(/\/(?:p|reel|tv)\/([^/?#]+)/)?.[1];
      if (!code || /profile (picture|photo)|avatar/i.test(element.alt || '')) continue;
      const width = element.naturalWidth || element.videoWidth || element.width || 0;
      const height = element.naturalHeight || element.videoHeight || element.height || 0;
      if (element.tagName === 'IMG' && width > 0 && width < 100 && height < 100) continue;
      const current = normalizeMediaUrl(element.currentSrc || element.src);
      if (!current) continue;
      const candidates = [];
      if (element.tagName === 'IMG') {
        for (const piece of (element.srcset || '').split(/,\s*(?=https?:)/)) {
          const match = piece.trim().match(/^(\S+)\s+(\d+)w$/);
          if (match) candidates.push({ url: normalizeMediaUrl(match[1]), width: Number(match[2]), height: width && height ? Math.round(Number(match[2]) * height / width) : 0 });
        }
        candidates.push({ url: current, width, height });
      }
      let parent = groups.get(code);
      if (!parent) {
        parent = { code, __preview: true, user: { username: route.username }, carousel_media: [] };
        groups.set(code, parent);
      }
      if (parent.carousel_media.some(child => (child.video_url || child.image_versions2?.candidates?.at(-1)?.url) === current)) continue;
      parent.carousel_media.push(element.tagName === 'VIDEO'
        ? { is_video: true, video_url: current, image_versions2: { candidates: element.poster ? [{ url: normalizeMediaUrl(element.poster) }] : [] } }
        : { image_versions2: { candidates } });
    }
    for (const media of groups.values()) cacheMedia(media, route, 'visible page');
  }

  function observedEndpoint(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!['www.instagram.com', 'instagram.com', 'i.instagram.com'].includes(url.hostname)) return null;
      if (!/^\/(?:graphql\/query\/?|api\/graphql\/?|api\/v1\/(?:feed\/(?:user\/|timeline\/)|usertags\/|media\/[^/]+\/info\/))/.test(url.pathname)) return null;
      return url;
    } catch (_) { return null; }
  }

  function recordNativeFailure(url, status) {
    native.errors.push({ path: url.pathname.replace(/\/\d+(?:_\d+)?\//g, '/:id/'), status: Number(status) || 0 });
    if (native.errors.length > 8) native.errors.shift();
  }

  function installResponseCapture() {
    const expose = fn => typeof exportFunction === 'function' ? exportFunction(fn, win, { allowCrossOriginArguments: true }) : fn;
    if (originalFetch) {
      try {
        win.fetch = expose(function (...args) {
          const url = observedEndpoint(args[0]);
          const route = detectRoute();
          if (url) native.requests += 1;
          return originalFetch(...args).then(response => {
            if (url && detectRoute().key === route.key) {
              if (response.ok) {
                try {
                  response.clone().text().then(text => {
                    if (detectRoute().key !== route.key) return;
                    native.responses += 1;
                    for (const value of parsePayload(text)) ingestPayload(value, route);
                  }).catch(() => {});
                } catch (_) {}
              } else recordNativeFailure(url, response.status);
            }
            return response;
          });
        });
        native.hooks.push('fetch');
      } catch (_) {}
    }
    try {
      const proto = win.XMLHttpRequest?.prototype;
      if (!proto) return;
      const open = proto.open;
      const send = proto.send;
      const contexts = new WeakMap();
      proto.open = expose(function (method, url, ...rest) {
        contexts.set(this, { url: observedEndpoint(String(url)), route: detectRoute() });
        return open.call(this, method, url, ...rest);
      });
      proto.send = expose(function (...args) {
        const context = contexts.get(this);
        if (context?.url) {
          native.requests += 1;
          this.addEventListener('load', () => {
            if (detectRoute().key !== context.route.key) return;
            if (this.status < 200 || this.status >= 300) { recordNativeFailure(context.url, this.status); return; }
            try {
              native.responses += 1;
              const values = this.responseType === 'json' ? [this.response] : parsePayload(this.responseText);
              for (const value of values) ingestPayload(value, context.route);
            } catch (_) {}
          }, { once: true });
        }
        return send.apply(this, args);
      });
      native.hooks.push('XHR');
    } catch (_) {}
  }

  function checkSession(generation, route, signal) {
    if (signal?.aborted || generation !== state.generation || route.key !== detectRoute().key || !state.opened) {
      throw new DOMException('Gallery session changed or closed', 'AbortError');
    }
  }

  function pendingNativeItems() {
    return [...native.items.entries()].filter(([key, value]) => state.nativeConsumed.get(key) !== value.signature);
  }

  function takeNativePage(waiting = false) {
    const pending = pendingNativeItems();
    for (const [key, value] of pending) state.nativeConsumed.set(key, value.signature);
    return {
      items: pending.map(([, value]) => value.media),
      next_max_id: `native:${++state.nativeStep}`,
      more_available: native.pageInfo?.more !== false,
      __native: true, __waiting: waiting && !pending.length,
      __preview: pending.some(([, value]) => value.media.__preview),
    };
  }

  function scrollInstagram() {
    const main = doc.querySelector('main');
    let target = main;
    while (target && target !== doc.body && target !== doc.documentElement) {
      const style = win.getComputedStyle(target);
      if (/(auto|scroll)/.test(style.overflowY) && target.scrollHeight > target.clientHeight + 80) break;
      target = target.parentElement;
    }
    target = target && target !== doc.body && target !== doc.documentElement ? target : (doc.scrollingElement || doc.documentElement);
    const top = Math.max(0, target.scrollHeight - target.clientHeight);
    if (target === doc.scrollingElement || target === doc.documentElement) win.scrollTo({ top, behavior: 'instant' });
    else target.scrollTo({ top, behavior: 'instant' });
    target.dispatchEvent(new win.Event('scroll', { bubbles: true }));
  }

  async function fetchPage(_cursor, signal) {
    const generation = state.generation;
    const route = detectRoute();
    checkSession(generation, route, signal);
    scanPageData(route);
    scanVisibleMedia(route);
    if (pendingNativeItems().length || native.pageInfo?.more === false) return takeNativePage();
    if (route.mode === 'post') return takeNativePage(true);
    ui.setStatus('Waiting for Instagram to load the next posts…');
    scrollInstagram();
    const until = Date.now() + 6500;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 200));
      checkSession(generation, route, signal);
      scanPageData(route);
      scanVisibleMedia(route);
      if (pendingNativeItems().length || native.pageInfo?.more === false) return takeNativePage();
    }
    return takeNativePage(true);
  }

  function diagnosticReport() {
    return JSON.stringify({
      version: VERSION, mode: state.mode, loader: 'Instagram page responses',
      hooks: native.hooks, observedRequests: native.requests, capturedResponses: native.responses,
      cachedPosts: native.items.size, renderedMedia: state.media.length, paused: state.autoPaused,
      pagesLoaded: state.pagesLoaded, moreKnown: native.pageInfo?.more ?? null,
      recentHttpErrors: native.errors, failedMedia: state.stats.failures,
      previewMedia: state.media.filter(item => item.preview).length,
    }, null, 2);
  }

  function resetSession(route = detectRoute()) {
    state.controller?.abort();
    state.generation += 1;
    state.routeKey = route.key;
    state.mode = route.mode;
    state.username = route.username;
    state.userId = '';
    state.nativeConsumed = new Map();
    state.nativeStep = 0;
    state.autoPaused = false;
    state.starting = false;
    state.mediaById = new Map();
    refreshRequests.clear();
    routeCache(route);
    state.nextCursor = null;
    state.hasMore = false;
    state.exhausted = false;
    state.loading = false;
    state.loadAll = false;
    state.pagesLoaded = 0;
    state.media = [];
    state.seenMedia = new Set();
    state.seenCursors = new Set();
    state.lightboxIndex = -1;
    state.stats = { images: 0, videos: 0, carousels: 0, ads: 0, duplicates: 0, failures: 0 };
    ui?.clearGallery();
    ui?.refresh();
  }

  async function startSession() {
    if (state.starting || !state.opened) return;
    const generation = state.generation;
    state.starting = true;
    try {
      if (state.mode === 'explore') throw new Error('Open a profile, tagged feed, home feed, post, or reel.');
      if (state.mode === 'profile' && !state.username) throw new Error('Open an Instagram profile first.');
      await loadNextPage();
    } catch (error) {
      if (generation === state.generation && error?.name !== 'AbortError') {
        state.autoPaused = true;
        ui.setStatus(`Gallery: ${error.message || error}`);
        ui.toast(error.message || String(error), 'error', 5000);
      }
    } finally {
      if (generation === state.generation) state.starting = false;
    }
  }

  function extractPage(json) {
    const timeline = json?.data?.xdt_api__v1__feed__user_timeline_graphql_connection
      || json?.data?.user?.edge_owner_to_timeline_media
      || json?.user?.edge_owner_to_timeline_media
      || json?.edge_owner_to_timeline_media;

    const items = timeline?.edges?.map(edge => edge.node).filter(Boolean)
      || json?.items?.map(item => item?.media || item).filter(Boolean)
      || json?.feed_items?.map(item => item?.media_or_ad || item?.media).filter(Boolean)
      || json?.data?.xdt_api__v1__feed__user_timeline_graphql_connection?.edges?.map(edge => edge.node).filter(Boolean)
      || [];

    const cursor = timeline?.page_info?.end_cursor
      || json?.next_max_id
      || json?.next_max_id_value
      || null;

    const more = timeline?.page_info?.has_next_page
      ?? json?.more_available
      ?? Boolean(cursor);

    return { items, cursor: cursor ? String(cursor) : null, more: Boolean(more && cursor) };
  }

  async function loadNextPage() {
    if (state.loading || state.exhausted || !state.opened) return { added: 0, busy: state.loading };
    if (state.settings.maxPages > 0 && state.pagesLoaded >= state.settings.maxPages) {
      state.exhausted = true;
      state.hasMore = false;
      ui.setStatus(`Stopped at the ${state.settings.maxPages}-page limit.`);
      ui.refresh();
      return { added: 0 };
    }
    const generation = state.generation;
    const route = detectRoute();
    state.loading = true;
    state.controller?.abort();
    state.controller = new AbortController();
    state.autoPaused = false;
    ui.setStatus(state.pagesLoaded ? 'Loading more media…' : 'Reading Instagram media…');
    ui.refresh();
    try {
      const json = await fetchPage(state.nextCursor, state.controller.signal);
      checkSession(generation, route, state.controller.signal);
      const before = state.media.length;
      appendRawMedia(json.items);
      const added = state.media.length - before;
      if (json.items.length) state.pagesLoaded += 1;
      state.nextCursor = json.next_max_id;
      state.hasMore = json.more_available;
      state.exhausted = !state.hasMore;
      state.autoPaused = Boolean(json.__waiting);
      if (json.__waiting) {
        ui.setStatus('Instagram has not returned more posts. Close the gallery to check the page, then reopen or press Load more.');
      } else {
        ui.setStatus(`${added ? `Loaded ${added} new media items` : 'Updated loaded media'}${state.exhausted ? ' — end reached.' : '.'}${json.__preview ? ' Visible-page previews are shown until full-size data arrives.' : ''}`);
      }
      ui.refresh();
      return { added, waiting: json.__waiting };
    } catch (error) {
      if (generation !== state.generation || route.key !== detectRoute().key) return { added: 0, stale: true };
      if (error?.name === 'AbortError') return { added: 0, aborted: true };
      state.autoPaused = true;
      ui.setStatus(`Gallery failed: ${error.message || error}`);
      ui.toast(`Gallery failed: ${error.message || error}`, 'error', 5000);
      return { added: 0, error };
    } finally {
      if (generation === state.generation) {
        state.loading = false;
        ui.refresh();
      }
    }
  }

  function isAd(media) {
    return Boolean(media?.ad_id || media?.ad_tracking_token || media?.label === 'Sponsored' || media?.sponsor_tags);
  }

  function isVideo(media) {
    return Boolean(media?.is_video || media?.is_unified_video || media?.video_duration || media?.media_type === 2 || media?.video_url || media?.video_versions?.length);
  }

  function captionOf(media) {
    return media?.caption?.text || media?.edge_media_to_caption?.edges?.[0]?.node?.text || media?.accessibility_caption || '';
  }

  function uniqueCandidates(groups, fallbackType) {
    const seen = new Set();
    const result = [];
    for (const group of groups) {
      for (const candidate of Array.isArray(group) ? group : []) {
        const url = normalizeMediaUrl(candidate?.url || candidate?.src);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        result.push({
          url,
          width: Number(candidate?.width || candidate?.config_width || candidate?.original_width || 0),
          height: Number(candidate?.height || candidate?.config_height || candidate?.original_height || 0),
          bitrate: Number(candidate?.bitrate || 0),
          priority: Number(candidate?.priority || 0),
          type: fallbackType,
        });
      }
    }
    return result;
  }

  function imageCandidates(media) {
    const primary = uniqueCandidates([
      media?.display_resources,
      media?.image_versions2?.candidates,
      media?.image_versions?.items,
    ], 'image');

    const direct = [
      media?.display_url && { url: media.display_url, width: media?.dimensions?.width, height: media?.dimensions?.height },
      media?.image_url && { url: media.image_url },
      media?.thumbnail_url && { url: media.thumbnail_url },
    ].filter(Boolean);

    const fallback = uniqueCandidates([direct, media?.thumbnail_resources], 'image');
    return rankCandidates([...primary, ...fallback], media);
  }

  function videoCandidates(media) {
    const direct = media?.video_url ? [{ url: media.video_url, width: media?.original_width, height: media?.original_height }] : [];
    return rankCandidates(uniqueCandidates([media?.video_versions, media?.video_resources, direct], 'video'), media, true);
  }

  function rankCandidates(candidates, media, video = false) {
    const targetW = Number(media?.original_width || media?.width || media?.dimensions?.width || 0);
    const targetH = Number(media?.original_height || media?.height || media?.dimensions?.height || 0);
    const targetRatio = targetW && targetH ? targetW / targetH : 0;

    return candidates.sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      const ratioPenaltyA = targetRatio && a.width && a.height ? Math.abs((a.width / a.height) - targetRatio) : 0;
      const ratioPenaltyB = targetRatio && b.width && b.height ? Math.abs((b.width / b.height) - targetRatio) : 0;
      const scoreA = areaA - ratioPenaltyA * 1e9 + (video ? a.bitrate * 100 : 0);
      const scoreB = areaB - ratioPenaltyB * 1e9 + (video ? b.bitrate * 100 : 0);
      return scoreB - scoreA;
    });
  }

  function appendRawMedia(rawItems) {
    const fragment = doc.createDocumentFragment();

    for (const parent of rawItems || []) {
      if (!parent) continue;
      if (isAd(parent)) {
        state.stats.ads += 1;
        continue;
      }

      const shortcode = parent.shortcode || parent.code || '';
      const username = parent?.user?.username || parent?.owner?.username || state.username;
      const caption = captionOf(parent);
      const children = parent?.edge_sidecar_to_children?.edges?.map(edge => edge.node).filter(Boolean)
        || parent?.carousel_media
        || parent?.carousel_media_items
        || [parent];

      if (children.length > 1) state.stats.carousels += 1;

      children.forEach((child, index) => {
        if (!child || isAd(child)) return;
        const type = isVideo(child) ? 'video' : 'image';
        const sources = type === 'video' ? videoCandidates(child) : imageCandidates(child);
        if (!sources.length) {
          state.stats.failures += 1;
          return;
        }

        const stableId = String(shortcode ? `${shortcode}:${index}` : (child.pk || child.id || sources[0].url));
        if (state.seenMedia.has(stableId)) {
          const previous = state.mediaById.get(stableId);
          if (previous && (!parent.__preview || previous.preview)) {
            const changed = JSON.stringify(previous.sources) !== JSON.stringify(sources);
            previous.preview = Boolean(parent.__preview);
            previous.mediaId = String(child.pk || child.id || previous.mediaId || '');
            previous.postId = String(parent.pk || parent.id || previous.postId || '');
            if (changed) {
              previous.sources = sources;
              previous.mediaUrl = sources[0].url;
              previous.sourceIndex = 0;
              const element = previous.card?.querySelector('img, video');
              if (element) setSourceWithFallback(element, previous);
            }
          }
          state.stats.duplicates += 1;
          return;
        }
        state.seenMedia.add(stableId);

        const posterSources = type === 'video' ? imageCandidates(child).concat(imageCandidates(parent)) : [];
        const entry = {
          id: stableId,
          preview: Boolean(parent.__preview),
          mediaId: String(child.pk || child.id || ''),
          postId: String(parent.pk || parent.id || ''),
          type,
          sources,
          sourceIndex: 0,
          mediaUrl: sources[0].url,
          posterUrl: posterSources[0]?.url || '',
          postUrl: shortcode ? `https://www.instagram.com/p/${shortcode}/` : location.href,
          shortcode,
          username,
          caption,
          carouselIndex: index,
          carouselTotal: children.length,
          width: sources[0].width || Number(child?.original_width || child?.width || child?.dimensions?.width || 0),
          height: sources[0].height || Number(child?.original_height || child?.height || child?.dimensions?.height || 0),
          downloadState: 'idle',
        };

        const mediaIndex = state.media.length;
        state.media.push(entry);
        entry.card = ui.createCard(entry, mediaIndex);
        state.mediaById.set(stableId, entry);
        fragment.appendChild(entry.card);
        if (type === 'video') state.stats.videos += 1;
        else state.stats.images += 1;
      });
    }

    ui.gallery.appendChild(fragment);
  }

  async function refreshedSources(entry, signal) {
    const route = detectRoute();
    const cached = routeCache(route).items.get(entry.shortcode)?.media;
    function sourcesOf(parent) {
      if (!parent) return [];
      const children = parent.carousel_media || parent.carousel_media_items
        || parent.edge_sidecar_to_children?.edges?.map(edge => edge.node) || [parent];
      const child = children.find(item => entry.mediaId && String(item.pk || item.id) === entry.mediaId)
        || children[entry.carouselIndex];
      return entry.type === 'video' ? videoCandidates(child) : imageCandidates(child);
    }
    const fromPage = sourcesOf(cached);
    if (fromPage.some(source => !entry.sources.some(old => old.url === source.url))) return fromPage;
    const id = entry.postId || entry.mediaId;
    if (!/^\d+(?:_\d+)?$/.test(id)) return [];
    if (!refreshRequests.has(id)) {
      const url = new URL(`/api/v1/media/${encodeURIComponent(id)}/info/`, location.origin).href;
      const request = requestJson(url, { headers: headers(), signal }).then(json => {
        if (json?.status === 'fail' || !Array.isArray(json?.items)) throw new Error('Instagram did not return refreshed media.');
        return json.items[0];
      }).catch(error => {
        if (error?.status) recordNativeFailure(new URL(url), error.status);
        throw error;
      });
      refreshRequests.set(id, request);
    }
    return sourcesOf(await refreshRequests.get(id));
  }

  function setSourceWithFallback(element, entry, poster = false) {
    mediaBindings.get(element)?.();
    let candidates = poster ? [{ url: entry.posterUrl }].filter(item => item.url) : entry.sources;
    candidates = [...new Map(candidates.map(source => [source.url, source])).values()];
    const preferred = candidates.findIndex(source => source.url === entry.mediaUrl);
    if (preferred > 0) candidates = [candidates[preferred], ...candidates.filter((_, index) => index !== preferred)];
    const tried = new Set();
    const generation = state.generation;
    const controller = new AbortController();
    let active = true;
    let recovering = false;
    let refreshed = false;
    let failed = false;
    let candidate;
    const dispose = () => {
      active = false;
      controller.abort();
      element.removeEventListener('error', onError);
      element.removeEventListener('load', onReady);
      element.removeEventListener('loadedmetadata', onReady);
    };
    const onReady = () => {
      if (!active) return;
      entry.card?.classList.remove('broken');
      if (failed) { state.stats.failures = Math.max(0, state.stats.failures - 1); failed = false; }
      if (!poster && candidate) {
        entry.mediaUrl = candidate.url;
        entry.width = candidate.width || entry.width;
        entry.height = candidate.height || entry.height;
      }
    };
    const finalError = () => {
      if (!active || generation !== state.generation || failed) return;
      failed = true;
      state.stats.failures += 1;
      entry.card?.classList.add('broken');
      element.title = 'Instagram could not load this media. Open the original post to check it.';
      ui.refresh();
    };
    const apply = () => {
      if (!active || generation !== state.generation) return;
      candidate = candidates.find(source => !tried.has(source.url));
      if (!candidate) return false;
      tried.add(candidate.url);
      element.src = candidate.url;
      return true;
    };
    const onError = async () => {
      if (!active || recovering || generation !== state.generation) return;
      if (apply()) return;
      if (!poster && !refreshed) {
        refreshed = true;
        recovering = true;
        try {
          const fresh = await refreshedSources(entry, controller.signal);
          if (!active || generation !== state.generation) return;
          candidates = [...candidates, ...fresh];
          if (fresh.length) entry.sources = fresh;
          if (apply()) return;
        } catch (_) {}
        finally { recovering = false; }
      }
      finalError();
    };
    mediaBindings.set(element, dispose);
    element.referrerPolicy = 'no-referrer';
    element.addEventListener('error', onError);
    element.addEventListener('load', onReady);
    element.addEventListener('loadedmetadata', onReady);
    if (!apply()) finalError();
  }

  function sanitizeFilename(value) {
    return String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'instagram';
  }

  function extensionFor(entry) {
    if (entry.type === 'video') return 'mp4';
    try {
      const extension = new URL(entry.mediaUrl).pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
      return ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(extension) ? extension : 'jpg';
    } catch (_) {
      return 'jpg';
    }
  }

  function filenameFor(entry) {
    const user = sanitizeFilename(entry.username || 'instagram');
    const code = sanitizeFilename(entry.shortcode || entry.id);
    const slide = entry.carouselTotal > 1 ? `_${String(entry.carouselIndex + 1).padStart(2, '0')}` : '';
    return `${user}_${code}${slide}.${extensionFor(entry)}`;
  }

  function managerDownload(url, name) {
    return new Promise((resolve, reject) => {
      if (typeof GM_download !== 'function') return reject(new Error('Manager download unavailable'));
      try {
        GM_download({ url, name, saveAs: false, timeout: 120000,
          onload: resolve,
          onerror: () => reject(new Error('Manager download failed')),
          ontimeout: () => reject(new Error('Download timed out')) });
      } catch (error) { reject(error); }
    });
  }

  async function downloadBlob(url) {
    let blob;
    if (typeof GM_xmlhttpRequest === 'function') {
      blob = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({ method: 'GET', url, responseType: 'blob', timeout: 120000,
          onload: response => response.status >= 200 && response.status < 300
            ? resolve(response.response) : reject(new Error(`HTTP ${response.status}`)),
          onerror: () => reject(new Error('Media download failed')),
          ontimeout: () => reject(new Error('Download timed out')) });
      });
    } else {
      const response = await (originalFetch || win.fetch.bind(win))(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      blob = await response.blob();
    }
    if (!blob || !blob.size || (blob.type && !/^(image\/|video\/|application\/octet-stream)/i.test(blob.type))) {
      throw new Error('Instagram returned no downloadable media');
    }
    return blob;
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = doc.createElement('a');
    anchor.href = url;
    anchor.download = name;
    doc.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function downloadEntry(entry) {
    if (!entry || entry.downloadState === 'running') {
      if (entry) ui.toast('That download is already running.', 'warning');
      return;
    }

    entry.downloadState = 'running';
    ui.toast(`${entry.type === 'video' ? 'Video' : 'Image'} download started.`, 'info');
    const tried = new Set();
    let failure;
    try {
      let candidates = [{ url: entry.mediaUrl }, ...entry.sources];
      for (let pass = 0; pass < 2; pass += 1) {
        for (const candidate of candidates) {
          if (!candidate.url || tried.has(candidate.url)) continue;
          tried.add(candidate.url);
          const name = filenameFor({ ...entry, mediaUrl: candidate.url });
          try {
            try { await managerDownload(candidate.url, name); }
            catch (_) { saveBlob(await downloadBlob(candidate.url), name); }
            entry.mediaUrl = candidate.url;
            entry.downloadState = 'done';
            ui.toast(`Download sent to browser: ${name}`, 'success', 3500);
            return;
          } catch (error) { failure = error; }
        }
        if (pass === 0) candidates = await refreshedSources(entry);
      }
      throw failure || new Error('No downloadable media URL is available');
    } catch (error) {
      entry.downloadState = 'idle';
      ui.toast(`Download failed: ${error.message || error}. Open the original post and try again.`, 'error', 5000);
    }
  }

  async function toggleLoadAll() {
    if (state.loadAll) {
      state.loadAll = false;
      ui.toast('Load all stopped.', 'warning');
      ui.refresh();
      return;
    }

    state.loadAll = true;
    ui.toast('Loading every available page. Press Stop to cancel.', 'info', 4000);
    ui.refresh();

    while (state.loadAll && state.opened && !state.exhausted) {
      const result = await loadNextPage();
      if (result?.error || result?.aborted || result?.stale || result?.waiting || result?.busy) break;
      if (!state.hasMore) break;
      await new Promise(resolve => setTimeout(resolve, 450));
    }

    const completed = state.loadAll && state.exhausted;
    state.loadAll = false;
    ui.toast(completed ? `Load all complete: ${state.media.length} media items.` : 'Load all stopped.', completed ? 'success' : 'warning', 4000);
    ui.refresh();
  }

  function copyText(text, label = 'Copied') {
    try {
      if (typeof GM_setClipboard === 'function') GM_setClipboard(text, 'text');
      else return navigator.clipboard.writeText(text).then(() => ui.toast(label, 'success')).catch(() => ui.toast('Copy failed.', 'error'));
      ui.toast(label, 'success');
    } catch (_) {
      ui.toast('Copy failed.', 'error');
    }
  }

  function exportUrls() {
    const lines = state.media.map((entry, index) => [
      index + 1,
      entry.type,
      entry.username ? `@${entry.username}` : '',
      entry.postUrl,
      entry.mediaUrl,
      entry.caption.replace(/\s+/g, ' ').trim(),
    ].join('\t'));
    copyText(['#\ttype\tuser\tpostUrl\tmediaUrl\tcaption', ...lines].join('\n'), `Copied ${state.media.length} media rows.`);
  }

  function createUI() {
    const host = doc.createElement('div');
    host.id = 'ig-full-size-gallery-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    doc.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });

    root.innerHTML = `
      <style>${styles()}</style>
      <button class="launcher" type="button"><b>IG</b><span>Gallery</span></button>
      <section class="app hidden" data-theme="dark" data-layout="fit" data-filter="all" data-captions="off" data-size="large" data-thumbnails="contain">
        <header class="toolbar">
          <div class="brand"><strong>IG Gallery ${VERSION}</strong><span class="pill mode">idle</span><span class="pill count">0 media</span></div>
          <div class="controls">
            <button data-action="layout">Layout: Fit</button>
            <button data-action="filter">Filter: All</button>
            <button data-action="captions">Captions: Off</button>
            <button data-action="autoload">Auto: On</button>
            <button data-action="load">Load more</button>
            <button data-action="load-all">Load all</button>
            <button data-action="export">Export URLs</button>
            <button data-action="diagnostics">Copy diagnostics</button>
            <button data-action="settings">Settings</button>
            <button class="danger" data-action="close">Close</button>
          </div>
        </header>
        <div class="statusbar"><span class="status">Ready.</span><span class="stats"></span></div>
        <main class="scroller"><div class="gallery"></div><div class="sentinel"></div></main>
        <aside class="settings panel hidden">
          <div class="panel-head"><strong>Settings</strong><button data-action="settings">×</button></div>
          <label>Layout<select data-setting="layout"><option value="fit">Fit grid</option><option value="masonry">Masonry</option><option value="classic">Classic wall</option><option value="contact">Contact sheet</option></select></label>
          <label>Image size<select data-setting="imageSize"><option value="medium">Medium</option><option value="large">Large</option><option value="huge">Huge</option></select></label>
          <label>Contact thumbnails<select data-setting="thumbnailMode"><option value="contain">Full image</option><option value="crop">Crop square</option></select></label>
          <label>Viewer opening size<select data-setting="viewerSize"><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="large">Large</option></select></label>
          <label>Theme<select data-setting="theme"><option value="dark">Dark</option><option value="light">Light</option></select></label>
          <label>Max pages <small>0 = unlimited</small><input data-setting="maxPages" type="number" min="0" max="999"></label>
          <label>Video volume<input data-setting="videoVolume" type="number" min="0" max="1" step="0.01"></label>
          <label class="check"><input data-setting="captions" type="checkbox"> Show captions</label>
          <label class="check"><input data-setting="autoLoad" type="checkbox"> Auto-load near the bottom</label>
          <button data-action="reset">Reset settings</button>
        </aside>
        <section class="lightbox hidden">
          <button class="viewer-controls-toggle" data-action="toggle-controls" aria-pressed="false">Hide controls</button>
          <button class="viewer-close" data-action="viewer-close">×</button>
          <button class="viewer-nav prev" data-action="prev">‹</button>
          <div class="viewer-viewport">
            <div class="viewer-media"></div>
          </div>
          <button class="viewer-nav next" data-action="next">›</button>
          <footer class="viewer-footer">
            <div class="viewer-meta"><div class="viewer-kicker"></div><div class="viewer-title"></div><div class="viewer-status"></div></div>
            <div class="viewer-actions">
              <button data-action="download">Download</button>
              <button data-action="open-media">Open media</button>
              <button data-action="open-post">Open post</button>
              <button data-action="copy-post">Copy post URL</button>
              <button data-action="copy-media">Copy media URL</button>
              <button data-action="fit">Reset view</button>
              <button data-action="zoom-out">−</button>
              <button data-action="zoom-in">+</button>
            </div>
          </footer>
        </section>
        <div class="toasts" aria-live="polite"></div>
      </section>`;

    const $ = selector => root.querySelector(selector);
    const $$ = selector => [...root.querySelectorAll(selector)];
    const app = $('.app');
    const launcher = $('.launcher');
    const gallery = $('.gallery');
    const scroller = $('.scroller');
    const sentinel = $('.sentinel');
    const lightbox = $('.lightbox');
    const viewerViewport = $('.viewer-viewport');
    const viewerMedia = $('.viewer-media');
    const viewerKicker = $('.viewer-kicker');
    const viewerTitle = $('.viewer-title');
    const viewerStatus = $('.viewer-status');
    const toasts = $('.toasts');

    const gesture = {
      scale: 1,
      panX: 0,
      panY: 0,
      dragging: false,
      pointerId: null,
      lastX: 0,
      lastY: 0,
      didDrag: false,
      clickTimer: null,
      suppressNextClick: false,
    };

    function toast(message, type = 'info', duration = 2800) {
      const element = doc.createElement('div');
      element.className = `toast ${type}`;
      element.textContent = message;
      toasts.appendChild(element);
      requestAnimationFrame(() => element.classList.add('show'));
      setTimeout(() => {
        element.classList.remove('show');
        setTimeout(() => element.remove(), 180);
      }, duration);
    }

    function setStatus(message) {
      $('.status').textContent = message;
    }

    function clearGallery() {
      gallery.textContent = '';
      closeViewer();
    }

    function open() {
      state.opened = true;
      app.classList.remove('hidden');
      launcher.classList.add('hidden');
      host.style.pointerEvents = 'auto';
      applySettings();
      ensureObserver();
      const route = detectRoute();
      if (route.key !== state.routeKey || (!state.media.length && !state.starting)) {
        resetSession(route);
        startSession();
      } else if (state.autoPaused || pendingNativeItems().length) {
        loadNextPage();
      }
    }

    function close() {
      state.opened = false;
      app.classList.add('hidden');
      launcher.classList.remove('hidden');
      closeViewer();
      host.style.pointerEvents = 'none';
      launcher.style.pointerEvents = 'auto';
      state.loadAll = false;
      state.controller?.abort();
      state.observer?.disconnect();
    }

    function applySettings() {
      const settings = state.settings;
      app.dataset.theme = settings.theme;
      app.dataset.layout = settings.layout;
      app.dataset.filter = settings.filter;
      app.dataset.captions = settings.captions ? 'on' : 'off';
      app.dataset.size = settings.imageSize;
      app.dataset.thumbnails = settings.thumbnailMode;
      app.dataset.viewerSize = settings.viewerSize;
      launcher.dataset.position = settings.launcherPosition;
      lightbox.classList.toggle('controls-hidden', settings.hideViewerControls);
      const controlsToggle = $('.viewer-controls-toggle');
      controlsToggle.textContent = settings.hideViewerControls ? 'Show controls' : 'Hide controls';
      controlsToggle.setAttribute('aria-pressed', String(settings.hideViewerControls));

      $('[data-action="layout"]').textContent = `Layout: ${{ fit: 'Fit', masonry: 'Masonry', classic: 'Classic', contact: 'Contact' }[settings.layout]}`;
      $('[data-action="filter"]').textContent = `Filter: ${{ all: 'All', image: 'Images', video: 'Videos' }[settings.filter]}`;
      $('[data-action="captions"]').textContent = `Captions: ${settings.captions ? 'On' : 'Off'}`;
      $('[data-action="autoload"]').textContent = `Auto: ${settings.autoLoad ? 'On' : 'Off'}`;

      for (const input of $$('[data-setting]')) {
        const value = settings[input.dataset.setting];
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else input.value = value;
      }
      for (const video of $$('video')) video.volume = Number(settings.videoVolume) || 0;
      refresh();
    }

    function refresh() {
      $('.mode').textContent = state.mode;
      $('.count').textContent = `${state.media.length} media`;
      $('.stats').textContent = `Pages ${state.pagesLoaded} • Images ${state.stats.images} • Videos ${state.stats.videos} • Carousels ${state.stats.carousels} • Duplicates ${state.stats.duplicates}`;
      const load = $('[data-action="load"]');
      load.disabled = state.loading || state.exhausted;
      load.textContent = state.loading ? 'Loading…' : state.exhausted ? 'No more' : 'Load more';
      $('[data-action="load-all"]').textContent = state.loadAll ? 'Stop' : 'Load all';
      if (state.lightboxIndex >= 0) updateViewerMeta();
    }

    function createCard(entry, index) {
      const card = doc.createElement('article');
      card.className = 'media-card';
      card.dataset.type = entry.type;
      card.dataset.index = String(index);
      card.tabIndex = 0;

      const frame = doc.createElement('div');
      frame.className = 'media-frame';

      if (entry.type === 'video') {
        const video = doc.createElement('video');
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;
        video.volume = Number(state.settings.videoVolume) || 0;
        if (entry.posterUrl) video.poster = entry.posterUrl;
        setSourceWithFallback(video, entry);
        frame.appendChild(video);
      } else {
        const image = doc.createElement('img');
        image.alt = entry.caption?.slice(0, 160) || 'Instagram image';
        image.loading = 'lazy';
        image.decoding = 'async';
        setSourceWithFallback(image, entry);
        frame.appendChild(image);
      }

      const meta = doc.createElement('div');
      meta.className = 'card-meta';
      const line = doc.createElement('div');
      line.className = 'card-line';
      line.textContent = `${entry.type.toUpperCase()}${entry.username ? `  @${entry.username}` : ''}${entry.carouselTotal > 1 ? `  ${entry.carouselIndex + 1}/${entry.carouselTotal}` : ''}`;
      const caption = doc.createElement('p');
      caption.className = 'caption';
      caption.textContent = entry.caption || '';
      const actions = doc.createElement('div');
      actions.className = 'card-actions';
      actions.append(
        button(entry.type === 'video' ? 'Download video' : 'Download', () => downloadEntry(entry)),
        button('Open media', () => win.open(entry.mediaUrl, '_blank', 'noopener')),
        button('Open post', () => win.open(entry.postUrl, '_blank', 'noopener')),
      );
      meta.append(line, caption, actions);
      card.append(frame, meta);

      card.addEventListener('click', event => {
        if (event.target.closest('button, video')) return;
        openViewer(index);
      });
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter') openViewer(index);
      });
      return card;
    }

    function button(label, handler) {
      const element = doc.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.addEventListener('click', event => {
        event.stopPropagation();
        handler();
      });
      return element;
    }

    function currentEntry() {
      return state.media[state.lightboxIndex] || null;
    }

    function resetGesture() {
      gesture.scale = 1;
      gesture.panX = 0;
      gesture.panY = 0;
      gesture.dragging = false;
      gesture.pointerId = null;
      gesture.didDrag = false;
      if (gesture.clickTimer) {
        clearTimeout(gesture.clickTimer);
        gesture.clickTimer = null;
      }
      applyTransform();
    }

    function applyTransform() {
      const media = viewerMedia.querySelector('img, video');
      if (!media) return;
      clampPan(media);
      media.style.transform = `translate3d(${gesture.panX}px, ${gesture.panY}px, 0) scale(${gesture.scale})`;
      const pannable = canPan(media);
      viewerViewport.classList.toggle('zoomed', pannable);
      viewerViewport.classList.toggle('zoom-out-ready', gesture.scale > 1.001);
      viewerViewport.classList.toggle('dragging', gesture.dragging);
      viewerStatus.textContent = `Zoom ${Math.round(gesture.scale * 100)}% • ${state.settings.viewerSize[0].toUpperCase() + state.settings.viewerSize.slice(1)} fit`;
    }

    function canPan(media) {
      return media.clientWidth * gesture.scale > viewerViewport.clientWidth + 1
        || media.clientHeight * gesture.scale > viewerViewport.clientHeight + 1;
    }

    function clampPan(media) {
      const width = media.clientWidth * gesture.scale;
      const height = media.clientHeight * gesture.scale;
      const maxX = Math.max(0, (width - viewerViewport.clientWidth) / 2);
      const maxY = Math.max(0, (height - viewerViewport.clientHeight) / 2);
      gesture.panX = Math.max(-maxX, Math.min(maxX, gesture.panX));
      gesture.panY = Math.max(-maxY, Math.min(maxY, gesture.panY));
    }

    function zoomTo(nextScale, clientX, clientY) {
      const media = viewerMedia.querySelector('img');
      if (!media) return;
      const oldScale = gesture.scale;
      const scale = Math.max(0.25, Math.min(6, nextScale));
      const rect = viewerViewport.getBoundingClientRect();
      const pointX = Number.isFinite(clientX) ? clientX - (rect.left + rect.width / 2) : 0;
      const pointY = Number.isFinite(clientY) ? clientY - (rect.top + rect.height / 2) : 0;
      const ratio = scale / oldScale;
      gesture.panX = pointX - (pointX - gesture.panX) * ratio;
      gesture.panY = pointY - (pointY - gesture.panY) * ratio;
      gesture.scale = scale;
      applyTransform();
    }

    function openViewer(index) {
      const entry = state.media[index];
      if (!entry) return;
      state.lightboxIndex = index;
      viewerMedia.textContent = '';

      if (entry.type === 'video') {
        const video = doc.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.volume = Number(state.settings.videoVolume) || 0;
        if (entry.posterUrl) video.poster = entry.posterUrl;
        setSourceWithFallback(video, entry);
        viewerMedia.appendChild(video);
      } else {
        const image = doc.createElement('img');
        image.alt = entry.caption || 'Instagram image';
        setSourceWithFallback(image, entry);
        viewerMedia.appendChild(image);
      }

      lightbox.classList.remove('hidden');
      resetGesture();
      updateViewerMeta();
    }

    function closeViewer() {
      state.lightboxIndex = -1;
      lightbox.classList.add('hidden');
      viewerMedia.textContent = '';
      resetGesture();
    }

    function updateViewerMeta(extra = '') {
      const entry = currentEntry();
      if (!entry) return;
      const more = state.hasMore ? 'More available' : state.exhausted ? 'End reached' : 'Loaded';
      const carousel = entry.carouselTotal > 1 ? ` • Post carousel ${entry.carouselIndex + 1}/${entry.carouselTotal}` : '';
      const resolution = entry.width && entry.height ? ` • ${entry.width}×${entry.height}` : '';
      viewerKicker.textContent = `Gallery ${state.lightboxIndex + 1}/${state.media.length} loaded • ${more}${carousel}${resolution}`;
      viewerTitle.textContent = `${entry.type.toUpperCase()}${entry.username ? ` @${entry.username}` : ''}${entry.caption ? ` — ${entry.caption.slice(0, 220)}` : ''}`;
      if (extra) viewerStatus.textContent = extra;
      $('[data-action="download"]').textContent = entry.type === 'video' ? 'Download video' : 'Download image';
    }

    async function moveViewer(delta) {
      if (state.lightboxIndex < 0 || !state.media.length) return;
      if (delta > 0 && state.lightboxIndex === state.media.length - 1) {
        if (state.hasMore && !state.exhausted) {
          const previousLength = state.media.length;
          updateViewerMeta('Loading more media…');
          const result = await loadNextPage();
          if (state.media.length > previousLength) {
            openViewer(previousLength);
            return;
          }
          if (result?.error || result?.waiting || result?.busy || result?.aborted || result?.stale) return;
        }
        openViewer(0);
        toast('Reached the end and returned to the first item.', 'info');
        return;
      }
      const next = (state.lightboxIndex + delta + state.media.length) % state.media.length;
      openViewer(next);
    }

    function ensureObserver() {
      state.observer?.disconnect();
      if (!('IntersectionObserver' in win)) return;
      state.observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        if (state.opened && !state.autoPaused && state.settings.autoLoad && state.hasMore && !state.loading && !state.exhausted && !state.loadAll) loadNextPage();
      }, { root: scroller, rootMargin: '800px 0px' });
      state.observer.observe(sentinel);
    }

    launcher.addEventListener('click', open);

    root.addEventListener('click', event => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      const entry = currentEntry();

      if (action === 'close') close();
      if (action === 'layout') {
        const order = ['fit', 'masonry', 'classic', 'contact'];
        state.settings.layout = order[(order.indexOf(state.settings.layout) + 1) % order.length];
        saveSettings(); applySettings();
      }
      if (action === 'filter') {
        const order = ['all', 'image', 'video'];
        state.settings.filter = order[(order.indexOf(state.settings.filter) + 1) % order.length];
        saveSettings(); applySettings();
      }
      if (action === 'captions') {
        state.settings.captions = !state.settings.captions;
        saveSettings(); applySettings();
      }
      if (action === 'autoload') {
        state.settings.autoLoad = !state.settings.autoLoad;
        saveSettings(); applySettings();
        toast(`Auto-load ${state.settings.autoLoad ? 'enabled' : 'disabled'}.`, 'success');
      }
      if (action === 'load') loadNextPage();
      if (action === 'load-all') toggleLoadAll();
      if (action === 'export') exportUrls();
      if (action === 'diagnostics') copyText(diagnosticReport(), 'Diagnostics copied.');
      if (action === 'settings') $('.settings').classList.toggle('hidden');
      if (action === 'reset') {
        state.settings = { ...DEFAULTS };
        saveSettings(); applySettings();
        toast('Settings reset.', 'success');
      }
      if (action === 'viewer-close') closeViewer();
      if (action === 'toggle-controls') {
        state.settings.hideViewerControls = !state.settings.hideViewerControls;
        saveSettings();
        applySettings();
      }
      if (action === 'prev') moveViewer(-1);
      if (action === 'next') moveViewer(1);
      if (action === 'download' && entry) downloadEntry(entry);
      if (action === 'open-media' && entry) win.open(entry.mediaUrl, '_blank', 'noopener');
      if (action === 'open-post' && entry) win.open(entry.postUrl, '_blank', 'noopener');
      if (action === 'copy-post' && entry) copyText(entry.postUrl, 'Post URL copied.');
      if (action === 'copy-media' && entry) copyText(entry.mediaUrl, 'Media URL copied.');
      if (action === 'fit') resetGesture();
      if (action === 'zoom-in') zoomTo(gesture.scale * 1.25);
      if (action === 'zoom-out') zoomTo(gesture.scale / 1.25);
    });

    root.addEventListener('change', event => {
      const key = event.target?.dataset?.setting;
      if (!key) return;
      state.settings[key] = event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.type === 'number' ? Number(event.target.value) : event.target.value;
      saveSettings();
      applySettings();
      toast('Setting saved.', 'success', 1800);
    });

    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) closeViewer();
    });

    viewerViewport.addEventListener('wheel', event => {
      if (!event.target.closest('img')) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      zoomTo(gesture.scale * factor, event.clientX, event.clientY);
    }, { passive: false });

    viewerViewport.addEventListener('pointerdown', event => {
      const image = event.target.closest('img');
      if (!image || event.button !== 0 || !canPan(image)) return;
      event.preventDefault();
      gesture.dragging = true;
      gesture.pointerId = event.pointerId;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      gesture.didDrag = false;
      viewerViewport.setPointerCapture?.(event.pointerId);
      applyTransform();
    });

    viewerViewport.addEventListener('pointermove', event => {
      if (!gesture.dragging || event.pointerId !== gesture.pointerId) return;
      event.preventDefault();
      const deltaX = event.clientX - gesture.lastX;
      const deltaY = event.clientY - gesture.lastY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) gesture.didDrag = true;
      gesture.panX += deltaX;
      gesture.panY += deltaY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      applyTransform();
    });

    const finishDrag = event => {
      if (!gesture.dragging || (event.pointerId != null && event.pointerId !== gesture.pointerId)) return;
      const zoomOutOnRelease = event.type === 'pointerup' && !gesture.didDrag && gesture.scale > 1.001;
      gesture.dragging = false;
      try { viewerViewport.releasePointerCapture?.(gesture.pointerId); } catch (_) {}
      gesture.pointerId = null;
      if (zoomOutOnRelease) {
        gesture.suppressNextClick = true;
        resetGesture();
        setTimeout(() => { gesture.suppressNextClick = false; }, 0);
        return;
      }
      applyTransform();
    };
    viewerViewport.addEventListener('pointerup', finishDrag);
    viewerViewport.addEventListener('pointercancel', finishDrag);

    viewerViewport.addEventListener('click', event => {
      const image = event.target.closest('img');
      if (!image) return;
      if (gesture.suppressNextClick) {
        gesture.suppressNextClick = false;
        return;
      }
      if (gesture.didDrag) {
        gesture.didDrag = false;
        return;
      }
      if (gesture.scale > 1.001) {
        resetGesture();
        return;
      }

      const clientX = event.clientX;
      const clientY = event.clientY;
      if (gesture.clickTimer) clearTimeout(gesture.clickTimer);
      gesture.clickTimer = setTimeout(() => {
        gesture.clickTimer = null;
        const currentImage = viewerMedia.querySelector('img');
        if (!currentImage || canPan(currentImage)) return;
        const targetScale = gesture.scale < 2 ? 2 : Math.min(6, gesture.scale * 1.5);
        zoomTo(targetScale, clientX, clientY);
      }, 180);
    });

    viewerViewport.addEventListener('dblclick', event => {
      if (!event.target.closest('img')) return;
      event.preventDefault();
      if (gesture.clickTimer) {
        clearTimeout(gesture.clickTimer);
        gesture.clickTimer = null;
      }
      resetGesture();
    });

    win.addEventListener('keydown', event => {
      if (!state.opened) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.composedPath?.()[0] || doc.activeElement)?.tagName)) return;
      if (event.key === 'Escape') state.lightboxIndex >= 0 ? closeViewer() : close();
      if (event.key === 'ArrowLeft') moveViewer(-1);
      if (event.key === 'ArrowRight') moveViewer(1);
      if (event.key.toLowerCase() === 'd' && currentEntry()) downloadEntry(currentEntry());
      if (event.key.toLowerCase() === 'o' && currentEntry()) win.open(currentEntry().postUrl, '_blank', 'noopener');
      if (event.key === '+' || event.key === '=') zoomTo(gesture.scale * 1.25);
      if (event.key === '-') zoomTo(gesture.scale / 1.25);
      if (event.key.toLowerCase() === 'f') resetGesture();
    });

    applySettings();

    return {
      root, gallery, open, close, setStatus, toast, clearGallery, refresh, createCard, applySettings,
    };
  }

  function styles() {
    return `
      :host{all:initial;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}*{box-sizing:border-box}button,select,input{font:inherit}.hidden{display:none!important}
      .launcher{pointer-events:auto;position:fixed;right:18px;bottom:18px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:10px 15px;border:0;border-radius:999px;color:#fff;background:linear-gradient(135deg,#f58529,#dd2a7b,#8134af,#515bd4);box-shadow:0 12px 32px #0006;font-weight:800;cursor:pointer}.launcher b{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:#ffffff28}.launcher:hover{filter:brightness(1.08);transform:translateY(-1px)}
      .app{pointer-events:auto;position:fixed;inset:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);z-index:2147483647;color:var(--fg);background:var(--bg)}
      .app[data-theme=dark]{--bg:#080a12fa;--panel:#161926fa;--soft:#ffffff12;--line:#ffffff22;--fg:#f6f7fb;--muted:#abb3c8;--card:#ffffff0e;--hover:#ffffff19}.app[data-theme=light]{--bg:#f5f7fcfa;--panel:#fffefa;--soft:#0000000e;--line:#00000020;--fg:#10131d;--muted:#5c6577;--card:#00000009;--hover:#00000012}
      .toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:64px;padding:10px 14px;background:var(--panel);border-bottom:1px solid var(--line);backdrop-filter:blur(18px)}.brand,.controls{display:flex;align-items:center;gap:8px}.controls{justify-content:flex-end;flex-wrap:wrap}.brand strong{font-size:18px}.pill{padding:5px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:var(--soft);font-size:12px}
      button,select,input{padding:8px 10px;color:var(--fg);background:var(--soft);border:1px solid var(--line);border-radius:11px}select option{color:#10131d;background:#fff}.app[data-theme=dark] select option{color:#f6f7fb;background:#161926}button{cursor:pointer}button:hover:not(:disabled){background:var(--hover)}button:disabled{opacity:.5;cursor:not-allowed}.danger{background:#ff4a681f;border-color:#ff4a6858}
      .statusbar{display:flex;justify-content:space-between;gap:14px;padding:8px 14px;color:var(--muted);font-size:13px;border-bottom:1px solid var(--line)}.scroller{min-height:0;overflow:auto;padding:18px;overscroll-behavior:contain}.sentinel{height:1px}.gallery{min-height:50vh}
      .media-card{position:relative;overflow:hidden;background:var(--card);border:1px solid var(--line);border-radius:17px;box-shadow:0 10px 30px #0003}.media-card:hover{background:var(--hover)}.media-frame{display:grid;place-items:center;width:100%;min-height:80px;background:#05060b}.media-frame img,.media-frame video{display:block;max-width:100%;width:auto;height:auto;object-fit:contain}.media-frame video{width:100%}.card-meta{display:grid;gap:7px;padding:9px 10px}.card-line{font-size:12px;color:var(--muted)}.caption{display:none;margin:0;max-height:5.4em;overflow:hidden;font-size:12px;line-height:1.35}.app[data-captions=on] .caption{display:block}.card-actions{display:flex;flex-wrap:wrap;gap:6px;opacity:0;transition:opacity .15s}.media-card:hover .card-actions,.media-card:focus-within .card-actions{opacity:1}.card-actions button{padding:5px 7px;font-size:11px}.broken{outline:2px solid #ff4a68}
      .app[data-filter=image] .media-card[data-type=video],.app[data-filter=video] .media-card[data-type=image]{display:none!important}
      .app[data-layout=fit] .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-width,320px),1fr));gap:14px}.app[data-layout=fit][data-size=medium] .gallery{--card-width:240px}.app[data-layout=fit][data-size=huge] .gallery{--card-width:460px}.app[data-layout=fit] .media-frame img,.app[data-layout=fit] .media-frame video{max-height:72vh}
      .app[data-layout=masonry] .gallery{display:block;column-width:var(--column-width,340px);column-gap:14px}.app[data-layout=masonry][data-size=medium] .gallery{--column-width:250px}.app[data-layout=masonry][data-size=huge] .gallery{--column-width:470px}.app[data-layout=masonry] .media-card{display:inline-block;width:100%;margin:0 0 14px;break-inside:avoid}
      .app[data-layout=classic] .gallery{text-align:center}.app[data-layout=classic] .media-card{display:inline-block;vertical-align:top;max-width:49vw;margin:9px}.app[data-layout=classic] .media-frame img,.app[data-layout=classic] .media-frame video{max-width:49vw;max-height:80vh}
      .app[data-layout=contact] .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.app[data-layout=contact] .media-frame{aspect-ratio:1;overflow:hidden}.app[data-layout=contact] .media-frame img,.app[data-layout=contact] .media-frame video{width:100%;height:100%;object-fit:contain}.app[data-layout=contact][data-thumbnails=crop] .media-frame img,.app[data-layout=contact][data-thumbnails=crop] .media-frame video{object-fit:cover}.app[data-layout=contact] .card-meta{display:none}
      .panel{position:fixed;top:82px;right:18px;z-index:10;display:grid;gap:12px;width:min(390px,calc(100vw - 36px));max-height:calc(100vh - 110px);overflow:auto;padding:14px;color:var(--fg);background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:0 18px 60px #0006}.panel-head{display:flex;justify-content:space-between;align-items:center}.panel label{display:grid;gap:6px;color:var(--muted);font-size:13px}.panel .check{display:flex;align-items:center}.panel small{opacity:.8}
      .lightbox{position:fixed;inset:0;z-index:20;display:grid;grid-template-rows:minmax(0,1fr) auto;background:#000e}.lightbox.controls-hidden{grid-template-rows:minmax(0,1fr)}.lightbox.controls-hidden .viewer-footer{display:none}.viewer-viewport{position:relative;display:grid;place-items:center;min-width:0;min-height:0;overflow:hidden;padding:24px 74px;touch-action:none}.viewer-media{display:flex;align-items:center;justify-content:center;width:min(72vw,1100px);height:min(68vh,680px);max-width:100%;max-height:100%;min-width:0;min-height:0}.app[data-viewer-size=compact] .viewer-media{width:min(58vw,840px);height:min(60vh,560px)}.app[data-viewer-size=large] .viewer-media{width:min(86vw,1400px);height:min(78vh,820px)}.viewer-media img,.viewer-media video{display:block;width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;transform-origin:center center;will-change:transform;user-select:none;-webkit-user-drag:none}.viewer-media img{cursor:zoom-in}.viewer-viewport.zoom-out-ready img{cursor:zoom-out}.viewer-viewport.dragging img{cursor:grabbing}
      .viewer-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:86px;padding:11px 18px;color:#fff;background:#090b12;border-top:1px solid #ffffff25}.viewer-meta{display:grid;gap:3px;min-width:0}.viewer-kicker,.viewer-status{color:#ffffff9e;font-size:12px}.viewer-title{overflow:hidden;color:#ffffffdb;text-overflow:ellipsis;white-space:nowrap}.viewer-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.viewer-actions button{color:#fff;background:#ffffff18;border-color:#ffffff30}.viewer-controls-toggle,.viewer-close,.viewer-nav{position:fixed;z-index:22;color:#fff;background:#ffffff20;border-color:#ffffff38}.viewer-controls-toggle{top:18px;right:74px;padding:9px 12px;border-radius:999px;font-size:12px;font-weight:700}.viewer-close{top:18px;right:18px;width:44px;height:44px;padding:0;border-radius:50%;font-size:26px}.viewer-nav{top:45%;width:54px;height:78px;padding:0;font-size:52px;line-height:1;transform:translateY(-50%)}.viewer-nav.prev{left:14px}.viewer-nav.next{right:14px}
      .toasts{position:fixed;right:20px;bottom:105px;z-index:30;display:grid;gap:8px;width:min(380px,calc(100vw - 40px));pointer-events:none}.toast{padding:11px 13px;color:#fff;background:#202536;border:1px solid #ffffff2c;border-radius:12px;box-shadow:0 12px 34px #0008;opacity:0;transform:translateY(7px);transition:.18s}.toast.show{opacity:1;transform:none}.toast.success{background:#135c3d}.toast.error{background:#7a2532}.toast.warning{background:#755315}
      @media(max-width:760px){.toolbar{align-items:flex-start;flex-direction:column}.controls{justify-content:flex-start}.statusbar{display:grid}.app[data-layout=classic] .media-card,.app[data-layout=classic] .media-frame img,.app[data-layout=classic] .media-frame video{max-width:96vw}.viewer-viewport{padding:12px}.viewer-media,.app[data-viewer-size=compact] .viewer-media,.app[data-viewer-size=large] .viewer-media{width:min(92vw,900px);height:min(68vh,680px)}.viewer-nav{display:none}.viewer-footer{align-items:flex-start;flex-direction:column}.viewer-actions{justify-content:flex-start}}
    `;
  }

  function registerMenus() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand(`Open Instagram Gallery ${VERSION}`, () => ui.open());
    GM_registerMenuCommand('Copy gallery diagnostics', () => copyText(diagnosticReport()));
    GM_registerMenuCommand('Toggle automatic loading', () => {
      state.settings.autoLoad = !state.settings.autoLoad;
      saveSettings();
      ui?.refresh();
    });
    GM_registerMenuCommand('Reset gallery settings', () => {
      state.settings = { ...DEFAULTS };
      saveSettings();
      ui?.toast('Settings reset.', 'success');
      ui?.applySettings();
    });
  }

  function watchNavigation() {
    let last = location.href;
    const changed = () => {
      if (location.href === last) return;
      last = location.href;
      const route = detectRoute();
      resetSession(route);
      if (state.opened) startSession();
    };

    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function patchedHistory(...args) {
        const result = original.apply(this, args);
        queueMicrotask(changed);
        return result;
      };
    }
    win.addEventListener('popstate', changed);
    win.setInterval(changed, 1000);
  }

  installResponseCapture();

  ready(() => {
    ui = createUI();
    registerMenus();
    watchNavigation();
  });
})();
