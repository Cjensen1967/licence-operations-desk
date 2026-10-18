"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const WSGCModel = require("../shared/model.js");
const WorkspaceSettings = require("../shared/workspace.js");
const { createSettingsBackup, mergeSettings, normalizeSettings, parseSettingsBackup } = WorkspaceSettings;

test("settings backup contains workspace choices but no roster data", () => {
  const backup = createSettingsBackup([{ accountId: "property-1", name: "Example", raw: { shouldNot: "leave" } }], { people: { "contact:1": { starred: true, name: "Person One", department: "Security", tags: ["Night"] } } }, "2026-10-01T00:00:00.000Z");
  assert.equal(backup.properties[0].name, "Example");
  assert.equal("raw" in backup.properties[0], false);
  assert.equal(backup.settings.people["contact:1"].starred, true);
  assert.equal("snapshots" in backup, false);
  assert.equal("cookies" in backup, false);
  assert.deepEqual(parseSettingsBackup(backup).properties, backup.properties);
});

test("merge keeps existing staff labels and applies incoming changes", () => {
  const merged = mergeSettings({ people: { a: { starred: true, department: "Security", tags: ["A"] } } }, { people: { b: { starred: true, department: "Operations", tags: ["B"] } } });
  assert.equal(merged.people.a.department, "Security");
  assert.equal(merged.people.b.department, "Operations");
});

test("normalization removes empty and duplicate tags", () => {
  const settings = normalizeSettings({ people: { a: { tags: ["Night", "", "Night", " Lead "] } } });
  assert.deepEqual(settings.people.a.tags, ["Night", "Lead"]);
  assert.deepEqual(settings.alertThresholds, [30, 60, 90]);
});


test("property preferences keep one home property and short names", () => {
  const settings = normalizeSettings({ properties: { p1: { shortName: "Moose MLT", home: true }, p2: { shortName: "Silver Dollar", home: true } } });
  assert.equal(settings.properties.p1.shortName, "Moose MLT");
  assert.equal(Object.values(settings.properties).filter((property) => property.home).length, 1);

  const merged = mergeSettings(
    { properties: { p1: { shortName: "Moose MLT", home: true } } },
    { properties: { p2: { shortName: "Silver Dollar", home: true } } },
  );
  assert.equal(Object.values(merged.properties).filter((property) => property.home).length, 1);
  assert.equal(merged.properties.p1.shortName, "Moose MLT");
  assert.equal(merged.properties.p2.shortName, "Silver Dollar");
});

test("app.js uses multi-element selector $$(...) for all .forEach() event bindings", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const singleSelectorArrayCalls = [...source.matchAll(/(?<![\$a-zA-Z0-9_])\$\([^)]+\)\.(forEach|map|filter|some|every|find|reduce)\b/g)];
  assert.deepEqual(singleSelectorArrayCalls.map((match) => match[0]), []);

  for (const selector of [
    "[data-property-export]",
    "[data-property-short-name]",
    "[data-property-home]",
  ]) {
    assert.equal(
      source.includes(`$$('${selector}').forEach(`),
      true,
      `Expected $$('${selector}').forEach(...) in app.js`,
    );
  }
});

function createAppHarness(storedProperties, storedSnapshots, initialWorkspace) {
  const elements = new Map();
  const makeElement = (id = "") => {
    const listeners = {};
    const classes = new Set();
    return {
      id,
      value: "",
      textContent: "",
      innerHTML: "",
      disabled: false,
      checked: false,
      open: false,
      returnValue: "confirm",
      dataset: {},
      classList: {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (name, force) => {
          const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
          if (shouldAdd) classes.add(name);
          else classes.delete(name);
          return shouldAdd;
        },
        contains: (name) => classes.has(name),
      },
      setAttribute(name, val) { this[name] = val; },
      removeAttribute(name) { if (name === "open") this.open = false; delete this[name]; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      trigger(type, event = {}) { for (const fn of listeners[type] || []) fn({ currentTarget: this, target: this, preventDefault() {}, stopPropagation() {}, ...event }); },
      showModal() { this.open = true; },
      close() { this.open = false; this.trigger("close"); },
      reset() {},
      click() { this.trigger("click"); },
      closest() { return null; },
      contains() { return false; },
      scrollIntoView() {},
      querySelector() { return makeElement(); },
      querySelectorAll() { return []; },
    };
  };
  const getEl = (selector) => {
    if (!elements.has(selector)) elements.set(selector, makeElement(selector.replace(/^#/, "")));
    return elements.get(selector);
  };
  const tabPeople = getEl("#tab-people-register"); tabPeople.dataset.registerMode = "people";
  const tabRecords = getEl("#tab-records-register"); tabRecords.dataset.registerMode = "records";
  let savedWorkspace = initialWorkspace;
  let promptReturnValue = "SD Mill Creek";

  const sandbox = {
    WSGCModel,
    WorkspaceSettings,
    DB: {
      async getProperties() { return storedProperties.map((p) => ({ ...p })); },
      async putProperty() {},
      async deleteProperty() {},
      async clearProperties() {},
      async getSnapshots(accountId) { return storedSnapshots[accountId] || []; },
      async putSnapshot() {},
      async getSetting(key, fallback) { return key === "workspace" ? savedWorkspace : fallback; },
      async putSetting(key, value) { if (key === "workspace") savedWorkspace = value; },
      async clearAll() {},
    },
    document: {
      querySelector: (sel) => getEl(sel),
      querySelectorAll: (sel) => (sel === "[data-register-mode]" ? [tabPeople, tabRecords] : []),
      addEventListener() {},
      createElement: () => makeElement(),
    },
    Intl, Date, Map, Set, Number, String, Boolean, Object, Array, Math, Promise, Error,
    FormData: class { entries() { return []; } },
    Blob: class {},
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    prompt: () => promptReturnValue,
    setTimeout: () => 1,
    clearTimeout() {},
  };
  return { sandbox, getEl, getSavedWorkspace: () => savedWorkspace };
}

test("app.js runtime exercises People register, All Licence Records register, Changes, Properties preferences, CSV rows, and About acknowledgements", async () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "app.html"), "utf8");
  assert.equal(
    html.includes("Thanks to Ryan Wilson for early testing, feedback, and feature suggestions that helped improve Licence Operations Desk."),
    true,
  );

  const storedProperties = [
    { accountId: "prop-1", name: "Royal Casino Everett", city: "Everett", county: "Snohomish" },
    { accountId: "prop-2", name: "Silver Dollar Mill Creek", city: "Mill Creek", county: "Snohomish" },
  ];
  const storedSnapshots = {
    "prop-1": [
      {
        id: "prop-1:2",
        accountId: "prop-1",
        propertyName: "Royal Casino Everett",
        retrievedAt: "2026-10-15T12:00:00.000Z",
        individuals: [
          { fullname: "Jane Doe", contactid: "c-jane", licensenumber: "68-10001", licensetype: "Card Room Employee", status: "Active", expirationdate: "2027-08-01", received_date: "2026-08-01" },
          { fullname: "Jane Doe", contactid: "c-jane", licensenumber: "68-00500", licensetype: "Card Room Employee", status: "Expired", expirationdate: "2026-08-01", received_date: "2025-08-01" },
          { fullname: "Mark Pending", contactid: "c-mark", licensenumber: "", licensetype: "Card Room Employee", status: "Pending", expirationdate: "", received_date: "2026-10-01" },
        ],
      },
      {
        id: "prop-1:1",
        accountId: "prop-1",
        propertyName: "Royal Casino Everett",
        retrievedAt: "2026-10-10T12:00:00.000Z",
        individuals: [
          { fullname: "Jane Doe", contactid: "c-jane", licensenumber: "68-10001", licensetype: "Card Room Employee", status: "Pending Activation", expirationdate: "2027-08-01", received_date: "2026-08-01" },
          { fullname: "Sam Former", contactid: "c-sam", licensenumber: "68-04444", licensetype: "Card Room Employee", status: "Pending", expirationdate: "2026-12-01", received_date: "2026-01-01" },
        ],
      },
    ],
    "prop-2": [
      {
        id: "prop-2:1",
        accountId: "prop-2",
        propertyName: "Silver Dollar Mill Creek",
        retrievedAt: "2026-10-15T12:00:00.000Z",
        individuals: [
          { fullname: "Jane Doe", contactid: "c-jane", licensenumber: "68-10001", licensetype: "Card Room Employee", status: "Active", expirationdate: "2027-08-01", received_date: "2026-08-01" },
        ],
      },
    ],
  };

  const { sandbox, getEl, getSavedWorkspace } = createAppHarness(storedProperties, storedSnapshots, {
    people: { "contact:c-jane": { starred: true, name: "Jane Doe", department: "Surveillance", tags: ["Lead"] } },
    properties: {},
  });

  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInNewContext(appSource, sandbox);
  await new Promise((resolve) => setImmediate(resolve));

  const state = vm.runInContext("state", sandbox);
  assert.equal(state.people.length, 2);
  assert.equal(state.records.length, 4);
  assert.equal(getEl("#people-result-count").textContent, "2 people");
  assert.equal(getEl("#records-result-count").textContent, "4 observations · 3 unique");
  assert.equal(getEl("#records-summary-bar").innerHTML.includes("2 numbered · 1 unnumbered pending/application"), true);

  vm.runInContext('switchRegisterMode("records")', sandbox);
  assert.equal(state.registerMode, "records");
  assert.equal(getEl("#records-register-panel").classList.contains("hidden"), false);
  getEl("#records-status-filter").value = "duplicates";
  vm.runInContext("renderRecords()", sandbox);
  assert.equal(getEl("#records-result-count").textContent, "2 observations · 1 unique");

  getEl("#show-all-records").click();
  assert.equal(getEl("#records-status-filter").value, "");
  assert.equal(getEl("#records-result-count").textContent, "4 observations · 3 unique");

  const changesHtml = getEl("#changes-list").innerHTML;
  assert.equal(changesHtml.includes("Licence #68-10001"), true);
  assert.equal(changesHtml.includes("Licence #68-04444"), true);
  assert.equal(changesHtml.includes("Card Room Employee"), true);
  assert.equal(changesHtml.includes("badge positive"), true);
  assert.equal(changesHtml.includes("badge not-returned"), true);

  await vm.runInContext('setPropertyShortName("prop-2")', sandbox);
  await vm.runInContext('toggleHomeProperty("prop-2")', sandbox);
  assert.equal(getSavedWorkspace().properties["prop-2"].shortName, "SD Mill Creek");
  assert.equal(getSavedWorkspace().properties["prop-2"].home, true);
  const propertiesHtml = getEl("#properties-grid").innerHTML;
  assert.equal(propertiesHtml.includes("SD Mill Creek"), true);
  assert.equal(propertiesHtml.includes("Official WSGC name: Silver Dollar Mill Creek"), true);
  assert.equal(propertiesHtml.indexOf("SD Mill Creek") < propertiesHtml.indexOf("Royal Casino Everett"), true);

  const peopleCsv = vm.runInContext("csvRows(filteredPeople())", sandbox);
  const recordsCsv = vm.runInContext("recordCsvRows(filteredRecords())", sandbox);
  assert.equal(peopleCsv.length, 5);
  assert.equal(recordsCsv.length, 5);
  assert.equal(recordsCsv.some((row) => row.includes("Observed at 2 properties")), true);
});
