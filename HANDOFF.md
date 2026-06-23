# JSON-to-Grid 1.3.0 — work handoff

Goal of this effort: clone `widget-json-to-grid`, branch a `release/1.3.0` off
`release/1.2.0`, reverse-engineer behavior into a spec, and build tests (jest +
playwright) that lock the view & edit widgets' rendering down — "renders
properly, has X rows", etc.

## Current state (all green / intentional)

- **Repo:** cloned to `widgets-src/widget-json-to-grid` (its own git repo).
  Branch **`release/1.3.0`** is checked out (created off `release/1.2.0`).
  Branch naming convention is `release/X.Y.Z`.
- **Version bumped 1.2.0 → 1.3.0** via the harness package endpoint, which
  rewrote controllers to the harness dev convention:
  - view ctrl: `jsonToGrid130DevCtrl`
  - edit ctrl: `editJsonToGrid130DevCtrl`
  - Do NOT hand-edit `info.json` version or controller names — let the bump path
    (`syncSourceToInfoJson`/`rewriteForVersion` in `packager.js`) rewrite them.
    `node scripts/widget.js bump` is currently STALE (posts `{bump}` to
    `/_fsr/fix-info`, which only patches metadata). The working bump is:
    `curl -XPOST localhost:4401/_fsr/package/<id> -d '{"bump":"minor"}'` (it
    bumps + syncs source before linting; the .tgz it streams can be discarded).
- **Lint:** `node scripts/widget.js lint widget-json-to-grid` → clean.
- **Dev server:** harness on :4401 (started via `npm run dev`, background). After
  cloning a new widget the server must be RESTARTED — discovery is at boot.

## Tests written

Run unit: `make test-unit WIDGET=widget-json-to-grid` (201 pass, 0 fail).
Run e2e:  `make test-e2e-spec SPEC="widget-json-to-grid/tests/e2e/jsonToGrid.spec.js"`

- `tests/view.controller.test.js` — drives the full execution chain offline with
  mocked platform services; asserts the grid contract incl. **row count ==
  `grid_data.length`**, columnDefs, empty-state PagedCollection, processing
  flags, `force_debug` sync URL, refresh, static grid options.
- `tests/edit.controller.test.js` — config defaults, add/remove buttons,
  collection reload, reset-on-uncheck, wizard list, save/cancel validation.
- `tests/templates.test.js` — offline DOM-binding contracts for view/edit HTML.
- `tests/e2e/jsonToGrid.spec.js` — hermetic playwright. **"renders the
  configured title" PASSES** (real mount + config flow + template). Two grid-
  data tests are `test.fixme` (see blockers below); they already encode the full
  trigger → log_list poll → getExecutedPlaybookLogData API contract.
- `jest.config.js` — jsdom project, picked up by the harness when WIDGET= names
  the folder.
- `SPEC.md` — the behavior contract (items A–E) + a coverage map. Update SPEC and
  the matching test in the same commit when 1.3.0 changes behavior.

## Harness changes made (in the HARNESS repo, not the widget)

These were required just to mount this grid widget. Verified non-regressing
against counter + fsrSocAssistant.smoke e2e.

1. `public/index.html` — `window.UUID` shim next to the DOMPurify shim (stripped
   UUID.js vendor; `generateUUID:()=>UUID.generate()` blocks any grid widget at
   bootstrap without it).
2. `harness.module.js` — `widgetBasePath` factory (real SOAR injectable for view
   widgets) + `$rootScope.config` seed (json-to-grid reads `$scope.config`
   directly rather than injecting `config` like counter/actionRenderer do).
3. `server.js` — added `widgetBasePath` to `KNOWN_PLATFORM_EXTRAS` so lint treats
   it as a real platform service, not a harness-only stub.

## RESOLVED (option a): e2e grid-row rendering now passes

The two `test.fixme`s are now real, passing tests — the harness can host a grid.
What it took (all harness-repo changes; details documented in KNOWLEDGEBASE.md
§9.4.1/§9.4.2):
- **angular-ui-grid** loaded from CDN in `public/index.html` (before app.unmin)
  and `ui.grid` + all 8 feature modules added to `HARNESS_VENDOR_DEPS`
  (`server.js`).
- **`$stateParams`** stubbed in `harness.module.js` — csGrid injects it directly;
  without it the directive `$injector:unpr`s and ui-grid never builds (which is
  why `gridApi` was undefined → `getSelectedRows()` threw → `loadProcessing`
  stuck true).
- Hermetic stubs for **`/api/system/fixtures`** (real SYSTEM_MODULES snapshot, so
  `metadata.picklists` is seeded and `Entity.loadFields()` resolves),
  **`/api/3/picklists`** (empty values), and **`/api/3/system_settings`** (real
  snapshot). Snapshots live per-dev in `fsr_src/*.json` (gitignored, fetched by
  `scripts/fetch-soar-assets.sh`).
- The row-count assertion scopes to `.ui-grid-render-container-body .ui-grid-row`
  (ui-grid renders rows once per render container, so unscoped counts double).

Verified non-regressing: counter (3) + fsrSocAssistant.smoke (14) e2e still green.

## (historical) The blocker: e2e grid-row rendering (the `test.fixme`s)

Driving real grid DOM hermetically is blocked on two harness build-outs the dev
harness deliberately omits (they affect EVERY grid widget + the hermetic gate, so
don't pull them in casually):

1. **angular-ui-grid (`uiGridConstants`)** — stripped from `app.unmin.js`, not
   re-added (index.html "Skipped on purpose" list). `cs-grid` throws
   `$injector:unpr uiGridConstants` and renders zero `.ui-grid-row`. To add it:
   load the angular-ui-grid CDN script+css in `public/index.html` (before
   app.unmin) AND add `"ui.grid"` to `HARNESS_VENDOR_DEPS` in `server.js`
   (~line 718) so its provider is visible to the cybersponse injector. Risk:
   ui-grid 4.x ↔ angular 1.8.3 compat + csGrid template expectations.
2. **picklist module metadata** — `Entity.loadFields()` rejects with "picklists
   module metadata not found", so the execution chain never resolves and
   `loadProcessing` stays true (the "No Results Found" empty state is gated on
   `!loadProcessing`). Needs the harness to preload picklist metadata the way it
   preloads model_metadatas (`loadAllModules`).

The execution chain itself is understood and stubbed correctly (see the precise
endpoint contract in `stubApi()` in the spec):
- trigger: `POST …/triggers/1/action/<route>?force_debug=true` → `{task_ids}`
- poll (no websocket in harness → HTTP poll):
  `POST <WORKFLOW=api/wf/>api/workflows/log_list/?…&task_id=<id>` →
  `{hydra:member:[{status:"finished","@id":"/wf/api/workflows/<instanceId>"}]}`
  (platform does `instance_ids = parseInt(@id.split("/wf/api/workflows/")[1])`)
- log data: `GET api/wf/api/workflows/<instanceId>/?format=json` →
  `{status:"finished", result:{grid_data, grid_columns:{columns}}}`

## Open decision for the user (next step)

How to cover real grid-DOM rendering ("X rows"):
- **(a)** Invest in harness ui-grid + picklist support → un-fixme the two specs;
  they should pass as-is. Biggest payoff (all grid widgets get DOM coverage) but
  a real harness change touching the hermetic gate.
- **(b)** Cover grid rendering via a **live-tier** e2e (`E2E_LIVE=1`) against the
  demo SOAR with a real json-data-provider playbook + collection, leaving the
  hermetic tier at mount/title + jest for row-count logic.

Row-count *logic* is already locked deterministically by the jest
view-controller test regardless of which path is chosen.

## Not done yet

- **Nothing is committed.** When the user OKs it, commit on `release/1.3.0`:
  - widget repo: `SPEC.md`, `HANDOFF.md`, `jest.config.js`, `tests/**`, and the
    1.3.0 bump (info.json + renamed controllers).
  - harness repo (separate commit): the 3 harness changes above. Note the harness
    repo does NOT track widget source (widgets-src is gitignored/symlinked), so
    these are independent commits in different repos.
  - Commit author = user, NO Claude attribution (per global instructions).
- An **edit-modal e2e** was scoped but not built — it's the more attainable real-
  DOM surface (config-driven, ui-select is already loaded in the harness) and a
  good next addition if more hermetic e2e coverage is wanted.
- `release_notes.md` still describes the 1.2.0 change; update it for 1.3.0 when
  the feature scope for this branch is decided.
