# Contributing

Thanks for helping improve Instagram Full-Size Gallery & Downloader.

## Before opening a pull request

1. Test with only one copy of the userscript enabled.
2. Run:

   ```bash
   node --check instagram-full-size-gallery-downloader.user.js
   node scripts/validate-userscript.mjs
   ```

3. Complete the manual checklist in `docs/TESTING.md` for any affected behavior.
4. Keep the userscript readable and dependency-free.
5. Do not add analytics, tracking, advertisements, credential collection, or remote executable code.
6. Preserve the AGPL license and driver8 attribution.

## Development principles

- Map both sides of every bridge before changing connected behavior.
- Preserve working loader, pagination, viewer, and download invariants unless the change explicitly requires modifying them.
- Prefer a single clear implementation over layered fallbacks.
- Treat Instagram route changes and stale asynchronous responses as first-class failure cases.
- Avoid UI changes based only on assumptions; include screenshots and exact reproduction steps.

## Pull requests

Describe:

- The problem and reproduction steps
- The invariant or root cause being addressed
- Exact files and behaviors changed
- Automated checks run
- Manual browsers/pages/media types tested
- Screenshots for visible UI changes
