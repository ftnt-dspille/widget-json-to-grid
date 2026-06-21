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

## B. View — grid options contract

B1. Static, read-only grid: `allowDelete/allowAdd/allowClone === false`,
    `viewType === 'staticGrid'`, `showPagination === false`,
    `allowGlobalFilter === false`.
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
    when the form is `$invalid`; otherwise closes the modal with `config`.
    `cancel()` dismisses.

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
