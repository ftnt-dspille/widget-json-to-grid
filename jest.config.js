"use strict";

// Jest project config for the json-to-grid widget. The harness owns the
// runtime (jest/jsdom/angular/angular-mocks) and merges this in when invoked
// with `make test-unit WIDGET=widget-json-to-grid`.
module.exports = {
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    url: "http://localhost/jsonToGrid-dev/",
  },
  testMatch: ["<rootDir>/tests/**/*.test.js"],
};
