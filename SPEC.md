# JSON to Grid — behavior spec (reverse-engineered from 1.2.0)

This document is the feature contract the test suite locks down. Each numbered
item maps to one or more tests (jest controller/template, playwright e2e). When
1.3.0 changes behavior, change the spec **and** the test in the same commit.

Controllers:
- View: `jsonToGrid130DevCtrl` (`widget/view.controller.js`)
- Edit: `editJsonToGrid130DevCtrl` (`widget/edit.controller.js`)

The widget turns a "JSON Data Provider" playbook's result into a FortiSOAR grid
(`data-cs-grid`) and renders configurable action buttons that execute other
playbooks against the grid's rows.

---

## A. View — data flow & rendering

A1. **Boot fetches the grid.** On init the controller sets `loadProcessing =
    true`, builds grid options, and triggers the configured data-provider
    playbook (`config.actionButtons[0].uuid`) to populate the grid.

A2. **Grid data comes from the playbook result.** When the triggered playbook
    finishes (`status === 'finished'`), the controller sets
    `gridOptions.data = result.grid_data` and
    `columnDefs = result.grid_columns.columns`. → **row count == grid_data.length**.

A2b. **PagedCollection `list`/`keyPairs` drive the rows.** csGrid renders body
    rows from `gridPagedCollection.list`/`.keyPairs`, **not** from
    `data['hydra:member']` (`if (isUndefined(pc.list) || !pc.list.length)
    gridOptions.data=[]; else gridOptions.data=pc.keyPairs;`). Setting only
    `data['hydra:member']` shows the column headers but **zero rows**. The
    controller sets `list`, `keyPairs`, and `visited` from the grid data so the
    rows render. Each row also gets a synthesized `@id`/`uuid` when missing
    (`ensureRowIds`) since csGrid selection tracks rows by IRI.

A3. **Empty result → empty collection.** When `grid_data.length === 0`, a
    `PagedCollection('dummy_module', …)` is built with an empty
    `hydra:member` / `hydra:totalItems: 0` so the grid renders the
    "No Results Found" empty state rather than erroring.

A4. **Spinners.** `loadProcessing` shows the full "Fetching Grid Data ..."
    spinner; `refreshProcessing` shows the overlay spinner during a refresh.
    Both are cleared to `false` once data resolves (finished or failed).

A5. **Failed execution toasts a warning** and clears both processing flags
    (no grid mutation).

A6. **SystemWaitForCompletion is forced.** Before triggering, the data-provider
    playbook's `recordTags` gets `'SystemWaitForCompletion'` appended if absent,
    and (with read permission) the trigger URL gets `?force_debug=true`, so the
    grid waits synchronously for the result.

A7. **Refresh** (`refreshGridData`) clears `gridOptions.data = []` then
    re-triggers the data-provider playbook.

A8. **Columns: binding, order, persistence.**
    - A8a. Each `grid_columns` entry's `name` is copied into `field`
      (`normalizeColumns`); ui-grid reads cell values from `field`, not `name`.
      `displayName` defaults to `name`.
    - A8b. Default column order **is** the `grid_columns` array order.
    - A8c. A per-user saved order (`settingsService` key
      `jsonToGrid/columnOrder`, KB §8.2.1) overrides the default; columns not in
      the saved order are appended in `grid_columns` order (`applyColumnOrder`).
    - A8d. Dragging a column header persists the new field order via
      `settingsService.set('jsonToGrid/columnOrder', …)`
      (`gridApi.colMovable.on.columnPositionChanged`).

A9. **Native (client-side) sort & filter.** csGrid's grid defaults set
    `useExternalSorting`/`useExternalFiltering` to true, which routes sort/filter
    to a server query against the synthetic `dummy_module` (no endpoint) → they
    silently do nothing. The widget forces both to **false** (its gridOptions win
    over csGrid's defaults), so ui-grid's native client-side engine sorts and
    filters `gridOptions.data` in memory. `enableSorting` is also set true (grid
    default is false). Verified live (text + numeric sort, per-column filter).
    - A9a. `enableSorting`/`enableFiltering === true` and
      `useExternalSorting`/`useExternalFiltering === false`.
    - A9b. The collection's `loadGridRecord` is stubbed to a resolved no-op so a
      stray csGrid reload can't query the dead endpoint and blank the grid.

A10. **FortiSOAR-style per-column filters.** A column's type (declared on
    `grid_columns[].type`, else INFERRED from the data) drives a native-looking
    filter via `normalizeColumns` → `decorateColumnFilter`. Dropdown modes
    (boolean/enum/date) render through a custom `filterHeaderTemplate` (the
    `jtgColumnFilter` directive); number/string keep ui-grid's native input. All
    filtering is client-side over the in-memory rows (each colDef carries a
    `condition`).
    - A10a. `string`/unknown (high-cardinality) → ui-grid default text filter.
    - A10b. `boolean` → tri-state dropdown (`Any` / `Not Set` / `Yes` / `No`);
      `jtgFilterMode === 'tri'`.
    - A10c. `number`/`integer`/`int`/`float` → plain search box (`Search`
      placeholder) whose `condition` still supports `> >= < <= =` and `lo..hi`.
    - A10d. `date`/`datetime` → relative-range preset dropdown (Last 7/15/30
      Days, Last 3/6 Months, Last Month, Last Calendar Month, Last Year);
      `jtgFilterMode === 'date'`.
    - A10e. An explicit per-column `filter`/`filters` override is preserved.
    - A10f. `enableFiltering: false` suppresses the injected filter.
    - A10g. Type is inferred from the data when `grid_columns` omits it
      (boolean/number/ISO-date); ambiguous strings stay plain text.
    - A10h. An explicit `grid_columns` type wins over inference.
    - A10j. `enum`/`picklist`/`select` → searchable multi-select checklist
      (Check/Uncheck All, `Not Set`, `Apply`); `jtgFilterMode === 'enum'`,
      values = sorted distinct.
    - A10k. A low-cardinality, clearly-repeating string column is auto-detected
      as enum; A10l. a high-cardinality string column stays plain text.
    - E2E: the boolean dropdown and enum multi-select are exercised against real
      ui-grid (open menu → select → row count drops).

A11. **Admin column chooser merge.** `config.columnPrefs` (set in edit.html,
    `[{ field, visible }]`) supplies a default order + visibility, applied by
    `applyColumnPrefs` BEFORE `applyColumnOrder`. grid_columns stays the source
    of truth for which columns exist.
    - A11a. Prefs set order; a `visible:false` pref hides the column.
    - A11b. A playbook column absent from prefs is appended, stays visible.
    - A11c. A pref for a column the playbook no longer returns is dropped.
    - A11d. A per-user dragged order (settings) overrides the config order;
      config visibility still applies (no per-user visibility override).
    - A11e. No `columnPrefs` → columns untouched (all visible, grid order).

A12. **Per-user column width persistence.** Resizing a column persists a
    `{ field: px }` map to `settingsService` (`jsonToGrid/columnWidths`) via
    `colResizable.on.columnSizeChanged`; widths are re-applied to the colDefs on
    load (`applyColumnWidths`). POST-on-change, cached read, no GET, no playbook
    re-run — same persistence model as column order (A8).
    - A12a. Resize persists the live pixel widths of all columns.
    - A12b. A saved width is re-applied on load; unset columns keep their
      grid_columns width.
    - A12c. A resize merges with previously-saved widths (others not lost).

A13. **Runtime column chooser (end user).** `enableGridMenu`/
    `gridMenuShowHideColumns` are on, so the ui-grid grid menu lets a viewer
    show/hide columns at runtime (distinct from the admin default in A11).

## B. View — grid options contract

B1. Static, read-only grid: `allowDelete/allowAdd/allowClone === false`,
    `viewType === 'staticGrid'`, `showPagination === false`,
    `allowGlobalFilter === false`. Sorting + filtering are **enabled**
    (`enableSorting`/`enableFiltering === true`) and handled client-side (A9).
B2. Selection: checkbox-only, header-select + select-all enabled
    (`selectWithCheckboxOnly`, `enableSelectAll`, `showSelectionCheckbox`,
    `enableRowHeaderSelection`).
B3. Expandable rows enabled via `widgetAssets/html/rowExpandable.html`.
B4. Card view allowed; column resizing + moving enabled; grid menu disabled.

## C. View — action buttons

C1. **"With record" vs "without record".** `config.selectedPlaybooksWithoutRecord`
    become plain `buttons` (execute with no selection);
    `config.selectedPlaybooksWithRecord` become `selectButtons` (execute against
    selected rows).
C2. **Button label** is the trigger step's `arguments.title`, falling back to the
    playbook `name`.
C3. **Button icon** is the configured `icon`, falling back to `icon icon-execute`.
C4. **Execution wizard.** If a with-record playbook is in
    `selectedExecutionWizardPlaybooks` and `showExecutionProgress` is on,
    clicking launches the standalone "Playbook Execution Wizard" widget with the
    selected rows instead of executing inline; selection is then cleared.
C5. **Input variables modal.** Executing a playbook whose trigger step has
    `inputVariables` opens the `inputVariables.html` modal before running.

## D. Edit — config model

D1. **Defaults.** `widgetName` is forced to `'Playbook Execution Wizard'`;
    `actionButtons`, `selectedPlaybooksWithoutRecord`,
    `selectedPlaybooksWithRecord` default to `[]` if unset.
D2. **Collection drives playbook list.** Selecting a Workflow Collection
    (`changedCollection`) clears all selections and loads that collection's
    playbooks (`$limit:100`, ordered by name) into `playbookData`.
D3. **Data-provider single-select.** Picking a playbook calls `addButton` →
    pushes onto `actionButtons`; once one is added the data-provider select is
    disabled (only one provider allowed). `removeButton(i)` removes it.
D4. **Add/remove with/without record.** `addButtonWithoutRecord` /
    `addButtonWithRecord` push to the matching config list and onto
    `playbookList`; `removeButton*Record(i, action)` splice them out and reject
    the action from `selectedExecutionWizardPlaybooks`.
D5. **Reset on uncheck.** Unchecking "Action Buttons (No Record)" empties
    `selectedPlaybooksWithoutRecord`; unchecking "With Record" empties the
    with-record list, `playbookList`, `selectedExecutionWizardPlaybooks`, and
    turns off `showExecutionProgress`.
D6. **Wizard list source.** `playbookButton()` copies
    `selectedPlaybooksWithRecord` into `playbookList` (the wizard multiselect's
    options).
D7. **Save validation.** `save()` blocks (marks touched, focuses first error)
    when the form is `$invalid`; otherwise persists the column chooser and
    closes the modal with `config`. `cancel()` dismisses.

D8. **Column chooser.** `discoverColumns()` runs the data-provider playbook once
    (record-less, `force_debug=true`) and populates `$scope.columnChooser` from
    the result's `grid_columns`. The admin sets default visibility (checkbox)
    and order (up/down), persisted to `config.columnPrefs`
    (`[{ field, displayName, visible }]`).
    - D8a. Discovery POSTs to the action-trigger route and fills the chooser
      (fields + types, all visible by default).
    - D8b/D8c. No data provider / missing playbook-read permission → inline
      error, no trigger.
    - D8d. A finished run returning no `grid_columns` → error + toaster.
    - D8e. Toggling visibility + `save()` writes `config.columnPrefs`.
    - D8f. `moveColumnUp`/`moveColumnDown` reorder and persist immediately.
    - D8g. Re-discovery keeps prior order/visibility, appends new columns
      (visible).
    - D8h. `resetColumnPrefs()` clears chooser + saved prefs.
    - D8i. Saving without discovering never wipes existing `columnPrefs`.

## E. Edit — template contract

E1. Title is required (`config.title`).
E2. Playbook Collection typeahead is required and bound to
    `config.playbookCollection`.
E3. JSON Data Provider select is required until one button exists, then disabled.
E4. The two "Action Buttons" checkboxes reveal their respective playbook selects
    and sortable lists only when checked.
E5. The execution-progress block (multiselect + Advanced Settings / Widget Name)
    is revealed only when `showButtonWithRecord` && `showExecutionProgress`.
E6. Save/Close buttons present (`#edit-widget-save`, `#edit-widget-cancel`).

---

## Test coverage map

| Surface | Layer | File |
|---|---|---|
| A1–A7 data flow, row count, empty state | jest (deterministic) | `tests/view.controller.test.js` |
| B1–B4 grid options | jest | `tests/view.controller.test.js` |
| D1–D7 edit config model | jest | `tests/edit.controller.test.js` |
| A4/B/E template bindings | jest (offline DOM contract) | `tests/templates.test.js` |
| Real-DOM mount + title render | playwright (hermetic) | `tests/e2e/jsonToGrid.spec.js` |
| Grid rows / empty state in real DOM | playwright (`test.fixme`) | `tests/e2e/jsonToGrid.spec.js` |

**e2e grid rendering is blocked on two harness build-outs** (tracked in the
spec file's fixme comment): the harness omits angular-ui-grid (`uiGridConstants`)
so `cs-grid` can't render rows, and lacks picklist metadata so `Entity.loadFields`
rejects and the execution chain never completes. Row-count *logic* is locked by
the jest view-controller test meanwhile; the fixme specs already encode the full
trigger→poll→log API contract and will pass once the harness can host a grid.

### Harness changes this widget required (committed in the harness repo)
- `window.UUID` shim (stripped UUID.js vendor) — `public/index.html`
- `widgetBasePath` factory + `KNOWN_PLATFORM_EXTRAS` entry — `harness.module.js`, `server.js`
- `$rootScope.config` seed for controllers reading `$scope.config` directly — `harness.module.js`
