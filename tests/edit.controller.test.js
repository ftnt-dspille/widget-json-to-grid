"use strict";
// edit.controller (editJsonToGrid150DevCtrl) unit tests — jsdom project.
//
// The edit controller is pure config manipulation (no async grid chain), so
// these tests construct it with injected locals and assert the config model
// directly. Maps to SPEC items D1-D7.

global.jasmine = global.jasmine || {};

require("angular");
require("angular-mocks");

angular.module("cybersponse", []); // eslint-disable-line no-undef
require("../widget/edit.controller.js");

const CTRL_NAME = "editJsonToGrid150DevCtrl";
const ngModule = window.angular.mock.module; // eslint-disable-line no-undef
const ngInject = window.angular.mock.inject; // eslint-disable-line no-undef

const underscoreShim = {
  reject: (list, fn) => (list || []).filter((x) => !fn(x)),
};

let $rootScope, $controller, $q, modalInstance, resourceGet, scenario;

beforeEach(() => {
  modalInstance = { close: jest.fn(), dismiss: jest.fn() };
  resourceGet = jest.fn();

  // Column-discovery knobs (SPEC D8). Default models a healthy provider that
  // finishes and returns three typed columns.
  scenario = {
    hasReadPermission: true,
    triggerStep: { arguments: { route: "route-1", resources: ["alerts"] } },
    saveResponse: { task_ids: ["task-1"] },
    logData: {
      status: "finished",
      result: {
        grid_columns: {
          columns: [
            { name: "name", type: "string" },
            { name: "active", type: "boolean" },
            { name: "count", type: "number" },
          ],
        },
      },
    },
    saveCalls: [],
    toasts: [],
  };

  ngModule("cybersponse", ($provide) => {
    $provide.value("API", {
      BASE: "/api/3/",
      WORKFLOWS: "workflows/",
      ACTION_TRIGGER: "/api/triggers/1/action/",
    });
    $provide.value("$uibModalInstance", modalInstance);
    $provide.value("_", underscoreShim);
    $provide.value("$filter", () => (val) => {
      // getEndPathName('/api/3/workflow_collections/abc') -> 'abc'
      if (typeof val === "string") return val.split("/").pop();
      return val;
    });
    // Field is a constructor used to build the typeahead field descriptor.
    $provide.value("Field", function Field(def) {
      Object.assign(this, def);
    });
    $provide.factory("$resource", (_$q_) => (url) => ({
      get: (q) => {
        resourceGet(q);
        // A workflows/<uuid> GET (relationships) returns a playbook for
        // discovery; the collection GET returns the playbook list.
        if (/workflows\/[\w-]+$/.test(url)) {
          return {
            $promise: _$q_.when({
              "@id": url,
              recordTags: [],
              steps: [],
            }),
          };
        }
        return { $promise: _$q_.when({ "hydra:member": [{ name: "PB1" }, { name: "PB2" }] }) };
      },
      save: (body) => {
        scenario.saveCalls.push({ url, body });
        return { $promise: _$q_.when(scenario.saveResponse) };
      },
    }));
    $provide.value("playbookService", {
      getTriggerStep: () => scenario.triggerStep,
      checkPlaybookExecutionCompletion: (taskIds, cb) =>
        cb({ instance_ids: ["inst-1"] }),
      getExecutedPlaybookLogData: () => $q.when(scenario.logData),
    });
    $provide.value("currentPermissionsService", {
      availablePermission: () => scenario.hasReadPermission,
    });
    $provide.value("FIXED_MODULE", { PLAYBOOK: "workflows" });
    $provide.value("toaster", { pop: (...a) => scenario.toasts.push(a) });
  });

  ngInject((_$rootScope_, _$controller_, _$q_) => {
    $rootScope = _$rootScope_;
    $controller = _$controller_;
    $q = _$q_;
  });
});

function boot(config = {}) {
  const scope = $rootScope.$new();
  $controller(CTRL_NAME, { $scope: scope, config });
  $rootScope.$apply();
  return scope;
}

describe("config defaults (SPEC D1)", () => {
  test("widgetName forced; list fields default to []", () => {
    const scope = boot({});
    expect(scope.config.widgetName).toBe("Playbook Execution Wizard");
    expect(scope.config.actionButtons).toEqual([]);
    expect(scope.config.selectedPlaybooksWithoutRecord).toEqual([]);
    expect(scope.config.selectedPlaybooksWithRecord).toEqual([]);
  });

  test("existing collection triggers a playbook fetch on init (SPEC D2)", () => {
    boot({ playbookCollection: { "@id": "/api/3/workflow_collections/col-1" } });
    expect(resourceGet).toHaveBeenCalled();
    const query = resourceGet.mock.calls[0][0];
    expect(query.collection).toBe("col-1");
    expect(query.$limit).toBe(100);
    expect(query.$orderby).toBe("name");
  });
});

describe("data-provider button (SPEC D3)", () => {
  test("addButton pushes onto actionButtons and clears the picker", () => {
    const scope = boot({});
    scope.selectedPlaybook = { name: "Provider" };
    scope.addButton(scope.selectedPlaybook);
    expect(scope.config.actionButtons).toHaveLength(1);
    expect(scope.config.actionButtons[0].name).toBe("Provider");
    expect(scope.selectedPlaybook).toBe("");
  });

  test("addButton ignores a falsy selection", () => {
    const scope = boot({});
    scope.addButton(undefined);
    expect(scope.config.actionButtons).toHaveLength(0);
  });

  test("removeButton splices the provider out", () => {
    const scope = boot({ actionButtons: [{ name: "A" }, { name: "B" }] });
    scope.removeButton(0);
    expect(scope.config.actionButtons).toEqual([{ name: "B" }]);
  });
});

describe("with/without-record buttons (SPEC D4)", () => {
  test("addButtonWithoutRecord updates config list and playbookList", () => {
    const scope = boot({});
    scope.addButtonWithoutRecord({ name: "X" });
    expect(scope.config.selectedPlaybooksWithoutRecord).toEqual([{ name: "X" }]);
    expect(scope.playbookList).toEqual([{ name: "X" }]);
  });

  test("addButtonWithRecord updates config list and playbookList", () => {
    const scope = boot({});
    scope.addButtonWithRecord({ name: "Y" });
    expect(scope.config.selectedPlaybooksWithRecord).toEqual([{ name: "Y" }]);
    expect(scope.playbookList).toEqual([{ name: "Y" }]);
  });

  test("removeButtonWithRecord splices list and rejects from wizard set", () => {
    const scope = boot({
      selectedPlaybooksWithRecord: [{ id: "a" }, { id: "b" }],
      selectedExecutionWizardPlaybooks: [{ id: "a" }, { id: "b" }],
    });
    scope.removeButtonWithRecord(0, { id: "a" });
    expect(scope.config.selectedPlaybooksWithRecord).toEqual([{ id: "b" }]);
    expect(scope.config.selectedExecutionWizardPlaybooks).toEqual([{ id: "b" }]);
  });
});

describe("reset on uncheck (SPEC D5)", () => {
  test("resetButtonWithoutRecord empties list when checkbox is off", () => {
    const scope = boot({
      showButtonWithoutRecord: false,
      selectedPlaybooksWithoutRecord: [{ name: "X" }],
    });
    scope.resetButtonWithoutRecord();
    expect(scope.config.selectedPlaybooksWithoutRecord).toEqual([]);
  });

  test("resetButtonWithRecord clears with-record state and wizard progress", () => {
    const scope = boot({
      showButtonWithRecord: false,
      selectedPlaybooksWithRecord: [{ name: "Y" }],
      selectedExecutionWizardPlaybooks: [{ name: "Y" }],
      showExecutionProgress: true,
    });
    scope.playbookList = [{ name: "Y" }];
    scope.resetButtonWithRecord();
    expect(scope.config.selectedPlaybooksWithRecord).toEqual([]);
    expect(scope.config.selectedExecutionWizardPlaybooks).toEqual([]);
    expect(scope.config.showExecutionProgress).toBe(false);
    expect(scope.playbookList).toEqual([]);
  });

  test("reset is a no-op while the checkbox is still on", () => {
    const scope = boot({
      showButtonWithoutRecord: true,
      selectedPlaybooksWithoutRecord: [{ name: "X" }],
    });
    scope.resetButtonWithoutRecord();
    expect(scope.config.selectedPlaybooksWithoutRecord).toEqual([{ name: "X" }]);
  });
});

describe("wizard list source (SPEC D6)", () => {
  test("playbookButton copies selectedPlaybooksWithRecord into playbookList", () => {
    const scope = boot({ selectedPlaybooksWithRecord: [{ name: "Y" }] });
    scope.playbookButton();
    expect(scope.playbookList).toEqual([{ name: "Y" }]);
    // it's a copy, not a reference
    expect(scope.playbookList).not.toBe(scope.config.selectedPlaybooksWithRecord);
  });
});

describe("changedCollection (SPEC D2)", () => {
  test("clears every selection then reloads playbooks for the new collection", () => {
    const scope = boot({
      actionButtons: [{ name: "A" }],
      selectedPlaybooksWithRecord: [{ name: "Y" }],
      playbookCollection: { "@id": "/api/3/workflow_collections/col-2" },
    });
    resourceGet.mockClear();
    scope.changedCollection();
    expect(scope.config.actionButtons).toEqual([]);
    expect(scope.config.selectedPlaybooksWithRecord).toEqual([]);
    expect(scope.config.selectedPlaybooksWithoutRecord).toEqual([]);
    expect(scope.playbookList).toEqual([]);
    expect(resourceGet).toHaveBeenCalled();
  });
});

describe("save / cancel (SPEC D7)", () => {
  test("save closes the modal with config when the form is valid", () => {
    const scope = boot({});
    scope.editJsonToGridForm = { $invalid: false };
    scope.save();
    expect(modalInstance.close).toHaveBeenCalledWith(scope.config);
  });

  test("save blocks and surfaces errors when the form is invalid", () => {
    const scope = boot({});
    scope.editJsonToGridForm = {
      $invalid: true,
      $setTouched: jest.fn(),
      $focusOnFirstError: jest.fn(),
    };
    scope.save();
    expect(modalInstance.close).not.toHaveBeenCalled();
    expect(scope.editJsonToGridForm.$setTouched).toHaveBeenCalled();
    expect(scope.editJsonToGridForm.$focusOnFirstError).toHaveBeenCalled();
  });

  test("cancel dismisses the modal", () => {
    const scope = boot({});
    scope.cancel();
    expect(modalInstance.dismiss).toHaveBeenCalledWith("cancel");
  });
});

// ── Column chooser / discovery (SPEC D8 / FOLLOWUPS #2) ───────────────────
describe("column chooser (SPEC D8)", () => {
  const withProvider = (extra = {}) => ({
    actionButtons: [{ uuid: "provider-uuid", name: "Provider" }],
    ...extra,
  });

  test("D8a: discoverColumns runs the provider and populates the chooser", () => {
    const scope = boot(withProvider());
    scope.discoverColumns();
    $rootScope.$apply();

    expect(scope.columnDiscovery.done).toBe(true);
    expect(scope.columnDiscovery.error).toBeNull();
    expect(scope.columnChooser.map((c) => c.field)).toEqual([
      "name",
      "active",
      "count",
    ]);
    // type is carried through; all visible by default.
    expect(scope.columnChooser.map((c) => c.type)).toEqual([
      "string",
      "boolean",
      "number",
    ]);
    expect(scope.columnChooser.every((c) => c.visible)).toBe(true);
    // It POSTed to the action-trigger route in force_debug mode with no records.
    const trigger = scenario.saveCalls.find((c) => /force_debug=true$/.test(c.url));
    expect(trigger).toBeDefined();
    expect(trigger.body.records).toEqual([]);
    // A record-scoped trigger MUST send __resource = the scoped module, or the
    // action-trigger endpoint returns 403 AccessDenied (verified live).
    expect(trigger.body.__resource).toBe("alerts");
  });

  test("D8a2: a record-less provider sends an empty __resource", () => {
    scenario.triggerStep = { arguments: { route: "route-1" } }; // no resources
    const scope = boot(withProvider());
    scope.discoverColumns();
    $rootScope.$apply();
    const trigger = scenario.saveCalls.find((c) => /force_debug=true$/.test(c.url));
    expect(trigger.body.__resource).toBe("");
  });

  test("D8b: discovery without a data provider sets an error, no trigger", () => {
    const scope = boot({});
    scope.discoverColumns();
    $rootScope.$apply();
    expect(scope.columnDiscovery.error).toMatch(/data-provider/i);
    expect(scenario.saveCalls).toHaveLength(0);
  });

  test("D8c: missing playbook read permission is reported, no trigger", () => {
    scenario.hasReadPermission = false;
    const scope = boot(withProvider());
    scope.discoverColumns();
    $rootScope.$apply();
    expect(scope.columnDiscovery.error).toMatch(/permission/i);
    expect(scenario.saveCalls).toHaveLength(0);
  });

  test("D8d: a finished run with no grid_columns is reported as an error", () => {
    scenario.logData = { status: "finished", result: { grid_columns: { columns: [] } } };
    const scope = boot(withProvider());
    scope.discoverColumns();
    $rootScope.$apply();
    expect(scope.columnChooser).toHaveLength(0);
    expect(scope.columnDiscovery.error).toMatch(/no grid_columns/i);
    expect(scenario.toasts.length).toBeGreaterThan(0);
  });

  test("D8e: toggling visibility and saving persists config.columnPrefs", () => {
    const scope = boot(withProvider());
    scope.discoverColumns();
    $rootScope.$apply();

    scope.toggleColumnVisible(scope.columnChooser[1]); // hide "active"
    scope.editJsonToGridForm = { $invalid: false };
    scope.save();

    const prefs = scope.config.columnPrefs;
    expect(prefs.map((p) => p.field)).toEqual(["name", "active", "count"]);
    expect(prefs.find((p) => p.field === "active").visible).toBe(false);
    expect(prefs.find((p) => p.field === "name").visible).toBe(true);
    expect(modalInstance.close).toHaveBeenCalledWith(scope.config);
  });

  test("D8f: moveColumnUp/Down reorders and persists", () => {
    const scope = boot(withProvider());
    scope.discoverColumns();
    $rootScope.$apply();

    scope.moveColumnDown(0); // name moves after active
    expect(scope.columnChooser.map((c) => c.field)).toEqual([
      "active",
      "name",
      "count",
    ]);
    scope.moveColumnUp(2); // count moves before name
    expect(scope.columnChooser.map((c) => c.field)).toEqual([
      "active",
      "count",
      "name",
    ]);
    // persisted immediately on reorder
    expect(scope.config.columnPrefs.map((p) => p.field)).toEqual([
      "active",
      "count",
      "name",
    ]);
  });

  test("D8g: re-discovery preserves prior order + hidden state, appends new columns", () => {
    const scope = boot(
      withProvider({
        columnPrefs: [
          { field: "count", displayName: "count", visible: false },
          { field: "name", displayName: "name", visible: true },
        ],
      })
    );
    // _init seeds the chooser from saved prefs.
    expect(scope.columnChooser.map((c) => c.field)).toEqual(["count", "name"]);

    // A re-discovery returns name, active, count — prior order/visibility wins,
    // the new "active" column is appended and visible.
    scope.discoverColumns();
    $rootScope.$apply();
    expect(scope.columnChooser.map((c) => c.field)).toEqual([
      "count",
      "name",
      "active",
    ]);
    expect(scope.columnChooser.find((c) => c.field === "count").visible).toBe(false);
    expect(scope.columnChooser.find((c) => c.field === "active").visible).toBe(true);
  });

  test("D8h: resetColumnPrefs clears the chooser and saved prefs", () => {
    const scope = boot(withProvider({ columnPrefs: [{ field: "x", visible: true }] }));
    scope.resetColumnPrefs();
    expect(scope.columnChooser).toHaveLength(0);
    expect(scope.config.columnPrefs).toHaveLength(0);
    expect(scope.columnDiscovery.done).toBe(false);
  });

  test("D8i: saving without ever discovering does NOT wipe existing columnPrefs", () => {
    const existing = [{ field: "x", displayName: "x", visible: false }];
    const scope = boot(withProvider({ columnPrefs: existing.slice() }));
    // _init seeds the chooser from prefs, so it round-trips rather than wiping.
    scope.editJsonToGridForm = { $invalid: false };
    scope.save();
    expect(scope.config.columnPrefs.map((p) => p.field)).toEqual(["x"]);
    expect(scope.config.columnPrefs[0].visible).toBe(false);
  });
});
