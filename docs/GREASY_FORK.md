# Greasy Fork publishing and sync setup

## Live listing

https://greasyfork.org/en/scripts/592249-instagram-full-size-gallery-downloader

## Public title

**Instagram Full-Size Gallery & Downloader**

## Short description

Rebuilds Instagram into an uncropped, full-size photo and video gallery with smooth zoom, continuous browsing, load-all, and direct downloads.

## Code source syncing

Use the raw GitHub userscript as the Greasy Fork code-sync source:

`https://raw.githubusercontent.com/stupidgiraffe/instagram-full-size-gallery-downloader/main/instagram-full-size-gallery-downloader.user.js`

Automatic syncing is fine once a release has been tested. Every public runtime change must increment `@version` before it is pushed.

## Additional info syncing

Greasy Fork can sync the public **Additional info** section independently from the userscript code.

For **Default additional info (language matches @name)** use:

`https://raw.githubusercontent.com/stupidgiraffe/instagram-full-size-gallery-downloader/main/docs/GREASY_FORK_DESCRIPTION.md`

That file is intentionally written only for the public Greasy Fork listing. Do not use the repository README or the `.user.js` file as the Additional info source.

Future listing-copy changes should be made in `docs/GREASY_FORK_DESCRIPTION.md` so GitHub remains the source of truth.

## Detailed description source

The synced description currently covers:

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
- Privacy, permissions, source, support, credits, and disclaimer information

## Force / immediate update workflow

When you do not want to wait for the periodic automatic check:

1. Push the verified release to GitHub with a higher `@version`.
2. Open the Greasy Fork script **Admin** page.
3. Trigger the source sync/update control shown in the Source Syncing section if available.
4. Confirm the Greasy Fork **Code** tab now shows the new `@version`.
5. Confirm the Additional info section reflects the synced Markdown when that source changed too.
6. Reinstall/update the Greasy Fork copy with development copies disabled and run the relevant tests.

A Greasy Fork webhook can also be configured so a GitHub push triggers an update instead of waiting for periodic polling.

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
