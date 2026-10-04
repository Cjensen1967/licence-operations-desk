(function (root, factory) {
  const workspace = factory();
  if (typeof module === "object" && module.exports) module.exports = workspace;
  root.WorkspaceSettings = workspace;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_DEPARTMENTS = ["Surveillance", "Security", "Operations", "Corporate", "Other"];
  const DEFAULT_ALERT_THRESHOLDS = [30, 60, 90];

  const clean = (value) => String(value || "").trim();
  const unique = (values) => [...new Set((values || []).map(clean).filter(Boolean))].slice(0, 20);

  function normalizePersonPreference(value = {}) {
    return {
      starred: Boolean(value.starred),
      name: clean(value.name),
      department: clean(value.department),
      tags: unique(value.tags),
      updatedAt: clean(value.updatedAt),
    };
  }

  function normalizeSettings(value = {}) {
    const people = {};
    const properties = {};
    for (const [key, preference] of Object.entries(value.people || {})) {
      const cleanKey = clean(key);
      if (cleanKey) people[cleanKey] = normalizePersonPreference(preference);
    }
    for (const [key, preference] of Object.entries(value.properties || {})) {
      const cleanKey = clean(key);
      if (cleanKey) properties[cleanKey] = { shortName: clean(preference?.shortName), home: Boolean(preference?.home) };
    }
    const homeKey = Object.keys(properties).find((key) => properties[key].home);
    if (homeKey) for (const key of Object.keys(properties)) properties[key].home = key === homeKey;
    const thresholds = unique(value.alertThresholds).map(Number).filter((number) => Number.isFinite(number) && number > 0).sort((a, b) => a - b);
    return {
      version: 1,
      people,
      properties,
      alertThresholds: thresholds.length ? thresholds : [...DEFAULT_ALERT_THRESHOLDS],
    };
  }

  function mergeSettings(current, incoming) {
    const base = normalizeSettings(current);
    const next = normalizeSettings(incoming);
    return normalizeSettings({
      ...base,
      ...next,
      people: { ...base.people, ...next.people },
      properties: { ...base.properties, ...next.properties },
    });
  }

  function safeProperty(property = {}) {
    return {
      accountId: clean(property.accountId),
      name: clean(property.name),
      city: clean(property.city),
      county: clean(property.county),
      licenseType: clean(property.licenseType),
      addedAt: clean(property.addedAt),
    };
  }

  function createSettingsBackup(properties, settings, exportedAt = new Date().toISOString()) {
    return {
      type: "licence-operations-desk-settings",
      version: 1,
      exportedAt,
      properties: (properties || []).map(safeProperty).filter((property) => property.accountId && property.name),
      settings: normalizeSettings(settings),
      excludes: ["roster snapshots", "change history", "credentials", "cookies", "tokens"],
    };
  }

  function parseSettingsBackup(value) {
    if (!value || value.type !== "licence-operations-desk-settings" || value.version !== 1 || !Array.isArray(value.properties)) {
      throw new Error("This is not a supported Licence Operations Desk settings file.");
    }
    return {
      properties: value.properties.map(safeProperty).filter((property) => property.accountId && property.name),
      settings: normalizeSettings(value.settings),
    };
  }

  return { DEFAULT_DEPARTMENTS, DEFAULT_ALERT_THRESHOLDS, normalizePersonPreference, normalizeSettings, mergeSettings, createSettingsBackup, parseSettingsBackup };
});
