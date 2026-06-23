"use strict";
// E2E for the JSON-to-Grid widget — hermetic mock tier.
//
// The view widget is execution-driven: every rendered row comes from a
// playbook the platform runs and returns as `grid_data`. To stay box-
// independent we intercept the widget's platform API calls in the browser
// (page.route) and feed canned responses, then assert the REAL grid DOM:
// row count == grid_data.length, columns, and the empty/loading states.
//
// Discovered endpoints (captured once via the recorder below, then pinned):
//   GET  /api/3/workflows/<uuid>?...     -> the data-provider / action playbook
//   GET  /api/wf/workflows?...           -> Modules.get button-playbook export
//   POST /api/triggers/1/action/<route>  -> trigger execution (returns task id)
//   ...  playbook-execution-log reads    -> resolve to {status:finished,result}
//
// Run: make test-e2e-spec SPEC="../widgets-src/widget-json-to-grid/tests/e2e/jsonToGrid.spec.js"

const { test, expect } = require("../../../../fortisoar-widget-harness/tests/e2e/_isolated");
const { waitForRender, settleRender } = require("../../../../fortisoar-widget-harness/tests/e2e/_render");

const PROVIDER_UUID = "11111111-1111-1111-1111-111111111111";
const TRIGGER_ROUTE = "json-grid-route";

// A data-provider playbook the GET /workflows/<uuid> stub returns.
function providerPlaybook(uuid) {
  return {
    "@id": "/api/3/workflows/" + uuid,
    "@type": "Workflow",
    uuid,
    name: "JSON Grid Provider",
    recordTags: [],
    triggerStep: "/api/3/workflow_steps/step-1",
    steps: [
      {
        "@id": "/api/3/workflow_steps/step-1",
        uuid: "step-1",
        arguments: {
          title: "Refresh",
          route: TRIGGER_ROUTE,
          resources: ["alerts"],
        },
      },
    ],
  };
}

// The execution-log result that drives the grid. rows -> grid_data. An optional
// `columns` overrides the default two-column set (used by the filter tests to
// drive typed columns).
function gridResult(rows, columns) {
  return {
    status: "finished",
    result: {
      grid_data: rows,
      grid_columns: {
        columns: columns || [
          { name: "name", displayName: "Name" },
          { name: "severity", displayName: "Severity" },
        ],
      },
    },
  };
}

async function resolveId(request) {
  const resp = await request.get(`/_fsr/widgets`);
  const data = await resp.json();
  const w = (data.widgets || data).find((x) => x.name === "jsonToGrid");
  if (!w) throw new Error("jsonToGrid not discovered by the harness");
  return w.id;
}

// Intercept every widget API call and serve canned data. `rows` is the grid
// payload under test. Set RECORD=1 to log unmatched calls instead of failing,
// which is how the endpoint list above was discovered.
// Instance id the poll hands back; getExecutedPlaybookLogData fetches it.
const INSTANCE_ID = 777;

async function stubApi(page, rows, columns) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    // 1. Trigger POST -> task id. Two endpoints by trigger type:
    //    record-context action  …/triggers/1/action/<route>
    //    generic/no-record run  …/triggers/1/notrigger/<playbookUuid>
    if (/\/(action|notrigger)\//.test(url) && method === "POST") {
      return json({ task_ids: ["task-1"], task_id: "task-1" });
    }
    // 2. checkPlaybookExecutionCompletion poll (no websocket in the harness, so
    //    it HTTP-polls log_list). Report the task finished and hand back an
    //    @id the platform parses into the instance id.
    if (/log_list/.test(url)) {
      return json({
        "hydra:member": [
          { status: "finished", task_id: "task-1", "@id": "/wf/api/workflows/" + INSTANCE_ID },
        ],
      });
    }
    // 3. getExecutedPlaybookLogData -> GET api/wf/api/workflows/<numeric id>/.
    //    Resolves to the finished log carrying grid_data/grid_columns.
    if (new RegExp("/api/workflows/" + INSTANCE_ID + "\\b").test(url) && method === "GET") {
      return json(gridResult(rows, columns));
    }
    // 4. Data-provider / action playbook fetched by uuid (/api/3/workflows/<uuid>).
    if (/\/workflows\/[0-9a-f-]{36}/i.test(url)) {
      return json(providerPlaybook(PROVIDER_UUID));
    }
    // 5. Modules.get button-playbook export & any other workflows list — none.
    if (/\/workflows(\/)?(\?|$)/.test(url)) {
      return json({ "hydra:member": [], "hydra:totalItems": 0 });
    }
    // 6. solutionpacks search (wizard version lookup).
    if (/solutionpacks/.test(url)) {
      return json({ "hydra:member": [] });
    }
    if (process.env.RECORD) {
      // eslint-disable-next-line no-console
      console.log(`[UNMATCHED] ${method} ${url}`);
    }
    // Everything else is platform boot (model_metadatas, actors, fixtures,
    // locale bundles …). Let it reach the harness so its hermetic stubs (or
    // benign 599s) handle it — intercepting these empties the AngularJS
    // bootstrap and the widget never mounts.
    return route.continue();
  });
}

async function mountView(page, id, rows, configOverrides = {}, columns) {
  await stubApi(page, rows, columns);
  const config = Object.assign(
    {
      title: "Change Requests",
      actionButtons: [{ uuid: PROVIDER_UUID, name: "JSON Grid Provider" }],
      selectedPlaybooksWithoutRecord: [],
      selectedPlaybooksWithRecord: [],
      selectedExecutionWizardPlaybooks: [],
      widgetName: "Playbook Execution Wizard",
    },
    configOverrides
  );
  await page.addInitScript(
    (args) => {
      localStorage.setItem("harness.widget", args.id);
      localStorage.setItem("harness.ctx", "dashboard");
      localStorage.setItem("harness:config:" + args.id, JSON.stringify(args.config));
    },
    { id, config }
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Deterministic render gate (harness P0/P1): wait for the mount to reach a
  // terminal phase and drain the digest/$http/$timeout queues, so the grid's
  // execution-driven render (including the empty "No Results Found" path) has
  // caught up before any assertion. Replaces per-test timeout races.
  await waitForRender(page);
}

test.describe("jsonToGrid — view", () => {
  let id;
  test.beforeAll(async ({ request }) => {
    id = await resolveId(request);
  });

  test("renders the configured title", async ({ page }) => {
    await mountView(page, id, []);
    await expect(page.locator(".widget h5", { hasText: "Change Requests" })).toBeVisible({
      timeout: 20000,
    });
  });

  // ── Grid-data rendering — real DOM coverage ──────────────────────────────
  // These drive the full execution chain (trigger → log_list poll →
  // getExecutedPlaybookLogData → gridOptions.data) and assert the rendered
  // ui-grid. They depend on two harness build-outs (added for grid widgets):
  //   1. angular-ui-grid (uiGridConstants) — loaded from CDN in the harness
  //      index.html and registered in HARNESS_VENDOR_DEPS, so csGrid resolves
  //      and renders .ui-grid-row.
  //   2. system fixtures — the harness hermetic /api/system/fixtures stub serves
  //      the real snapshot (fsr_src/system_fixtures.json), so metadata.picklists
  //      is set and Entity.loadFields() resolves (loadProcessing clears).
  // The row-count *logic* is also locked deterministically by
  // tests/view.controller.test.js ("row count equals grid_data length");
  // these add real-DOM confirmation.
  test("empty grid_data shows the No Results Found state", async ({ page }) => {
    await mountView(page, id, []);
    await expect(page.getByText("No Results Found")).toBeVisible({ timeout: 20000 });
  });

  test("renders one grid row per grid_data item", async ({ page }) => {
    const rows = [
      { name: "CR-1", severity: "High" },
      { name: "CR-2", severity: "Low" },
      { name: "CR-3", severity: "Medium" },
    ];
    await mountView(page, id, rows);
    // ui-grid renders the row set once per render container (a left/pinned
    // container plus the body container), so `.ui-grid-row` appears twice per
    // data row. Scope to the body render container for the true one-row-per-item
    // count.
    const gridRows = page.locator(
      ".grid-widget-container .ui-grid-render-container-body .ui-grid-row"
    );
    await expect(gridRows).toHaveCount(3, { timeout: 20000 });
  });

  // ── Coloring diagnostic ───────────────────────────────────────────────────
  // Dumps computed background/text colors for each row and the grid host so we
  // can pin down whether the ui-grid stripe CSS is fighting the dark-theme text
  // color. Not a pass/fail assertion — just structured output for analysis.
  test("DIAG: dump row computed styles for coloring investigation", async ({ page }) => {
    const rows = [
      { name: "CR-1", severity: "High" },
      { name: "CR-2", severity: "Low" },
      { name: "CR-3", severity: "Medium" },
    ];
    await mountView(page, id, rows);

    // Wait for rows to render.
    await expect(
      page.locator(".grid-widget-container .ui-grid-render-container-body .ui-grid-row")
    ).toHaveCount(3, { timeout: 20000 });

    const diag = await page.evaluate(() => {
      function styleOf(el) {
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          className: el.className,
        };
      }

      const gridHost = document.querySelector(".grid-widget-container [data-cs-grid], .grid-widget-container .ui-grid");
      const rows = Array.from(
        document.querySelectorAll(".grid-widget-container .ui-grid-render-container-body .ui-grid-row")
      );
      const nameCells = Array.from(
        document.querySelectorAll(".grid-widget-container .ui-grid-render-container-body .ui-grid-row .ui-grid-cell:first-child")
      );

      // Try to read gridOptions.lightMode from the Angular scope.
      let lightMode = "(scope unavailable)";
      try {
        const gridEl = document.querySelector("[data-cs-grid], .ui-grid[ui-grid]");
        if (gridEl && window.angular) {
          const scope = window.angular.element(gridEl).scope();
          lightMode = scope && scope.gridOptions ? scope.gridOptions.lightMode : "(no gridOptions)";
        }
      } catch (e) {
        lightMode = "(error: " + e.message + ")";
      }

      // Enumerate stylesheets with their CSSOM index (order determines cascade winner).
      // Hermetic runs always show soarSheets=[] — that is expected; theme fidelity
      // is a live-harness concern (see TESTING.md §"Two tiers").
      const sheets = Array.from(document.styleSheets).map((s, i) => {
        try { return { i, href: s.href || "(inline)" }; } catch (e) { return { i, href: "(cross-origin)" }; }
      });
      const soarSheets = sheets
        .filter((s) => /css\/themes\/|css\/style|node_modules\/angular-ui-grid\/ui-grid\.min\.[a-f0-9]+/.test(s.href))
        .map((s) => s.i + ":" + s.href.replace(/^https?:\/\/[^/]+\//, ""));

      // Find CDN ui-grid sheet index so we can compare with steel theme index.
      const cdnUiGridSheet = sheets.find((s) => /angular-ui-grid\/[^/]+\/ui-grid\.min\.css/.test(s.href));

      return {
        gridHost: styleOf(gridHost),
        lightMode,
        rows: rows.map((r, i) => ({ index: i, ...styleOf(r) })),
        nameCells: nameCells.map((c, i) => ({ index: i, ...styleOf(c) })),
        soarStylesheets: soarSheets,
        cdnUiGridSheetIndex: cdnUiGridSheet ? cdnUiGridSheet.i : "(not loaded)",
        note: soarSheets.length === 0
          ? "HERMETIC: no SOAR CSS loaded — cell backgrounds will be CDN defaults (#fdfdfd/#f3f3f3). This is expected. Run live harness browser to check theme."
          : "SOAR CSS loaded. If steel theme index > cdnUiGridSheetIndex, theming should win.",
        allStylesheetCount: sheets.length,
      };
    });

    // Print structured output — visible in `make test-e2e-spec` console output.
    console.log("\n=== COLORING DIAG ===");
    console.log(JSON.stringify(diag, null, 2));
    console.log("=== END DIAG ===\n");

    // Soft assertion so the test always passes (it's diagnostic-only).
    expect(diag.rows.length).toBe(3);
  });

  // ── FortiSOAR-style dropdown filters (real DOM) ──────────────────────────
  const bodyRowsLoc = (page) =>
    page.locator(".grid-widget-container .ui-grid-render-container-body .ui-grid-row");

  test("boolean column renders a Yes/No/Not Set dropdown that filters rows", async ({ page }) => {
    const rows = [
      { name: "A", active: true },
      { name: "B", active: false },
      { name: "C", active: true },
    ];
    const columns = [{ name: "name" }, { name: "active", type: "boolean" }];
    await mountView(page, id, rows, {}, columns);

    const bodyRows = bodyRowsLoc(page);
    await expect(bodyRows).toHaveCount(3, { timeout: 20000 });

    // Exactly one custom dropdown toggle (the boolean column; "name" keeps the
    // native text filter).
    const toggle = page.locator(".jtg-toggle");
    await expect(toggle).toHaveCount(1);
    await toggle.click();

    const menu = page.locator(".jtg-menu");
    await expect(menu).toBeVisible();
    await menu.getByText("Yes", { exact: true }).click();

    // Only the two active=true rows remain.
    await expect(bodyRows).toHaveCount(2, { timeout: 10000 });
  });

  test("enum column renders a multi-select checklist with Apply that filters rows", async ({ page }) => {
    const rows = [
      { sev: "High" },
      { sev: "Low" },
      { sev: "High" },
      { sev: "Medium" },
    ];
    const columns = [{ name: "sev", type: "enum" }];
    await mountView(page, id, rows, {}, columns);

    const bodyRows = bodyRowsLoc(page);
    await expect(bodyRows).toHaveCount(4, { timeout: 20000 });

    await page.locator(".jtg-toggle").click();
    const menu = page.locator(".jtg-menu");
    await expect(menu).toBeVisible();

    // Select "High" and Apply.
    await menu.locator("label.jtg-check", { hasText: "High" }).locator("input").check();
    await menu.getByRole("button", { name: /Apply/ }).click();

    // Two "High" rows remain.
    await expect(bodyRows).toHaveCount(2, { timeout: 10000 });
  });

  test("date column Custom Range filters rows to the selected From/To window", async ({ page }) => {
    // Rows on days 5/15/25 of the current month so the default calendar view
    // (no model date => current month) shows all three days as in-month cells.
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const mk = (d) => new Date(Date.UTC(y, m, d, 12)).toISOString();
    const rows = [
      { name: "A", when: mk(5) },
      { name: "B", when: mk(15) },
      { name: "C", when: mk(25) },
    ];
    const columns = [{ name: "name" }, { name: "when", type: "date" }];
    await mountView(page, id, rows, {}, columns);

    const bodyRows = bodyRowsLoc(page);
    await expect(bodyRows).toHaveCount(3, { timeout: 20000 });

    await page.locator(".jtg-toggle").click();
    const menu = page.locator(".jtg-menu");
    await expect(menu).toBeVisible();

    await menu.getByText("Custom Range", { exact: false }).click();

    // Opens the "Define Custom Date Range" popup ($uibModal, appended to body).
    const modal = page.locator(".jtg-range");
    await expect(modal).toBeVisible();
    const cols = modal.locator(".jtg-range-col");
    await expect(cols).toHaveCount(2);

    // From = day 10, To = day 20 (both current-month cells) => only day-15 row.
    // uib-datepicker day buttons carry a full-date aria-label, so match the
    // visible in-month day-number <span> (out-of-month spans are .text-muted).
    const day = (col, n) =>
      col.locator("button", { has: page.locator(`span:not(.text-muted):text-is("${n}")`) }).first();
    await day(cols.nth(0), 10).click();
    await day(cols.nth(1), 20).click();
    await modal.getByRole("button", { name: /Apply/ }).click();

    await expect(bodyRows).toHaveCount(1, { timeout: 10000 });
  });

});
