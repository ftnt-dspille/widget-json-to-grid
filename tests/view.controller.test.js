"use strict";
// view.controller (jsonToGrid130DevCtrl) unit tests — jsdom project.
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

const CTRL_NAME = "jsonToGrid130DevCtrl";
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
    // captured calls
    saveCalls: [],
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
      getTriggerStep: () => ({
        arguments: { route: "route-1", resources: ["alerts"] },
      }),
      checkPlaybookExecutionCompletion: (taskIds, successCb /*, errCb, scope */) => {
        successCb({ instance_ids: ["inst-1"] });
      },
      getExecutedPlaybookLogData: () =>
        _$q_.when({
          status: scenario.logStatus,
          result: {
            grid_data: scenario.gridData,
            grid_columns: { columns: scenario.gridColumns },
          },
        }),
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
function boot(configOverrides = {}) {
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
  $controller(CTRL_NAME, { $scope: scope });
  scope.gridApi = gridApi; // setGridApi() would normally do this
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

  test("expandable rows wired to widgetAssets template; grid menu disabled", () => {
    const { scope } = boot();
    expect(scope.gridOptions.enableExpandable).toBe(true);
    expect(scope.gridOptions.expandableRowTemplate).toBe(
      "base/widgetAssets/html/rowExpandable.html"
    );
    expect(scope.gridOptions.enableGridMenu).toBe(false);
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
    expect(scope.gridOptions.data).toEqual(scenario.gridData);
    expect(scope.columnDefs).toEqual(scenario.gridColumns);
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
