## What's New

- Fixed an issue where the Change Request dropdown did not open in the Continuous Delivery module

## 1.3.0

- **Column order now respects `grid_columns` definition order** — added `orderByColumnDefs: true` to grid options so the rendered column sequence matches the order specified in the playbook's `grid_columns` variable
- **Column filtering enabled** — `enableFiltering` was incorrectly set to `false`; column-level filters now work as expected
- **Detail-view record support** — when the widget is placed on a record detail page, the current record is automatically passed as the playbook's "selected record" input (no row selection required). Requires `$state.params.module` and `$state.params.id` to be set by the host page
- **Removed non-functional `useExternalFiltering` setting** — this flag was set but no external filter handler was ever implemented, which silently suppressed built-in column filters
