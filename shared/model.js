(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  root.WSGCModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const first = (record, keys, fallback = "") => {
    for (const key of keys) {
      const value = record?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
    return fallback;
  };
  const clean = (value) => String(value || "").trim();
  const lower = (value) => clean(value).toLowerCase();

  function parseDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    const calendar = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
    const date = calendar
      ? new Date(Number(calendar[1]), Number(calendar[2]) - 1, Number(calendar[3]))
      : new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysUntil(value, now = new Date()) {
    const target = parseDate(value);
    if (!target) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    return Math.round((end - today) / 86400000);
  }

  function normalizeOrganization(record, source = "organizations") {
    const accountId = first(record, ["accountid", "account_id", "accountId", "_accountid_value", "account.accountid"]);
    const name = first(record, [
      "organization_name", "organizationname", "name", "account_name", "accountname", "account.name",
      "gmb_organizationname", "gmb_Organization", "gmb_name", "tradename", "trade_name", "gmb_tradename",
    ], "Unnamed organization");
    return {
      accountId,
      name,
      tradeName: first(record, ["tradename", "trade_name", "gmb_tradename", "dba"]),
      city: first(record, ["gmb_city", "city", "address1_city", "account.address1_city"]),
      county: first(record, ["county", "county_name", "address1_county", "gmb_county"]),
      licenseType: first(record, ["licensetype", "license_type", "license_type_name", "_gmb_licensetype_value@OData.Community.Display.V1.FormattedValue", "gmb_license.gmb_licensetype@OData.Community.Display.V1.FormattedValue"]),
      status: source === "applications" ? "Pending" : first(record, ["status", "license_status", "licensestatus", "gmb_licenseexternalstatus@OData.Community.Display.V1.FormattedValue"]),
      source,
      raw: record,
    };
  }

  function normalizeLicense(record, property) {
    const firstName = first(record, ["contact.firstname", "firstname", "first_name", "contact_firstname"]);
    const lastName = first(record, ["contact.lastname", "lastname", "last_name", "contact_lastname"]);
    const fullName = first(record, ["contact.fullname", "fullname", "full_name", "contact_name", "individual_name", "name"], `${firstName} ${lastName}`.trim() || "Unknown person");
    const contactId = first(record, ["contact.contactid", "contact_id", "contactid", "contactId", "_contactid_value", "contact_guid"]);
    const licenseNumber = first(record, ["gmb_license.gmb_name", "license_number", "licensenumber", "license_no", "licenseno", "number"]);
    const licenseType = first(record, ["gmb_license.gmb_licensetype@OData.Community.Display.V1.FormattedValue", "gmb_application.gmb_applicationtypes@OData.Community.Display.V1.FormattedValue", "license_type", "licensetype", "license_type_name", "licensecategory", "license_category"]);
    const status = first(record, ["gmb_license.gmb_licenseexternalstatus@OData.Community.Display.V1.FormattedValue", "license_status", "licensestatus", "status", "status_name", "statecode"], "Unknown");
    const expirationDate = first(record, ["gmb_license.gmb_expirationdate", "expiration_date", "expirationdate", "license_expiration_date", "expiry_date", "expires", "expiration"]);
    // WSGC's organization employee roster labels this value "Received Date"
    // even though the underlying Dataverse field is named gmb_effectivedate.
    // Keep it distinct from an organization's own license effective date.
    const receivedDate = first(record, [
      "gmb_license.gmb_effectivedate",
      "received_date",
      "receiveddate",
      "license_received_date",
    ]);
    const personKey = contactId ? `contact:${lower(contactId)}` : `name:${lower(fullName)}`;
    return {
      personKey,
      identity: contactId ? "contact_id" : "name_fallback",
      contactId,
      firstName,
      lastName,
      fullName,
      licenseNumber,
      licenseType,
      status,
      expirationDate,
      receivedDate,
      propertyId: property.accountId,
      propertyName: property.name,
      raw: record,
    };
  }

  function normalizeIndividualLicense(record, now = new Date()) {
    const individual = record?.gmb_Individual || {};
    const organization = record?.gmb_Organization || {};
    const firstName = first(individual, ["firstname", "first_name"]);
    const lastName = first(individual, ["lastname", "last_name"]);
    const expirationDate = first(record, ["gmb_expirationdate", "expiration_date", "expirationdate"]);
    const status = first(record, ["gmb_licenseexternalstatus@OData.Community.Display.V1.FormattedValue", "license_status", "status"], "Unknown");
    return {
      personKey: `contact:${lower(first(individual, ["contactid", "contact_id"]))}`,
      contactId: first(individual, ["contactid", "contact_id"]),
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim() || "Unknown person",
      city: first(individual, ["address1_city", "city"]),
      licenseNumber: first(record, ["gmb_name", "license_number", "licensenumber"]),
      licenseType: first(record, ["_gmb_licensetype_value@OData.Community.Display.V1.FormattedValue", "license_type", "licensetype"]),
      status,
      expirationDate,
      propertyId: first(organization, ["accountid", "account_id"]),
      propertyName: first(organization, ["gmb_businesstradename", "name", "organization_name"], "Organization name unavailable"),
      bucket: statusBucket(status, expirationDate, now),
      daysRemaining: daysUntil(expirationDate, now),
      raw: record,
    };
  }

  function statusBucket(status, expirationDate, now = new Date()) {
    const value = lower(status);
    const days = daysUntil(expirationDate, now);
    if (value.includes("pending") || value.includes("application")) return "pending";
    if (value.includes("revok") || value.includes("suspend") || value.includes("cancel")) return "attention";
    // Organization pages accumulate former employees and old associations.
    // Preserve explicit expired/inactive records as history; do not infer that
    // they are current employees who need follow-up.
    if (value.includes("expir") || value.includes("inactive")) return "historical";
    // An ostensibly current/unknown record with a date already past is
    // contradictory and does deserve review.
    if (days !== null && days < 0) return "attention";
    if (days !== null && days <= 30) return "expiring30";
    if (days !== null && days <= 60) return "expiring60";
    if (days !== null && days <= 90) return "expiring90";
    if (value.includes("active") || value.includes("current") || value.includes("valid")) return "active";
    return "other";
  }

  function markRenewedRecords(licenses) {
    return licenses.map((license) => {
      if (license.bucket !== "historical") return { ...license, superseded: false };
      const replacement = licenses
        .filter((candidate) =>
          candidate !== license &&
          candidate.propertyId === license.propertyId &&
          lower(candidate.licenseType) === lower(license.licenseType) &&
          candidate.bucket === "active" &&
          parseDate(candidate.expirationDate) &&
          parseDate(license.expirationDate) &&
          parseDate(candidate.expirationDate) > parseDate(license.expirationDate),
        )
        .sort((a, b) => parseDate(b.expirationDate) - parseDate(a.expirationDate))[0];
      return replacement
        ? { ...license, superseded: true, supersededBy: replacement.licenseNumber }
        : { ...license, superseded: false };
    });
  }

  function standingForLicenses(licenses) {
    const currentLicenses = licenses.filter((license) => !license.superseded);
    const hasPending = currentLicenses.some((license) => license.bucket === "pending");
    const hasCurrentLicense = currentLicenses.some((license) => ["active", "expiring30", "expiring60", "expiring90"].includes(license.bucket));
    const priority = ["attention", "expiring30", "pending", "expiring60", "expiring90", "active", "other", "historical"];
    const bucket = hasPending && hasCurrentLicense
      ? "renewalPending"
      : priority.find((value) => currentLicenses.some((license) => license.bucket === value)) || "other";
    const dated = currentLicenses.filter((license) => license.daysRemaining !== null).sort((a, b) => a.daysRemaining - b.daysRemaining);
    return {
      bucket,
      licenses: currentLicenses,
      nearestExpiration: dated[0]?.expirationDate || "",
      nearestDays: dated[0]?.daysRemaining ?? null,
    };
  }

  function buildPeople(properties, snapshots, now = new Date()) {
    const propertyMap = new Map(properties.map((property) => [property.accountId, property]));
    const people = new Map();
    for (const snapshot of snapshots) {
      const property = propertyMap.get(snapshot.accountId);
      if (!property) continue;
      for (const raw of snapshot.individuals || []) {
        const license = normalizeLicense(raw, property);
        if (!people.has(license.personKey)) {
          people.set(license.personKey, {
            key: license.personKey,
            contactId: license.contactId,
            fullName: license.fullName,
            identity: license.identity,
            licenses: [],
            properties: new Map(),
          });
        }
        const person = people.get(license.personKey);
        person.licenses.push({ ...license, bucket: statusBucket(license.status, license.expirationDate, now), daysRemaining: daysUntil(license.expirationDate, now) });
        person.properties.set(property.accountId, property);
      }
    }
    return [...people.values()].map((person) => {
      const licenses = markRenewedRecords(person.licenses);
      const currentLicenses = licenses.filter((license) => !license.superseded && license.bucket !== "historical");
      const dated = currentLicenses.filter((license) => license.daysRemaining !== null).sort((a, b) => a.daysRemaining - b.daysRemaining);
      const propertyStandings = [...person.properties.values()].map((property) => ({
        ...property,
        ...standingForLicenses(licenses.filter((license) => license.propertyId === property.accountId)),
      }));
      const priority = ["attention", "renewalPending", "expiring30", "pending", "expiring60", "expiring90", "active", "other", "historical"];
      const bucket = priority.find((value) => propertyStandings.some((standing) => standing.bucket === value)) || "historical";
      return { ...person, licenses, currentLicenses, properties: [...person.properties.values()], propertyStandings, nearestExpiration: dated[0]?.expirationDate || "", nearestDays: dated[0]?.daysRemaining ?? null, bucket };
    }).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  function recordKey(record) {
    const normalized = normalizeLicense(record, { accountId: "", name: "" });
    return `${normalized.personKey}|${lower(normalized.licenseNumber || normalized.licenseType)}`;
  }

  function compareSnapshots(previous, current) {
    if (!previous || !current) return { available: false, events: [] };
    const before = new Map((previous.individuals || []).map((record) => [recordKey(record), normalizeLicense(record, { accountId: current.accountId, name: current.propertyName || "" })]));
    const after = new Map((current.individuals || []).map((record) => [recordKey(record), normalizeLicense(record, { accountId: current.accountId, name: current.propertyName || "" })]));
    const events = [];
    for (const [key, value] of after) {
      if (!before.has(key)) events.push({ type: "appeared", person: value.fullName, license: value.licenseNumber, message: "Appeared in the latest WSGC response" });
      else {
        const old = before.get(key);
        if (old.status !== value.status) events.push({ type: "status", person: value.fullName, license: value.licenseNumber, message: `Status changed: ${old.status || "Unknown"} → ${value.status || "Unknown"}` });
        if (old.expirationDate !== value.expirationDate) events.push({ type: "expiration", person: value.fullName, license: value.licenseNumber, message: `Expiration changed: ${old.expirationDate || "None"} → ${value.expirationDate || "None"}` });
        if (old.receivedDate !== value.receivedDate) events.push({ type: "received", person: value.fullName, license: value.licenseNumber, message: `Received date changed: ${old.receivedDate || "None"} → ${value.receivedDate || "None"}` });
      }
    }
    for (const [key, value] of before) {
      if (!after.has(key)) events.push({ type: "not_returned", person: value.fullName, license: value.licenseNumber, message: "Was not present in the latest WSGC response" });
    }
    return { available: true, events };
  }

  function summarize(people, properties) {
    const licenses = people.flatMap((person) => person.licenses);
    const currentLicenses = people.flatMap((person) => person.currentLicenses || person.licenses);
    const currentPeople = people.filter((person) => person.bucket !== "historical");
    return {
      properties: properties.length,
      people: currentPeople.length,
      historicalPeople: people.length - currentPeople.length,
      records: licenses.length,
      assignments: currentPeople.reduce((total, person) => total + (person.propertyStandings?.filter((standing) => standing.bucket !== "historical").length || 0), 0),
      active: currentLicenses.filter((license) => license.bucket === "active").length,
      expiring30: currentLicenses.filter((license) => license.bucket === "expiring30").length,
      expiring90: currentLicenses.filter((license) => ["expiring30", "expiring60", "expiring90"].includes(license.bucket)).length,
      attention: people.filter((person) => ["attention", "renewalPending", "expiring30", "pending"].includes(person.bucket)).length,
    };
  }

  return { first, parseDate, daysUntil, normalizeOrganization, normalizeLicense, normalizeIndividualLicense, statusBucket, markRenewedRecords, standingForLicenses, buildPeople, compareSnapshots, summarize };
});
