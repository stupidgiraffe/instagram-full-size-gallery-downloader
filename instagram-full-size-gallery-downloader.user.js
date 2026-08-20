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
// @version      2.1.5
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
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
  const ASBD_ID = '129477';
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
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, '') : localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    const raw = JSON.stringify(state.settings);
    try {
      if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, raw);
      else localStorage.setItem(STORAGE_KEY, raw);
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
      const request = GM_xmlhttpRequest({
        method: options.method || 'GET',
        url,
        headers: options.headers || {},
        data: options.body instanceof URLSearchParams ? options.body.toString() : options.body,
        responseType: 'json',
        timeout: 30000,
        onload: response => {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status}`));
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
      const response = await (win.fetch || fetch)(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        credentials: 'include',
        signal: options.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
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

  async function resolveUserId(username, signal) {
    if (!username) return '';

    try {
      const url = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
      const json = await requestJson(url, { headers: headers(), signal });
      const id = json?.data?.user?.id || json?.user?.id;
      if (id) return String(id);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }

    const html = doc.documentElement?.innerHTML || '';
    for (const pattern of [
      /"profile_id"\s*:\s*"?(\d+)"?/,
      /profilePage_(\d+)/,
      /"user_id"\s*:\s*"?(\d+)"?/,
    ]) {
      const match = html.match(pattern)?.[1];
      if (match) return match;
    }

    try {
      const id = await new Promise(resolve => {
        const open = indexedDB.open('redux');
        open.onerror = () => resolve('');
        open.onsuccess = () => {
          try {
            const request = open.result.transaction('paths', 'readonly').objectStore('paths').get('users.usernameToId');
            request.onerror = () => resolve('');
            request.onsuccess = () => resolve(String(request.result?.[username] || ''));
          } catch (_) {
            resolve('');
          }
        };
      });
      return id;
    } catch (_) {
      return '';
    }
  }

  function resetSession(route = detectRoute()) {
    state.controller?.abort();
    state.generation += 1;
    state.routeKey = route.key;
    state.mode = route.mode;
    state.username = route.username;
    state.userId = '';
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
    const route = detectRoute();
    if (route.key !== state.routeKey) resetSession(route);
    ui.setStatus('Preparing gallery…');

    try {
      if (state.mode === 'explore') throw new Error('Explore pages are not supported yet. Open a profile, tagged feed, home feed, post, or reel.');
      if (state.mode === 'post') {
        const harvested = harvestCurrentPost();
        appendRawMedia(harvested);
        state.exhausted = true;
        state.hasMore = false;
        ui.setStatus(`Loaded ${state.media.length} visible media item${state.media.length === 1 ? '' : 's'}.`);
        ui.refresh();
        return;
      }
      if (state.mode === 'profile' || state.mode === 'tagged') {
        state.controller = new AbortController();
        state.userId = await resolveUserId(state.username, state.controller.signal);
        if (!state.userId) throw new Error(`Could not resolve @${state.username}. Reload Instagram and try again.`);
      }
      await loadNextPage();
    } catch (error) {
      if (error?.name !== 'AbortError') {
        ui.setStatus(`Error: ${error.message || error}`);
        ui.toast(error.message || String(error), 'error', 5000);
      }
    }
  }

  async function fetchPage(cursor, signal) {
    const requestHeaders = headers();
    let url;
    let method = 'GET';
    let body;

    if (state.mode === 'profile') {
      url = `https://i.instagram.com/api/v1/feed/user/${encodeURIComponent(state.userId)}/?count=12`;
      if (cursor) url += `&max_id=${encodeURIComponent(cursor)}`;
    } else if (state.mode === 'tagged') {
      url = `https://i.instagram.com/api/v1/usertags/${encodeURIComponent(state.userId)}/feed/?count=12`;
      if (cursor) url += `&max_id=${encodeURIComponent(cursor)}`;
    } else if (state.mode === 'home') {
      url = 'https://i.instagram.com/api/v1/feed/timeline/';
      method = 'POST';
      body = new URLSearchParams({
        is_async_ads_rti: '0',
        is_async_ads_double_request: '0',
        rti_delivery_backend: '0',
        is_async_ads_in_headload_enabled: '0',
      });
      const deviceId = win._sharedData?.device_id || getCookie('ig_did') || getCookie('mid');
      if (deviceId) body.set('device_id', deviceId);
      if (cursor) body.set('max_id', cursor);
      requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      throw new Error(`Pagination is unavailable in ${state.mode} mode.`);
    }

    return requestJson(url, { method, headers: requestHeaders, body, signal });
  }

  function extractPage(json) {
    const timeline = json?.data?.user?.edge_owner_to_timeline_media
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
    if (state.loading || state.exhausted) return { added: 0 };
    if (state.settings.maxPages > 0 && state.pagesLoaded >= state.settings.maxPages) {
      state.exhausted = true;
      state.hasMore = false;
      ui.setStatus(`Stopped at the ${state.settings.maxPages}-page limit.`);
      ui.refresh();
      return { added: 0 };
    }

    const generation = state.generation;
    const routeKey = state.routeKey;
    const requestedCursor = state.nextCursor;
    const cursorKey = requestedCursor ?? '__first__';

    if (state.seenCursors.has(cursorKey)) {
      state.exhausted = true;
      state.hasMore = false;
      ui.setStatus('Stopped: Instagram repeated the same pagination cursor.');
      ui.refresh();
      return { added: 0 };
    }

    state.seenCursors.add(cursorKey);
    state.loading = true;
    state.controller?.abort();
    state.controller = new AbortController();
    ui.setStatus(state.pagesLoaded ? 'Loading more media…' : 'Loading media…');
    ui.refresh();

    try {
      const json = await fetchPage(requestedCursor, state.controller.signal);
      if (generation !== state.generation || routeKey !== state.routeKey) return { added: 0, stale: true };

      const page = extractPage(json);
      const before = state.media.length;
      appendRawMedia(page.items);
      const added = state.media.length - before;

      state.pagesLoaded += 1;
      state.nextCursor = page.cursor;
      state.hasMore = page.more;

      if (!page.cursor || page.cursor === requestedCursor || (page.cursor && state.seenCursors.has(page.cursor))) {
        state.hasMore = false;
        state.exhausted = true;
      }

      ui.setStatus(added
        ? `Loaded ${added} new item${added === 1 ? '' : 's'}${state.hasMore ? '.' : ' — end reached.'}`
        : state.hasMore ? 'This page contained no new media.' : 'No more media found.');
      ui.refresh();
      return { added };
    } catch (error) {
      if (error?.name === 'AbortError') return { added: 0, aborted: true };
      state.seenCursors.delete(cursorKey);
      ui.setStatus(`Load failed: ${error.message || error}`);
      ui.toast(`Load failed: ${error.message || error}`, 'error', 5000);
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
        const url = candidate?.url || candidate?.src;
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

        const stableId = String(child.pk || child.id || `${shortcode}:${index}` || sources[0].url);
        if (state.seenMedia.has(stableId)) {
          state.stats.duplicates += 1;
          return;
        }
        state.seenMedia.add(stableId);

        const posterSources = type === 'video' ? imageCandidates(child).concat(imageCandidates(parent)) : [];
        const entry = {
          id: stableId,
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
        fragment.appendChild(ui.createCard(entry, mediaIndex));
        if (type === 'video') state.stats.videos += 1;
        else state.stats.images += 1;
      });
    }

    ui.gallery.appendChild(fragment);
  }

  function setSourceWithFallback(element, entry, poster = false) {
    const candidates = poster ? [{ url: entry.posterUrl }].filter(item => item.url) : entry.sources;
    let index = 0;

    const apply = () => {
      const candidate = candidates[index];
      if (!candidate) {
        state.stats.failures += 1;
        element.closest('.media-card')?.classList.add('broken');
        ui.refresh();
        return;
      }
      element.src = candidate.url;
      if (!poster) {
        entry.sourceIndex = index;
        entry.mediaUrl = candidate.url;
        entry.width = candidate.width || entry.width;
        entry.height = candidate.height || entry.height;
      }
    };

    element.addEventListener('error', () => {
      index += 1;
      apply();
    });
    apply();
  }

  function harvestCurrentPost() {
    const shortcode = location.pathname.match(/^\/(?:p|reel|tv)\/([^/?#]+)/)?.[1] || '';
    const caption = doc.querySelector('article h1, article span[dir="auto"]')?.textContent || '';
    const result = [];

    for (const img of doc.querySelectorAll('article img[src], main img[src]')) {
      const url = img.currentSrc || img.src;
      if (!url) continue;
      result.push({
        code: shortcode,
        caption: { text: caption },
        image_versions2: { candidates: [{ url, width: img.naturalWidth, height: img.naturalHeight }] },
      });
    }

    for (const video of doc.querySelectorAll('article video[src], main video[src]')) {
      const url = video.currentSrc || video.src;
      if (!url) continue;
      result.push({
        code: shortcode,
        caption: { text: caption },
        is_video: true,
        video_url: url,
        image_versions2: { candidates: video.poster ? [{ url: video.poster }] : [] },
      });
    }
    return result;
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

  function downloadEntry(entry) {
    if (!entry || entry.downloadState === 'running') {
      if (entry) ui.toast('That download is already running.', 'warning');
      return;
    }

    entry.downloadState = 'running';
    const name = filenameFor(entry);
    ui.toast(`${entry.type === 'video' ? 'Video' : 'Image'} download started.`, 'info');

    const done = () => {
      entry.downloadState = 'done';
      ui.toast(`Downloaded ${name}`, 'success', 3500);
    };
    const failed = error => {
      entry.downloadState = 'idle';
      ui.toast(`Download failed. Opening the full-resolution media instead.`, 'error', 4500);
      win.open(entry.mediaUrl, '_blank', 'noopener');
      console.warn('IG Gallery download failed', error);
    };

    try {
      if (typeof GM_download === 'function') {
        GM_download({ url: entry.mediaUrl, name, saveAs: false, onload: done, onerror: failed, ontimeout: failed });
      } else {
        const anchor = doc.createElement('a');
        anchor.href = entry.mediaUrl;
        anchor.download = name;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.click();
        done();
      }
    } catch (error) {
      failed(error);
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

    while (state.loadAll && !state.exhausted) {
      const result = await loadNextPage();
      if (result?.error || result?.aborted || result?.stale) break;
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
      else navigator.clipboard.writeText(text);
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
          <div class="brand"><strong>IG Full-Size Gallery</strong><span class="pill mode">idle</span><span class="pill count">0 media</span></div>
          <div class="controls">
            <button data-action="layout">Layout: Fit</button>
            <button data-action="filter">Filter: All</button>
            <button data-action="captions">Captions: Off</button>
            <button data-action="autoload">Auto: On</button>
            <button data-action="load">Load more</button>
            <button data-action="load-all">Load all</button>
            <button data-action="export">Export URLs</button>
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
      if (route.key !== state.routeKey || !state.media.length) {
        resetSession(route);
        startSession();
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
          if (result?.error) return;
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
        if (state.settings.autoLoad && state.hasMore && !state.loading && !state.exhausted && !state.loadAll) loadNextPage();
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
      if (action === 'settings') $('.settings').classList.toggle('hidden');
      if (action === 'reset') {
        state.settings = { ...DEFAULTS };
        saveSettings(); applySettings();
        toast('Settings reset.', 'success');
      }
      if (action === 'viewer-close') closeViewer();
      if (action === 'toggle-controls') {
        const hidden = lightbox.classList.toggle('controls-hidden');
        const toggle = $('.viewer-controls-toggle');
        toggle.textContent = hidden ? 'Show controls' : 'Hide controls';
        toggle.setAttribute('aria-pressed', String(hidden));
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
      root, gallery, open, close, setStatus, toast, clearGallery, refresh, createCard,
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
    GM_registerMenuCommand('Open Full-Size Instagram Gallery', () => ui.open());
    GM_registerMenuCommand('Toggle automatic loading', () => {
      state.settings.autoLoad = !state.settings.autoLoad;
      saveSettings();
      ui?.refresh();
    });
    GM_registerMenuCommand('Reset gallery settings', () => {
      state.settings = { ...DEFAULTS };
      saveSettings();
      ui?.toast('Settings reset.', 'success');
      ui?.refresh();
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

  ready(() => {
    ui = createUI();
    registerMenus();
    watchNavigation();
  });
})();
