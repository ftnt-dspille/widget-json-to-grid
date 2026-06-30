/* Copyright start
    MIT License
    Copyright (c) 2026 Fortinet Inc
Copyright end */
'use strict';
(function () {
    angular
        .module('cybersponse')
        .controller('editJsonToGrid150DevCtrl', editJsonToGrid150DevCtrl);

    editJsonToGrid150DevCtrl.$inject = ['$scope', '$resource', 'API', '$uibModalInstance', 'config', 'Field', '$filter', '_', '$q', 'playbookService', 'currentPermissionsService', 'FIXED_MODULE', 'toaster'];

    function editJsonToGrid150DevCtrl($scope, $resource, API, $uibModalInstance, config, Field, $filter, _, $q, playbookService, currentPermissionsService, FIXED_MODULE, toaster) {
        $scope.cancel = cancel;
        $scope.save = save;
        $scope.config = config;
        $scope.config.widgetName = 'Playbook Execution Wizard';
        $scope.playbookList = [];
        $scope.playbookButton = playbookButton;
        $scope.playbookData = [];
        $scope.showExecutionProgressCheckbox = showExecutionProgressCheckbox;
        if (!$scope.config.actionButtons) {
            $scope.config.actionButtons = [];
        }
        if (!$scope.config.selectedPlaybooksWithoutRecord) {
            $scope.config.selectedPlaybooksWithoutRecord = [];
        }
        if (!$scope.config.selectedPlaybooksWithRecord) {
            $scope.config.selectedPlaybooksWithRecord = [];
        }
        $scope.changedCollection = changedCollection;
        $scope.addButton = addButton;
        $scope.addButtonWithRecord = addButtonWithRecord;
        $scope.addButtonWithoutRecord = addButtonWithoutRecord;
        $scope.removeButton = removeButton;
        $scope.removeButtonWithRecord = removeButtonWithRecord;
        $scope.removeButtonWithoutRecord = removeButtonWithoutRecord;
        $scope.resetButtonWithoutRecord = resetButtonWithoutRecord;
        $scope.resetButtonWithRecord = resetButtonWithRecord;
        $scope.toggleAdvancedSettings = toggleAdvancedSettings;

        // ── Column chooser (FOLLOWUPS #2) ──────────────────────────────────
        // The admin can run the data-provider playbook once here to discover its
        // real columns, then pick a default visibility + order. The result is
        // persisted as config.columnPrefs (ordered [{ field, displayName,
        // visible }]); view.controller merges it over the runtime grid_columns.
        $scope.columnChooser = [];          // working list shown in edit.html
        $scope.discoverColumns = discoverColumns;
        $scope.toggleColumnVisible = toggleColumnVisible;
        $scope.moveColumnUp = moveColumnUp;
        $scope.moveColumnDown = moveColumnDown;
        $scope.resetColumnPrefs = resetColumnPrefs;
        $scope.columnDiscovery = { processing: false, error: null, done: false };

        function getDataProvider() {
            return ($scope.config.actionButtons || [])[0];
        }

        // Build the working chooser list by merging previously-saved prefs
        // (order + visibility) with a freshly-discovered set of columns. Saved
        // entries come first in their saved order; newly discovered columns are
        // appended (visible by default); saved entries whose column vanished are
        // dropped. `discovered` is an array of { field, displayName, type }.
        function mergeChooser(discovered, prefs) {
            var byField = {};
            discovered.forEach(function (c) { byField[c.field] = c; });
            var merged = [];
            var seen = {};
            (prefs || []).forEach(function (p) {
                var field = p && (p.field || p.name);
                if (field && byField[field] && !seen[field]) {
                    merged.push(angular.extend({}, byField[field], {
                        visible: p.visible !== false
                    }));
                    seen[field] = true;
                }
            });
            discovered.forEach(function (c) {
                if (!seen[c.field]) {
                    merged.push(angular.extend({}, c, { visible: true }));
                    seen[c.field] = true;
                }
            });
            return merged;
        }

        function discoverColumns() {
            var provider = getDataProvider();
            if (!provider || !provider.uuid) {
                $scope.columnDiscovery.error = 'Add a data-provider playbook first.';
                return $q.when();
            }
            $scope.columnDiscovery.processing = true;
            $scope.columnDiscovery.error = null;
            return runProviderForColumns(provider.uuid).then(function (columns) {
                $scope.columnChooser = mergeChooser(columns, $scope.config.columnPrefs);
                $scope.columnDiscovery.done = true;
                $scope.columnDiscovery.processing = false;
            }, function (err) {
                $scope.columnDiscovery.processing = false;
                $scope.columnDiscovery.error = (err && err.message) || 'Could not discover columns. Run the playbook manually and verify it returns grid_columns.';
                if (toaster && angular.isFunction(toaster.pop)) {
                    toaster.pop('error', 'Column discovery failed', $scope.columnDiscovery.error);
                }
            });
        }

        // Trigger the data-provider playbook synchronously (record-less, the
        // edit modal has no selected rows) and resolve with its normalized
        // grid_columns. Mirrors view.controller's force_debug → checkCompletion
        // → getExecutedPlaybookLogData chain, minus the grid wiring.
        function runProviderForColumns(uuid) {
            var defer = $q.defer();
            $resource(API.BASE + API.WORKFLOWS + uuid).get({ '$relationships': true }).$promise.then(function (playbook) {
                playbook.recordTags = playbook.recordTags || [];
                if (playbook.recordTags.indexOf('SystemWaitForCompletion') === -1) {
                    playbook.recordTags.push('SystemWaitForCompletion');
                }
                var triggerStep = playbookService.getTriggerStep(playbook);
                if (!triggerStep || !triggerStep.arguments || !triggerStep.arguments.route) {
                    return defer.reject({ message: 'Playbook has no manual-trigger route.' });
                }
                var workflowsReadPermission = currentPermissionsService.availablePermission(FIXED_MODULE.PLAYBOOK, 'read');
                if (!workflowsReadPermission) {
                    return defer.reject({ message: 'Playbook read permission is required to run the provider here.' });
                }
                // The trigger may be record-SCOPED (its arguments.resources name
                // a module, e.g. ['alerts']). The action-trigger endpoint
                // authorizes against __resource, so it MUST be the scoped module
                // name — sending '' yields a 403 AccessDenied even with no
                // selected records. Mirror the view path (__resource =
                // entity.name from resources[0]); fall back to '' for a truly
                // record-less (generic/manual) provider.
                var resources = triggerStep.arguments.resources || [];
                var inputData = {
                    __resource: resources.length ? resources[0] : '',
                    __uuid: $filter('getEndPathName')(playbook['@id']),
                    records: []
                };
                var url = API.ACTION_TRIGGER + triggerStep.arguments.route + '?force_debug=true';
                $resource(url).save(inputData).$promise.then(function (response) {
                    var taskIds = [];
                    if (response.task_ids && response.task_ids.length > 0) {
                        taskIds = response.task_ids;
                    } else if (response.task_id) {
                        taskIds.push(response.task_id);
                    }
                    playbookService.checkPlaybookExecutionCompletion(taskIds, function (result) {
                        playbookService.getExecutedPlaybookLogData(result.instance_ids).then(function (data) {
                            if (data && data.status === 'finished' && data.result) {
                                // Columns may be returned in result OR set as an
                                // env variable in any step (see view.controller's
                                // resolveGridPayload). Prefer result, fall back
                                // to the named env var so discovery works even
                                // when columns aren't in the final step.
                                var env = data.env || {};
                                var gridColumns =
                                    angular.isArray((data.result.grid_columns || {}).columns) ? data.result.grid_columns :
                                    angular.isArray((env.grid_columns || {}).columns) ? env.grid_columns :
                                    { columns: [] };
                                var raw = gridColumns.columns || [];
                                var columns = (angular.isArray(raw) ? raw : []).map(function (col) {
                                    var field = col.field || col.name;
                                    return { field: field, displayName: col.displayName || col.name || field, type: col.type || 'string' };
                                });
                                if (!columns.length) {
                                    return defer.reject({ message: 'Playbook ran but returned no grid_columns.' });
                                }
                                defer.resolve(columns);
                            } else {
                                defer.reject({ message: 'Playbook did not finish successfully (status: ' + (data && data.status) + ').' });
                            }
                        }, function () { defer.reject({ message: 'Could not read the playbook execution log.' }); });
                    });
                }, function () { defer.reject({ message: 'Could not trigger the data-provider playbook.' }); });
            }, function () { defer.reject({ message: 'Could not load the data-provider playbook.' }); });
            return defer.promise;
        }

        function toggleColumnVisible(col) {
            col.visible = !col.visible;
            persistColumnPrefs();
        }

        function moveColumnUp(index) {
            if (index <= 0) { return; }
            var arr = $scope.columnChooser;
            var tmp = arr[index - 1];
            arr[index - 1] = arr[index];
            arr[index] = tmp;
            persistColumnPrefs();
        }

        function moveColumnDown(index) {
            var arr = $scope.columnChooser;
            if (index >= arr.length - 1) { return; }
            var tmp = arr[index + 1];
            arr[index + 1] = arr[index];
            arr[index] = tmp;
            persistColumnPrefs();
        }

        function resetColumnPrefs() {
            $scope.config.columnPrefs = [];
            $scope.columnChooser = [];
            $scope.columnDiscovery.done = false;
            $scope.columnDiscovery.error = null;
        }

        // Serialize the working chooser into config.columnPrefs (the persisted
        // contract view.controller reads). Called on every change and on save.
        function persistColumnPrefs() {
            // Only write when the admin has actually built a chooser list. An
            // empty working list (never discovered this session) must NOT wipe a
            // previously-saved columnPrefs — use resetColumnPrefs() to clear.
            if (!$scope.columnChooser || !$scope.columnChooser.length) {
                return;
            }
            $scope.config.columnPrefs = $scope.columnChooser.map(function (c) {
                return { field: c.field, displayName: c.displayName, visible: c.visible !== false };
            });
        }

        function toggleAdvancedSettings() {
            $scope.toggle = !$scope.toggle;
          }

        function resetButtonWithoutRecord() {
            if ($scope.config.showButtonWithoutRecord === false) {
                $scope.config.selectedPlaybooksWithoutRecord = [];
            }
        }

        function resetButtonWithRecord() {
            if ($scope.config.showButtonWithRecord === false) {
                $scope.config.selectedPlaybooksWithRecord = [];
                $scope.playbookList = [];
                $scope.config.selectedExecutionWizardPlaybooks = [];
                $scope.config.showExecutionProgress = false;
            }
        }

        function changedCollection() {
            $scope.config.actionButtons = [];
            $scope.playbookData = [];
            $scope.config.selectedPlaybooksWithoutRecord = [];
            $scope.config.selectedPlaybooksWithRecord = [];
            $scope.playbookList = [];
            getCollectionPlaybooks();
        }

        function showExecutionProgressCheckbox() {
            if ($scope.config.showButton) {
                $scope.config.selectedPlaybooksWithoutRecord = [];
                $scope.config.selectedPlaybooksWithRecord = [];
                $scope.playbookData = [];
                $scope.playbookList = [];
            }
        }

        function playbookButton() {
            $scope.playbookList = angular.copy($scope.config.selectedPlaybooksWithRecord);
        }

        function getCollectionPlaybooks() {
            var collectionUUID = $filter('getEndPathName')(config.playbookCollection['@id']);
            var playbookQuery = {
                '$limit': 100,
                '$orderby': 'name',
                'collection': collectionUUID,
                '__selectFields': 'name,description'
            };
            $resource(API.BASE + 'workflows').get(playbookQuery).$promise.then(function (response) {
                $scope.playbookData = response['hydra:member'];
            }, function (error) {
                defer.reject(error);

            });
        }

        function cancel() {
            $uibModalInstance.dismiss('cancel');
        }

        function save() {
            if ($scope.editJsonToGridForm.$invalid) {
                $scope.editJsonToGridForm.$setTouched();
                $scope.editJsonToGridForm.$focusOnFirstError();
                return;
            }
            persistColumnPrefs();
            $uibModalInstance.close($scope.config);
        }

        function addButton(playbook) {
            if (playbook) {
                $scope.config.actionButtons.push(playbook);
                $scope.selectedPlaybook = '';
            }
        }

        function addButtonWithoutRecord(playbook) {
            $scope.config.selectedPlaybooksWithoutRecord.push(playbook);
            $scope.playbookList.push(playbook);
        }

        function addButtonWithRecord(playbook) {
            $scope.config.selectedPlaybooksWithRecord.push(playbook);
            $scope.playbookList.push(playbook);
        }

        function removeButton(index) {
            $scope.config.actionButtons.splice(index, 1);
        }

        function removeButtonWithRecord(index, action) {
            $scope.config.selectedPlaybooksWithRecord.splice(index, 1);
            $scope.config.selectedExecutionWizardPlaybooks = _.reject($scope.config.selectedExecutionWizardPlaybooks, obj => obj.id === action.id);
        }

        function removeButtonWithoutRecord(index, action) {
            $scope.config.selectedPlaybooksWithoutRecord.splice(index, 1);
            $scope.config.selectedExecutionWizardPlaybooks = _.reject($scope.config.selectedExecutionWizardPlaybooks, obj => obj.id === action.id);
        }

        function _init() {
            $scope.getWorkflowCollectionsField = new Field({
                'name': 'Workflow Collections',
                'title': 'Workflow Collections',
                'writeable': true,
                'dataSource': {
                    'model': 'workflow_collections',
                    'query': {
                        '$limit': 1000,
                        'sort': [{
                            'field': 'name',
                            'direction': 'asc',
                            '_fieldName': 'name'

                        }],
                        'filters': []
                    }
                },
                'validation': {
                    'required': true
                }
            });
            $scope.getWorkflowCollectionsField.displayTemplate = '{{ name }}';
            if (config.playbookCollection) {
                getCollectionPlaybooks();
            }
            // Re-open with previously-saved column prefs visible (no need to
            // re-discover just to tweak visibility/order). Discovered `type` is
            // unknown until a fresh discovery; it doesn't affect the chooser UI.
            if (angular.isArray($scope.config.columnPrefs) && $scope.config.columnPrefs.length) {
                $scope.columnChooser = $scope.config.columnPrefs.map(function (p) {
                    return { field: p.field, displayName: p.displayName || p.field, type: p.type || 'string', visible: p.visible !== false };
                });
                $scope.columnDiscovery.done = true;
            }
        }
        _init();

    }
})();
