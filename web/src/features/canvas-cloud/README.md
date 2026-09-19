# Canvas Cloud Web extension

This feature is the isolated WEB-001 extension for the pinned New API revision `2d8e50bf36e94200b809dfb39e73624ec48b1e23`.

- Keep Canvas API calls under `/canvas-api` and forward the existing in-memory New API Bearer through the shared HTTP client.
- Keep customer and administrator authorization authoritative in Canvas Cloud. Never infer Canvas authority from a visible tab or a New API role alone.
- Model catalog publication accepts the complete App Bundle folder through the role-10 catalog tab or the governed local/CI pipeline. Both entries use Canvas Cloud server validation and one confirmed publication transaction; never restore the retired reviewed-package draft/self-approval workflow.
- Reuse New API layout, theme, components, i18n, error handling, responsive behavior, and accessibility patterns.
- Do not import Canvas modules into New API account, API-key, security, channel, forwarding, or quota features.
- Before upgrading upstream, compare this feature's route, sidebar, auth-client, layout, shared-state components, themes, i18n, and Rsbuild proxy surfaces and rerun the WEB-001 gates.
