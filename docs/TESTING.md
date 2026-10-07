# Manual testing checklist

Disable every older copy of the userscript before testing. Test the exact file/version intended for release.

## Core gallery

- Open a profile and launch IG Gallery.
- Confirm the current profile’s media loads—not media from the previously visited profile.
- Start from a profile grid showing only a carousel cover. Without opening that post in Instagram first, verify a six-photo post produces six separate gallery cards and six distinct downloadable images.
- Repeat with a mixed photo/video carousel; verify media type, original slide order, and `1/6` through `6/6` labels.
- Keep a later post open in the viewer while an earlier carousel expands. Verify the selected media stays selected and its arrows/card links still select the correct items.
- At the end of the post list, confirm missing slides are still resolved and incomplete posts remain clearly marked with a working retry control.
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
- Close/reopen the viewer and gallery, then reload Instagram; confirm the footer stays hidden and **Show controls** restores it.
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
- Navigate to another media item and confirm zoom is preserved with centered pan; Reset view restores fitted size.

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
- Disable manager-native downloads and confirm the blob fallback saves image/video data rather than opening a remote URL.
- Test an expired URL; confirm refresh is bounded and failure never reports download success.
- Test **Open media**, **Open post**, **Copy post URL**, **Copy media URL**, and **Export URLs**.

## Routes and failures

- Navigate between two profiles without a full browser reload.
- Confirm stale responses from the first profile are discarded.
- Confirm repeated cursors stop rather than repeating the previous page.
- Test a tagged feed.
- Test the home feed where the current Instagram session permits it.
- Test an individual post/reel page.
- Confirm a failed media URL falls back or reports a clear error.
- Confirm the gallery reads visible posts and native page responses without profile lookup/feed REST requests.
- Confirm a no-progress timeout pauses automatic loading, leaves **Load more** available, and does not wrap the viewer as though the feed ended.
- Use **Copy diagnostics** and verify the version, captured-response count, and failed endpoint/status details.

## Release verification

Before publishing:

```bash
npm ci
npm test
```

Then install the release source through the same channel users will use (especially Greasy Fork), disable local development copies, and repeat the high-risk viewer, pagination, and download checks above.

### Response formats (2.1.8)

Automated fixtures cover prefixed JSON, newline-delimited nested post data, manager text responses, and HTML/GraphQL failure diagnostics. These fixtures verify parser behavior, not whether Instagram accepts requests in a particular logged-in session. On a live failure, include `postDetailErrors` from copied diagnostics.

### Recovery and profile startup (2.1.9)

- From the middle and bottom of a profile, open the gallery and load through the end. Check posts above the original scroll position as well as every carousel slide.
- Verify a collaborative post whose primary author differs from the profile, including when GraphQL fails and media-info succeeds.
- Confirm transient failures retry automatically; closing or navigating cancels backoff. Persistent unavailable posts remain visibly incomplete.
- Automated tests cover these scenarios with fixtures; authenticated Instagram verification is still required.

### Silent carousel loss (2.1.10)

Regression fixtures verify six retrieved slides survive a later two-slide summary; conflicting totals trigger retrieval; duplicate IDs cannot satisfy completeness; and new missing-slide evidence automatically reopens a completed detail job. Live checks should compare a specific native post's ordered slides with the gallery. Clean error counters alone are not proof of profile coverage, especially with moreKnown=true.

### Startup and browsing (2.1.11)

- Open on a freshly navigated profile before the first grid appears; click Load all while waiting. Verify the first batch appears and later feed data corrects cover order.
- Change every sort mode, reopen the gallery, and verify saved choice, carousel adjacency, and viewer selection. Resolution sorting groups posts by the largest available slide pixel area.
- Zoom, navigate next/previous, and wrap at the end; check the same scale on the next image, centered pan, and functioning Reset view.
- Fling through a large profile in a real browser and inspect thumbnail visibility, reserved card geometry, network requests, and memory. Automated DOM fixtures verify policy; they do not measure compositor smoothness.

### Profile completeness (2.2.0)

- Open immediately after navigating, before the native grid appears. With Auto on, leave the gallery scroll position alone and confirm it continues collecting profile pages.
- Repeat after scrolling the native profile to the middle and bottom. Check pins, newest posts, middle posts, and the oldest post against the native grid.
- Compare the native post count with the gallery's **Posts X/Y**, keeping in mind that media count includes carousel slides while post count does not. A discrepancy must remain visibly incomplete.
- Use Copy diagnostics: the first page and terminal page must both be observed, `coverageGap` must be zero when a total is known, and incomplete slides must prevent `profileComplete`.
- Check modern ordered timeline and collaborative posts. Open each carousel and compare every ordered slide, including mixed photo/video posts.
- Change all five sorts and compare the same post/slide identities. An older pin belongs first in grid order and at its actual date in newest order.
- Stop Load all during a request; confirm no new pages are requested behind Stop. Resume with Load more/Load all. Close or navigate during a request and confirm its stale result is discarded.
- With a page limit, confirm the status says limit rather than end. A repeated cursor, 429, failed request, or count gap must also pause without claiming completion.
- Run both Chromium fixtures with `npm run test:browser` and `IG_BROWSER_POSTS=216 npm run test:browser`. They exercise real browser fetch, Headers, DOM, and observers with intercepted data; they do not authenticate to Instagram.

### Review fixes (2.2.1)

- Disable Auto, then enable it from the userscript manager menu. Verify scanning resumes and the in-gallery Auto control updates. Repeat after Stop cancels Load all.
- After a terminal response leaves a post-count gap, press Load more or Load all. Verify it restarts the traversal, keeps known media, and recovers newly available posts. An unchanged gap must pause again without repeated automatic restarts.
- Replay fixtures verify inferred form content type and one value per case-insensitive header, with captured values overriding defaults.
