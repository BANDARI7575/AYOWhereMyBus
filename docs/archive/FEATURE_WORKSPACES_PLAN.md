# Integrated feature implementation plan

Baseline 6e404df on release/integrated-transit. Existing untracked QA receipts/backups are preserved. No commit, push, merge, purchase or public deployment is authorized.

1. Reuse one Leaflet map and the existing planner/transit adapters. Add an accessible responsive workspace shell for all six cards; preserve selections and restore DOM/map/focus on close. Do not replace the cinematic homepage or creator content.
2. Add validated, paginated official-stop/route discovery with explicit radius, exact platform IDs and schedule directions. Connect stop details to existing departures, alerts, planner and favorites.
3. Extend the existing planner with swap, saved-pair shortcuts and explicit depart-at input; expose only routing modes actually implemented. Keep arrive-by unavailable rather than claiming unimplemented reverse search. Preserve all routing safety regressions.
4. Add shared local favorites (stops/routes/journeys), rename/reorder/remove/confirmed clear and fresh reloads; integrate legacy favorites without silently losing them.
5. Add threshold/filter-aware page-open alerts with explicit status/cancel and no scheduled-only/stale triggers. Preserve existing background infrastructure and its external acceptance gates.
6. Add reliability inspection using current official source timestamps, route/vehicle filtering, official alerts and separately labeled approved community reports. Never infer historical reliability.
7. Verify official OpenAI Realtime/WebRTC docs. Implement validated allowlisted transit tools and useful data-backed text interaction. Add a disabled-by-default server-mediated Realtime boundary requiring credentials, authenticated sessions and approved cost controls; no paid requests in QA. Clearly mark paid AI voice blocked without that infrastructure and physical-device acceptance.
8. Repair logo weather symbol, neutral unknown/failure handling, observation timestamps, day/night and reduced-motion behavior using the existing verified provider.
9. Inventory visible controls; add integrated regression coverage for six workflows, weather fixtures, cross-feature context, storage failures, permissions/offline states and 320/360/390/768/1024/1440 widths plus landscape/zoom. Run existing backend/Node/browser/PWA/accessibility/security suites. Separate mocks, live snapshots and external blockers in one final report.

External gates remain: paid AI account/key/billing/spend controls and authenticated voice sessions, real native audio/push/device acceptance, hosting/TLS/storage/monitoring, moderation/support staffing and legal/provider/privacy acceptance. All feasible local code and tests are pursued before final reporting; unsupported outcomes must remain explicit.
