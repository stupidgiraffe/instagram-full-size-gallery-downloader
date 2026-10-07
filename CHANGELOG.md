# Changelog

All notable changes to this project are documented here.

## [2.2.1] - 2026-10-08

### Fixed

- Preserve the inferred form content type of captured URLSearchParams bodies and merge replay headers case-insensitively, preventing duplicate authentication/app header values.
- Share the Auto toggle between the gallery and userscript menu. Enabling it clears Stop's pause and schedules loading; disabling it cancels its pending timer.
- Make explicit Load more/Load all retries restart a terminal count gap from the first page, through captured pagination or native scrolling. Keep known media and pause again if the gap remains instead of looping automatically.

### Validation

- Seven focused regressions cover inferred form bodies, Headers/mixed-case objects, menu resume after disabling/Stop, cursor-chain recovery, native-grid recovery, and bounded retry of an unchanged count gap.
- Chromium fixtures validate the actual outgoing form content type and captured headers, including overriding differently cased default headers.

## [2.2.0] - 2026-10-06

### Changed

- Capture profile request bodies and permitted headers from fetch (including Request objects) and XHR. Reuse observed GraphQL/REST pagination without hardcoding a profile operation ID; retain provider variables and form fields.
- Track a connected cursor chain beginning at the first page. Recover the root when opened at the middle/bottom; a disconnected terminal response, repeated cursor, timeout, page limit, or advertised count gap cannot prove completion. Stale boot data cannot replace a newer live frontier or grid order.
- Automatically scan profile pages while the gallery is open, independent of its scroll sentinel. Keep paced requests, bounded transient retries, rate-limit pauses, cancellation, and manual controls. Stop also pauses background scanning.
- Recognize modern ordered timeline stubs, verify missing full sources, and retain collaborative posts from a validated profile feed. Exclude tagged/foreign feed responses from profile membership and completion.
- Render newly captured posts immediately, including while carousel details are loading. Remove the 600-post cache eviction, synthetic cursor state, and unused cache/statistics fields. Batch DOM row discovery and live feed updates.
- Merge complementary partial carousel slides by identity without discarding known media. Keep all five sorts on the same collection, and label the grid option **Instagram grid (pins first)**. Show post coverage in the status bar and add cursor/coverage diagnostics.

### Validation

- Syntax/metadata checks and 81 behavioral regressions cover startup, scope, missing/root/repeated cursors, fetch/XHR/REST contracts, retries, cancellation, 605 cached posts, sorting, slide expansion, late responses, and DOM batching.
- Real Chromium fixtures cover early launch, captured cursor pagination, collaborative carousels, all five sorts, pins, retained zoom, and close/reopen. Fixtures intercept all traffic and use no Instagram account.
- Authenticated Instagram and the Greasy Fork-installed copy still require live verification. Advertised profile counts can differ from accessible posts; such a difference remains visibly incomplete.

## [2.1.11] - 2026-09-30

### Changed

- Wait for initial profile media before starting the scroll sweep. Load all waits for startup, and late profile data automatically resumes a timed-out empty session.
- Use captured feed order to correct early cover discovery order while retaining the selected viewer item.
- Add persisted Profile order, Newest first, Oldest first, Largest resolution, and Smallest resolution sorting. Sort posts as groups so carousel slides remain adjacent and ordered. Resolution means the largest available pixel area within each post, not download file size.
- Preserve zoom scale through next/previous navigation and end wrapping, recentering each new image. Reset view and opening a new viewer still start at fit size.
- Reserve known image geometry, retain thumbnail backgrounds, and load images within 1600px of the gallery viewport sooner. Keep distant images lazy; only the first eight load eagerly on creation.
- Batch captured feed updates into one gallery reconciliation. Centralize ordering and page scanning; remove unused pagination extraction and state fields. Disconnect thumbnail observation on gallery close and card disposal.

### Validation

- 53 regression tests pass, including immediate startup/Load all, late data recovery, feed-order correction, all sort modes/persistence, retained zoom, thumbnail geometry/loading policy, and one-rebuild-per-response batching.
- Authenticated Instagram behavior and fast-scroll visual smoothness still require live browser verification.

## [2.1.10] - 2026-09-27

### Fixed

- Preserve the largest known carousel size and previously retrieved slides when later summaries report fewer items, including full-detail responses with no declared total.
- Reconcile competing count fields using the largest value. Count unique slide IDs, so duplicated records cannot hide a missing slide.
- Reopen successful detail jobs automatically when new metadata reveals missing slides, including after feed exhaustion. Existing rate-limit pauses and bounded failure retries remain in force.
- Keep inferred minimum slide counts separate from declared totals so repeatedly merging an unknown-count summary does not falsely verify it.
- Add discoveredPosts, detailVerifiedPosts, profileScanPending, and feedEndObserved diagnostics to distinguish known-post completeness from profile coverage.

### Validation

- Four new regressions fail against v2.1.9 and pass after these changes; all 47 tests pass.
- The supplied run still had moreKnown=true. Its clean error counters do not establish full-profile coverage or identify which reproduced defect occurred in that session. Authenticated live verification remains pending.

## [2.1.9] - 2026-09-16

### Fixed

- Accept exact post-detail identity matches even when the primary author differs from the profile (including collaborative posts). Continue rejecting mismatched post codes.
- Use visible profile-grid membership to recognize collaborative posts in page data; re-read boot data when new grid identities become available.
- Verify carousel summaries with an unknown slide count instead of assuming two available slides are complete. Preserve richer partial metadata when rescanning cover thumbnails.
- Retry temporary HTML, network, timeout, server, and incomplete-source failures for up to three rounds, with 1- and 4-second delays. Keep concurrency at two and cancel retries when closing or changing routes. Authentication/rate-limit responses still pause loading.
- Start new profile sessions from the top and scan by viewport instead of jumping directly to the bottom, including when an earlier response already reported the feed end.
- Check all known incomplete groups while loading and retry unresolved groups when reopening the gallery.

### Validation

- 43 automated tests pass, including the reported HTML/different-author fallback, collaborative boot data, unknown slide counts, automatic recovery, cancellation during backoff, and bottom-of-profile startup.
- Authenticated live verification remains pending. Unavailable media stays marked incomplete; retry limits are not a guarantee that Instagram will return every item.

## [2.1.8] - 2026-09-10

### Fixed

- Decode prefixed and newline-delimited JSON in active post requests and the userscript-manager transport, matching formats already supported by passive capture.
- Find the matching post inside nested response envelopes and prefer its complete carousel over a summary in the same response.
- Avoid retrying a successful HTTP response through a second transport solely because its body is HTML or unreadable.
- Include distinct post-detail failure reasons and endpoint names in copied diagnostics; report GraphQL error counts/codes without dumping response bodies.

### Validation

- 37 automated regression tests pass, including four new response-format and diagnostic cases.
- User diagnostics from v2.1.7 showed 36 unresolved previews and 23 failed detail jobs. They did not include failure reasons, so the cause in that authenticated session is not yet confirmed. Live verification remains required.

## [2.1.7] - 2026-09-10

### Fixed

- Automatically request full post details for visible covers and incomplete carousel records. A six-slide post now expands into six individual gallery items without opening the Instagram post first.
- Use the current post-detail GraphQL response and one media-info fallback; cap concurrent lookups at two, cancel closed/stale sessions, and pause queued lookups on authentication or rate-limit responses.
- Keep every post's slides adjacent in their original order even when detail responses arrive out of order. Preserve viewer selection and update card navigation indices after expansion.
- Upgrade cover images to the correct photo/video type, carousel position, full-size source, and download filename. Downloads requested while a cover is resolving wait for the complete item.
- Apply late complete metadata even after the post list is exhausted; preserve complete carousels when later summaries contain fewer slides.
- Show incomplete-post status and an explicit retry control instead of silently treating one cover as a complete carousel. Do not report Load all complete while posts remain incomplete.

### Validation

- Reproduced both cover-only and partial-carousel failures against v2.1.6: one item rendered instead of six.
- Added regression cases for automatic six-slide resolution, mixed media, ordering, viewer selection/navigation, individual downloads, detail fallback, cancellation, retry, and rate-limit handling.
- Live authenticated verification of this new retrieval path remains pending. The earlier v2.1.6 confirmation did not cover carousel completeness.

## [2.1.6] - 2026-09-09

### Fixed

- Load media from Instagram's page data, visible posts, and native fetch/XHR responses without depending on the failing profile lookup/feed REST endpoints.
- Ask Instagram's own page to load more posts; pause on no progress and discard responses from a previous route or closed gallery.
- Preserve signed media URLs, try available candidates, and refresh expired media once without repeated HTTP error loops.
- Persist the existing viewer Hide/Show controls preference across reopening and reloads, with a local fallback if userscript storage fails.
- Fall back to downloading the actual media blob when manager downloads fail, and stop reporting link-opening as a successful download.
- Preserve the existing viewer zoom, pointer-release reset, layout, and public userscript identity.

### Validation

- Add executable regression tests for native feed capture, pagination, preview/viewer loading, expired sources, downloads, and settings persistence.
- Authenticated Instagram and Greasy Fork installation checks remain pending; this change is prepared for review, not a verified public release.

## [2.1.5] - 2026-08-21

### Added

- Added a persistent **Hide controls / Show controls** button in the full-size viewer.
- Hiding the controls completely collapses the bottom viewer footer so it cannot obstruct or reduce the usable media-viewing area.
- Kept the toggle accessible at the top of the viewer so the controls can always be restored.

### Changed

- Strengthened repository documentation around installation, privacy, permissions, troubleshooting, release discipline, and the gallery-first design.
- Updated userscript validation so CI verifies the v2.1.5 metadata and the hideable-controls feature.

## [2.1.4] - 2026-07-31

### Changed

- Prepared the first public GitHub release.
- Adopted the searchable public name **Instagram Full-Size Gallery & Downloader**.
- Added GitHub homepage, support, browser compatibility, and Buy Me a Coffee metadata.
- Preserved the verified v2.1.3 runtime behavior without changing gallery, loader, pagination, download, or zoom logic.

## [2.1.3] - 2026-07-31

### Fixed

- Made the zoom-out click execute on pointer release so Firefox pointer capture cannot suppress it.
- Preserved drag-to-pan without accidental zoom reset.

## [2.1.2] - 2026-07-31

### Added

- Matching minus cursor after click-to-zoom.
- Buy Me a Coffee contribution URL.

## [2.1.1] - 2026-07-31

### Changed

- Removed intrusive zoom instruction overlays.
- Added intuitive click-to-zoom behavior.

## [2.1.0] - 2026-07-31

### Fixed

- Enforced complete, uncropped media containment in the viewer.
- Added zoom-out below 100%, viewer opening-size controls, and separate footer geometry.
