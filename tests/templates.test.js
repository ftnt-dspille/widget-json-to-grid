"use strict";
// view.html / edit.html template contracts.
//
// These are pure DOM-binding guards: they pin the wiring that the controller
// tests can't reach (ng-if visibility, required fields, the cs-grid hookup,
// element ids the e2e specs depend on). A template edit that drops one of
// these bindings goes red here, cheaply and offline. Maps to SPEC B/E.

const fs = require("fs");
const path = require("path");

const WIDGET_DIR = path.join(__dirname, "..", "widget");
const viewHtml = fs.readFileSync(path.join(WIDGET_DIR, "view.html"), "utf8");
const editHtml = fs.readFileSync(path.join(WIDGET_DIR, "edit.html"), "utf8");

describe("view.html (SPEC A4, B)", () => {
  test("renders the configurable title", () => {
    expect(viewHtml).toContain("{{config.title}}");
  });

  test("grid is wired through cs-grid with gridOptions + columnDefs", () => {
    expect(viewHtml).toContain("data-cs-grid");
    expect(viewHtml).toContain('data-grid-options="gridOptions"');
    expect(viewHtml).toContain('data-column-defs="columnDefs"');
    expect(viewHtml).toContain('data-paged-collection="gridPagedCollection"');
  });

  test("load spinner is gated on loadProcessing (and suppressed when a gridError is shown)", () => {
    expect(viewHtml).toContain('data-ng-if="loadProcessing && !gridError"');
    expect(viewHtml).toContain("Fetching Grid Data");
  });

  test("gridError message is rendered when set (graceful no-provider state)", () => {
    expect(viewHtml).toContain('data-ng-if="gridError"');
    expect(viewHtml).toContain("{{gridError}}");
  });

  test("refresh overlay is gated on refreshProcessing", () => {
    expect(viewHtml).toContain('data-ng-if="refreshProcessing"');
  });

  test("empty-state message shows only when there are zero rows", () => {
    expect(viewHtml).toContain("gridOptions.data.length === 0");
    expect(viewHtml).toContain("No Results Found");
  });
});

describe("edit.html (SPEC E)", () => {
  test("title input is required and bound to config.title", () => {
    expect(editHtml).toMatch(/id="title"[^>]*data-ng-model="config.title"[^>]*required/s);
  });

  test("playbook collection typeahead bound to config.playbookCollection", () => {
    expect(editHtml).toContain('data-cs-typeahead="getWorkflowCollectionsField"');
    expect(editHtml).toContain('data-ng-model="config.playbookCollection"');
    expect(editHtml).toContain('data-change-method="changedCollection"');
  });

  test("data-provider select disables once a button exists, required until then", () => {
    expect(editHtml).toContain('data-ng-disabled="config.actionButtons.length > 0"');
    expect(editHtml).toContain('data-ng-required="config.actionButtons.length === 0"');
  });

  test("without-record select + list reveal on showButtonWithoutRecord", () => {
    expect(editHtml).toContain('data-ng-model="config.showButtonWithoutRecord"');
    expect(editHtml).toContain('data-ng-if="config.showButtonWithoutRecord"');
    expect(editHtml).toContain('id="action-editor-without-record"');
  });

  test("with-record select + list reveal on showButtonWithRecord", () => {
    expect(editHtml).toContain('data-ng-model="config.showButtonWithRecord"');
    expect(editHtml).toContain('data-ng-if="config.showButtonWithRecord"');
    expect(editHtml).toContain('id="action-editor-with-record"');
  });

  test("execution-progress block gated on showExecutionProgress (SPEC E5)", () => {
    expect(editHtml).toContain('data-ng-model="config.showExecutionProgress"');
    expect(editHtml).toContain('data-ng-if="config.showExecutionProgress"');
    expect(editHtml).toContain('data-ng-model="config.selectedExecutionWizardPlaybooks"');
  });

  test("save/cancel controls present (SPEC E6)", () => {
    expect(editHtml).toContain('id="edit-widget-save"');
    expect(editHtml).toContain('id="edit-widget-cancel"');
    expect(editHtml).toContain('data-ng-submit="save()"');
  });
});
