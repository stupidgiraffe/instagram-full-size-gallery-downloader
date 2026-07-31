import { readFileSync } from 'node:fs';

const path = new URL('../instagram-full-size-gallery-downloader.user.js', import.meta.url);
const source = readFileSync(path, 'utf8');

const requiredMetadata = [
  '// ==UserScript==',
  '// ==/UserScript==',
  '// @name         Instagram Full-Size Gallery & Downloader',
  '// @namespace    https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader',
  '// @license      AGPL-3.0-or-later',
  '// @version      2.1.4',
  '// @contributionURL https://buymeacoffee.com/stupidgiraffe',
  '// @grant        GM_download',
  '// @grant        GM_xmlhttpRequest',
  '// @connect      i.instagram.com',
];

const missing = requiredMetadata.filter((line) => !source.includes(line));
if (missing.length) {
  console.error('Missing required userscript metadata:');
  for (const line of missing) console.error(`- ${line}`);
  process.exit(1);
}

const forbiddenPatterns = [
  /@require\s+https?:\/\//,
  /google-analytics/i,
  /googletagmanager/i,
  /segment\.com/i,
  /mixpanel/i,
];

const violations = forbiddenPatterns.filter((pattern) => pattern.test(source));
if (violations.length) {
  console.error('Forbidden remote-code or tracking pattern detected:', violations);
  process.exit(1);
}

console.log('Userscript metadata and policy checks passed.');
