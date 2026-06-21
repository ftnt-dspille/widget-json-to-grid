"use strict";
// edit.controller (editJsonToGridCtrl) unit tests — jsdom project.
//
// The edit controller is pure config manipulation (no async grid chain), so
// these tests construct it with injected locals and assert the config model
// directly. Maps to SPEC items D1-D7.

global.jasmine = global.jasmine || {};

require("angular");
require("angular-mocks");

angular.module("cybersponse", []); // eslint-disable-line no-undef
require("../widget/edit.controller.js");

const CTRL_NAME = "editJsonToGrid130DevCtrl";
const ngModule = window.angular.mock.module; // eslint-disable-line no-undef
const ngInject = window.angular.mock.inject; // eslint-disable-line no-undef

const underscoreShim = {
  reject: (list, fn) => (list || []).filter((x) => !fn(x)),
};

let $rootScope, $controller, $q, modalInstance, resourceGet;

beforeEach(() => {
  modalInstance = { close: jest.fn(), dismiss: jest.fn() };
  resourceGet = jest.fn();

  ngModule("cybersponse", ($provide) => {
    $provide.value("API", { BASE: "/api/3/" });
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
    $provide.factory("$resource", (_$q_) => () => ({
      get: (q) => {
        resourceGet(q);
        return { $promise: _$q_.when({ "hydra:member": [{ name: "PB1" }, { name: "PB2" }] }) };
      },
    }));
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
