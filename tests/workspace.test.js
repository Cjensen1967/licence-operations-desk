"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSettingsBackup, mergeSettings, normalizeSettings, parseSettingsBackup } = require("../shared/workspace.js");

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
});
