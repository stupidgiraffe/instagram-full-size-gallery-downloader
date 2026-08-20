# Instagram Full-Size Gallery & Downloader

[![Validate userscript](https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader/actions/workflows/validate.yml/badge.svg)](https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader/actions/workflows/validate.yml)
[![License: AGPL v3+](https://img.shields.io/badge/License-AGPL_v3%2B-blue.svg)](LICENSE)
[![Support development](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-stupidgiraffe-ffdd00?logo=buymeacoffee&logoColor=000)](https://buymeacoffee.com/stupidgiraffe)

**A better way to browse Instagram media:** restack profiles and feeds into a continuous, uncropped, full-aspect photo and video gallery with smooth zooming, continuous navigation, load-all, and direct downloads.

Instagram's native grid is optimized for the feed, not for actually looking through complete photos. Portrait images are cropped into thumbnails, carousels are fragmented across posts, and moving through a large profile requires constant opening and closing of Instagram's own viewer.

**Instagram Full-Size Gallery & Downloader** turns that experience into a dedicated media wall and viewer. The gallery is the primary feature; downloading is a useful extra.

## Why this script is different

Most Instagram userscripts add download buttons to Instagram's existing interface. This one creates a separate browsing experience built around the media itself:

- complete portrait and landscape frames instead of cropped profile-grid thumbnails
- continuous browsing across loaded pages
- a dedicated lightbox with intuitive click, wheel/trackpad zoom, and drag-to-pan
- optional **Load all** for large profiles
- direct image and video downloads from the highest-quality media URL Instagram exposes to the browser

The result is closer to a real photo gallery than Instagram's native profile view.

## Features

### Gallery

- Uncropped portrait and landscape media
- Full-size image and video wall
- Fit grid, masonry, classic wall, and contact-sheet layouts
- Full-frame or cropped contact-sheet thumbnails
- Medium, large, and huge gallery sizing
- Image-only and video-only filters
- Optional captions
- Automatic infinite loading near the bottom
- Manual **Load more**
- Optional **Load all** with stop support
- Duplicate and repeated-cursor protection
- SPA/profile-navigation protection so old-page media is not reused on a new profile

### Viewer

- Dedicated full-size lightbox for images and videos
- Compact, comfortable, and large opening sizes
- Complete media containment with no forced crop
- Click once to zoom to 200%; click the matching minus cursor to return to fit
- Mouse-wheel and two-finger trackpad zoom from 25% to 600%
- Drag-to-pan while zoomed
- Continuous previous/next navigation
- Automatically loads the next page when the viewer reaches the end of currently loaded media
- **Hide controls / Show controls** button to completely collapse the bottom information/action bar when it gets in the way
- Separate metadata, gallery position, carousel position, resolution, and zoom status

### Downloads and utilities

- Direct image downloads
- Direct video downloads
- Download from either a gallery card or the full viewer
- Open the media file directly in a new tab
- Open the original Instagram post
- Copy post URL
- Copy media URL
- Export all loaded media URLs
- Success, error, copy, and download toasts
- Duplicate-download protection while a download is already in progress

### Preferences

- Persistent settings through the userscript manager
- Dark and light themes
- Adjustable video volume
- Configurable maximum page count
- No analytics, ads, trackers, remote configuration, or telemetry

## Installation

### Recommended: Greasy Fork

The script is published on Greasy Fork under the exact title **Instagram Full-Size Gallery & Downloader**.

[Search Greasy Fork for the script](https://greasyfork.org/en/scripts?q=Instagram%20Full-Size%20Gallery%20%26%20Downloader)

Greasy Fork is recommended for normal users because updates are handled through the userscript manager.

### Direct GitHub installation

1. Install a userscript manager such as **Tampermonkey** or **Violentmonkey**.
2. Open the [raw userscript](https://raw.githubusercontent.com/stupidgiraffe/instagram-full-size-gallery-downloader/main/instagram-full-size-gallery-downloader.user.js).
3. Approve the installation.
4. Open an Instagram profile and click the **IG Gallery** launcher.

> **Important:** disable older development copies before testing or using the public version. Two enabled copies can inject two galleries and create misleading bugs.

## Quick start

1. Open an Instagram profile.
2. Click **IG Gallery**.
3. Scroll normally or use **Load all**.
4. Click any image or video to enter the full viewer.
5. Download, zoom, pan, or move continuously through the loaded media.

## Viewer controls

| Action | Control |
| --- | --- |
| Open media | Click a gallery card |
| Zoom in | Click the image when the plus cursor is visible |
| Return to fitted view | Click the image when the minus cursor is visible |
| Fine zoom | Mouse wheel or two-finger trackpad scroll |
| Pan | Drag while zoomed |
| Reset view | `F` or **Reset view** |
| Previous / next | Arrow keys or viewer arrows |
| Hide bottom information/actions | **Hide controls** |
| Restore bottom information/actions | **Show controls** |
| Download current image/video | `D` or **Download image/video** |
| Close viewer | `Esc` or `×` |

## Supported Instagram pages

- Profiles
- Tagged feeds
- Home feed, when Instagram's logged-in web endpoint permits it
- Individual post and reel pages through visible-media harvesting

### Currently not supported

- Explore pagination
- Media the logged-in account is not authorized to access

Instagram changes its private web responses frequently. A route that works today can regress without the userscript itself changing. If that happens, please file a reproducible issue rather than assuming a visual glitch is a gallery-layout problem.

## Media quality

The script chooses the highest-quality candidate Instagram exposes to the current browser session while preferring candidates that preserve the original media aspect ratio.

That means **highest available quality**, not an invented upscale. If Instagram only sends a compressed or lower-resolution candidate to a particular account/session/CDN path, the script cannot reconstruct pixels Instagram did not provide.

## Privacy and permissions

The distributed userscript is readable source code and has no remote `@require` dependencies.

| Permission | Why it exists |
| --- | --- |
| `GM_getValue` / `GM_setValue` | Save gallery preferences locally |
| `GM_registerMenuCommand` | Provide userscript-manager shortcuts |
| `GM_setClipboard` | Copy post/media URLs |
| `GM_download` | Download images and videos directly |
| `GM_xmlhttpRequest` | Fallback request path when normal browser `fetch()` is blocked by Instagram/CORS behavior |
| `unsafeWindow` | Read Instagram page/session state required by the loader |
| `@connect i.instagram.com` | Instagram web API requests |
| `@connect *.cdninstagram.com` / `*.fbcdn.net` | Media retrieval/download fallbacks |

There is **no analytics, ad network, external telemetry, remote configuration, or user tracking** in the script.

## Troubleshooting

Before filing an issue:

1. Disable every older copy of this userscript.
2. Reload Instagram completely.
3. Confirm you are logged in and can see the media normally on Instagram.
4. Test both a normal profile and an individual post/reel.
5. Include the browser, userscript manager, script version, page type, screenshot, and exact error text in the report.

Common symptoms:

- **Media from the previous profile appears:** reload and confirm only one script copy is enabled. The current code also rejects stale responses after route changes.
- **A download opens instead of saving:** the script may be using the browser-open fallback after a userscript-manager download failure.
- **NetworkError:** Instagram may have rejected the normal fetch path; the script automatically attempts `GM_xmlhttpRequest` as a fallback.
- **No more media loads:** Instagram may have returned no next cursor or repeated a cursor; the script stops instead of looping the previous page.

Use the [bug-report template](https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader/issues/new/choose) for reproducible regressions.

## Development

There is no build step and no package installation. The distributed `.user.js` file is also the source.

Local verification:

```bash
node --check instagram-full-size-gallery-downloader.user.js
node scripts/validate-userscript.mjs
```

Before changing loader, pagination, media sizing, or viewer geometry, map the complete behavior on both sides of the change and run the manual checklist in [`docs/TESTING.md`](docs/TESTING.md).

See [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CHANGELOG.md`](CHANGELOG.md), and [`NOTICE.md`](NOTICE.md) for project history and contribution expectations.

## Release discipline

For every public runtime change:

1. Make the smallest complete change.
2. Increment `@version`.
3. Run JavaScript syntax and metadata validation.
4. Complete the relevant manual tests.
5. Update `CHANGELOG.md`.
6. Push the exact same userscript source to GitHub and Greasy Fork.
7. Test the Greasy Fork-installed copy with development copies disabled.

## Support development

The project is free and fully functional. There are no paid features or donation prompts inside the browsing flow.

If it improves the way you browse Instagram and you want to support maintenance:

**[Buy me a coffee](https://buymeacoffee.com/stupidgiraffe)**

## Credits

- **William Harris** — current maintainer and modern gallery rewrite
- **driver8** — original **Instagram full-size media scroll wall** concept and loader
- Development assisted by AI tooling

See [`NOTICE.md`](NOTICE.md) for attribution and modification information.

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Instagram or Meta. Only access, download, or reuse media you are authorized to view and use.

## License

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
