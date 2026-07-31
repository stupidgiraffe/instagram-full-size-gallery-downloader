# Manual testing checklist

Disable every older copy of the userscript before testing.

## Core gallery

- Open a profile and launch IG Gallery.
- Confirm the current profile’s media loads—not media from the previously visited profile.
- Confirm portrait and landscape photos show their complete frame.
- Test Fit, Masonry, Classic, and Contact layouts.
- Test image-only and video-only filters.
- Verify automatic loading and manual **Load more**.
- Verify **Load all** can start, stop, and end cleanly.

## Viewer

- Open portrait, landscape, carousel, and video items.
- Confirm each opens fully contained with no cropping.
- Confirm the footer never overlaps the media.
- At fitted view, confirm the plus cursor appears.
- Click once and confirm zoom reaches 200% around the clicked point.
- Confirm the cursor changes to minus.
- Click without dragging and confirm the viewer returns to fitted 100%.
- Zoom below 100% and above 100% with wheel/two-finger scrolling.
- Drag while zoomed and confirm it pans without resetting.
- Navigate beyond the last loaded item and confirm the next page loads continuously.

## Downloads

- Download a single image from a card.
- Download an image from the viewer.
- Download a video from a card and viewer.
- Confirm success/error toasts prevent accidental repeated downloads.
- Confirm the downloaded extension matches the media type.

## Routes and failures

- Navigate between two profiles without a full browser reload.
- Confirm stale responses from the first profile are discarded.
- Confirm repeated cursors stop rather than repeating the previous page.
- Test a post/reel page.
- Confirm a failed media URL falls back or reports a clear error.
