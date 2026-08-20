# Greasy Fork publishing and update copy

## Public title

**Instagram Full-Size Gallery & Downloader**

## Short description

Rebuilds Instagram into an uncropped, full-size photo and video gallery with smooth zoom, continuous browsing, load-all, and direct downloads.

## Detailed description

Instagram’s native grid crops portrait images and makes large photo collections difficult to browse.

**Instagram Full-Size Gallery & Downloader** rebuilds supported Instagram pages into a continuous, uncropped image and video gallery. The gallery is the main feature: profiles become a dedicated media wall, and clicking any item opens a full-size viewer with smooth zoom, drag-to-pan, continuous navigation, hideable controls, and direct downloads.

### Highlights

- Complete uncropped portrait and landscape images
- Full-size image and video gallery
- Fit, masonry, classic, and contact-sheet layouts
- Smooth mouse-wheel and trackpad zoom
- Zoom from 25% to 600%
- Click-to-zoom and matching click-to-reset behavior
- Drag-to-pan
- Continuous gallery navigation
- Automatic pagination and **Load all**
- Hide/show the full bottom viewer control bar when maximum viewing space is preferred
- Highest-quality available image downloads
- Direct video downloads
- Image/video filters and saved settings
- No analytics, tracking, advertisements, or remote code

### Controls

- Click image: zoom in or return to fitted view
- Mouse wheel / two-finger scroll: fine zoom
- Drag: pan while zoomed
- Arrow keys: previous or next
- **Hide controls / Show controls**: collapse or restore the bottom viewer bar
- `F`: reset view
- `D`: download current image/video
- `Esc`: close viewer

### Source and support

GitHub source and issue tracker:

https://github.com/stupidgiraffe/instagram-full-size-gallery-downloader

Voluntary support:

https://buymeacoffee.com/stupidgiraffe

This project is not affiliated with Instagram or Meta.

## Update checklist

For every Greasy Fork update:

1. Update and verify `instagram-full-size-gallery-downloader.user.js` on GitHub.
2. Increment `@version`; never publish changed runtime code under the same version.
3. Run `node --check instagram-full-size-gallery-downloader.user.js`.
4. Run `node scripts/validate-userscript.mjs`.
5. Complete the relevant checks in `docs/TESTING.md`.
6. Publish/sync the exact same source to Greasy Fork.
7. Disable every development copy and install the Greasy Fork copy fresh.
8. Re-test portrait/landscape viewing, click zoom/reset, hide/show controls, pagination, image download, and video download.
9. Keep `@namespace` stable and do not add custom `@updateURL` or `@downloadURL` metadata.

## GitHub sync recommendation

If Greasy Fork source sync is enabled, point it at the raw main-branch userscript:

`https://raw.githubusercontent.com/stupidgiraffe/instagram-full-size-gallery-downloader/main/instagram-full-size-gallery-downloader.user.js`

Manual sync is safer while the script is changing quickly because it prevents an untested GitHub commit from becoming an automatic public release.
