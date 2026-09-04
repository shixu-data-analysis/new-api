# Canvas Cloud Frontend Module Rules

This directory contains Canvas-owned pages embedded in the pinned New API web shell. Reuse the shell's existing components, tokens, navigation, responsive behavior, and internationalization conventions.

## Operational form layout

- Keep short administrative forms compact. On wide screens, fields and their primary action belong to the same responsive grid; do not place the action in a separate full-width row that creates a large empty card area.
- Size columns by content and task frequency. Give descriptive text fields flexible width, keep quantity and similarly bounded numeric fields narrow, and keep the primary action content-sized. Do not stretch every field equally across the viewport.
- Align a wide-screen primary action with the input control row, not with helper text. On smaller screens, let fields wrap before allowing horizontal overflow, and make the action full-width only when the viewport needs it.
- Group dense list controls by purpose: primary search/status/page-size controls first, then date and sorting controls. Use a restrained bordered surface to distinguish filters from results without creating another oversized card.
- Keep labels programmatically associated, preserve help text through `aria-describedby`, and use the existing `Card`, `Input`, `Label`, `Button`, and design tokens.

## Verification gate

- Add or update a focused React Testing Library regression for changed form behavior and accessible labels.
- For the frozen candidate, run the parent `scripts/run-docker-affected-gate.sh` once with the changed test and source paths; its Docker Bun result subsumes focused tests, TypeScript checking, affected-file lint/format, and the production build, so do not rerun those stages separately.
- For layout changes, inspect the real page at approximately 390 px, 768 px, 1440 px, and the available wide desktop viewport. Confirm there is no page-level horizontal overflow, no detached or floating primary action, and no large blank region created solely by grid placement.
