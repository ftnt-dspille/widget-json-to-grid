# JSON-to-Grid — open follow-ups

Context: v1.3.1 fixed row rendering, column order (from `grid_columns`), per-user
column-reorder persistence, and made sort/filter work via ui-grid's **native**
client-side engine (`useExternalSorting/Filtering: false`, `enableSorting: true`).
All four were live-verified against box 205 with the real "JSON to Grid -
playbook example" playbook. See `SPEC.md` (A8/A9), `docs/usage.md`, and
KNOWLEDGEBASE.md §7 + §8.2.1.

The items below are NOT yet done.

## 1. Per-column filter types — ✅ DONE, FortiSOAR-style (v1.3.2)

`normalizeColumns` → `decorateColumnFilter(colDef, type, field, rows)` renders
filters that match the native FortiSOAR grid UX (custom `filterHeaderTemplate` =
the `jtgColumnFilter` directive; all client-side over the in-memory rows):

- **boolean** → tri-state dropdown: `Any` / `Not Set` / `Yes` / `No`.
- **enum / picklist / select** (or an auto-detected low-cardinality, repeating
  string column) → searchable multi-select checklist with Check/Uncheck All,
  `Not Set`, and an **Apply** button. Distinct values come from the data.
- **date / datetime** → relative-range preset dropdown (Last 7/15/30 Days, Last
  3/6 Months, Last Month, Last Calendar Month, Last Year).
- **number / integer / int / float** → clean `Search` box whose `condition` still
  supports `> >= < <= =` and `lo..hi` ranges.
- **string / unknown** (high-cardinality) → ui-grid's default text filter.

Type is **inferred from the data** when `grid_columns` omits `type` (the platform
"JSON to Grid" example emits none) — boolean/number/ISO-date; ambiguous strings
stay text. An explicit `grid_columns` type wins over inference. Guards: explicit
`filter`/`filters` preserved; `enableFiltering:false` suppresses. The dropdown
menu uses `dropdown-append-to-body` to escape the clipped grid header; styles are
global `.jtg-*` (in view.html). Locked by jest A10a–A10l + two e2e (boolean
dropdown + enum multi-select filter real rows in ui-grid).

Also shipped alongside:
- **Runtime column show/hide** for the end user (`enableGridMenu` hamburger).
- **Per-user column-width persistence** (`settingsService` `jsonToGrid/columnWidths`,
  re-applied on load) — SPEC A12.

## 2. Column chooser in edit.html — ✅ DONE (v1.3.2)

Resolved decisions:
- **Column source = run the data-provider playbook once in edit.** A "Discover
  Columns" button in Advanced Settings triggers the provider (record-less,
  `force_debug=true`) via the same `playbookService` completion chain as the
  view, and reads `grid_columns` from the result. (`runProviderForColumns` in
  `edit.controller.js` — mirrors `view.controller`'s `_sendPost` minus the grid
  wiring.) Errors (no provider / no read permission / no grid_columns / run
  failed) surface inline + via toaster.
- **Persisted as `config.columnPrefs`**: ordered `[{ field, displayName,
  visible }]`. The chooser table offers a show/hide checkbox and up/down
  reorder; "Clear column defaults" resets.
- **Runtime merge** (`applyColumnPrefs` in `view.controller.js`): grid_columns
  is the source of truth for which columns EXIST; prefs supply default order +
  visibility. Columns named in prefs take pref order (and `visible:false`
  hides); playbook columns not in prefs are appended visible; a pref whose
  column vanished is dropped.
- **Precedence**: `applyColumnPrefs` runs BEFORE `applyColumnOrder`, so a
  per-user dragged order (`settingsService` `jsonToGrid/columnOrder`) still
  overrides the admin default ORDER. Visibility has no per-user override —
  always the config value.
- **No-discovery safety**: saving without discovering never wipes an existing
  `config.columnPrefs` (re-seeded into the chooser on open; `persistColumnPrefs`
  no-ops on an empty working list).

Coverage: jest A11a–A11e (view merge) + D8a–D8i (edit discovery/chooser).

## Don't re-discover (already settled)
- csGrid renders rows from `pagedCollection.list`/`keyPairs`, not
  `data['hydra:member']`.
- `orderByColumnDefs` and `viewType:'staticGrid'` are no-ops in the platform.
- Sort/filter MUST be ui-grid-native (`useExternal*: false`); csGrid's external
  path queries the non-existent `dummy_module`.
- ui-grid binds cells from `field` (we map `name`→`field`).
