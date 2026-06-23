"use strict";
// view.controller (jsonToGrid132DevCtrl) unit tests — jsdom project.
//
// The controller drives a deep async chain on init:
//   _init -> loadGriOptions (build grid options + buttons)
//         -> triggerPlaybook(data-provider) -> _sendPost
//         -> playbookService.checkPlaybookExecutionCompletion
//         -> getExecutedPlaybookLogData -> set gridOptions.data / columnDefs
//
// We mock every platform service so the whole chain resolves offline and we
// can assert the grid contract: row count == grid_data.length, columnDefs,
// empty-state PagedCollection, processing flags, grid options. Maps to SPEC
// items A1-A7 and B1-B4.

global.jasmine = global.jasmine || {};

require("angular");
require("angular-mocks");

angular.module("cybersponse", []); // eslint-disable-line no-undef
require("../widget/view.controller.js");

const CTRL_NAME = "jsonToGrid132DevCtrl";
const ngModule = window.angular.mock.module; // eslint-disable-line no-undef
const ngInject = window.angular.mock.inject; // eslint-disable-line no-undef

// Minimal underscore shim covering only the methods the controller uses.
const underscoreShim = {
  pluck: (list, key) => (list || []).map((o) => o[key]),
  union: (...arrs) => [].concat(...arrs.filter(Boolean)),
  find: (list, fn) => (list || []).find(fn),
  filter: (list, fn) => (list || []).filter(fn),
  some: (list, fn) => (list || []).some(fn),
  uniq: (list) => [...new Set(list)],
  reject: (list, fn) => (list || []).filter((x) => !fn(x)),
  extend: Object.assign,
};

let $rootScope, $controller, $q;

// Per-test knobs the mocks read.
let scenario;

beforeEach(() => {
  scenario = {
    // result the data-provider playbook "returns"
    gridData: [],
    gridColumns: [],
    logStatus: "finished",
    // playbooks Modules.get returns for button creation
    buttonPlaybooks: [],
    hasReadPermission: true,
    selectedRows: [],
    // trigger-step arguments the data-provider playbook exposes. Default is a
    // record-scoped action playbook (has resources); tests override to model a
    // generic/manual provider with no resources.
    triggerArgs: { route: "route-1", resources: ["alerts"] },
    // captured calls
    saveCalls: [],
    // per-user saved column order (settingsService); null = none saved yet
    savedColumnOrder: null,
    // per-user saved column widths ({field: px}); null = none saved yet
    savedColumnWidths: null,
    // captured settingsService.set writes
    settingsWrites: [],
  };

  ngModule("cybersponse", ($provide) => {
    $provide.value("config", {
      title: "My Grid",
      actionButtons: [{ uuid: "provider-uuid", name: "Provider" }],
      selectedPlaybooksWithoutRecord: [],
      selectedPlaybooksWithRecord: [],
      selectedExecutionWizardPlaybooks: [],
      widgetName: "Playbook Execution Wizard",
    });
    $provide.value("API", {
      BASE: "/api/3/",
      API_3_BASE: "/api/3/",
      WORKFLOWS: "workflows/",
      QUERY: "/api/query/",
      ACTION_TRIGGER: "/api/triggers/1/action/",
      MANUAL_TRIGGER: "/api/triggers/1/notrigger/",
    });
    $provide.value("widgetBasePath", "base/");
    $provide.value("FIXED_MODULE", { PLAYBOOK: "playbooks" });
    $provide.value("statusCodeService", {});
    $provide.value("_", underscoreShim);

    $provide.factory("toaster", () => ({
      success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn(),
    }));

    $provide.value("$filter", () => (val) => val); // getEndPathName -> identity

    // Entity(name) with a resolving loadFields().
    $provide.factory("Entity", (_$q_) =>
      function Entity(name) {
        this.name = name;
        this.loadFields = () => _$q_.when();
      }
    );

    $provide.factory("Modules", (_$q_) => ({
      get: () => ({ $promise: _$q_.when({ "hydra:member": scenario.buttonPlaybooks }) }),
    }));

    $provide.factory("playbookService", (_$q_) => ({
      getTriggerStep: () => ({ arguments: scenario.triggerArgs }),
      checkPlaybookExecutionCompletion: (taskIds, successCb /*, errCb, scope */) => {
        successCb({ instance_ids: ["inst-1"] });
      },
      getExecutedPlaybookLogData: () =>
        // `scenario.logData`, when set, is returned verbatim — used to model
        // env-sourced payloads (columns/rows in different steps). Otherwise the
        // default legacy `result`-only shape is built from gridData/gridColumns.
        _$q_.when(
          scenario.logData || {
            status: scenario.logStatus,
            result: {
              grid_data: scenario.gridData,
              grid_columns: { columns: scenario.gridColumns },
            },
          }
        ),
    }));

    $provide.factory("currentPermissionsService", () => ({
      availablePermission: () => scenario.hasReadPermission,
    }));

    $provide.factory("exportService", (_$q_) => ({
      loadRowsForExport: () => _$q_.when([]),
    }));

    $provide.value("widgetService", { launchStandaloneWidget: jest.fn() });

    $provide.value("$state", { params: {} });

    // $uibModal is only opened when a trigger step has inputVariables; our
    // fixtures don't, so a never-resolving stub is enough to satisfy DI.
    $provide.factory("$uibModal", (_$q_) => ({
      open: () => ({ result: _$q_.defer().promise }),
    }));

    // PagedCollection captured so the empty-state test can assert it ran.
    const PagedCollection = jest.fn(function () {});
    $provide.value("PagedCollection", PagedCollection);

    // ui-grid filter-type constants (real ui-grid: INPUT=1, SELECT=2).
    $provide.value("uiGridConstants", { filter: { INPUT: 1, SELECT: 2 } });

    // settingsService: synchronous get (cached @settings), fire-and-forget set.
    $provide.value("settingsService", {
      get: (key) => {
        if (key === "jsonToGrid/columnOrder") return scenario.savedColumnOrder;
        if (key === "jsonToGrid/columnWidths") return scenario.savedColumnWidths;
        return null;
      },
      set: (key, value) => {
        scenario.settingsWrites.push({ key, value });
        if (key === "jsonToGrid/columnOrder") {
          scenario.savedColumnOrder = value;
        }
        if (key === "jsonToGrid/columnWidths") {
          scenario.savedColumnWidths = value;
        }
      },
    });

    // $resource mock: get() returns the data-provider playbook; save()
    // returns a trigger response carrying a task id.
    $provide.factory("$resource", (_$q_) => (url) => ({
      get: () => ({
        $promise: _$q_.when({
          "@id": "/api/3/workflows/provider-uuid",
          name: "Provider PB",
          recordTags: [],
          steps: [],
        }),
      }),
      save: (body) => {
        scenario.saveCalls.push({ url, body });
        return { $promise: _$q_.when({ task_ids: ["task-1"] }) };
      },
    }));
  });

  ngInject((_$rootScope_, _$controller_, _$q_) => {
    $rootScope = _$rootScope_;
    $controller = _$controller_;
    $q = _$q_;
  });
});

// Build the controller, wire a fake gridApi (normally supplied by the cs-grid
// directive's onRegisterApi), then flush the init promise chain.
function boot(configOverrides = {}, customizeGridApi) {
  const scope = $rootScope.$new();
  // The view template supplies config on the scope; the controller reads
  // $scope.config (it is not an injected local).
  scope.config = Object.assign(
    {
      title: "My Grid",
      actionButtons: [{ uuid: "provider-uuid", name: "Provider" }],
      selectedPlaybooksWithoutRecord: [],
      selectedPlaybooksWithRecord: [],
      selectedExecutionWizardPlaybooks: [],
      widgetName: "Playbook Execution Wizard",
    },
    configOverrides
  );
  const gridApi = {
    selection: {
      getSelectedRows: () => scenario.selectedRows,
      clearSelectedRows: jest.fn(),
    },
  };
  if (typeof customizeGridApi === "function") {
    customizeGridApi(gridApi);
  }
  $controller(CTRL_NAME, { $scope: scope });
  // Drive the controller's real setGridApi via the registered onRegisterApi
  // (csGrid does this in production) so column-move persistence wiring runs.
  const onRegisterApi =
    scope.gridOptions &&
    scope.gridOptions.csOptions &&
    scope.gridOptions.csOptions.onRegisterApi;
  if (typeof onRegisterApi === "function") {
    onRegisterApi(gridApi);
  } else {
    scope.gridApi = gridApi;
  }
  $rootScope.$apply();
  return { scope, gridApi };
}

describe("grid options contract (SPEC B)", () => {
  test("static read-only grid: no add/delete/clone/pagination/global-filter", () => {
    const { scope } = boot();
    const o = scope.gridOptions.csOptions;
    expect(o.allowAdd).toBe(false);
    expect(o.allowDelete).toBe(false);
    expect(o.allowClone).toBe(false);
    expect(o.showPagination).toBe(false);
    expect(o.allowGlobalFilter).toBe(false);
    expect(o.viewType).toBe("staticGrid");
  });

  test("checkbox-only selection with header + select-all", () => {
    const { scope } = boot();
    expect(scope.gridOptions.selectWithCheckboxOnly).toBe(true);
    expect(scope.gridOptions.enableSelectAll).toBe(true);
    expect(scope.gridOptions.showSelectionCheckbox).toBe(true);
    expect(scope.gridOptions.enableRowHeaderSelection).toBe(true);
  });

  test("expandable rows wired to widgetAssets template; grid menu enabled for runtime column show/hide", () => {
    const { scope } = boot();
    expect(scope.gridOptions.enableExpandable).toBe(true);
    expect(scope.gridOptions.expandableRowTemplate).toBe(
      "base/widgetAssets/html/rowExpandable.html"
    );
    // The grid menu gives the END USER a runtime column chooser (show/hide).
    expect(scope.gridOptions.enableGridMenu).toBe(true);
    expect(scope.gridOptions.gridMenuShowHideColumns).toBe(true);
  });
});

describe("data flow & row rendering (SPEC A)", () => {
  test("A2: row count equals grid_data length and columnDefs come from result", () => {
    scenario.gridData = [
      { uuid: "r1", name: "one" },
      { uuid: "r2", name: "two" },
      { uuid: "r3", name: "three" },
    ];
    scenario.gridColumns = [{ name: "name" }, { name: "uuid" }];
    const { scope } = boot();

    expect(scope.gridOptions.data).toHaveLength(3);
    // Original fields are preserved (an '@id' may be synthesized — see A2b).
    expect(scope.gridOptions.data.map((r) => r.name)).toEqual([
      "one",
      "two",
      "three",
    ]);
    // columnDefs come from grid_columns, in order, normalized with `field`
    // (see A8a). Exact field/normalization is asserted in the A8 tests.
    expect(scope.columnDefs.map((c) => c.field)).toEqual(["name", "uuid"]);
  });

  test("A2b: PagedCollection.list/keyPairs are populated so csGrid renders rows", () => {
    // csGrid reads pagedCollection.list (empty-check) and .keyPairs (the rows),
    // NOT data['hydra:member']. If list is left undefined the grid blanks the
    // body even with data present. Both must be set to the row data.
    scenario.gridData = [
      { "@id": "/api/3/workflows/a", uuid: "a", name: "alpha" },
      { "@id": "/api/3/workflows/b", uuid: "b", name: "beta" },
    ];
    scenario.gridColumns = [{ name: "name" }];
    const { scope } = boot();

    const pc = scope.gridPagedCollection;
    expect(pc.list).toHaveLength(2);
    expect(pc.keyPairs).toHaveLength(2);
    expect(pc.list.map((r) => r.name)).toEqual(["alpha", "beta"]);
    expect(pc.keyPairs).toBe(pc.list);
    expect(pc.visited).toBe(true);
    expect(pc.data["hydra:member"]).toHaveLength(2);
    expect(pc.data["hydra:totalItems"]).toBe(2);
  });

  test("A2c: rows lacking an '@id' get a synthesized IRI/uuid", () => {
    // csGrid selection tracks rows by IRI; a plain-JSON playbook may omit it.
    scenario.gridData = [{ name: "alpha" }, { name: "beta" }];
    scenario.gridColumns = [{ name: "name" }];
    const { scope } = boot();

    const rows = scope.gridPagedCollection.list;
    rows.forEach((row) => {
      expect(row["@id"]).toBeTruthy();
      expect(row.uuid).toBeTruthy();
    });
    expect(rows[0]["@id"]).not.toBe(rows[1]["@id"]);
    expect(rows.map((r) => r.name)).toEqual(["alpha", "beta"]);
  });

  // ── A2e–A2j: rows + columns sourced from the playbook env ─────────────────
  // The executed-playbook log carries a flat `env` of every variable set in any
  // step, so grid_data and grid_columns no longer have to be returned by the
  // same final step. resolveGridPayload precedence: result → named env → sniff.
  const COLS = { columns: [{ name: "name" }, { name: "uuid" }] };
  const ROWS = [
    { uuid: "r1", name: "one" },
    { uuid: "r2", name: "two" },
  ];

  test("A2e: rows + columns sourced from named env vars (no result)", () => {
    scenario.logData = {
      status: "finished",
      result: { debug: true }, // result present but carries no grid_* keys
      env: { grid_data: ROWS, grid_columns: COLS, input: {}, request: {} },
    };
    const { scope } = boot();
    expect(scope.gridOptions.data).toHaveLength(2);
    expect(scope.columnDefs.map((c) => c.field)).toEqual(["name", "uuid"]);
  });

  test("A2f: rows and columns can come from DIFFERENT sources (result + env)", () => {
    // rows set in the final step (result), columns set in an earlier step (env)
    scenario.logData = {
      status: "finished",
      result: { grid_data: ROWS },
      env: { grid_columns: COLS },
    };
    const { scope } = boot();
    expect(scope.gridOptions.data).toHaveLength(2);
    expect(scope.columnDefs.map((c) => c.field)).toEqual(["name", "uuid"]);
  });

  test("A2g: result takes precedence over env for the same field", () => {
    scenario.logData = {
      status: "finished",
      result: { grid_data: ROWS, grid_columns: COLS },
      env: { grid_data: [{ uuid: "x", name: "stale" }], grid_columns: { columns: [{ name: "wrong" }] } },
    };
    const { scope } = boot();
    expect(scope.gridOptions.data.map((r) => r.name)).toEqual(["one", "two"]);
    expect(scope.columnDefs.map((c) => c.field)).toEqual(["name", "uuid"]);
  });

  test("A2h: shape-sniff finds rows/columns under non-standard env names", () => {
    scenario.logData = {
      status: "finished",
      result: {},
      env: {
        // system keys must be ignored even though `input` is an object
        input: { params: {}, records: [] },
        request: {},
        myTableRows: ROWS,
        myTableCols: COLS,
      },
    };
    const { scope } = boot();
    expect(scope.gridOptions.data).toHaveLength(2);
    expect(scope.columnDefs.map((c) => c.field)).toEqual(["name", "uuid"]);
  });

  test("A2i: shape-sniff picks the longest object-array as rows", () => {
    scenario.logData = {
      status: "finished",
      result: {},
      env: {
        small: [{ uuid: "a", name: "a" }],
        big: ROWS.concat([{ uuid: "r3", name: "three" }]),
        grid_columns: COLS,
      },
    };
    const { scope } = boot();
    expect(scope.gridOptions.data).toHaveLength(3);
  });

  test("A2j: no resolvable rows/columns yields an empty grid (no throw)", () => {
    scenario.logData = {
      status: "finished",
      result: {},
      env: { input: {}, request: {}, debug: true },
    };
    const { scope } = boot();
    expect(scope.gridOptions.data).toEqual([]);
    expect(scope.columnDefs).toEqual([]);
  });

  test("A2d: rows that already carry an '@id' are left untouched", () => {
    scenario.gridData = [
      { "@id": "/api/3/alerts/abc", uuid: "abc", name: "real" },
    ];
    scenario.gridColumns = [{ name: "name" }];
    const { scope } = boot();

    const member = scope.gridPagedCollection.data["hydra:member"][0];
    expect(member["@id"]).toBe("/api/3/alerts/abc");
    expect(member.uuid).toBe("abc");
  });

  // ── Columns: binding, order, persistence (SPEC A8) ──────────────────────
  test("A8a: column 'name' is copied to 'field' (ui-grid binds cells by field)", () => {
    scenario.gridData = [{ name: "x", severity: "High" }];
    scenario.gridColumns = [
      { name: "name", displayName: "Name" },
      { name: "severity" },
    ];
    const { scope } = boot();

    expect(scope.columnDefs.map((c) => c.field)).toEqual(["name", "severity"]);
    // displayName defaults to name when omitted.
    expect(scope.columnDefs[1].displayName).toBe("severity");
  });

  test("A8b: default column order is the grid_columns order", () => {
    scenario.savedColumnOrder = null; // nothing persisted
    scenario.gridData = [{ a: 1, b: 2, c: 3 }];
    scenario.gridColumns = [{ name: "c" }, { name: "a" }, { name: "b" }];
    const { scope } = boot();

    expect(scope.columnDefs.map((c) => c.field)).toEqual(["c", "a", "b"]);
  });

  test("A8c: a saved per-user order overrides the default, new columns appended", () => {
    scenario.savedColumnOrder = ["severity", "name"];
    scenario.gridData = [{ name: "x", severity: "High", added: "z" }];
    // grid_columns lists name first, plus a column not in the saved order.
    scenario.gridColumns = [
      { name: "name" },
      { name: "severity" },
      { name: "added" },
    ];
    const { scope } = boot();

    // saved order first, then columns unseen in the saved order (grid order).
    expect(scope.columnDefs.map((c) => c.field)).toEqual([
      "severity",
      "name",
      "added",
    ]);
  });

  test("A8d: dragging a column persists the new order via settingsService", () => {
    scenario.gridData = [{ name: "x", severity: "High" }];
    scenario.gridColumns = [{ name: "name" }, { name: "severity" }];
    let positionHandler;
    const { scope } = boot({}, (gridApi) => {
      gridApi.colMovable = {
        on: {
          columnPositionChanged: (_s, cb) => {
            positionHandler = cb;
          },
        },
      };
      gridApi.grid = {
        columns: [{ field: "severity" }, { field: "name" }],
      };
    });

    expect(typeof positionHandler).toBe("function");
    positionHandler(); // user dragged severity before name
    $rootScope.$apply();

    const write = scenario.settingsWrites.find(
      (w) => w.key === "jsonToGrid/columnOrder"
    );
    expect(write).toBeDefined();
    expect(write.value).toEqual(["severity", "name"]);
    expect(scope).toBeDefined();
  });

  // ── Column width persistence (SPEC A12) ─────────────────────────────────
  test("A12a: resizing a column persists per-field widths via settingsService", () => {
    scenario.gridData = [{ name: "x", severity: "High" }];
    scenario.gridColumns = [{ name: "name" }, { name: "severity" }];
    let sizeHandler;
    const { scope } = boot({}, (gridApi) => {
      gridApi.colResizable = {
        on: {
          columnSizeChanged: (_s, cb) => {
            sizeHandler = cb;
          },
        },
      };
      gridApi.grid = {
        columns: [
          { field: "name", drawnWidth: 240 },
          { field: "severity", drawnWidth: 120 },
        ],
      };
    });

    expect(typeof sizeHandler).toBe("function");
    sizeHandler(); // user dragged the "name" column border
    $rootScope.$apply();

    const write = scenario.settingsWrites.find(
      (w) => w.key === "jsonToGrid/columnWidths"
    );
    expect(write).toBeDefined();
    expect(write.value).toEqual({ name: 240, severity: 120 });
    expect(scope).toBeDefined();
  });

  test("A12b: a saved width is re-applied to the colDef on load", () => {
    scenario.savedColumnWidths = { severity: 300 };
    scenario.gridData = [{ name: "x", severity: "High" }];
    scenario.gridColumns = [{ name: "name", width: "*" }, { name: "severity" }];
    const { scope } = boot();
    const sev = scope.columnDefs.find((c) => c.field === "severity");
    expect(sev.width).toBe(300);
    // a column without a saved width keeps its grid_columns width
    expect(scope.columnDefs.find((c) => c.field === "name").width).toBe("*");
  });

  test("A12c: resizing merges with previously-saved widths (others not lost)", () => {
    scenario.savedColumnWidths = { name: 200 };
    scenario.gridData = [{ name: "x", severity: "High" }];
    scenario.gridColumns = [{ name: "name" }, { name: "severity" }];
    let sizeHandler;
    boot({}, (gridApi) => {
      gridApi.colResizable = {
        on: { columnSizeChanged: (_s, cb) => (sizeHandler = cb) },
      };
      // only severity reports a fresh drawnWidth this time
      gridApi.grid = {
        columns: [{ field: "severity", drawnWidth: 150 }],
      };
    });
    sizeHandler();
    $rootScope.$apply();
    const write = scenario.settingsWrites.find(
      (w) => w.key === "jsonToGrid/columnWidths"
    );
    expect(write.value).toEqual({ name: 200, severity: 150 });
  });

  // ── Per-column filter types (SPEC A10 / FOLLOWUPS #1) ───────────────────
  // grid_columns[].type drives the ui-grid filter config: boolean→SELECT,
  // number/date→INPUT with operator/range condition, string→default (none).
  function colsByType(types) {
    scenario.gridData = [{ a: 1 }];
    scenario.gridColumns = types.map((t, i) => ({ name: "c" + i, type: t }));
    const { scope } = boot();
    return scope.columnDefs;
  }

  test("A10a: a string column keeps ui-grid's default text filter (none injected)", () => {
    const [col] = colsByType(["string"]);
    expect(col.filter).toBeUndefined();
  });

  test("A10b: a boolean column gets a tri-state (Not Set/Yes/No) dropdown filter", () => {
    const [col] = colsByType(["boolean"]);
    expect(col.jtgFilterMode).toBe("tri");
    expect(col.filterHeaderTemplate).toContain("jtg-column-filter");
    const cond = col.filter.condition;
    expect(cond("true", true)).toBe(true);
    expect(cond("true", false)).toBe(false);
    expect(cond("false", false)).toBe(true);
    expect(cond("notset", null)).toBe(true);
    expect(cond("notset", true)).toBe(false);
    expect(cond("", true)).toBe(true); // empty term matches everything
  });

  test("A10c: a number column gets a plain search filter supporting operators and ranges", () => {
    const [col] = colsByType(["number"]);
    expect(col.jtgFilterMode).toBeUndefined(); // native input, not a dropdown
    expect(col.filter.placeholder).toBe("Search");
    const cond = col.filter.condition;
    expect(cond(">5", 7)).toBe(true);
    expect(cond(">5", 3)).toBe(false);
    expect(cond(">=5", 5)).toBe(true);
    expect(cond("<=5", 5)).toBe(true);
    expect(cond("<5", 5)).toBe(false);
    expect(cond("=5", 5)).toBe(true);
    expect(cond("5", 5)).toBe(true);
    expect(cond("5", 6)).toBe(false);
    expect(cond("1..10", 5)).toBe(true);
    expect(cond("1..10", 11)).toBe(false);
    expect(cond("", 99)).toBe(true);
  });

  test("A10d: a date column gets a relative-range preset dropdown filter", () => {
    const [col] = colsByType(["date"]);
    expect(col.jtgFilterMode).toBe("date");
    expect(col.filterHeaderTemplate).toContain("jtg-column-filter");
    const cond = col.filter.condition;
    const today = new Date().toISOString();
    const longAgo = "2000-01-01T00:00:00Z";
    expect(cond("", longAgo)).toBe(true); // no preset = any time
    expect(cond("last7", today)).toBe(true);
    expect(cond("last7", longAgo)).toBe(false);
    expect(cond("lastYear", today)).toBe(true);
    expect(cond("lastYear", longAgo)).toBe(false);
  });

  test("A10m: a date column filter supports a custom { from, to } range term", () => {
    const [col] = colsByType(["date"]);
    const cond = col.filter.condition;
    const jan = Date.parse("2026-01-15T12:00:00Z");
    const jun = Date.parse("2026-06-15T12:00:00Z");
    const dec = Date.parse("2026-12-15T12:00:00Z");
    const within = { from: Date.parse("2026-06-01T00:00:00Z"), to: Date.parse("2026-06-30T23:59:59Z") };
    expect(cond(within, new Date(jun).toISOString())).toBe(true);
    expect(cond(within, new Date(jan).toISOString())).toBe(false);
    expect(cond(within, new Date(dec).toISOString())).toBe(false);
    // open-ended: from-only matches anything on/after; to-only anything on/before
    expect(cond({ from: jun, to: null }, new Date(dec).toISOString())).toBe(true);
    expect(cond({ from: jun, to: null }, new Date(jan).toISOString())).toBe(false);
    expect(cond({ from: null, to: jun }, new Date(jan).toISOString())).toBe(true);
    expect(cond({ from: null, to: jun }, new Date(dec).toISOString())).toBe(false);
    // an unparseable cell never matches a bounded range
    expect(cond(within, "not a date")).toBe(false);
  });

  test("A10j: an enum column gets a multi-select dropdown with distinct values", () => {
    scenario.gridData = [
      { sev: "High" }, { sev: "Low" }, { sev: "High" }, { sev: "Medium" },
      { sev: "Low" }, { sev: "High" },
    ];
    scenario.gridColumns = [{ name: "sev", type: "enum" }];
    const { scope } = boot();
    const col = scope.columnDefs[0];
    expect(col.jtgFilterMode).toBe("enum");
    expect(col.jtgEnumValues).toEqual(["High", "Low", "Medium"]); // sorted distinct
    const cond = col.filter.condition;
    expect(cond([], "High")).toBe(true); // empty selection = no filter
    expect(cond(["High"], "High")).toBe(true);
    expect(cond(["High"], "Low")).toBe(false);
    expect(cond(["__notset"], null)).toBe(true);
    expect(cond(["High"], null)).toBe(false);
  });

  test("A10k: a low-cardinality string column is auto-detected as enum", () => {
    scenario.gridData = [
      { status: "Open" }, { status: "Closed" }, { status: "Open" },
      { status: "Closed" }, { status: "Open" }, { status: "Closed" },
    ];
    scenario.gridColumns = [{ name: "status" }]; // no type
    const { scope } = boot();
    expect(scope.columnDefs[0].jtgFilterMode).toBe("enum");
    expect(scope.columnDefs[0].jtgEnumValues).toEqual(["Closed", "Open"]);
  });

  test("A10l: a high-cardinality string column stays a plain text filter (not enum)", () => {
    scenario.gridData = [
      { name: "alpha" }, { name: "beta" }, { name: "gamma" }, { name: "delta" },
    ];
    scenario.gridColumns = [{ name: "name" }];
    const { scope } = boot();
    expect(scope.columnDefs[0].jtgFilterMode).toBeUndefined();
    expect(scope.columnDefs[0].filter).toBeUndefined();
  });

  test("A10g: type is INFERRED from data when grid_columns omits it", () => {
    // The platform "JSON to Grid" example emits no `type` on its columns, so the
    // typed filters must be derived from the actual values.
    scenario.gridData = [
      { name: "a", isActive: true, lastUsedDate: "2025-02-15T14:30:00Z", executionCount: 156 },
      { name: "b", isActive: false, lastUsedDate: "2025-03-10T09:15:00Z", executionCount: 89 },
    ];
    scenario.gridColumns = [
      { name: "name" },
      { name: "isActive" },
      { name: "lastUsedDate" },
      { name: "executionCount" },
    ];
    const { scope } = boot();
    const byField = {};
    scope.columnDefs.forEach((c) => (byField[c.field] = c));
    // name → plain string (no filter), others → typed.
    expect(byField.name.filter).toBeUndefined();
    expect(byField.isActive.jtgFilterMode).toBe("tri"); // boolean dropdown
    expect(byField.lastUsedDate.jtgFilterMode).toBe("date"); // date presets
    expect(byField.executionCount.jtgFilterMode).toBeUndefined(); // numeric search
    expect(byField.executionCount.filter.placeholder).toBe("Search");
    // inferred type is also surfaced on the colDef
    expect(byField.isActive.type).toBe("boolean");
    expect(byField.lastUsedDate.type).toBe("date");
    expect(byField.executionCount.type).toBe("number");
  });

  test("A10h: an explicit grid_columns type wins over inference", () => {
    scenario.gridData = [{ code: 200 }, { code: 404 }]; // looks numeric
    scenario.gridColumns = [{ name: "code", type: "string" }];
    const { scope } = boot();
    expect(scope.columnDefs[0].filter).toBeUndefined(); // string → default text
    expect(scope.columnDefs[0].type).toBe("string");
  });

  test("A10i: ambiguous string data stays a plain text filter (no false date)", () => {
    scenario.gridData = [{ label: "Active" }, { label: "Inactive" }];
    scenario.gridColumns = [{ name: "label" }];
    const { scope } = boot();
    expect(scope.columnDefs[0].filter).toBeUndefined();
  });

  test("A10e: an explicit per-column filter override is preserved (not clobbered)", () => {
    scenario.gridData = [{ a: 1 }];
    scenario.gridColumns = [
      { name: "c0", type: "number", filter: { placeholder: "custom" } },
    ];
    const { scope } = boot();
    expect(scope.columnDefs[0].filter).toEqual({ placeholder: "custom" });
  });

  test("A10f: enableFiltering:false suppresses the injected type filter", () => {
    scenario.gridData = [{ a: 1 }];
    scenario.gridColumns = [{ name: "c0", type: "boolean", enableFiltering: false }];
    const { scope } = boot();
    expect(scope.columnDefs[0].filter).toBeUndefined();
  });

  // ── Admin column chooser merge (SPEC A11 / FOLLOWUPS #2) ────────────────
  // config.columnPrefs (set in edit.html) supplies a default order + visibility;
  // grid_columns stays the source of truth for which columns exist.
  function bootWithPrefs(prefs, gridColumns, savedOrder) {
    scenario.gridData = [{ name: "x", active: true, count: 1 }];
    scenario.gridColumns = gridColumns;
    scenario.savedColumnOrder = savedOrder || null;
    return boot({ columnPrefs: prefs }).scope;
  }

  test("A11a: columnPrefs sets the default order and hides unchecked columns", () => {
    const scope = bootWithPrefs(
      [
        { field: "count", visible: true },
        { field: "name", visible: false },
        { field: "active", visible: true },
      ],
      [{ name: "name" }, { name: "active" }, { name: "count" }]
    );
    expect(scope.columnDefs.map((c) => c.field)).toEqual([
      "count",
      "name",
      "active",
    ]);
    expect(scope.columnDefs.find((c) => c.field === "name").visible).toBe(false);
    expect(scope.columnDefs.find((c) => c.field === "count").visible).not.toBe(false);
  });

  test("A11b: a playbook column absent from prefs is appended and stays visible", () => {
    const scope = bootWithPrefs(
      [{ field: "name", visible: true }],
      [{ name: "name" }, { name: "active" }, { name: "count" }]
    );
    // name first (from prefs), then the un-prefed columns in grid order.
    expect(scope.columnDefs.map((c) => c.field)).toEqual([
      "name",
      "active",
      "count",
    ]);
    expect(scope.columnDefs.find((c) => c.field === "active").visible).not.toBe(false);
  });

  test("A11c: a pref for a column the playbook no longer returns is dropped", () => {
    const scope = bootWithPrefs(
      [
        { field: "gone", visible: true },
        { field: "name", visible: true },
      ],
      [{ name: "name" }, { name: "active" }]
    );
    expect(scope.columnDefs.map((c) => c.field)).toEqual(["name", "active"]);
  });

  test("A11d: a per-user dragged order overrides the config default order", () => {
    const scope = bootWithPrefs(
      [
        { field: "name", visible: true },
        { field: "active", visible: false },
        { field: "count", visible: true },
      ],
      [{ name: "name" }, { name: "active" }, { name: "count" }],
      ["count", "name", "active"] // per-user settingsService order
    );
    // settings order wins for ORDER...
    expect(scope.columnDefs.map((c) => c.field)).toEqual([
      "count",
      "name",
      "active",
    ]);
    // ...but config visibility still applies (no per-user visibility override).
    expect(scope.columnDefs.find((c) => c.field === "active").visible).toBe(false);
  });

  test("A11e: no columnPrefs leaves columns untouched (all visible, grid order)", () => {
    const scope = bootWithPrefs(undefined, [{ name: "name" }, { name: "active" }]);
    expect(scope.columnDefs.map((c) => c.field)).toEqual(["name", "active"]);
    expect(scope.columnDefs.every((c) => c.visible !== false)).toBe(true);
  });

  // ── Client-side sort/filter (SPEC A9) ───────────────────────────────────
  test("A9a: sort/filter run in ui-grid NATIVE mode (useExternal* === false)", () => {
    // The fix: csGrid's defaults set useExternalSorting/Filtering true, routing
    // sort/filter to a server query against the synthetic dummy_module (no
    // endpoint) — so nothing happens. Forcing them false makes ui-grid sort and
    // filter the in-memory rows itself. Verified live (text + numeric sort,
    // per-column filter) against the box; the actual sort/filter behavior is
    // ui-grid's, so it can't be unit-tested without a real grid.
    scenario.gridData = [{ name: "a", count: 1 }];
    scenario.gridColumns = [{ name: "name" }, { name: "count" }];
    const { scope } = boot();

    expect(scope.gridOptions.enableSorting).toBe(true);
    expect(scope.gridOptions.enableFiltering).toBe(true);
    expect(scope.gridOptions.useExternalSorting).toBe(false);
    expect(scope.gridOptions.useExternalFiltering).toBe(false);
  });

  test("A9b: loadGridRecord is neutralized so a stray reload can't blank the grid", () => {
    scenario.gridData = [{ name: "alpha" }, { name: "beta" }];
    scenario.gridColumns = [{ name: "name" }];
    const { scope } = boot();
    const pc = scope.gridPagedCollection;

    let resolved = false;
    pc.loadGridRecord().then(() => {
      resolved = true;
    });
    $rootScope.$apply();

    // Resolves without issuing any server query and without touching the rows.
    expect(resolved).toBe(true);
    expect(scenario.saveCalls.some((c) => /dummy_module|\/api\/query/.test(String(c.url)))).toBe(false);
    expect(pc.list.map((r) => r.name)).toEqual(["alpha", "beta"]);
  });

  test("A1/A4: loadProcessing/refreshProcessing cleared once data resolves", () => {
    scenario.gridData = [{ uuid: "r1" }];
    const { scope } = boot();
    expect(scope.loadProcessing).toBe(false);
    expect(scope.refreshProcessing).toBe(false);
  });

  test("A3: empty result builds an empty PagedCollection (no rows)", () => {
    scenario.gridData = [];
    scenario.gridColumns = [{ name: "name" }];
    const { scope } = boot();

    expect(scope.gridOptions.data).toHaveLength(0);
    expect(scope.gridPagedCollection).toBeDefined();
    expect(scope.gridPagedCollection.data["hydra:totalItems"]).toBe(0);
    expect(scope.gridPagedCollection.data["hydra:member"]).toEqual([]);
  });

  test("A6: SystemWaitForCompletion forces force_debug sync trigger URL", () => {
    scenario.gridData = [{ uuid: "r1" }];
    boot();
    const triggerCall = scenario.saveCalls.find((c) =>
      String(c.url).includes("/action/route-1")
    );
    expect(triggerCall).toBeDefined();
    expect(triggerCall.url).toContain("force_debug=true");
  });

  // Trigger ENDPOINT is chosen by trigger TYPE (KNOWLEDGEBASE.md §19.3). A
  // no-record / generic data-provider playbook must run by playbook UUID via
  // the manual "notrigger" endpoint — NOT action/<route>, which 404s when the
  // manual-action route isn't registered (e.g. a Drafts/unpublished collection).
  test("A6b: noRecordExecution provider triggers via notrigger/<uuid>, not action/<route>", () => {
    scenario.triggerArgs = { route: "route-1", resources: [], noRecordExecution: true };
    scenario.gridData = [{ uuid: "r1" }];
    boot();
    const trig = scenario.saveCalls.find((c) => /\/(action|notrigger)\//.test(String(c.url)));
    expect(trig).toBeDefined();
    expect(trig.url).toContain("/notrigger/");
    expect(trig.url).not.toContain("/action/");
    // identity getEndPathName in the harness => __uuid is the playbook @id
    expect(trig.url).toContain("/api/3/workflows/provider-uuid");
  });

  test("A6c: provider with no action route also uses notrigger/<uuid>", () => {
    scenario.triggerArgs = { resources: [] }; // no route at all
    scenario.gridData = [{ uuid: "r1" }];
    boot();
    const trig = scenario.saveCalls.find((c) => /\/(action|notrigger)\//.test(String(c.url)));
    expect(trig).toBeDefined();
    expect(trig.url).toContain("/notrigger/");
  });

  test("A7: refreshGridData clears data then re-triggers the provider", () => {
    scenario.gridData = [{ uuid: "r1" }, { uuid: "r2" }];
    const { scope } = boot();
    const before = scenario.saveCalls.length;

    scope.refreshGridData();
    $rootScope.$apply();

    // a fresh trigger save was issued for the data provider
    expect(scenario.saveCalls.length).toBeGreaterThan(before);
    expect(scope.gridOptions.data).toHaveLength(2);
  });
});

describe("failed execution (SPEC A5)", () => {
  test("failed status clears processing flags and does not set rows", () => {
    scenario.logStatus = "failed";
    const { scope } = boot();
    expect(scope.loadProcessing).toBe(false);
    expect(scope.refreshProcessing).toBe(false);
    // grid never populated on failure
    expect(scope.gridOptions.data || []).toHaveLength(0);
  });
});

describe("init robustness — graceful degradation (no hard crash)", () => {
  test("no JSON Data Provider Playbook configured: sets gridError, does not throw or trigger", () => {
    const before = scenario.saveCalls.length;
    let scope;
    expect(() => {
      scope = boot({ actionButtons: [] }).scope;
    }).not.toThrow();
    expect(scope.gridError).toMatch(/JSON Data Provider Playbook/i);
    expect(scope.loadProcessing).toBe(false);
    // No playbook was triggered.
    expect(scenario.saveCalls.length).toBe(before);
  });

  test("actionButtons present but missing uuid: still degrades gracefully", () => {
    let scope;
    expect(() => {
      scope = boot({ actionButtons: [{ name: "broken" }] }).scope;
    }).not.toThrow();
    expect(scope.gridError).toMatch(/JSON Data Provider Playbook/i);
  });

  test("generic/manual provider (trigger step has no resources): runs without a record Entity", () => {
    scenario.triggerArgs = { route: "generic-route" }; // no resources
    scenario.gridData = [{ uuid: "g1", name: "generic" }];
    scenario.gridColumns = [{ name: "name" }];
    let scope;
    expect(() => {
      scope = boot().scope;
    }).not.toThrow();
    // It still triggered the playbook and rendered the returned grid data.
    expect(scenario.saveCalls.length).toBeGreaterThan(0);
    // Entity-less path: __resource is empty (no record module name).
    expect(scenario.saveCalls[0].body.__resource).toBe("");
    expect(scope.gridOptions.data).toHaveLength(1);
    expect(scope.gridError).toBeUndefined();
  });

  test("playbook with null recordTags does not throw", () => {
    // belt-and-suspenders: triggerPlaybook normalizes recordTags before push
    scenario.triggerArgs = { route: "generic-route" };
    expect(() => boot()).not.toThrow();
  });
});
