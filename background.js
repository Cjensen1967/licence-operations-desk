"use strict";

const WSGC = Object.freeze({
  baseUrl: "https://myaccount.wsgc.wa.gov",
  searchPage: "https://myaccount.wsgc.wa.gov/license-lookup/",
  tokenUrl: "https://myaccount.wsgc.wa.gov/_layout/tokenhtml",
  rosterTrigger:
    "https://myaccount.wsgc.wa.gov/_api/cloudflow/v1.0/trigger/" +
    "b50e30f4-c8a9-f011-bbd3-000d3a33fb9d",
  organizationTrigger:
    "https://myaccount.wsgc.wa.gov/_api/cloudflow/v1.0/trigger/" +
    "e0b115a6-53a8-f011-bbd3-000d3a33fb9d",
  individualTrigger:
    "https://myaccount.wsgc.wa.gov/_api/cloudflow/v1.0/trigger/" +
    "cd658b24-68a4-f011-bbd3-000d3a33fb9d",
  timeoutMs: 30000,
});

const ORGANIZATION_FIELDS = Object.freeze([
  "organization_name",
  "entity",
  "tradename",
  "licensetype",
  "gmb_city",
  "county",
]);

const INDIVIDUAL_FIELDS = Object.freeze([
  "firstname",
  "lastname",
  "licensenumber",
  "employer",
  "gmb_city",
  "county",
]);

class WsgcError extends Error {
  constructor(stage, message, details = {}) {
    super(message);
    this.name = "WsgcError";
    this.stage = stage;
    this.details = details;
  }
}

function rosterPage(accountId) {
  const event = encodeURIComponent(JSON.stringify({ accountid: accountId }));
  return `${WSGC.searchPage}license-lookup-sub/?type=organization&data=${btoa(event)}`;
}

async function fetchTimed(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WSGC.timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Request timed out after 30 seconds.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requireOk(stage, label, promise) {
  let response;
  try {
    response = await promise;
  } catch (error) {
    throw new WsgcError(stage, `${label} failed: ${error.message}`);
  }
  if (!response.ok) {
    throw new WsgcError(stage, `${label} returned HTTP ${response.status}.`, {
      httpStatus: response.status,
    });
  }
  return response;
}

function extractToken(html) {
  const input = String(html || "").match(/<input[^>]*__RequestVerificationToken[^>]*>/i);
  if (!input) throw new WsgcError("token", "WSGC did not return a verification token.");
  const value = input[0].match(/value=(['"])(.*?)\1/i);
  if (!value) throw new WsgcError("token", "The WSGC verification token had no value.");
  return value[2];
}

function decodeField(encoded, name) {
  if (typeof encoded !== "string" || !encoded.trim()) return [];
  let value = encoded.replace(/\s/g, "");
  value += "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed)) throw new Error("decoded value was not a list");
    return parsed;
  } catch (error) {
    throw new WsgcError("decode", `Could not decode WSGC ${name}: ${error.message}`);
  }
}

async function bootstrap(url, pageLabel) {
  const page = await requireOk("page", `WSGC ${pageLabel} page`, fetchTimed(url));
  await page.text();
  const tokenPage = await requireOk("token", "WSGC token page", fetchTimed(WSGC.tokenUrl));
  return extractToken(await tokenPage.text());
}

async function postFlow(trigger, token, eventData, label) {
  const response = await requireOk(
    "request",
    label,
    fetchTimed(trigger, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        __RequestVerificationToken: token,
      },
      body: new URLSearchParams({ eventData: JSON.stringify(eventData) }),
    }),
  );
  try {
    const result = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("unexpected response structure");
    }
    return result;
  } catch (error) {
    throw new WsgcError("request", `${label} did not return valid JSON.`);
  }
}

async function searchOrganizations(criteria) {
  const unknown = Object.keys(criteria || {}).filter((key) => !ORGANIZATION_FIELDS.includes(key));
  if (unknown.length) throw new WsgcError("input", `Unknown search field: ${unknown.join(", ")}`);
  const cleaned = Object.fromEntries(
    ORGANIZATION_FIELDS.map((key) => [key, String(criteria?.[key] || "").trim()]),
  );
  if (!Object.values(cleaned).some(Boolean)) {
    throw new WsgcError("input", "Enter at least one organization search value.");
  }
  const token = await bootstrap(WSGC.searchPage, "search");
  const wrapper = await postFlow(WSGC.organizationTrigger, token, cleaned, "WSGC organization search");
  return {
    organizations: decodeField(wrapper.response, "response"),
    applications: decodeField(wrapper.application_data, "application_data"),
    tribes: decodeField(wrapper.tribe_data, "tribe_data"),
  };
}

async function searchIndividuals(criteria) {
  const unknown = Object.keys(criteria || {}).filter((key) => !INDIVIDUAL_FIELDS.includes(key));
  if (unknown.length) throw new WsgcError("input", `Unknown search field: ${unknown.join(", ")}`);
  const cleaned = Object.fromEntries(
    INDIVIDUAL_FIELDS.map((key) => [key, String(criteria?.[key] || "").trim()]),
  );
  if (!Object.values(cleaned).some(Boolean)) {
    throw new WsgcError("input", "Enter at least one individual search value.");
  }
  const token = await bootstrap(WSGC.searchPage, "search");
  const wrapper = await postFlow(WSGC.individualTrigger, token, cleaned, "WSGC individual search");
  return decodeField(wrapper.response, "response");
}

async function retrieveRoster(accountId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId || "")) {
    throw new WsgcError("input", "The selected organization does not have a valid WSGC account ID.");
  }
  const token = await bootstrap(rosterPage(accountId), "organization");
  const wrapper = await postFlow(
    WSGC.rosterTrigger,
    token,
    { accountid: accountId },
    "WSGC roster request",
  );
  if (wrapper.status !== 200 && wrapper.status !== "200") {
    throw new WsgcError("request", `WSGC reported status ${JSON.stringify(wrapper.status)}.`);
  }
  const individuals = decodeField(wrapper.individual_data, "individual_data");
  const organizations = decodeField(wrapper.organization_data, "organization_data");
  if (!individuals.length) {
    throw new WsgcError("decode", "WSGC returned zero individual records. Existing data was kept.");
  }
  return { individuals, organizations, retrievedAt: new Date().toISOString() };
}

function publicError(error) {
  return {
    ok: false,
    stage: error instanceof WsgcError ? error.stage : "unknown",
    error: error?.message || String(error),
    details: error instanceof WsgcError ? error.details : {},
  };
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return false;
  let task;
  if (message.type === "SEARCH_ORGANIZATIONS") task = searchOrganizations(message.criteria);
  if (message.type === "SEARCH_INDIVIDUALS") task = searchIndividuals(message.criteria);
  if (message.type === "RETRIEVE_ROSTER") task = retrieveRoster(message.accountId);
  if (message.type === "OPEN_APP") task = chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
  if (!task) return false;
  Promise.resolve(task)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse(publicError(error)));
  return true;
});
