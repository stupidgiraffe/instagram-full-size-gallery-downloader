# Changelog

All notable changes to this project are documented here.

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
