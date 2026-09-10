# Changelog

All notable changes to this project are documented here.

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
