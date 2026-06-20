/* Copyright start
    MIT License
    Copyright (c) 2026 Fortinet Inc
Copyright end */
'use strict';
(function () {
    angular
        .module('cybersponse')
        .controller('editJsonToGrid130DevCtrl', editJsonToGrid130DevCtrl);

    editJsonToGrid130DevCtrl.$inject = ['$scope', '$resource', 'API', '$uibModalInstance', 'config', 'Field', '$filter', '_'];

    function editJsonToGrid130DevCtrl($scope, $resource, API, $uibModalInstance, config, Field, $filter, _) {
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
        }
        _init();

    }
})();
