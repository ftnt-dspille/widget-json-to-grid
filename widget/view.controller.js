/* Copyright start
    MIT License
    Copyright (c) 2026 Fortinet Inc
Copyright end */
'use strict';
(function () {
  // Relative-date presets for the date-column filter dropdown (FortiSOAR-style).
  // `key` matches datePresetWindow() in the controller; `label` is shown in the
  // menu. Shared by the controller (decorate) and the jtgColumnFilter directive.
  var DATE_PRESETS = [
    { key: 'last7', label: 'Last 7 Days' },
    { key: 'last15', label: 'Last 15 Days' },
    { key: 'last30', label: 'Last 30 Days' },
    { key: 'last90', label: 'Last 3 Months' },
    { key: 'last180', label: 'Last 6 Months' },
    { key: 'thisMonth', label: 'Last Calendar Month' },
    { key: 'lastCalMonth', label: 'Last Month' },
    { key: 'lastYear', label: 'Last Year' }
  ];

  // Custom ui-grid filterHeaderTemplate for the dropdown filter modes
  // (tri/enum/date). Rendered by the jtgColumnFilter directive, which reads
  // `col`/`grid` from the header-cell scope ui-grid provides. Number/string
  // columns do NOT use this — they keep ui-grid's native text input.
  var JTG_FILTER_TEMPLATE =
    '<div class="jtg-colfilter" jtg-column-filter></div>';

  angular
    .module('cybersponse')
    .controller('jsonToGrid131DevCtrl', jsonToGrid131DevCtrl);

  jsonToGrid131DevCtrl.$inject = ['$scope', '$state', '$resource', 'API', 'playbookService', '$q', 'toaster', 'Entity', '$filter', 'Modules', '_', 'exportService', 'currentPermissionsService', 'FIXED_MODULE', 'statusCodeService', '$uibModal', 'widgetService', 'PagedCollection', 'widgetBasePath', 'settingsService', '$injector'];

  function jsonToGrid131DevCtrl($scope, $state, $resource, API, playbookService, $q, toaster, Entity, $filter, Modules, _, exportService, currentPermissionsService, FIXED_MODULE, statusCodeService, $uibModal, widgetService, PagedCollection, widgetBasePath, settingsService, $injector) {
    // uiGridConstants is a SOFT dependency: it supplies the filter-type enum for
    // the per-column filters, but the widget must still mount if a host/harness
    // hasn't registered ui.grid (buildColumnFilter falls back to the numeric
    // enum). A hard $inject would abort the entire controller instantiation —
    // and thus the whole widget mount — when the constant is absent.
    var uiGridConstants = $injector.has('uiGridConstants') ? $injector.get('uiGridConstants') : null;
    // Per-user column-order preference key. MUST stay stable across widget
    // versions (do not embed the version) so a saved order survives upgrades.
    // See KNOWLEDGEBASE.md §8.2.1 (settingsService column-order persistence).
    var COLUMN_ORDER_KEY = 'jsonToGrid/columnOrder';
    // Per-user column WIDTHS ({ field: pixelWidth }). Same stability rule.
    var COLUMN_WIDTH_KEY = 'jsonToGrid/columnWidths';
    $scope.executeGridPlaybook = executeGridPlaybook;
    $scope.refreshGridData = refreshGridData;
    $scope.widgetBasePath = widgetBasePath;
    var selectButtons = [];
    var buttons = [];

    function loadGriOptions() {
      setGridOptions();
      var playbookIds = _.pluck(_.union($scope.config.selectedPlaybooksWithRecord, $scope.config.selectedPlaybooksWithoutRecord), 'uuid');
      var params = {
        module: 'workflows',
        'uuid$in': playbookIds.join('|'),
        $relationships: true,
        $export: true
      };
      Modules.get(params).$promise.then(function (result) {
        createGridButtons(result['hydra:member']);
      });
      // When placed on a record detail page, capture that record so it can be
      // passed to playbooks as the implicit "selected record" (no row selection needed).
      if ($state.params.module && $state.params.id) {
        Modules.get({ module: $state.params.module, id: $state.params.id }).$promise.then(function (result) {
          $scope.custom_selected_records = result;
        });
      }
    }

    function createGridButtons(playbooks) {
      angular.forEach(playbooks, function (playbook, index) {
        var triggerStep = _.find(playbook.steps, function (item) { return item.uuid === $filter('getEndPathName')(playbook.triggerStep); });
        var buttonText = triggerStep.arguments.title;
        var playbookButtonWithoutRecordObject = _.find($scope.config.selectedPlaybooksWithoutRecord, function (item) { return item.uuid === playbook.uuid; });
        var playbookButtonWithRecordObject = _.find($scope.config.selectedPlaybooksWithRecord, function (item) { return item.uuid === playbook.uuid; });
        var button = {
          id: 'btn-pb-with-record_' + index,
          text: buttonText || playbook.name,
          class: 'btn-primary margin-right-sm',
          disabled: false,
          hide: false
        };
        var isWizardExecution = _.some($scope.config.selectedExecutionWizardPlaybooks, function (f) {
          return f.uuid == playbook.uuid;
        });
        var wizardName = ($scope.config.widgetName).replace(/ /g, "+");
        $resource(API.QUERY + 'solutionpacks?$search=' + wizardName).save().$promise.then(function (response) {
          if (response['hydra:member'] && response['hydra:member'].length > 0) {
            $scope.widgetVersion = response['hydra:member'][0].version;
            $scope.widgetAPIName = response['hydra:member'][0].name;
          }
        });
        if (playbookButtonWithoutRecordObject) {
          button.onClick = function () {
            executeGridPlaybook(playbook, false);
          },
            button.iconClass = playbookButtonWithoutRecordObject.icon || 'icon icon-execute';
          buttons.push(button);
          $scope.gridOptions.csOptions.buttons = buttons;
        }

        if (playbookButtonWithRecordObject) {
          button.onClick = function () {
            if ($scope.config.showExecutionProgress && isWizardExecution) {
              var selectedRows = $scope.getSelectedRows();
              var payload = {
                "playbookDetails": playbook,
                "selectedRecord": selectedRows
              };
              widgetService.launchStandaloneWidget($scope.widgetAPIName, $scope.widgetVersion, null, null, payload).then(function () {
                angular.noop;
              });
              $scope.gridApi.selection.clearSelectedRows();
            }
            else {
              executeGridPlaybook(playbook, true);
            }
          },
            button.iconClass = playbookButtonWithRecordObject.icon || 'icon icon-execute';
          selectButtons.push(button);
          $scope.gridOptions.csOptions.selectButtons = selectButtons;
        }


      });
    }

    function setGridOptions() {
      $scope.gridOptions = {
        csOptions: {
          allowDelete: false,
          allowAdd: false,
          allowClone: false,
          showPagination: false,
          allowGlobalFilter: false,
          allowCardView: true,
          viewType: 'staticGrid',
          onRegisterApi: setGridApi,
          buttons: buttons,
          selectButtons: selectButtons,
          noResultsMessage: 'No change requests available.',
        },
        expandableRowTemplate: $scope.widgetBasePath + 'widgetAssets/html/rowExpandable.html',
        enableExpandable: true,
        // Sorting + filtering are honored client-side: the data lives entirely
        // in memory (a playbook result), so we override the static
        // PagedCollection's loadGridRecord to sort/filter the in-memory rows
        // instead of letting csGrid issue a server query against the synthetic
        // 'dummy_module' (which has no endpoint). enableSorting must be set
        // explicitly — the platform default is false, which is why header
        // sorting never worked before.
        enableSorting: true,
        enableFiltering: true,
        // Force ui-grid's NATIVE (client-side) sort/filter. csGrid's grid
        // defaults set these to true, which delegates sort/filter to a server
        // query against the synthetic 'dummy_module' (no endpoint) — so nothing
        // happens. The widget's gridOptions win over csGrid's defaults
        // (angular.extend(gridOptions, extend(defaults, gridOptions))), so
        // setting them false makes ui-grid sort/filter the in-memory rows
        // directly.
        useExternalSorting: false,
        useExternalFiltering: false,
        enableSelectAll: true,
        enableRowSelection: false,
        enableRowHeaderSelection: true,
        selectWithCheckboxOnly: true,
        showSelectionCheckbox: true,
        enableColumnResizing: true,
        enableColumnMoving: true,
        // Runtime column chooser for the END USER: the grid menu (hamburger at
        // the top-right of the grid) lists every column with a show/hide toggle,
        // so a viewer can hide columns without editing the widget config. The
        // edit.html "Default Columns" chooser only sets the admin DEFAULT
        // visibility/order; this is how an individual user overrides what they
        // see. gridMenuShowHideColumns is on by default; set explicitly so the
        // intent is clear.
        enableGridMenu: true,
        gridMenuShowHideColumns: true,
        refresh: $scope.refreshGridData
      };
    }

    // csGrid/PagedCollection identify rows by their IRI ('@id'). Rows produced
    // by a plain-JSON data-provider playbook often lack one, which renders the
    // columns but no body rows. Give every row a stable, unique '@id'/'uuid'
    // (preserving any the playbook already supplied) so the grid can render.
    function ensureRowIds(rows) {
      if (!angular.isArray(rows)) {
        return [];
      }
      return rows.map(function (row, index) {
        if (!angular.isObject(row)) {
          return row;
        }
        if (row['@id'] && row.uuid) {
          return row;
        }
        var uuid = row.uuid || ('@id' in row ? $filter('getEndPathName')(row['@id']) : null) || ('dummy-row-' + index);
        return angular.extend({}, row, {
          uuid: uuid,
          '@id': row['@id'] || (API.API_3_BASE + 'dummy_module/' + uuid)
        });
      });
    }

    // ── Column definitions ────────────────────────────────────────────────
    // ui-grid reads each cell's value from the column's `field` property, NOT
    // `name`. A grid_columns entry only carries `name` (the grid_data key), so
    // copy it into `field` and default `displayName`. Everything else
    // (width/minWidth/maxWidth/type/cellFilter/cellTemplate/enableSorting/
    // enableFiltering/visible/pinnedLeft/pinnedRight) is passed through
    // untouched. The array order is preserved verbatim — it is the default
    // column order.
    function normalizeColumns(columns, sampleRows) {
      if (!angular.isArray(columns)) {
        return [];
      }
      return columns.map(function (col) {
        var field = col.field || col.name;
        var normalized = angular.extend({}, col, {
          field: field,
          name: col.name || field,
          displayName: col.displayName || col.name || field
        });
        // Wire the column's type → an ui-grid filter config so the per-column
        // filter box behaves correctly for non-string columns. Many provider
        // playbooks don't declare a `type` on grid_columns (the platform's own
        // "JSON to Grid" example doesn't), so when it's absent we INFER it from
        // the actual data — otherwise every column silently falls back to a
        // plain text filter and the typed filters never appear. Only inject a
        // filter when the column doesn't already carry an explicit `filter`/
        // `filters` (caller override wins) and filtering isn't disabled.
        var type = col.type || inferColumnType(field, sampleRows);
        if (type && !normalized.type) { normalized.type = type; }
        decorateColumnFilter(normalized, type, field, sampleRows);
        return normalized;
      });
    }

    // Infer a column's type from the first few rows' values for that field when
    // the playbook didn't declare one. Conservative: booleans and numbers are
    // unambiguous; a string is treated as a date only if every sampled value
    // parses as an ISO-ish date (so plain text like "Active" stays a string).
    // Returns undefined when it can't tell (→ default text filter).
    function inferColumnType(field, rows) {
      if (!angular.isArray(rows) || !rows.length) { return undefined; }
      var sample = [];
      for (var i = 0; i < rows.length && sample.length < 5; i++) {
        var v = rows[i] ? rows[i][field] : undefined;
        if (v !== undefined && v !== null && v !== '') { sample.push(v); }
      }
      if (!sample.length) { return undefined; }
      if (sample.every(function (v) { return typeof v === 'boolean'; })) { return 'boolean'; }
      if (sample.every(function (v) { return typeof v === 'number'; })) { return 'number'; }
      if (sample.every(isIsoDateString)) { return 'date'; }
      return undefined;
    }

    // True for a string that looks like an ISO-8601 date/datetime (the shape
    // playbooks emit, e.g. "2025-02-15T14:30:00Z"). Guards against treating an
    // arbitrary number-ish or short string as a date.
    function isIsoDateString(v) {
      return typeof v === 'string' &&
        /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})/.test(v) &&
        !isNaN(Date.parse(v));
    }

    // Decorate a colDef with a type-appropriate filter that matches the
    // FortiSOAR native grid UX. Mutates colDef in place. Modes:
    //   boolean → 'tri'  : Not Set / Yes / No dropdown
    //   enum    → 'enum' : searchable multi-select checklist + Apply
    //   date    → 'date' : relative-range presets (Last 7/30 Days, Last Month…)
    //   number  →         : plain search box (numeric/operator condition)
    //   string  →         : ui-grid's default text filter (untouched)
    // The dropdown modes render via a custom filterHeaderTemplate (the
    // jtgColumnFilter directive); number keeps ui-grid's native input. Returns
    // nothing — the caller checks colDef.filter.
    function decorateColumnFilter(colDef, type, field, rows) {
      if (colDef.filter || colDef.filters || colDef.enableFiltering === false) {
        return;
      }
      if (type === 'boolean') {
        colDef.jtgFilterMode = 'tri';
        colDef.filter = { term: '', condition: triCondition };
        colDef.filterHeaderTemplate = JTG_FILTER_TEMPLATE;
        return;
      }
      if (isEnumType(type) || looksLikeEnum(field, rows)) {
        colDef.jtgFilterMode = 'enum';
        colDef.jtgEnumValues = distinctValues(field, rows);
        colDef.filter = { term: [], condition: enumCondition };
        colDef.filterHeaderTemplate = JTG_FILTER_TEMPLATE;
        return;
      }
      if (type === 'date' || type === 'datetime') {
        colDef.jtgFilterMode = 'date';
        colDef.filter = { term: '', condition: dateCondition };
        colDef.filterHeaderTemplate = JTG_FILTER_TEMPLATE;
        return;
      }
      if (isNumberType(type)) {
        colDef.filter = {
          placeholder: 'Search',
          condition: function (term, value) {
            return numericRangeMatch(term, value, function (s) {
              var n = parseFloat(s);
              return isNaN(n) ? null : n;
            });
          }
        };
        return;
      }
      // string / unknown: leave ui-grid's default text filter in place.
    }

    function isEnumType(type) {
      return type === 'enum' || type === 'picklist' || type === 'select';
    }

    function isNumberType(type) {
      return type === 'number' || type === 'integer' || type === 'int' || type === 'float';
    }

    // Treat a string column as an enum (multi-select) when its distinct values
    // are few and clearly repeat — i.e. it reads like a Status/Type/Severity
    // picklist, not free text. Conservative so a high-cardinality column (names)
    // keeps a plain search box.
    function looksLikeEnum(field, rows) {
      if (!angular.isArray(rows) || rows.length < 3) { return false; }
      var vals = distinctValues(field, rows);
      if (!vals.length || vals.length > 12) { return false; }
      // require real repetition: at least twice as many rows as distinct values
      var present = rows.filter(function (r) {
        var v = r ? r[field] : undefined;
        return v !== undefined && v !== null && v !== '';
      }).length;
      if (present < vals.length * 2) { return false; }
      // every value must be a (short) string — not numbers/objects
      return vals.every(function (v) { return typeof v === 'string' && v.length <= 64; });
    }

    // Sorted distinct non-empty string values of a field across all rows.
    function distinctValues(field, rows) {
      if (!angular.isArray(rows)) { return []; }
      var seen = {};
      rows.forEach(function (r) {
        var v = r ? r[field] : undefined;
        if (typeof v === 'string' && v !== '') { seen[v] = true; }
      });
      return Object.keys(seen).sort();
    }

    // ── Filter conditions (pure; ui-grid calls them per cell) ───────────────
    // Boolean tri-state. term ∈ {'', 'notset', 'true', 'false'}.
    function triCondition(term, value) {
      if (term === undefined || term === null || term === '') { return true; }
      if (term === 'notset') {
        return value === undefined || value === null || value === '';
      }
      var truthy = value === true || value === 'true' || value === 1;
      var falsy = value === false || value === 'false' || value === 0;
      if (term === 'true') { return truthy; }
      if (term === 'false') { return falsy; }
      return true;
    }

    // Enum multi-select. term is an array of selected string values; the special
    // '__notset' entry matches empty cells. An empty array means "no filter".
    function enumCondition(term, value) {
      if (!angular.isArray(term) || !term.length) { return true; }
      var isEmpty = value === undefined || value === null || value === '';
      if (isEmpty) { return term.indexOf('__notset') !== -1; }
      return term.indexOf(String(value)) !== -1;
    }

    // Date filter. term is either a relative-preset key string (see
    // DATE_PRESETS) or a custom-range object { from, to } in epoch-ms (either
    // bound optional). '' / null = any time.
    function dateCondition(term, value) {
      if (term === undefined || term === null || term === '') { return true; }
      var t = Date.parse(value);
      if (isNaN(t)) { return false; }
      var win = dateWindow(term);
      if (!win) { return true; }
      if (win.from !== null && win.from !== undefined && t < win.from) { return false; }
      if (win.to !== null && win.to !== undefined && t > win.to) { return false; }
      return true;
    }

    // Resolve a date filter term to a { from, to } epoch-ms window. A custom
    // range object is used as-is (missing bound = open-ended); otherwise the
    // term is a preset key.
    function dateWindow(term) {
      if (term && typeof term === 'object') {
        return {
          from: (term.from === undefined || term.from === null) ? null : term.from,
          to: (term.to === undefined || term.to === null) ? null : term.to
        };
      }
      return datePresetWindow(term);
    }

    // Compute [from, to] epoch-ms for a preset key, relative to "now".
    function datePresetWindow(key) {
      var now = new Date();
      var to = now.getTime();
      function daysAgo(n) { return to - n * 24 * 60 * 60 * 1000; }
      switch (key) {
        case 'last7': return { from: daysAgo(7), to: to };
        case 'last15': return { from: daysAgo(15), to: to };
        case 'last30': return { from: daysAgo(30), to: to };
        case 'last90': return { from: daysAgo(90), to: to };
        case 'last180': return { from: daysAgo(180), to: to };
        case 'lastYear': return { from: daysAgo(365), to: to };
        case 'thisMonth': // calendar month-to-date
          return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: to };
        case 'lastCalMonth': {
          var firstThis = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          var firstPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
          return { from: firstPrev, to: firstThis - 1 };
        }
        default: return null;
      }
    }

    // Shared numeric/date filter matcher. `parse` coerces a raw string to a
    // comparable number (or null when not parseable). Supports operator
    // prefixes (>, >=, <, <=, =, ==) and `lo..hi` ranges; anything that doesn't
    // parse falls back to a case-insensitive substring match so the box is
    // never a dead end.
    function numericRangeMatch(term, value, parse) {
      if (term === undefined || term === null) { return true; }
      term = String(term).trim();
      if (term === '') { return true; }
      var cell = parse(value);
      // Range: "lo..hi" (either side optional)
      var range = term.match(/^(.*?)\.\.(.*)$/);
      if (range) {
        var lo = parse(range[1].trim());
        var hi = parse(range[2].trim());
        if (cell === null) { return false; }
        if (lo !== null && cell < lo) { return false; }
        if (hi !== null && cell > hi) { return false; }
        return true;
      }
      var op = term.match(/^(>=|<=|>|<|==|=)\s*(.*)$/);
      if (op) {
        var operand = parse(op[2].trim());
        if (operand === null || cell === null) { return false; }
        switch (op[1]) {
          case '>':  return cell > operand;
          case '>=': return cell >= operand;
          case '<':  return cell < operand;
          case '<=': return cell <= operand;
          case '=':
          case '==': return cell === operand;
        }
      }
      // No operator: exact numeric/date equality when both parse, else
      // substring on the raw rendered value.
      var plain = parse(term);
      if (plain !== null && cell !== null) { return cell === plain; }
      return String(value).toLowerCase().indexOf(term.toLowerCase()) !== -1;
    }

    // Apply the admin-configured column chooser (config.columnPrefs, set in
    // edit.html — an ordered list of { field, visible }). The playbook's
    // grid_columns remain the source of truth for which columns EXIST; the
    // prefs only supply a default order + visibility:
    //   - columns named in prefs take the prefs order, and a pref with
    //     visible === false sets the column's `visible` to false (ui-grid hides
    //     it, and the column chooser/menu can still re-show it);
    //   - columns the playbook returns that aren't in prefs are appended in
    //     grid_columns order and stay visible (a newly added column is never
    //     silently hidden);
    //   - a pref whose field no longer exists in grid_columns is dropped.
    // This runs BEFORE applyColumnOrder so a per-user dragged order (settings)
    // still overrides the admin default order. Visibility has no per-user
    // override, so it always reflects the config.
    function applyColumnPrefs(columns, prefs) {
      if (!angular.isArray(prefs) || !prefs.length) {
        return columns;
      }
      var ordered = [];
      prefs.forEach(function (pref) {
        var field = pref && (pref.field || pref.name);
        if (!field) { return; }
        var match = _.find(columns, function (c) { return c.field === field; });
        if (match) {
          if (pref.visible === false) {
            match.visible = false;
          }
          ordered.push(match);
        }
      });
      var prefFields = prefs.map(function (p) { return p && (p.field || p.name); });
      var rest = _.filter(columns, function (c) { return prefFields.indexOf(c.field) === -1; });
      return ordered.concat(rest);
    }

    // Default order is the grid_columns order. If the user has previously
    // dragged columns, that saved order (per-user, via settingsService — see
    // KNOWLEDGEBASE.md §8.2.1) takes precedence. Saved fields are reconciled
    // against the current columns so a playbook that added/removed/renamed a
    // column does not strand or drop entries: known saved columns first (in
    // saved order), then any new columns in their grid_columns order.
    function applyColumnOrder(columns, savedOrder) {
      if (!angular.isArray(savedOrder) || !savedOrder.length) {
        return columns;
      }
      var ordered = [];
      savedOrder.forEach(function (field) {
        var match = _.find(columns, function (c) { return c.field === field; });
        if (match) {
          ordered.push(match);
        }
      });
      var rest = _.filter(columns, function (c) { return savedOrder.indexOf(c.field) === -1; });
      return ordered.concat(rest);
    }

    function getSavedColumnOrder() {
      if (!settingsService || !angular.isFunction(settingsService.get)) {
        return null;
      }
      try {
        // settingsService.get returns synchronously from the cached @settings.
        return settingsService.get(COLUMN_ORDER_KEY);
      } catch (e) {
        return null;
      }
    }

    function saveColumnOrder(order) {
      if (!settingsService || !angular.isFunction(settingsService.set) || !order || !order.length) {
        return;
      }
      try {
        settingsService.set(COLUMN_ORDER_KEY, order); // fire-and-forget
      } catch (e) {
        // Persistence is best-effort; a save failure must not break the grid.
      }
    }

    function getSavedColumnWidths() {
      if (!settingsService || !angular.isFunction(settingsService.get)) {
        return null;
      }
      try {
        return settingsService.get(COLUMN_WIDTH_KEY);
      } catch (e) {
        return null;
      }
    }

    function saveColumnWidths(widths) {
      if (!settingsService || !angular.isFunction(settingsService.set) || !widths) {
        return;
      }
      try {
        settingsService.set(COLUMN_WIDTH_KEY, widths); // fire-and-forget
      } catch (e) {
        // Best-effort; a save failure must not break the grid.
      }
    }

    // Re-apply any saved per-user widths onto the colDefs. A saved width is a
    // concrete pixel number; columns without a saved width keep their
    // grid_columns width (e.g. '*' star sizing). Merged with the current saved
    // map so a resize of one column doesn't lose the others.
    function applyColumnWidths(columns, savedWidths) {
      if (!savedWidths || typeof savedWidths !== 'object') {
        return columns;
      }
      columns.forEach(function (c) {
        var w = savedWidths[c.field];
        if (typeof w === 'number' && w > 0) {
          c.width = w;
        }
      });
      return columns;
    }

    // ── Sort / filter ─────────────────────────────────────────────────────
    // Sorting and filtering are handled by ui-grid's NATIVE client-side engine
    // (gridOptions.useExternalSorting/Filtering are forced to false in
    // setGridOptions). The data lives entirely in memory, so ui-grid sorts and
    // filters gridOptions.data directly — no widget-side sort/filter code is
    // needed, and no server query is issued. Verified live against a real grid
    // (numeric + text sort, per-column filter). See KNOWLEDGEBASE.md §7.

    function setCollectionRows(pc, rows) {
      if (!pc) { return; }
      pc.list = rows;
      pc.keyPairs = rows;
      pc.visited = true;
      pc.totalItems = rows.length;
      pc.data = {
        '@context': API.API_3_BASE + 'contexts/dummy_module',
        '@id': API.API_3_BASE + 'dummy_module',
        '@type': 'hydra:Collection',
        'hydra:member': rows,
        'hydra:totalItems': rows.length
      };
    }

    function refreshGridData() {
      $scope.gridOptions.data = [];
      var dataProvider = ($scope.config.actionButtons || [])[0];
      if (!dataProvider || !dataProvider.uuid) {
        return $q.when();
      }
      return triggerPlaybook(dataProvider.uuid, true);
    }

    function setGridApi(gridApi) {
      $scope.gridApi = gridApi;
      // Persist the user's column order when they drag a column. colMovable is
      // present because enableColumnMoving is on; guard anyway. Saved order is
      // the list of `field`s, matching what applyColumnOrder() restores.
      if (gridApi && gridApi.colMovable && gridApi.colMovable.on && angular.isFunction(gridApi.colMovable.on.columnPositionChanged)) {
        gridApi.colMovable.on.columnPositionChanged($scope, function () {
          var order = (gridApi.grid && angular.isArray(gridApi.grid.columns) ? gridApi.grid.columns : [])
            .map(function (c) { return c.field || (c.colDef && c.colDef.field); })
            .filter(Boolean);
          saveColumnOrder(order);
        });
      }
      // Persist the user's column WIDTHS when they drag a column border.
      // colResizable fires columnSizeChanged(colDef, deltaChange); we snapshot
      // the live pixel widths of every column so a single resize keeps the rest.
      if (gridApi && gridApi.colResizable && gridApi.colResizable.on && angular.isFunction(gridApi.colResizable.on.columnSizeChanged)) {
        gridApi.colResizable.on.columnSizeChanged($scope, function () {
          var cols = (gridApi.grid && angular.isArray(gridApi.grid.columns)) ? gridApi.grid.columns : [];
          var widths = angular.extend({}, getSavedColumnWidths() || {});
          cols.forEach(function (c) {
            var field = c.field || (c.colDef && c.colDef.field);
            // c.drawnWidth is the rendered pixel width after the resize.
            if (field && typeof c.drawnWidth === 'number' && c.drawnWidth > 0) {
              widths[field] = c.drawnWidth;
            }
          });
          saveColumnWidths(widths);
        });
      }
    }

    $scope.getSelectedRows = function () {
      return $scope.gridApi.selection.getSelectedRows();
    };


    function executeGridPlaybook(playbook, executeWithRecord) {
      $resource(API.BASE + API.WORKFLOWS + playbook.uuid).get({ '$relationships': true }).$promise.then(function (playbook) {
        var triggerStep = playbookService.getTriggerStep(playbook);
        var resources = (triggerStep && triggerStep.arguments && triggerStep.arguments.resources) || [];
        var entity = resources.length ? new Entity(resources[0]) : null;
        var fieldsReady = entity ? entity.loadFields() : $q.when();
        fieldsReady.then(function () {
          if (!executeWithRecord) {
            _playbookButtonsExecution(playbook, executeWithRecord, triggerStep, entity);
          } else if (triggerStep.arguments.inputVariables && triggerStep.arguments.inputVariables.length > 0) {
            var modalInstance = $uibModal.open({
              templateUrl: $scope.widgetBasePath + 'widgetAssets/html/inputVariables.html',
              controller: 'InputVariablesCtrl',
              backdrop: 'static',
              resolve: {
                playbook: playbook,
                entity: angular.copy(entity),
                rows: function () {
                  var selectedFields = _.pluck(_.filter(triggerStep.arguments.inputVariables, function (inputVariable) {
                    return inputVariable.useRecordFieldDefault;
                  }), 'moduleField');
                  selectedFields.push('uuid');
                  return exportService.loadRowsForExport($scope.getSelectedRows, (entity && entity.name) || '', _.uniq(selectedFields)).then(function (response) {
                    return response || [];
                  });
                }
              }
            });

            modalInstance.result.then(function (result) {
              _playbookButtonsExecution(playbook, executeWithRecord, triggerStep, entity, result);
            });
          } else {
            var result = { inputVariables: {} };
            _playbookButtonsExecution(playbook, executeWithRecord, triggerStep, entity, result);
          }

        });
      });
    }

    function _playbookButtonsExecution(playbook, executeWithRecord, triggerStep, entity, manualTriggerInput) {
      var selectedRows = $scope.getSelectedRows();
      if (executeWithRecord && selectedRows.length > 0) {
        var apiNoTrigger = API.MANUAL_TRIGGER + playbook.uuid;
        var env = {
          'request': {
            'data': {
              'records': selectedRows,
              'singleRecordExecution': true,
              '__resource': ((triggerStep.arguments && triggerStep.arguments.resources) || [])[0],
              '__uuid': playbook.uuid
            }
          }
        };
        env = _.extend(env, manualTriggerInput.inputVariables);
        $resource(apiNoTrigger).save(env).$promise.then(function () {
        });
        $scope.gridApi.selection.clearSelectedRows();
      } else {
        $resource(API.BASE + API.WORKFLOWS + playbook.uuid).get({ '$relationships': true }).$promise.then(function (playbook) {
          var triggerStep = playbookService.getTriggerStep(playbook);
          var inputVariables = manualTriggerInput ? manualTriggerInput.inputVariables : {};
          _sendPost(triggerStep.arguments.route, playbook, inputVariables, $scope.getSelectedRows, $scope, true, (entity && entity.name) || '', false).then(function (data) {
            $scope.loadProcessing = false;
            $scope.refreshProcessing = false;
            if (data.status === 'finished') {
              $scope.refreshGridData();
            }
          });
        });
      }
    }

    function _init() {
      $scope.loadProcessing = true;
      $scope.refreshProcessing = false;
      loadGriOptions();
      // The JSON Data Provider Playbook is stored as the (single) entry in
      // config.actionButtons. If it was never selected, actionButtons is empty
      // — surface a clear message instead of throwing on actionButtons[0].uuid.
      var dataProvider = ($scope.config.actionButtons || [])[0];
      if (!dataProvider || !dataProvider.uuid) {
        $scope.loadProcessing = false;
        $scope.gridError = 'No JSON Data Provider Playbook is configured. Open the widget config and select one under "JSON Data Provider Playbook".';
        return;
      }
      triggerPlaybook(dataProvider.uuid, true);
    }

    function triggerPlaybook(uuid, refreshGrid) {
      var defer = $q.defer();
      $resource(API.BASE + API.WORKFLOWS + uuid).get({ '$relationships': true }).$promise.then(function (playbook) {
        playbook.recordTags = playbook.recordTags || [];
        if (playbook.recordTags.indexOf('SystemWaitForCompletion') === -1) {
          playbook.recordTags.push('SystemWaitForCompletion');
        }
        var triggerStep = playbookService.getTriggerStep(playbook);
        // A generic / manual data-provider playbook has no record resources on
        // its trigger step. Only build an Entity (and load its fields) when the
        // playbook is record-scoped; otherwise run it without a record entity.
        var resources = (triggerStep && triggerStep.arguments && triggerStep.arguments.resources) || [];
        var entity = resources.length ? new Entity(resources[0]) : null;
        var fieldsReady = entity ? entity.loadFields() : $q.when();
        fieldsReady.then(function () {
          _triggerPlaybookAction(playbook, $scope.getSelectedRows, $scope, true, entity, refreshGrid).then(function () {
            defer.resolve();
          }, function () {
            defer.reject();
          });
          if ($scope.gridApi && $scope.gridApi.selection) {
            $scope.gridApi.selection.clearSelectedRows();
          }
        });
        defer.resolve();
      }, function () {
        defer.reject();
      });
      return defer.promise;
    }

    function _triggerPlaybookAction(playbook, getSelectedRows, scope, isSync, entity, refreshGrid) {
      var defer = $q.defer();
      var playbookExeOption = {};
      var triggerStep = playbookService.getTriggerStep(playbook);
      if (angular.isDefined(triggerStep.arguments.singleRecordExecution)) {
        playbookExeOption = {
          'singleRecordExecution': triggerStep.arguments.singleRecordExecution
        };
      }
      if (!triggerStep.arguments.inputVariables || !triggerStep.arguments.inputVariables.length) {
        $scope.loadProcessing = true;
        // entity is null for a record-less (generic/manual) data-provider playbook.
        _sendPost(triggerStep.arguments.route, playbook, playbookExeOption, getSelectedRows, scope, isSync, (entity && entity.name) || '', refreshGrid).then(function () {
          defer.resolve();
        }, function () {
          defer.reject();
        });
        return defer.promise;
      }

      var modalInstance = $uibModal.open({
        templateUrl: $scope.widgetBasePath + 'widgetAssets/html/inputVariables.html',
        controller: 'InputVariablesCtrl',
        backdrop: 'static',
        resolve: {
          playbook: playbook,
          entity: angular.copy(entity),
          rows: function () {
            var selectedFields = _.pluck(_.filter(triggerStep.arguments.inputVariables, function (inputVariable) {
              return inputVariable.useRecordFieldDefault;
            }), 'moduleField');
            selectedFields.push('uuid');
            return exportService.loadRowsForExport(getSelectedRows(), entity.name, _.uniq(selectedFields)).then(function (response) {
              return response || [];
            });
          }
        }
      });

      modalInstance.result.then(function (result) {
        var inputVariables = angular.extend(result.inputVariables, playbookExeOption);
        $scope.loadProcessing = true;
        _sendPost(triggerStep.arguments.route, playbook, inputVariables, getSelectedRows, scope, isSync, entity.name, refreshGrid).then(function () {
          defer.resolve();
        }, function () {
          defer.reject();
        });
      });
      return defer.promise;
    }


    function _sendPost(route, playbook, inputVariables, getSelectedRows, scope, isSync, moduleName, refreshGrid) {
      var defer = $q.defer();
      $scope.refreshProcessing = refreshGrid;
      var workflowsReadPermission = currentPermissionsService.availablePermission(FIXED_MODULE.PLAYBOOK, 'read');
      var data = $scope.custom_selected_records ? [$scope.custom_selected_records] : getSelectedRows();
      var records = [];
      angular.forEach(data, function (record) {
        records.push(record['@id']);
      });
      var inputData = inputVariables;
      inputData.__resource = moduleName;
      inputData.__uuid = $filter('getEndPathName')(playbook['@id']);
      inputData.records = records;
      if (scope.parentRecordId) {
        inputData.__parentRecordId = scope.parentRecordId;
      }
      var url = API.ACTION_TRIGGER + route;
      if (isSync && workflowsReadPermission && playbook.recordTags.includes('SystemWaitForCompletion')) {
        url = API.ACTION_TRIGGER + route + '?force_debug=true';
      }
      $resource(url).save(inputData).$promise.then(function (response) {
        /* jshint camelcase: false */
        var taskIds = [];
        if (response.task_ids && response.task_ids.length > 0) {
          taskIds = response.task_ids;
        } else if (response.task_id) {
          taskIds.push(response.task_id);
        }
        var recordsText = records.length === 1 ? 'record' : 'records';
        if (isSync && workflowsReadPermission) {
          playbookService.checkPlaybookExecutionCompletion(taskIds, function (result) {
            playbookService.getExecutedPlaybookLogData(result.instance_ids).then(function (data) {
              if (data.status) {
                if (data.status === 'finished' && data.result) {
                  if (refreshGrid) {
                    // csGrid decides what to render from the PagedCollection's
                    // `list`/`keyPairs`, NOT from `data['hydra:member']`:
                    //   if (isUndefined(pc.list) || pc.list.length === 0)
                    //     gridOptions.data = [];            // zero rows
                    //   else
                    //     gridOptions.data = pc.keyPairs;   // the rows
                    // Setting only `data['hydra:member']` leaves `list`
                    // undefined, so the grid renders the column headers but no
                    // body rows. Populate `list` and `keyPairs` (the rows csGrid
                    // actually paints) so the data shows up. Each row still gets
                    // a synthesized '@id'/uuid when missing (csGrid selection
                    // tracks rows by IRI).
                    var gridData = ensureRowIds(data.result.grid_data);
                    // Master row set — sort/filter always derive from this so
                    // they compose and are reversible.
                    $scope._gridAllRows = gridData;

                    // Columns: map name->field, then apply the saved per-user
                    // order (default order = grid_columns order).
                    var columns = normalizeColumns((data.result.grid_columns || {}).columns, gridData);
                    // Admin column chooser default (order + visibility) first,
                    // then the per-user dragged order overrides order on top.
                    columns = applyColumnPrefs(columns, $scope.config.columnPrefs);
                    columns = applyColumnOrder(columns, getSavedColumnOrder());
                    // Re-apply any per-user resized widths last (independent of
                    // order/visibility).
                    $scope.columnDefs = applyColumnWidths(columns, getSavedColumnWidths());

                    $scope.gridOptions.data = gridData;
                    $scope.gridPagedCollection = new PagedCollection('dummy_module', null, {}, false, null, $scope.columnDefs);
                    // csGrid renders rows from list/keyPairs (not hydra:member);
                    // see the helper. Seed them with the full set.
                    setCollectionRows($scope.gridPagedCollection, gridData);
                    // Defensive: neutralize the collection's server reload. With
                    // native sort/filter (useExternal*: false) csGrid does not
                    // call this, but if any csGrid action ever does, the base
                    // loadGridRecord would query the non-existent dummy_module
                    // endpoint and blank the grid. Resolve without touching the
                    // rows instead.
                    $scope.gridPagedCollection.loadGridRecord = function () {
                      return $q.when(true);
                    };
                  }
                  $scope.loadProcessing = false;
                  $scope.refreshProcessing = false;
                  defer.resolve(data);
                }
                else if (data.status === 'failed') {
                  $scope.loadProcessing = false;
                  $scope.refreshProcessing = false;
                  toaster.warning({
                    body: 'Not able to fetch the status of the triggered playbook "'
                  });
                  defer.resolve(data);
                }
              }
            }, statusCodeService);
          }, function () {
            toaster.warning({
              body: 'Not able to fetch the status of the triggered playbook "' + playbook.name + '" or the playbook is taking too long to complete. Kindly check the Playbook Execution Log for more details.'
            });
            $scope.loadProcessing = false;
            $scope.refreshProcessing = false;
            defer.reject();
          }, scope);
        } else {
          var nextText = records.length > 0 ? '" on ' + records.length + ' ' + recordsText : '"';
          toaster.success({
            body: 'Triggered action "' + playbook.name + nextText + '.'
          });
          defer.resolve();
          $scope.loadProcessing = false;
          $scope.refreshProcessing = false;
          scope.$emit('playbookActions:triggerCompleted');
        }
      });
      return defer.promise;
    }

    _init();
  }

  // ── Custom date-range modal ───────────────────────────────────────────────
  // The "Define Custom Date Range" popup opened from a date column's filter
  // dropdown. Mirrors the native FortiSOAR dialog: From/To calendars + time,
  // Apply/Cancel. Rendered by $uibModal (appended to <body>), so it isn't
  // clipped by the grid header. Resolves with { from, to } epoch-ms.
  var JTG_RANGE_MODAL_TEMPLATE =
    '<div class="jtg-range">' +
    '  <div class="modal-header">' +
    '    <button type="button" class="close" ng-click="m.cancel()" aria-label="Close">&times;</button>' +
    '    <h4 class="modal-title">Define Custom Date Range</h4>' +
    '  </div>' +
    '  <div class="modal-body">' +
    '    <div class="jtg-range-cols">' +
    '      <div class="jtg-range-col">' +
    '        <div class="jtg-range-label">From <a href ng-if="m.from" ng-click="m.clearFrom()" class="jtg-range-clear">clear</a></div>' +
    '        <div uib-datepicker ng-model="m.from" datepicker-options="m.dpOpts"></div>' +
    '        <div uib-timepicker ng-model="m.from" show-meridian="false" minute-step="1"></div>' +
    '      </div>' +
    '      <div class="jtg-range-col">' +
    '        <div class="jtg-range-label">To <a href ng-if="m.to" ng-click="m.clearTo()" class="jtg-range-clear">clear</a></div>' +
    '        <div uib-datepicker ng-model="m.to" datepicker-options="m.dpOpts"></div>' +
    '        <div uib-timepicker ng-model="m.to" show-meridian="false" minute-step="1"></div>' +
    '      </div>' +
    '    </div>' +
    '    <div class="jtg-range-err" ng-if="m.error">{{ m.error }}</div>' +
    '  </div>' +
    '  <div class="modal-footer">' +
    '    <button type="button" class="btn btn-primary btn-sm" ng-click="m.apply()"><i class="fa fa-check"></i> Apply</button>' +
    '    <button type="button" class="btn btn-default btn-sm" ng-click="m.cancel()"><i class="fa fa-times"></i> Cancel</button>' +
    '  </div>' +
    '</div>';

  // controllerAs 'm'. Injects only the modal $scope: $close/$dismiss come from
  // $uibModal, and the resolved `init` { from, to } seed is read off
  // $scope.$resolve (ui-bootstrap exposes resolves there) rather than as an
  // injected local — a named resolve dependency would trip the harness lint's
  // unregistered-service check. Deliberately does NOT inject $uibModalInstance —
  // the harness stubs that to a no-op.
  JtgRangeModalCtrl.$inject = ['$scope'];
  function JtgRangeModalCtrl($scope) {
    var m = this;
    var init = ($scope.$resolve && $scope.$resolve.init) || {};
    m.dpOpts = { showWeeks: false };
    m.from = (init && init.from !== null && init.from !== undefined) ? new Date(init.from) : null;
    m.to = (init && init.to !== null && init.to !== undefined) ? new Date(init.to) : null;
    m.error = '';
    m.clearFrom = function () { m.from = null; };
    m.clearTo = function () { m.to = null; };
    m.apply = function () {
      var from = (m.from instanceof Date && !isNaN(m.from.getTime())) ? m.from.getTime() : null;
      var to = (m.to instanceof Date && !isNaN(m.to.getTime())) ? m.to.getTime() : null;
      if (from === null && to === null) { m.error = 'Pick a From and/or To date.'; return; }
      if (from !== null && to !== null && from > to) { m.error = 'From must be on or before To.'; return; }
      $scope.$close({ from: from, to: to });
    };
    m.cancel = function () { $scope.$dismiss('cancel'); };
  }

  // ── jtgColumnFilter directive ─────────────────────────────────────────────
  // Renders the FortiSOAR-style dropdown filter for a grid column. ui-grid
  // injects this via colDef.filterHeaderTemplate; the header-cell scope it runs
  // in exposes `col` (GridColumn) and `grid`. We read the filter mode/metadata
  // off col.colDef (set by decorateColumnFilter) and write the chosen term into
  // col.filters[0].term, then refresh so ui-grid re-runs the column's condition
  // over the in-memory rows. Non-isolate scope: each column's filter cell has
  // its own child scope, so `scope.jtg` state never collides across columns.
  jtgColumnFilter.$inject = ['$injector', '$uibModal'];
  function jtgColumnFilter($injector, $uibModal) {
    return {
      restrict: 'A',
      template:
        '<div uib-dropdown is-open="jtg.open" auto-close="outsideClick" dropdown-append-to-body="true" class="jtg-dd">' +
        '  <a href class="jtg-toggle" uib-dropdown-toggle title="{{ jtg.summary() }}">' +
        '    <span class="jtg-toggle-text" ng-bind="jtg.summary()"></span>' +
        '    <i class="fa fa-caret-down jtg-caret"></i>' +
        '  </a>' +
        '  <ul class="dropdown-menu jtg-menu" uib-dropdown-menu>' +
        '    <li class="jtg-menu-title">{{ col.displayName }}</li>' +
        '    <li ng-if="jtg.mode===\'tri\'" ng-repeat="o in jtg.triOptions">' +
        '      <a href ng-click="jtg.setTerm(o.value)"><i class="fa fa-fw" ng-class="{\'fa-check\': jtg.term===o.value}"></i> {{ o.label }}</a>' +
        '    </li>' +
        '    <li ng-if="jtg.mode===\'date\'">' +
        '      <a href ng-click="jtg.setTerm(\'\')"><i class="fa fa-fw" ng-class="{\'fa-check\': !jtg.term}"></i> Any time</a>' +
        '    </li>' +
        '    <li ng-if="jtg.mode===\'date\'" ng-repeat="p in jtg.datePresets">' +
        '      <a href ng-click="jtg.setTerm(p.key)"><i class="fa fa-fw" ng-class="{\'fa-check\': jtg.term===p.key}"></i> {{ p.label }}</a>' +
        '    </li>' +
        '    <li ng-if="jtg.mode===\'date\'" class="divider"></li>' +
        '    <li ng-if="jtg.mode===\'date\'">' +
        '      <a href ng-click="jtg.openCustom()"><i class="fa fa-fw" ng-class="{\'fa-check\': jtg.isCustom()}"></i> Custom Range…</a>' +
        '    </li>' +
        '    <li ng-if="jtg.mode===\'enum\'" class="jtg-enum">' +
        '      <input class="form-control input-sm jtg-enum-search" ng-model="jtg.search" placeholder="Enter search" ng-click="$event.stopPropagation()">' +
        '      <div class="jtg-allrow">' +
        '        <a href ng-click="jtg.checkAll(true)"><i class="fa fa-check"></i> Check All</a>' +
        '        <a href ng-click="jtg.checkAll(false)"><i class="fa fa-times"></i> Uncheck All</a>' +
        '      </div>' +
        '      <label class="jtg-check"><input type="checkbox" ng-model="jtg.selected[\'__notset\']"> <em>Not Set</em></label>' +
        '      <label class="jtg-check" ng-repeat="v in jtg.enumValues | filter:jtg.search"><input type="checkbox" ng-model="jtg.selected[v]"> {{ v }}</label>' +
        '      <button type="button" class="btn btn-primary btn-sm jtg-apply" ng-click="jtg.apply()"><i class="fa fa-check"></i> Apply</button>' +
        '    </li>' +
        '  </ul>' +
        '</div>',
      link: function (scope) {
        var col = scope.col;
        var grid = scope.grid;
        var def = (col && col.colDef) || {};
        var uiGridConstants = $injector.has('uiGridConstants') ? $injector.get('uiGridConstants') : null;
        var dateFilter = $injector.has('$filter') ? $injector.get('$filter')('date') : null;

        function currentTerm() {
          return (col && col.filters && col.filters[0]) ? col.filters[0].term : undefined;
        }

        scope.jtg = {
          mode: def.jtgFilterMode,
          open: false,
          enumValues: def.jtgEnumValues || [],
          datePresets: DATE_PRESETS,
          search: '',
          selected: {},
          triOptions: [
            { value: '', label: 'Any' },
            { value: 'notset', label: 'Not Set' },
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' }
          ],
          term: currentTerm()
        };

        // Seed enum checkboxes from any pre-existing term (e.g. survives a
        // grid refresh / re-render).
        if (scope.jtg.mode === 'enum' && angular.isArray(scope.jtg.term)) {
          scope.jtg.term.forEach(function (v) { scope.jtg.selected[v] = true; });
        }

        function setTerm(v) {
          if (col && col.filters && col.filters[0]) {
            col.filters[0].term = v;
          }
          scope.jtg.term = v;
          refresh();
        }

        function refresh() {
          try {
            if (grid && grid.api && grid.api.core && angular.isFunction(grid.api.core.notifyDataChange)) {
              grid.api.core.notifyDataChange(uiGridConstants ? uiGridConstants.dataChange.COLUMN : 'column');
            }
            if (grid && angular.isFunction(grid.refresh)) {
              grid.refresh();
            }
          } catch (e) {
            // Refresh is best-effort; a failure must not break the dropdown.
          }
        }

        scope.jtg.setTerm = function (v) {
          setTerm(v);
          scope.jtg.open = false;
        };

        scope.jtg.isCustom = function () {
          return !!(scope.jtg.term && typeof scope.jtg.term === 'object');
        };

        // Open the "Define Custom Date Range" popup (a $uibModal, appended to
        // <body> so it isn't clipped by the grid header / dropdown). Resolves
        // with { from, to } epoch-ms on Apply; a dismiss (Cancel/backdrop)
        // leaves the existing filter untouched.
        scope.jtg.openCustom = function () {
          scope.jtg.open = false;
          var existing = (scope.jtg.term && typeof scope.jtg.term === 'object') ? scope.jtg.term : {};
          $uibModal.open({
            template: JTG_RANGE_MODAL_TEMPLATE,
            controller: JtgRangeModalCtrl,
            controllerAs: 'm',
            windowClass: 'jtg-range-modal',
            backdrop: true,
            resolve: {
              init: function () {
                return {
                  from: (existing.from === undefined || existing.from === null) ? null : existing.from,
                  to: (existing.to === undefined || existing.to === null) ? null : existing.to
                };
              }
            }
          }).result.then(function (range) {
            if (range && (range.from !== null || range.to !== null)) {
              setTerm({ from: range.from, to: range.to });
            }
          }, function () { /* dismissed — keep current filter */ });
        };

        scope.jtg.checkAll = function (on) {
          scope.jtg.selected = {};
          if (on) {
            scope.jtg.selected.__notset = true;
            scope.jtg.enumValues.forEach(function (v) { scope.jtg.selected[v] = true; });
          }
        };

        scope.jtg.apply = function () {
          var arr = [];
          if (scope.jtg.selected.__notset) { arr.push('__notset'); }
          scope.jtg.enumValues.forEach(function (v) {
            if (scope.jtg.selected[v]) { arr.push(v); }
          });
          setTerm(arr);
          scope.jtg.open = false;
        };

        scope.jtg.summary = function () {
          var t = scope.jtg.term;
          if (scope.jtg.mode === 'tri') {
            if (t === 'notset') { return 'Not Set'; }
            if (t === 'true') { return 'Yes'; }
            if (t === 'false') { return 'No'; }
            return 'Search';
          }
          if (scope.jtg.mode === 'date') {
            if (!t) { return 'Select'; }
            if (typeof t === 'object') {
              var fmt = function (ms) {
                if (ms === undefined || ms === null) { return '…'; }
                return dateFilter ? dateFilter(ms, 'MMM d, y HH:mm') : new Date(ms).toLocaleString();
              };
              return fmt(t.from) + ' – ' + fmt(t.to);
            }
            var p = DATE_PRESETS.filter(function (x) { return x.key === t; })[0];
            return p ? p.label : 'Select';
          }
          if (scope.jtg.mode === 'enum') {
            if (!angular.isArray(t) || !t.length) { return 'Search'; }
            return t.length + ' selected';
          }
          return 'Search';
        };
      }
    };
  }

  angular.module('cybersponse').directive('jtgColumnFilter', jtgColumnFilter);
})();