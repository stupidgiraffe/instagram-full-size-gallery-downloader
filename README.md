# Instagram Full-Size Gallery & Downloader

[![Validate userscript](https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader/actions/workflows/validate.yml/badge.svg)](https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader/actions/workflows/validate.yml)
[![License: AGPL v3+](https://img.shields.io/badge/License-AGPL_v3%2B-blue.svg)](LICENSE)
[![Support development](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-stupidgiraffe-ffdd00?logo=buymeacoffee&logoColor=000)](https://buymeacoffee.com/stupidgiraffe)

Rebuild Instagram profiles and feeds into a continuous, uncropped, full-size photo and video gallery.

Instagram’s native grid crops portrait images and makes large collections awkward to browse. This userscript restacks supported Instagram pages into a cleaner gallery designed for viewing complete media, zooming smoothly, and downloading the highest-quality files Instagram provides to the browser.

## Why this script is different

The gallery is the main feature—not an afterthought attached to a downloader. Portrait and landscape media remain visible at their complete aspect ratio, while the dedicated viewer provides continuous navigation, adjustable opening size, click-to-zoom, wheel/trackpad zoom, and drag-to-pan.

## Features

- Uncropped portrait and landscape media
- Full-size image and video gallery
- Fit grid, masonry, classic wall, and contact-sheet layouts
- Compact, comfortable, and large viewer opening sizes
- Click-to-zoom and matching click-to-reset cursor behavior
- Mouse-wheel and two-finger trackpad zoom from 25% to 600%
- Drag-to-pan while zoomed
- Continuous viewer navigation that loads the next page when needed
- Automatic pagination and optional **Load all**
- Direct highest-quality image downloads
- Direct video downloads
- Image/video filtering and optional captions
- Persistent settings
- Download, copy, loading, and error toasts
- No analytics, ads, or telemetry

## Installation

### GitHub installation

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Open the [raw userscript](https://raw.githubusercontent.com/stupidgiraffe/instagram-full-size-gallery-downloader/main/instagram-full-size-gallery-downloader.user.js).
3. Approve the installation in your userscript manager.
4. Open an Instagram profile and click the **IG Gallery** launcher.

A Greasy Fork listing is planned. Once published, its link will be added here.

## Viewer controls

| Action | Control |
| --- | --- |
| Open media | Click a gallery card |
| Zoom in / reset | Click the image; the cursor changes between plus and minus |
| Fine zoom | Mouse wheel or two-finger trackpad scroll |
| Pan | Drag while zoomed |
| Reset view | `F` or **Reset view** |
| Previous / next | Arrow keys or viewer arrows |
| Download current media | `D` or **Download image/video** |
| Close viewer | `Esc` |

## Supported pages

- Instagram profiles
- Tagged feeds
- Home feed, where Instagram’s current logged-in endpoint permits it
- Individual post/reel pages through visible-media harvesting

Instagram changes its private web responses frequently. Please use the issue template when reporting a regression so the route, browser, and response behavior can be diagnosed accurately.

## Privacy

The script runs locally in your browser. It has no analytics, tracking, advertising, remote configuration, or external telemetry. Network access is limited to Instagram media/API hosts required to load and download media already available to your logged-in browser session.

## Development

No build step or package installation is required. The distributed `.user.js` file is the source.

Validate locally with:

```bash
node --check instagram-full-size-gallery-downloader.user.js
node scripts/validate-userscript.mjs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/TESTING.md](docs/TESTING.md) before submitting changes.

## Support development

The script is free and fully functional. Voluntary support helps with maintenance when Instagram changes its site:

**[Buy me a coffee](https://buymeacoffee.com/stupidgiraffe)**

There are no paid features, tracking, or donation prompts inside the browsing flow.

## Credits

- **William Harris** — current maintainer and modern gallery rewrite
- **driver8** — original “Instagram full-size media scroll wall” concept and loader
- Development assisted by AI tooling

See [NOTICE.md](NOTICE.md) for attribution and modification information.

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Instagram or Meta. Only access or download media you are authorized to view and use.

## License

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
