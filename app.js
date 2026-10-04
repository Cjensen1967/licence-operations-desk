"use strict";

const { normalizeOrganization, normalizeIndividualLicense, markRenewedRecords, buildPeople, compareSnapshots, summarize } = WSGCModel;
const { DEFAULT_DEPARTMENTS, normalizeSettings, mergeSettings, createSettingsBackup, parseSettingsBackup } = WorkspaceSettings;
const state = { properties: [], snapshots: new Map(), histories: new Map(), people: [], changes: [], workspace: normalizeSettings(), view: "overview", sort: "fullName", sortDirection: 1, searchMode: "managed", pendingSettingsImport: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
const formatDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? (value || "—") : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date); };
const formatTime = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Never" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); };
const DAY_MS = 86400000;
function freshness(retrievedAt) {
  const time = new Date(retrievedAt).getTime();
  if (!Number.isFinite(time)) return { key: "never", label: "Never refreshed", detail: "No saved roster" };
  const days = Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
  if (days <= 2) return { key: "current", label: "Current", detail: days === 0 ? "Refreshed today" : `Refreshed ${days} day${days === 1 ? "" : "s"} ago` };
  if (days <= 7) return { key: "aging", label: "Aging", detail: `Refreshed ${days} days ago` };
  return { key: "stale", label: "Stale", detail: `Refreshed ${days} days ago` };
}
function missingStarredPreferences() {
  const currentKeys = new Set(state.people.map((person) => person.key));
  return Object.entries(state.workspace.people).filter(([key, preference]) => preference.starred && !currentKeys.has(key)).map(([key, preference]) => ({ key, ...preference }));
}
function notReturnedPeople() {
  const groups = new Map();
  for (const event of state.changes.filter((item) => item.type === "not_returned")) {
    const key = event.personKey || `${event.property.accountId}|${String(event.person || "").toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { key, personKey: event.personKey || "", person: event.person, property: event.property, previousRetrievedAt: event.previousRetrievedAt || "", currentRetrievedAt: event.currentRetrievedAt || "", licenses: [] });
    const group = groups.get(key);
    if (event.license) group.licenses.push(event.license);
  }
  return [...groups.values()];
}

async function initialize() {
  state.properties = await DB.getProperties();
  state.workspace = normalizeSettings(await DB.getSetting("workspace", {}));
  await reloadSnapshots();
  bindEvents();
  render();
}

async function reloadSnapshots() {
  state.snapshots.clear(); state.histories.clear(); state.changes = [];
  for (const property of state.properties) {
    const history = await DB.getSnapshots(property.accountId);
    state.histories.set(property.accountId, history);
    if (history[0]) state.snapshots.set(property.accountId, history[0]);
    const comparison = compareSnapshots(history[1], history[0]);
    if (comparison.available) state.changes.push(...comparison.events.map((event) => ({ ...event, property, previousRetrievedAt: history[1]?.retrievedAt || "", currentRetrievedAt: history[0]?.retrievedAt || "" })));
  }
  state.people = buildPeople(state.properties, [...state.snapshots.values()]);
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$('[data-go]').forEach((button) => button.addEventListener("click", () => { if (button.dataset.filter) $("#status-filter").value = button.dataset.filter; switchView(button.dataset.go); }));
  $("#add-property").addEventListener("click", () => openPropertyDialog("managed")); $("#empty-add").addEventListener("click", () => openPropertyDialog("managed"));
  $("#quick-lookup").addEventListener("click", () => openPropertyDialog("quick"));
  $("#refresh-all").addEventListener("click", refreshAll);
  $("#open-not-returned").addEventListener("click", () => switchView("changes"));
  $("#more-button").addEventListener("click", () => $("#more-menu").classList.toggle("hidden"));
  document.addEventListener("click", (event) => { if (!event.target.closest(".top-actions")) $("#more-menu").classList.add("hidden"); });
  $("#people-search").addEventListener("input", renderPeople); $("#property-filter").addEventListener("change", renderPeople); $("#staff-filter").addEventListener("change", renderPeople); $("#status-filter").addEventListener("change", renderPeople);
  $("#open-my-staff").addEventListener("click", () => { $("#staff-filter").value = "starred"; switchView("people"); });
  $("#property-dialog form").addEventListener("submit", (event) => { event.preventDefault(); performSearch(Object.fromEntries(new FormData(event.currentTarget).entries())); });
  $("#property-dialog-close").addEventListener("click", () => $("#property-dialog").close());
  $("#property-dialog-cancel").addEventListener("click", () => $("#property-dialog").close());
  $("#person-close").addEventListener("click", () => $("#person-dialog").close());
  $("#quick-close").addEventListener("click", () => $("#quick-dialog").close());
  $("#property-workspace-close").addEventListener("click", () => $("#property-workspace-dialog").close());
  $("#export-csv").addEventListener("click", exportCsv); $("#export-backup").addEventListener("click", exportBackup); $("#import-backup").addEventListener("click", () => $("#backup-file").click());
  $("#backup-file").addEventListener("change", importBackup); $("#clear-data").addEventListener("click", clearData);
  $("#export-settings").addEventListener("click", exportSettings); $("#import-settings").addEventListener("click", () => $("#settings-file").click());
  $("#settings-file").addEventListener("change", prepareSettingsImport); $("#settings-import-cancel").addEventListener("click", () => $("#settings-import-dialog").close());
  $("#settings-import-merge").addEventListener("click", () => applySettingsImport("merge")); $("#settings-import-replace").addEventListener("click", () => applySettingsImport("replace"));
  $$('th[data-sort]').forEach((th) => th.addEventListener("click", () => { state.sortDirection = state.sort === th.dataset.sort ? -state.sortDirection : 1; state.sort = th.dataset.sort; renderPeople(); }));
}

function switchView(view) {
  state.view = view; $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((item) => item.classList.toggle("active", item.id === `${view}-view`));
  const labels = { overview: ["Briefing", "What deserves attention across your managed properties."], people: ["People", "One person, every returned public record."], properties: ["Properties", "Manage accepted snapshots for your licensing scope."], changes: ["Changes", "Observed differences between the two latest accepted responses."] };
  $("#view-title").textContent = labels[view][0]; $("#view-subtitle").textContent = labels[view][1];
  if (view === "people") renderPeople(); if (view === "properties") renderProperties(); if (view === "changes") renderChanges();
}

function render() {
  const empty = state.properties.length === 0;
  $("#empty-state").classList.toggle("hidden", !empty); $("#overview-content").classList.toggle("hidden", empty);
  const summary = summarize(state.people, state.properties); const notReturned = notReturnedPeople();
  $("#stats").innerHTML = [
    ["Managed properties", summary.properties], ["Current people shown", summary.people], ["Renewal pending", summary.renewalPending], ["Not returned", notReturned.length], ["Expiring ≤10 days", summary.expiring10], ["Needs attention", summary.attention],
  ].map(([label, value]) => `<div class="stat ${label === "Needs attention" ? "attention" : label === "Not returned" ? "change" : ""}"><span>${label}</span><strong>${value}</strong></div>`).join("");
  renderAttention(); renderPropertySummary(); renderNotReturned(); renderMyStaff(); renderRecent(); renderFilters(); renderPeople(); renderProperties(); renderChanges();
}

function personPreference(personOrKey) { return state.workspace.people[typeof personOrKey === "string" ? personOrKey : personOrKey.key] || {}; }
function propertyPreference(propertyOrId) { return state.workspace.properties?.[typeof propertyOrId === "string" ? propertyOrId : propertyOrId.accountId] || {}; }
function propertyDisplayName(property) { return propertyPreference(property).shortName || shortName(property.name); }
function sortedProperties() { return [...state.properties].sort((a, b) => Number(Boolean(propertyPreference(b).home)) - Number(Boolean(propertyPreference(a).home)) || propertyDisplayName(a).localeCompare(propertyDisplayName(b))); }
function starredPeople() { return state.people.filter((person) => personPreference(person).starred); }

function renderMyStaff() {
  const people = starredPeople(); const missing = missingStarredPreferences();
  const visible = people.length ? people.slice(0, 8).map((person) => { const preference = personPreference(person); return `<button class="staff-card person-link" data-person="${escapeHtml(person.key)}"><span class="staff-star" aria-hidden="true">★</span><span><strong>${escapeHtml(person.fullName)}</strong><small>${escapeHtml([preference.department, ...(preference.tags || [])].filter(Boolean).join(" · ") || "No local labels")}</small></span><span class="badge ${person.bucket}">${bucketLabel(person.bucket)}</span></button>`; }).join("") : `<div class="empty-inline"><strong>No current My Staff records.</strong><span>Open a person and choose “Add to My Staff.”</span></div>`;
  const missingNotice = missing.length ? `<div class="staff-missing"><strong>${missing.length} My Staff ${missing.length === 1 ? "person was" : "people were"} not returned in the latest managed rosters.</strong><span>This only describes the latest saved WSGC responses; it does not determine employment or licence status.</span></div>` : "";
  $("#my-staff-list").innerHTML = visible + missingNotice;
  bindPersonLinks();
}

function renderAttention() {
  const rows = state.people.filter((person) => ["attention", "expiring10"].includes(person.bucket)).slice(0, 8);
  $("#attention-list").innerHTML = rows.length ? rows.map((person) => `<button class="compact-row person-link" data-person="${escapeHtml(person.key)}"><span><strong>${escapeHtml(person.fullName)}</strong><small>${escapeHtml(attentionSummary(person))}</small></span><span class="badge ${person.bucket}">${bucketLabel(person.bucket)}</span></button>`).join("") : `<div class="empty-inline">No licence exceptions currently require attention.</div>`;
  bindPersonLinks();
}

function renderNotReturned() {
  const rows = notReturnedPeople();
  $("#not-returned-list").innerHTML = rows.length ? rows.slice(0, 8).map((row) => {
    const preference = row.personKey ? personPreference(row.personKey) : {};
    const licenceCopy = [...new Set(row.licenses)].filter(Boolean).join(", ");
    return `<div class="compact-row roster-change-row"><span><strong>${preference.starred ? '<span class="staff-star" aria-label="My Staff">★</span> ' : ""}${escapeHtml(row.person)}</strong><small>${escapeHtml(row.property.name)}${licenceCopy ? ` · ${escapeHtml(licenceCopy)}` : ""}</small></span><span><span class="badge not-returned">Not returned</span><small>${row.currentRetrievedAt ? `Latest roster ${formatTime(row.currentRetrievedAt)}` : "Latest roster"}</small></span></div>`;
  }).join("") : `<div class="empty-inline">No people disappeared between the two latest accepted property rosters.</div>`;
}

function renderPropertySummary() {
  $("#property-summary").innerHTML = sortedProperties().slice(0, 7).map((property) => { const snap = state.snapshots.get(property.accountId); const fresh = freshness(snap?.retrievedAt); return `<div class="compact-row"><span><strong>${escapeHtml(propertyDisplayName(property))}</strong><small>${propertyPreference(property).home ? "Home property · " : ""}Managed property</small></span><span><span class="freshness ${fresh.key}">${fresh.label}</span><small>${fresh.detail}</small>${property.lastRefreshError ? `<small class="refresh-failed">Last attempt failed</small>` : ""}</span></div>`; }).join("");
}

function renderRecent() {
  const rows = state.people.filter((person) => person.bucket !== "historical").slice(0, 10);
  $("#recent-people").innerHTML = rows.length ? `<table><thead><tr><th>Person</th><th>Property standing</th><th>License records</th><th>Overall</th></tr></thead><tbody>${rows.map((person) => `<tr class="person-link" data-person="${escapeHtml(person.key)}"><td data-label="Person"><strong>${escapeHtml(person.fullName)}</strong></td><td data-label="Property standing">${propertyStandingChips(person)}</td><td data-label="License records">${person.licenses.length}</td><td data-label="Overall"><span class="badge ${person.bucket}">${bucketLabel(person.bucket)}</span></td></tr>`).join("")}</tbody></table>` : `<div class="compact-row"><small>Refresh a property to load its roster.</small></div>`;
  bindPersonLinks();
}

function renderFilters() {
  const current = $("#property-filter").value;
  $("#property-filter").innerHTML = `<option value="">All properties</option>${sortedProperties().map((p) => `<option value="${escapeHtml(p.accountId)}">${escapeHtml(propertyDisplayName(p))}</option>`).join("")}`;
  $("#property-filter").value = current;
}

function filteredPeople() {
  const query = $("#people-search").value.trim().toLowerCase(); const propertyId = $("#property-filter").value; const status = $("#status-filter").value; const staff = $("#staff-filter").value;
  return state.people.filter((person) => {
    const preference = personPreference(person);
    const haystack = [person.fullName, preference.department, ...(preference.tags || []), ...person.properties.map((p) => p.name), ...person.licenses.flatMap((l) => [l.licenseNumber, l.licenseType, l.status])].join(" ").toLowerCase();
    const propertyMatch = !propertyId || person.properties.some((p) => p.accountId === propertyId);
    const currentLicenses = person.currentLicenses || person.licenses;
    const scopedLicenses = propertyId ? currentLicenses.filter((license) => license.propertyId === propertyId) : currentLicenses;
    const scopedStandings = propertyId ? person.propertyStandings.filter((standing) => standing.accountId === propertyId) : person.propertyStandings;
    const statusMatch = !status || (status === "current" ? scopedStandings.some((standing) => standing.bucket !== "historical") : status === "attention" ? scopedStandings.some((standing) => ["attention", "expiring10"].includes(standing.bucket)) : status === "expiring45" ? scopedLicenses.some((license) => ["approaching", "expiring10"].includes(license.bucket)) : status === "expiring10" ? scopedLicenses.some((license) => license.bucket === "expiring10") : status === "pending" ? scopedStandings.some((standing) => ["pending", "renewalPending"].includes(standing.bucket)) : status === "historical" ? scopedStandings.some((standing) => standing.bucket === "historical") : scopedLicenses.some((license) => license.bucket === status));
    return (!query || haystack.includes(query)) && propertyMatch && statusMatch && (!staff || preference.starred);
  });
}

function renderPeople() {
  const people = filteredPeople().sort((a, b) => { const av = a[state.sort] ?? Number.MAX_SAFE_INTEGER; const bv = b[state.sort] ?? Number.MAX_SAFE_INTEGER; return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * state.sortDirection; });
  $("#people-result-count").textContent = `${people.length} ${people.length === 1 ? "person" : "people"}`;
  $("#people-table").innerHTML = people.map((person) => { const preference = personPreference(person); return `<tr data-person="${escapeHtml(person.key)}"><td class="person-cell" data-label="Person"><div class="person-name-line"><button class="star-button ${preference.starred ? "selected" : ""}" data-star-person="${escapeHtml(person.key)}" aria-label="${preference.starred ? "Remove from" : "Add to"} My Staff" title="${preference.starred ? "Remove from" : "Add to"} My Staff">${preference.starred ? "★" : "☆"}</button><span><strong>${escapeHtml(person.fullName)}</strong><small class="record-id">${person.identity === "name_fallback" ? "Grouped by name; contact ID unavailable" : escapeHtml(person.contactId)}</small>${preference.starred ? `<small class="local-label">${escapeHtml([preference.department, ...(preference.tags || [])].filter(Boolean).join(" · ") || "My Staff")}</small>` : ""}</span></div></td><td data-label="Property observation"><div class="property-standings">${propertyStandingChips(person)}</div></td><td class="record-count" data-label="Returned records"><strong>${person.licenses.length}</strong><small>${escapeHtml([...new Set(person.licenses.map((l) => l.licenseType).filter(Boolean))].join(", "))}</small></td><td class="date-cell" data-label="Nearest expiration"><strong>${formatDate(person.nearestExpiration)}</strong><small>${person.nearestDays === null ? "No date" : person.nearestDays < 0 ? `${Math.abs(person.nearestDays)} days ago` : `${person.nearestDays} days`}</small></td><td data-label="Review state"><span class="badge ${person.bucket}">${bucketLabel(person.bucket)}</span></td></tr>`; }).join("");
  bindPersonLinks();
  $$('[data-star-person]').forEach((button) => button.addEventListener("click", async (event) => { event.stopPropagation(); await toggleStar(button.dataset.starPerson); }));
}

function renderProperties() {
  $("#properties-grid").innerHTML = sortedProperties().map((property) => {
    const snap = state.snapshots.get(property.accountId); const metrics = propertyMetrics(property); const fresh = freshness(snap?.retrievedAt);
    return `<article class="property-card"><div class="property-card-head"><span class="badge managed">Managed</span><span class="freshness ${fresh.key}">${fresh.label}</span>${propertyPreference(property).home ? '<span class="badge home">Home</span>' : ""}<h3>${escapeHtml(propertyDisplayName(property))}</h3></div><p>${escapeHtml([property.city, property.county].filter(Boolean).join(" · ") || property.accountId)}</p>${property.lastRefreshError ? `<div class="refresh-warning"><strong>Last refresh attempt failed.</strong><span>${escapeHtml(property.lastRefreshError)}</span><small>Showing the last successfully saved roster from ${snap ? formatTime(snap.retrievedAt) : "no previous refresh"}.</small></div>` : ""}<div class="property-dashboard"><button data-property-roster="${escapeHtml(property.accountId)}"><span>People shown</span><strong>${metrics.people.length}</strong></button><button data-property-roster="${escapeHtml(property.accountId)}" data-status="active"><span>Active shown</span><strong>${metrics.active}</strong></button><button data-property-roster="${escapeHtml(property.accountId)}" data-status="pending"><span>Pending / renewal</span><strong>${metrics.pending}</strong></button><button class="${metrics.attention ? "attention" : ""}" data-property-roster="${escapeHtml(property.accountId)}" data-status="attention"><span>Needs attention</span><strong>${metrics.attention}</strong></button><button data-property-open="${escapeHtml(property.accountId)}" data-section="changes"><span>Recent changes</span><strong>${metrics.changes}</strong></button><div><span>Last successful refresh</span><strong>${snap ? formatTime(snap.retrievedAt) : "Never"}</strong></div></div><div class="card-actions"><button class="button primary" data-property-open="${escapeHtml(property.accountId)}">Open property</button><button class="button secondary" data-refresh="${escapeHtml(property.accountId)}">Refresh</button><details class="card-menu"><summary aria-label="More property actions">•••</summary><div><button data-property-short-name="${escapeHtml(property.accountId)}">Set short name</button><button data-property-home="${escapeHtml(property.accountId)}">${propertyPreference(property).home ? "Unset home property" : "Set as home property"}</button><button data-property-export="${escapeHtml(property.accountId)}">Export roster CSV</button><button data-remove="${escapeHtml(property.accountId)}" class="danger-text">Remove property</button></div></details></div></article>`;
  }).join("") || `<div class="empty-state"><h2>No managed properties</h2><p>Add at least one property to begin.</p></div>`;
  $$('[data-refresh]').forEach((button) => button.addEventListener("click", () => refreshProperty(button.dataset.refresh, button)));
  $$('[data-remove]').forEach((button) => button.addEventListener("click", () => removeProperty(button.dataset.remove)));
  $$('[data-property-open]').forEach((button) => button.addEventListener("click", () => openPropertyWorkspace(button.dataset.propertyOpen, button.dataset.section)));
  $$('[data-property-roster]').forEach((button) => button.addEventListener("click", () => openPropertyPeople(button.dataset.propertyRoster, button.dataset.status || "current")));
  $('[data-property-export]').forEach((button) => button.addEventListener("click", () => exportPropertyCsv(button.dataset.propertyExport)));
  $('[data-property-short-name]').forEach((button) => button.addEventListener("click", () => setPropertyShortName(button.dataset.propertyShortName)));
  $('[data-property-home]').forEach((button) => button.addEventListener("click", () => toggleHomeProperty(button.dataset.propertyHome)));
}

async function setPropertyShortName(accountId) {
  const property = state.properties.find((item) => item.accountId === accountId); if (!property) return;
  const value = prompt("Short property name (leave blank to use the WSGC name):", propertyPreference(property).shortName || ""); if (value === null) return;
  state.workspace.properties ||= {}; state.workspace.properties[accountId] = { ...propertyPreference(property), shortName: value.trim() };
  state.workspace = normalizeSettings(state.workspace); await DB.putSetting("workspace", state.workspace); render();
}
async function toggleHomeProperty(accountId) {
  const property = state.properties.find((item) => item.accountId === accountId); if (!property) return;
  const wasHome = Boolean(propertyPreference(property).home); state.workspace.properties ||= {};
  for (const key of Object.keys(state.workspace.properties)) state.workspace.properties[key] = { ...state.workspace.properties[key], home: false };
  state.workspace.properties[accountId] = { ...propertyPreference(property), home: !wasHome };
  state.workspace = normalizeSettings(state.workspace); await DB.putSetting("workspace", state.workspace); render();
}
function propertyPeople(property) {
  const snapshot = state.snapshots.get(property.accountId);
  return snapshot ? buildPeople([property], [snapshot]) : [];
}

function propertyMetrics(property) {
  const people = propertyPeople(property); const changes = state.changes.filter((event) => event.property.accountId === property.accountId).length;
  return {
    people,
    active: people.filter((person) => person.propertyStandings.some((standing) => ["active", "approaching", "expiring10"].includes(standing.bucket))).length,
    pending: people.filter((person) => person.propertyStandings.some((standing) => ["pending", "renewalPending"].includes(standing.bucket))).length,
    attention: people.filter((person) => ["attention", "expiring10"].includes(person.bucket)).length,
    approaching45: people.filter((person) => (person.currentLicenses || []).some((license) => ["approaching", "expiring10"].includes(license.bucket))).length,
    expiring10: people.filter((person) => (person.currentLicenses || []).some((license) => license.bucket === "expiring10")).length,
    changes,
  };
}

function openPropertyPeople(accountId, status = "current") {
  $("#property-filter").value = accountId; $("#status-filter").value = status; $("#staff-filter").value = ""; switchView("people");
}

function openPropertyWorkspace(accountId, section = "") {
  const property = state.properties.find((item) => item.accountId === accountId); if (!property) return;
  const snapshot = state.snapshots.get(accountId); const metrics = propertyMetrics(property); const followed = metrics.people.filter((person) => personPreference(person).starred);
  const alerts = metrics.people.filter((person) => ["attention", "expiring10"].includes(person.bucket));
  const changes = state.changes.filter((event) => event.property.accountId === accountId);
  $("#property-workspace-detail").innerHTML = `<div class="detail-head"><p class="kicker">MANAGED PROPERTY WORKSPACE</p><h2>${escapeHtml(property.name)}</h2><p>${escapeHtml([property.city, property.county].filter(Boolean).join(" · "))} · ${snapshot ? `Refreshed ${formatTime(snapshot.retrievedAt)}` : "No roster loaded"}</p><div class="detail-actions"><button id="workspace-roster" class="button primary">View roster</button><button id="workspace-refresh" class="button secondary">Refresh</button><button id="workspace-export" class="button secondary">Export CSV</button></div></div><div class="workspace-stats"><button data-workspace-filter="current"><span>People shown</span><strong>${metrics.people.length}</strong></button><button data-workspace-filter="active"><span>Active shown</span><strong>${metrics.active}</strong></button><button data-workspace-filter="pending"><span>Pending / renewal</span><strong>${metrics.pending}</strong></button><button data-workspace-filter="attention"><span>Needs attention</span><strong>${metrics.attention}</strong></button><button data-workspace-filter="expiring45"><span>Expiring ≤45 days</span><strong>${metrics.approaching45}</strong></button></div><section class="workspace-section"><div class="panel-head"><div><p class="section-number">MY STAFF</p><h3>Flagged at this property</h3></div></div>${followed.length ? followed.map(workspacePersonRow).join("") : `<div class="empty-inline">No flagged people appear in this property’s latest roster.</div>`}</section><section class="workspace-section"><div class="panel-head"><div><p class="section-number">REVIEW</p><h3>Needs attention</h3></div></div>${alerts.length ? alerts.map(workspacePersonRow).join("") : `<div class="empty-inline">Nothing currently appears in the attention queue.</div>`}</section><section id="property-workspace-changes" class="workspace-section"><div class="panel-head"><div><p class="section-number">CHANGES</p><h3>Latest observed differences</h3></div><span class="badge">${changes.length}</span></div>${changes.length ? changes.slice(0, 20).map((event) => `<div class="change-row"><span class="badge ${event.direction === "positive" ? "positive" : event.type === "not_returned" ? "not-returned" : ""}">${escapeHtml(event.type.replaceAll("_", " "))}</span><span><strong>${escapeHtml(event.person)}</strong><small>${escapeHtml(event.message)}</small></span><small>${escapeHtml(event.license || "")}</small></div>`).join("") : `<div class="empty-inline">A second successful refresh is needed before changes can be compared.</div>`}</section>`;
  const dialog = $("#property-workspace-dialog"); dialog.showModal();
  $("#workspace-roster").addEventListener("click", () => { dialog.close(); openPropertyPeople(accountId); });
  $("#workspace-refresh").addEventListener("click", async (event) => { await refreshProperty(accountId, event.currentTarget); dialog.close(); openPropertyWorkspace(accountId); });
  $("#workspace-export").addEventListener("click", () => exportPropertyCsv(accountId));
  $$('[data-workspace-filter]').forEach((button) => button.addEventListener("click", () => { dialog.close(); openPropertyPeople(accountId, button.dataset.workspaceFilter); }));
  $("#property-workspace-detail").querySelectorAll('[data-person]').forEach((row) => row.addEventListener("click", () => { dialog.close(); openPerson(row.dataset.person); }));
  if (section === "changes") $("#property-workspace-changes").scrollIntoView({ block: "start" });
}

function workspacePersonRow(person) { const preference = personPreference(person); return `<button class="compact-row person-link" data-person="${escapeHtml(person.key)}"><span><strong>${escapeHtml(person.fullName)}</strong><small>${escapeHtml([preference.department, ...(preference.tags || [])].filter(Boolean).join(" · ") || attentionSummary(person))}</small></span><span class="badge ${person.bucket}">${bucketLabel(person.bucket)}</span></button>`; }

function renderChanges() {
  const grouped = new Map(); for (const event of state.changes) { if (!grouped.has(event.property.accountId)) grouped.set(event.property.accountId, { property: event.property, events: [] }); grouped.get(event.property.accountId).events.push(event); }
  $("#change-count").textContent = state.changes.length; $("#change-count").classList.toggle("hidden", !state.changes.length);
  $("#changes-list").innerHTML = grouped.size ? [...grouped.values()].map(({ property, events }) => `<section class="change-group"><h3>${escapeHtml(property.name)} <span class="badge">${events.length} changes</span></h3>${events.map((event) => `<div class="change-row"><span class="badge ${event.direction === "positive" ? "positive" : event.type === "not_returned" ? "not-returned" : ""}">${escapeHtml(event.type.replaceAll("_", " "))}</span><span><strong>${escapeHtml(event.person)}</strong><small>${escapeHtml(event.message)}</small></span><small>${escapeHtml(event.license || "")}</small></div>`).join("")}</section>`).join("") : `<div class="empty-state"><h2>No comparison available</h2><p>Changes appear after a property has two successful saved refreshes.</p></div>`;
}

function bindPersonLinks() { $$('[data-person]').forEach((row) => { row.onclick = () => openPerson(row.dataset.person); }); }
function propertyStandingChips(person) { return person.propertyStandings.map((standing) => { const managed = state.properties.find((property) => property.accountId === standing.accountId); const label = managed ? propertyDisplayName(managed) : shortName(standing.name); return `<span class="property-chip ${standing.bucket}" title="${escapeHtml(standing.name)}"><span>${escapeHtml(label)}</span><strong>${bucketLabel(standing.bucket)}</strong></span>`; }).join(" "); }
function attentionSummary(person) { return person.propertyStandings.filter((standing) => ["attention", "expiring10"].includes(standing.bucket)).map((standing) => `${shortName(standing.name)}: ${bucketLabel(standing.bucket)}`).join(" · ") || person.properties.map((property) => property.name).join(" · "); }
function licenseCard(license, outside = false) { return `<section class="license-card ${license.superseded ? "prior-record" : ""}"><div class="license-top"><div><strong>${escapeHtml(license.licenseType || "License record")}</strong><small>${escapeHtml(license.propertyName)}${outside ? " · Public individual lookup" : ""}${license.superseded ? ` · Prior record replaced by ${escapeHtml(license.supersededBy || "a renewed license")}` : ""}</small></div><span class="badge ${license.superseded ? "superseded" : license.bucket}">${license.superseded ? "Renewed" : bucketLabel(license.bucket)}</span></div><dl><div><dt>License number</dt><dd>${escapeHtml(license.licenseNumber || "—")}</dd></div><div><dt>WSGC status</dt><dd>${escapeHtml(license.status)}</dd></div><div><dt>Received date</dt><dd>${formatDate(license.receivedDate)}</dd></div><div><dt>Expiration</dt><dd>${formatDate(license.expirationDate)}</dd></div></dl></section>`; }
function openPerson(key) {
  const person = state.people.find((item) => item.key === key); if (!person) return;
  const preference = personPreference(person);
  $("#person-detail").innerHTML = `<div class="detail-head"><p class="kicker">PERSON DETAIL</p><h2>${escapeHtml(person.fullName)}</h2><p>${person.properties.length} managed ${person.properties.length === 1 ? "property" : "properties"} · ${person.licenses.length} license records</p><div class="detail-actions"><button id="full-profile" class="button secondary">Check full WSGC profile</button><small>On-demand public lookup; results are not saved.</small></div></div><section class="local-profile"><div><p class="section-number">LOCAL WORKSPACE LABELS</p><h3>Manager view</h3><p>These labels are private to this browser and are not WSGC facts.</p></div><label class="staff-toggle"><input id="person-starred" type="checkbox" ${preference.starred ? "checked" : ""}> Add to My Staff</label><label>Department<select id="person-department"><option value="">Unassigned</option>${DEFAULT_DEPARTMENTS.map((department) => `<option value="${department}" ${preference.department === department ? "selected" : ""}>${department}</option>`).join("")}</select></label><label>Tags<input id="person-tags" value="${escapeHtml((preference.tags || []).join(", "))}" placeholder="Shift, team, location"></label><button id="save-person-labels" class="button primary">Save local labels</button></section><div class="standing-summary">${propertyStandingChips(person)}</div><div id="full-profile-results"></div><div class="section-label">MANAGED PROPERTY RECORDS · PUBLIC WSGC DATA</div>${person.licenses.map((license) => licenseCard(license)).join("")}`;
  $("#person-dialog").showModal();
  $("#full-profile").addEventListener("click", () => loadFullProfile(person));
  $("#save-person-labels").addEventListener("click", async () => {
    state.workspace.people[person.key] = { starred: $("#person-starred").checked, name: person.fullName, department: $("#person-department").value, tags: $("#person-tags").value.split(",").map((tag) => tag.trim()).filter(Boolean), updatedAt: new Date().toISOString() };
    state.workspace = normalizeSettings(state.workspace); await DB.putSetting("workspace", state.workspace); render(); showNotice(`${person.fullName}: local labels saved.`); $("#person-dialog").close();
  });
}

async function toggleStar(key) {
  const person = state.people.find((item) => item.key === key); if (!person) return;
  const current = personPreference(person);
  state.workspace.people[key] = { ...current, name: person.fullName, starred: !current.starred, updatedAt: new Date().toISOString() };
  state.workspace = normalizeSettings(state.workspace); await DB.putSetting("workspace", state.workspace); render();
  showNotice(`${person.fullName} ${state.workspace.people[key].starred ? "added to" : "removed from"} My Staff.`);
}

async function loadFullProfile(person) {
  const button = $("#full-profile"); const target = $("#full-profile-results"); const sample = person.licenses[0] || {};
  button.disabled = true; button.textContent = "Checking WSGC…"; target.innerHTML = `<div class="lookup-note">Retrieving the public individual record…</div>`;
  try {
    const response = await chrome.runtime.sendMessage({ type: "SEARCH_INDIVIDUALS", criteria: { firstname: sample.firstName || person.fullName.split(/\s+/)[0], lastname: sample.lastName || person.fullName.split(/\s+/).slice(1).join(" ") } });
    if (!response.ok) throw new Error(response.error);
    const matches = markRenewedRecords(response.data.map((record) => normalizeIndividualLicense(record)).filter((license) => !person.contactId || license.contactId.toLowerCase() === person.contactId.toLowerCase()));
    if (!matches.length) { target.innerHTML = `<div class="lookup-note">No matching public individual records were returned.</div>`; return; }
    const managedIds = new Set(state.properties.map((property) => property.accountId));
    const outside = matches.filter((license) => !managedIds.has(license.propertyId));
    const managed = matches.filter((license) => managedIds.has(license.propertyId));
    target.innerHTML = `<section class="profile-summary"><strong>${outside.length ? `${outside.length} outside-property association${outside.length === 1 ? "" : "s"} found` : "No outside-property associations found"}</strong><small>${matches.length} total public license association${matches.length === 1 ? "" : "s"} returned by WSGC.</small></section>${outside.length ? `<div class="section-label">Outside managed properties</div>${outside.map((license) => licenseCard(license, true)).join("")}` : ""}${managed.length ? `<details class="managed-profile"><summary>Show ${managed.length} managed-property result${managed.length === 1 ? "" : "s"}</summary>${managed.map((license) => licenseCard(license, true)).join("")}</details>` : ""}`;
  } catch (error) { target.innerHTML = `<div class="lookup-note error-copy">${escapeHtml(error.message)}</div>`; }
  finally { button.disabled = false; button.textContent = "Check again"; }
}

function openPropertyDialog(mode = "managed") { state.searchMode = mode; const dialog = $("#property-dialog"); dialog.querySelector("form").reset(); $("#search-results").innerHTML = ""; $("#search-status").textContent = ""; $("#property-dialog-title").textContent = mode === "quick" ? "Quick property lookup" : "Find a managed property"; $("#property-dialog-copy").textContent = mode === "quick" ? "Inspect a current public roster without adding it to your workspace, totals, alerts, or history." : "Search for a property to add to your managed licensing portfolio."; dialog.showModal(); }
async function performSearch(criteria) { const button = $("#search-submit"); button.disabled = true; $("#search-status").textContent = "Searching WSGC…"; $("#search-results").innerHTML = ""; try { const response = await chrome.runtime.sendMessage({ type: "SEARCH_ORGANIZATIONS", criteria }); if (!response.ok) throw new Error(response.error); const groups = response.data; const results = [...groups.organizations.map((r) => normalizeOrganization(r, "organizations")), ...groups.applications.map((r) => normalizeOrganization(r, "applications")), ...groups.tribes.map((r) => normalizeOrganization(r, "tribes"))].filter((item) => item.accountId); $("#search-status").textContent = `${results.length} result${results.length === 1 ? "" : "s"}`; $("#search-results").innerHTML = results.map((org, index) => { const added = state.properties.some((p) => p.accountId === org.accountId); const action = state.searchMode === "quick" ? "View roster" : added ? "Added" : "Add to workspace"; return `<div class="search-result"><span><strong>${escapeHtml(org.name)}</strong><small>${escapeHtml([org.tradeName, org.city, org.county, org.licenseType, org.status].filter(Boolean).join(" · "))}</small></span><button type="button" class="button secondary" data-search-result="${index}" ${state.searchMode === "managed" && added ? "disabled" : ""}>${action}</button></div>`; }).join("") || `<div class="search-result"><small>No matching organizations were returned.</small></div>`; $$('[data-search-result]').forEach((action) => action.addEventListener("click", async () => { const org = results[Number(action.dataset.searchResult)]; if (state.searchMode === "quick") await openQuickRoster(org, action); else { await addProperty(org); action.textContent = "Added"; action.disabled = true; } })); } catch (error) { $("#search-status").textContent = error.message; } finally { button.disabled = false; } }
async function openQuickRoster(property, button) { button.disabled = true; button.textContent = "Loading…"; try { const response = await chrome.runtime.sendMessage({ type: "RETRIEVE_ROSTER", accountId: property.accountId }); if (!response.ok) throw new Error(response.error); const people = buildPeople([property], [{ accountId: property.accountId, individuals: response.data.individuals }]); $("#quick-detail").innerHTML = `<div class="detail-head"><p class="kicker">QUICK LOOKUP · NOT SAVED</p><h2>${escapeHtml(property.name)}</h2><p>${people.length} people · ${response.data.individuals.length} license records</p><div class="detail-actions">${state.properties.some((item) => item.accountId === property.accountId) ? `<span class="badge managed">Already managed</span>` : `<button id="quick-add-property" class="button primary">Add to managed properties</button>`}<small>This roster is excluded from workspace totals, alerts, snapshots, and changes.</small></div></div><div class="quick-roster">${people.map((person) => `<section class="quick-person"><div><strong>${escapeHtml(person.fullName)}</strong><small>${escapeHtml([...new Set(person.licenses.map((license) => license.licenseType).filter(Boolean))].join(", "))}</small></div><span class="badge ${person.bucket}">${bucketLabel(person.bucket)}</span></section>`).join("")}</div>`; $("#property-dialog").close(); $("#quick-dialog").showModal(); $("#quick-add-property")?.addEventListener("click", async () => { await addProperty(property); $("#quick-dialog").close(); }); } catch (error) { $("#search-status").textContent = error.message; } finally { button.disabled = false; button.textContent = "View roster"; } }
async function addProperty(org) {
  if (state.properties.some((p) => p.accountId === org.accountId)) return;

  const property = {
    accountId: org.accountId,
    name: org.name,
    city: org.city,
    county: org.county,
    licenseType: org.licenseType,
    addedAt: new Date().toISOString(),
  };

  await DB.putProperty(property);
  state.properties.push(property);
  $("#property-dialog")?.close();
  showNotice(`${property.name} was added. Retrieving its current roster…`);

  try {
    await retrieveAndSave(property);
    await reloadSnapshots();
    render();
    showNotice(`${property.name} was added and its current roster loaded.`);
  } catch (error) {
    await reloadSnapshots();
    render();
    showNotice(`${property.name} was added, but its roster could not be loaded: ${error.message}`, true);
  }
}
async function refreshAll() { const button = $("#refresh-all"); if (!state.properties.length) { openPropertyDialog(); return; } button.disabled = true; let passed = 0; const failures = []; for (let i = 0; i < state.properties.length; i += 1) { const property = state.properties[i]; button.textContent = `Refreshing ${i + 1} of ${state.properties.length}`; try { await retrieveAndSave(property); passed += 1; } catch (error) { failures.push(`${property.name}: ${error.message}`); } } await reloadSnapshots(); render(); button.disabled = false; button.textContent = "Refresh all"; if (failures.length) showNotice(`${passed} refreshed. ${failures.length} failed: ${failures.join(" | ")}`, true); else showNotice(`${passed} ${passed === 1 ? "property" : "properties"} refreshed successfully.`); }
async function refreshProperty(accountId, button) { const property = state.properties.find((p) => p.accountId === accountId); if (!property) return; if (button) { button.disabled = true; button.textContent = "Refreshing…"; } try { await retrieveAndSave(property); await reloadSnapshots(); render(); showNotice(`${property.name}: roster refreshed successfully.`); } catch (error) { await reloadSnapshots(); render(); showNotice(`${property.name}: ${error.message} Existing data was kept.`, true); } finally { if (button) { button.disabled = false; button.textContent = "Refresh"; } } }
async function retrieveAndSave(property) {
  const attemptedAt = new Date().toISOString();
  try {
    const response = await chrome.runtime.sendMessage({ type: "RETRIEVE_ROSTER", accountId: property.accountId });
    if (!response.ok) throw new Error(response.error);
    const data = response.data;
    const snapshot = { id: `${property.accountId}:${data.retrievedAt}`, accountId: property.accountId, propertyName: property.name, retrievedAt: data.retrievedAt, individuals: data.individuals, organizations: data.organizations };
    await DB.putSnapshot(snapshot);
    Object.assign(property, { lastRefreshAttemptAt: attemptedAt, lastRefreshError: "" });
    await DB.putProperty(property);
    return snapshot;
  } catch (error) {
    Object.assign(property, { lastRefreshAttemptAt: attemptedAt, lastRefreshError: error.message || String(error) });
    await DB.putProperty(property);
    throw error;
  }
}

async function removeProperty(accountId) { const property = state.properties.find((p) => p.accountId === accountId); if (!property) return; const accepted = await confirmAction("Remove property?", `${property.name} will be removed from this workspace. Its saved snapshots will remain available if you add it again.`, "Remove"); if (!accepted) return; await DB.deleteProperty(accountId); state.properties = state.properties.filter((p) => p.accountId !== accountId); await reloadSnapshots(); render(); }
function confirmAction(title, copy, action = "Delete") { const dialog = $("#confirm-dialog"); $("#confirm-title").textContent = title; $("#confirm-copy").textContent = copy; dialog.querySelector('.danger').textContent = action; dialog.showModal(); return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true })); }

function csvRows(people) { const rows = [["Person", "Contact ID", "Managed property", "Property standing", "License number", "License type", "WSGC status", "Received date", "Expiration", "Workbench record", "My Staff", "Local department", "Local tags"]]; for (const person of people) for (const license of person.licenses) { const standing = person.propertyStandings.find((item) => item.accountId === license.propertyId); const preference = personPreference(person); rows.push([person.fullName, person.contactId, license.propertyName, bucketLabel(standing?.bucket || license.bucket), license.licenseNumber, license.licenseType, license.status, license.receivedDate, license.expirationDate, license.superseded ? `Prior record; renewed as ${license.supersededBy || "new license"}` : "Current record", preference.starred ? "Yes" : "No", preference.department || "", (preference.tags || []).join("; ")]); } return rows; }
function downloadCsv(filename, people) { download(filename, csvRows(people).map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv"); }
function exportCsv() { downloadCsv(`wsgc-roster-${new Date().toISOString().slice(0,10)}.csv`, filteredPeople()); }
function exportPropertyCsv(accountId) { const property = state.properties.find((item) => item.accountId === accountId); if (!property) return; downloadCsv(`${safeFilename(property.name)}-${new Date().toISOString().slice(0,10)}.csv`, propertyPeople(property)); }

function exportSettings() { const backup = createSettingsBackup(state.properties, state.workspace); download(`licence-desk-settings-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(backup, null, 2), "application/json"); }
async function prepareSettingsImport(event) { const file = event.target.files[0]; event.target.value = ""; if (!file) return; try { state.pendingSettingsImport = parseSettingsBackup(JSON.parse(await file.text())); const starred = Object.values(state.pendingSettingsImport.settings.people).filter((person) => person.starred).length; $("#settings-import-summary").textContent = `${state.pendingSettingsImport.properties.length} managed properties and ${starred} My Staff flags are ready to import.`; $("#settings-import-dialog").showModal(); } catch (error) { showNotice(error.message, true); } }
async function applySettingsImport(mode) {
  const incoming = state.pendingSettingsImport; if (!incoming) return;
  if (mode === "replace") await DB.clearProperties();
  for (const property of incoming.properties) await DB.putProperty(property);
  state.workspace = mode === "merge" ? mergeSettings(state.workspace, incoming.settings) : normalizeSettings(incoming.settings);
  await DB.putSetting("workspace", state.workspace); state.properties = await DB.getProperties(); await reloadSnapshots(); render(); $("#settings-import-dialog").close(); state.pendingSettingsImport = null;
  showNotice(`Settings ${mode === "merge" ? "merged" : "replaced"}. No roster history or credentials were imported.`);
}

async function exportBackup() { const snapshots = Object.fromEntries(await Promise.all(state.properties.map(async (p) => [p.accountId, await DB.getSnapshots(p.accountId)]))); download(`wsgc-workbench-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), properties: state.properties, snapshots, workspace: state.workspace }, null, 2), "application/json"); }
async function importBackup(event) { const file = event.target.files[0]; event.target.value = ""; if (!file) return; try { const data = JSON.parse(await file.text()); if (![1, 2].includes(data.version) || !Array.isArray(data.properties)) throw new Error("This is not a supported Workbench backup."); for (const property of data.properties) await DB.putProperty(property); for (const values of Object.values(data.snapshots || {})) for (const snapshot of values) await DB.putSnapshot(snapshot); if (data.workspace) { state.workspace = mergeSettings(state.workspace, data.workspace); await DB.putSetting("workspace", state.workspace); } state.properties = await DB.getProperties(); await reloadSnapshots(); render(); showNotice("Full backup imported successfully."); } catch (error) { showNotice(error.message, true); } }
async function clearData() { const accepted = await confirmAction("Delete all local data?", "This permanently deletes selected properties, saved rosters, change history, My Staff flags, and local labels from this browser. Export a backup first if you may need it."); if (!accepted) return; await DB.clearAll(); state.properties = []; state.workspace = normalizeSettings(); await reloadSnapshots(); render(); switchView("overview"); showNotice("All local Workbench data was deleted."); }

function download(filename, text, type) { const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function csvCell(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function safeFilename(value) { return String(value || "property").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "property"; }
function bucketLabel(bucket) { return ({ active: "Active", pending: "Pending", renewalPending: "Renewal pending", historical: "Historical / inactive", attention: "Needs attention", expiring10: "Expires ≤10 days", approaching: "Expires ≤45 days" })[bucket] || bucket; }
function shortName(name) { return name.replace(/casino|cardroom|card room/ig, "").trim() || name; }
function showNotice(message, error = false) { const notice = $("#notice"); notice.textContent = message; notice.className = error ? "notice error" : "notice"; clearTimeout(showNotice.timer); showNotice.timer = setTimeout(() => notice.classList.add("hidden"), error ? 12000 : 5000); }

initialize().catch((error) => showNotice(`Could not start the Workbench: ${error.message}`, true));
