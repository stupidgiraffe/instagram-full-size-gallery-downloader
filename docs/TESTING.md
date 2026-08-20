# Manual testing checklist

Disable every older copy of the userscript before testing. Test the exact file/version intended for release.

## Core gallery

- Open a profile and launch IG Gallery.
- Confirm the current profile’s media loads—not media from the previously visited profile.
- Confirm portrait and landscape photos show their complete frame.
- Test Fit, Masonry, Classic, and Contact layouts.
- Test full-frame and cropped contact thumbnails.
- Test image-only and video-only filters.
- Verify automatic loading and manual **Load more**.
- Verify **Load all** can start, stop, and end cleanly.
- Navigate to a second profile without a full page reload and confirm stale media from the first profile is not appended.

## Viewer geometry and controls

- Open portrait, landscape, carousel, and video items.
- Confirm each opens fully contained with no cropping.
- Confirm the bottom footer occupies its own row and does not overlay the media.
- Click **Hide controls** and confirm the footer disappears completely and the viewer receives the freed vertical space.
- Navigate previous/next with the footer hidden and confirm it remains hidden.
- Click **Show controls** and confirm the complete footer returns with metadata and actions intact.
- Confirm the hide/show toggle remains available while the footer is hidden.
- Test Compact, Comfortable, and Large viewer opening sizes.

## Zoom and pan

- At fitted view, confirm the plus cursor appears.
- Click once and confirm zoom reaches 200% around the clicked point.
- Confirm the cursor changes to minus.
- Click without dragging and confirm the viewer returns to fitted 100%.
- Zoom below 100% and above 100% with wheel/two-finger scrolling.
- Drag while zoomed and confirm it pans without resetting.
- Confirm a completed drag does not trigger an accidental click-to-reset.
- Press `F` / **Reset view** and confirm the fitted view is restored.
- Navigate to another media item and confirm the new item starts from a clean fitted view.

## Viewer pagination

- Navigate to the last currently loaded item.
- Move forward once more and confirm the next page loads automatically when another cursor exists.
- Confirm the viewer advances into the newly loaded media instead of wrapping early.
- At the true end of the gallery, confirm forward navigation wraps cleanly without duplicate page loads.

## Downloads and utilities

- Download a single image from a card.
- Download an image from the viewer.
- Download a video from a card and viewer.
- Confirm success/error toasts make download state obvious.
- Confirm a second click while the same media is actively downloading is rejected cleanly.
- Confirm the downloaded extension matches the media type.
- Test **Open media**, **Open post**, **Copy post URL**, **Copy media URL**, and **Export URLs**.

## Routes and failures

- Navigate between two profiles without a full browser reload.
- Confirm stale responses from the first profile are discarded.
- Confirm repeated cursors stop rather than repeating the previous page.
- Test a tagged feed.
- Test the home feed where the current Instagram session permits it.
- Test an individual post/reel page.
- Confirm a failed media URL falls back or reports a clear error.
- If normal `fetch()` fails, confirm the userscript-manager request fallback either succeeds or surfaces a clear error.

## Release verification

Before publishing:

```bash
node --check instagram-full-size-gallery-downloader.user.js
node scripts/validate-userscript.mjs
```

Then install the release source through the same channel users will use (especially Greasy Fork), disable local development copies, and repeat the high-risk viewer, pagination, and download checks above.
