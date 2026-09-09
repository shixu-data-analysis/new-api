# Canvas Cloud Frontend Module Rules

This directory contains Canvas-owned pages embedded in the pinned New API web shell. Reuse the shell's existing components, tokens, navigation, responsive behavior, and internationalization conventions.

## Operational form layout

- Keep short administrative forms compact. On wide screens, fields and their primary action belong to the same responsive grid; do not place the action in a separate full-width row that creates a large empty card area.
- Size columns by content and task frequency. Give descriptive text fields flexible width, keep quantity and similarly bounded numeric fields narrow, and keep the primary action content-sized. Do not stretch every field equally across the viewport.
- Align a wide-screen primary action with the input control row, not with helper text. On smaller screens, let fields wrap before allowing horizontal overflow, and make the action full-width only when the viewport needs it.
- Group dense list controls by purpose: primary search/status/page-size controls first, then date and sorting controls. Use a restrained bordered surface to distinguish filters from results without creating another oversized card.
- Keep labels programmatically associated, preserve help text through `aria-describedby`, and use the existing `Card`, `Input`, `Label`, `Button`, and design tokens.

## Verification

- Add or update a focused React Testing Library regression for changed form behavior and accessible labels.
- The Canvas UI iteration exception and frozen-candidate Docker gate are defined solely in [`../../AGENTS.md`](../../../AGENTS.md). Follow that parent file; do not repeat its stages separately.
- For layout verification timing, representative viewports and evidence reuse, follow the workspace [risk/evidence rules](../../../../../docs/agent-guides/implementation-and-verification.md#风险相称验证与证据复用). Do not turn each visual edit into a full browser matrix; retain required overflow, action reachability and responsive checks at the applicable verification stage.
