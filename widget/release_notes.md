## What's New

## 1.3.1

- **Grid rows now render** — the grid showed the column headers but no data rows. csGrid paints rows from the collection's `list`/`keyPairs`, not from `hydra:member`, so the rows were never materialized. Fixed by populating `list`/`keyPairs` (and synthesizing a row `@id`/`uuid` when the playbook omits one).
- **Column order now actually follows `grid_columns`** — the previous `orderByColumnDefs` flag is a no-op in the platform. Column order is now driven directly from the `grid_columns` order, and each column's `name` is mapped to the grid's internal `field` so cell values bind.
- **User column reordering is remembered** — drag a column and the new order is saved per-user (via user settings, key `jsonToGrid/columnOrder`) and restored on the next visit; new columns from later runs are appended, removed ones dropped.
- **Sorting and filtering now work** — header sorting was never enabled (platform default is off) and both sort/filter were routed to a non-existent backend. They now run client-side over the returned rows (numeric-aware sort; case-insensitive substring filter). Disable per column with `"enableSorting": false` / `"enableFiltering": false`.
- **No longer crashes on init when no JSON Data Provider Playbook is configured** — the view controller dereferenced `actionButtons[0].uuid` unconditionally, so an unconfigured (or dashboard-added) widget threw `Cannot read properties of undefined (reading '0')` and rendered nothing. It now shows a clear "configure a JSON Data Provider Playbook" message instead.
- **Generic / manual data-provider playbooks supported** — the controller assumed the provider was a record-scoped action playbook (`triggerStep.arguments.resources[0]`); a generic Start-trigger playbook has no `resources` and crashed. It now runs the provider without a record entity, which makes the widget usable on **Dashboards** (no record context required).
- Hardened the same unguarded access in `refreshGridData` and `executeGridPlaybook`.

- Fixed an issue where the Change Request dropdown did not open in the Continuous Delivery module

## 1.3.0

- **Column order now respects `grid_columns` definition order** — added `orderByColumnDefs: true` to grid options so the rendered column sequence matches the order specified in the playbook's `grid_columns` variable
- **Column filtering enabled** — `enableFiltering` was incorrectly set to `false`; column-level filters now work as expected
- **Detail-view record support** — when the widget is placed on a record detail page, the current record is automatically passed as the playbook's "selected record" input (no row selection required). Requires `$state.params.module` and `$state.params.id` to be set by the host page
- **Removed non-functional `useExternalFiltering` setting** — this flag was set but no external filter handler was ever implemented, which silently suppressed built-in column filters
