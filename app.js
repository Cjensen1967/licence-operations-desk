"use strict";

const { normalizeOrganization, normalizeIndividualLicense, markRenewedRecords, buildPeople, compareSnapshots, summarize } = WSGCModel;
const state = { properties: [], snapshots: new Map(), histories: new Map(), people: [], changes: [], view: "overview", sort: "fullName", sortDirection: 1, searchMode: "managed" };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
const formatDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? (value || "—") : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date); };
const formatTime = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Never" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); };

async function initialize() {
  state.properties = await DB.getProperties();
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
    if (comparison.available) state.changes.push(...comparison.events.map((event) => ({ ...event, property })));
  }
  state.people = buildPeople(state.properties, [...state.snapshots.values()]);
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$('[data-go]').forEach((button) => button.addEventListener("click", () => { if (button.dataset.filter) $("#status-filter").value = button.dataset.filter; switchView(button.dataset.go); }));
  $("#add-property").addEventListener("click", () => openPropertyDialog("managed")); $("#empty-add").addEventListener("click", () => openPropertyDialog("managed"));
  $("#quick-lookup").addEventListener("click", () => openPropertyDialog("quick"));
  $("#refresh-all").addEventListener("click", refreshAll);
  $("#more-button").addEventListener("click", () => $("#more-menu").classList.toggle("hidden"));
  document.addEventListener("click", (event) => { if (!event.target.closest(".top-actions")) $("#more-menu").classList.add("hidden"); });
  $("#people-search").addEventListener("input", renderPeople); $("#property-filter").addEventListener("change", renderPeople); $("#status-filter").addEventListener("change", renderPeople);
  $("#property-dialog form").addEventListener("submit", (event) => { event.preventDefault(); performSearch(Object.fromEntries(new FormData(event.currentTarget).entries())); });
  $("#property-dialog-close").addEventListener("click", () => $("#property-dialog").close());
  $("#property-dialog-cancel").addEventListener("click", () => $("#property-dialog").close());
  $("#person-close").addEventListener("click", () => $("#person-dialog").close());
  $("#quick-close").addEventListener("click", () => $("#quick-dialog").close());
  $("#export-csv").addEventListener("click", exportCsv); $("#export-backup").addEventListener("click", exportBackup); $("#import-backup").addEventListener("click", () => $("#backup-file").click());
  $("#backup-file").addEventListener("change", importBackup); $("#clear-data").addEventListener("click", clearData);
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
  const summary = summarize(state.people, state.properties);
  $("#stats").innerHTML = [
    ["Managed properties", summary.properties], ["Current people shown", summary.people], ["All returned records", summary.records], ["Current assignments", summary.assignments], ["Expiring ≤90 days", summary.expiring90], ["Needs attention", summary.attention],
  ].map(([label, value]) => `<div class="stat ${label === "Needs attention" ? "attention" : ""}"><span>${label}</span><strong>${value}</strong></div>`).join("");
  renderAttention(); renderPropertySummary(); renderRecent(); renderFilters(); renderPeople(); renderProperties(); renderChanges();
}

function renderAttention() {
  const rows = state.people.filter((person) => ["attention", "renewalPending", "expiring30", "pending"].includes(person.bucket)).slice(0, 8);
  $("#attention-list").innerHTML = rows.map((person) => `<button class="compact-row person-link" data-person="${escapeHtml(person.key)}"><span><strong>${escapeHtml(person.fullName)}</strong><small>${escapeHtml(attentionSummary(person))}</small></span><span class="badge ${person.bucket}">${bucketLabel(person.bucket)}</span></button>`).join("");
  bindPersonLinks();
}

function renderPropertySummary() {
  $("#property-summary").innerHTML = state.properties.slice(0, 7).map((property) => { const snap = state.snapshots.get(property.accountId); return `<div class="compact-row"><span><strong>${escapeHtml(property.name)}</strong><small>Managed property</small></span><span><strong>${snap?.individuals?.length ?? "—"}</strong><small>${snap ? formatTime(snap.retrievedAt) : "Not retrieved"}</small></span></div>`; }).join("");
}

function renderRecent() {
  const rows = state.people.filter((person) => person.bucket !== "historical").slice(0, 10);
  $("#recent-people").innerHTML = rows.length ? `<table><thead><tr><th>Person</th><th>Property standing</th><th>License records</th><th>Overall</th></tr></thead><tbody>${rows.map((person) => `<tr class="person-link" data-person="${escapeHtml(person.key)}"><td><strong>${escapeHtml(person.fullName)}</strong></td><td>${propertyStandingChips(person)}</td><td>${person.licenses.length}</td><td><span class="badge ${person.bucket}">${bucketLabel(person.bucket)}</span></td></tr>`).join("")}</tbody></table>` : `<div class="compact-row"><small>Refresh a property to load its roster.</small></div>`;
  bindPersonLinks();
}

function renderFilters() {
  const current = $("#property-filter").value;
  $("#property-filter").innerHTML = `<option value="">All properties</option>${state.properties.map((p) => `<option value="${escapeHtml(p.accountId)}">${escapeHtml(p.name)}</option>`).join("")}`;
  $("#property-filter").value = current;
}

function filteredPeople() {
  const query = $("#people-search").value.trim().toLowerCase(); const propertyId = $("#property-filter").value; const status = $("#status-filter").value;
  return state.people.filter((person) => {
    const haystack = [person.fullName, ...person.properties.map((p) => p.name), ...person.licenses.flatMap((l) => [l.licenseNumber, l.licenseType, l.status])].join(" ").toLowerCase();
    const propertyMatch = !propertyId || person.properties.some((p) => p.accountId === propertyId);
    const currentLicenses = person.currentLicenses || person.licenses;
    const statusMatch = !status || (status === "current" ? person.bucket !== "historical" : status === "attention" ? ["attention", "renewalPending", "expiring30", "pending"].includes(person.bucket) : status === "expiring90" ? currentLicenses.some((l) => ["expiring30", "expiring60", "expiring90"].includes(l.bucket)) : status === "pending" ? person.propertyStandings.some((standing) => ["pending", "renewalPending"].includes(standing.bucket)) : status === "historical" ? person.bucket === "historical" : currentLicenses.some((l) => l.bucket === status));
    return (!query || haystack.includes(query)) && propertyMatch && statusMatch;
  });
}

function renderPeople() {
  const people = filteredPeople().sort((a, b) => { const av = a[state.sort] ?? Number.MAX_SAFE_INTEGER; const bv = b[state.sort] ?? Number.MAX_SAFE_INTEGER; return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * state.sortDirection; });
  $("#people-result-count").textContent = `${people.length} ${people.length === 1 ? "person" : "people"}`;
  $("#people-table").innerHTML = people.map((person) => `<tr data-person="${escapeHtml(person.key)}"><td class="person-cell"><strong>${escapeHtml(person.fullName)}</strong><small class="record-id">${person.identity === "name_fallback" ? "Grouped by name; contact ID unavailable" : escapeHtml(person.contactId)}</small></td><td><div class="property-standings">${propertyStandingChips(person)}</div></td><td class="record-count"><strong>${person.licenses.length}</strong><small>${escapeHtml([...new Set(person.licenses.map((l) => l.licenseType).filter(Boolean))].join(", "))}</small></td><td class="date-cell"><strong>${formatDate(person.nearestExpiration)}</strong><small>${person.nearestDays === null ? "No date" : person.nearestDays < 0 ? `${Math.abs(person.nearestDays)} days ago` : `${person.nearestDays} days`}</small></td><td><span class="badge ${person.bucket}">${bucketLabel(person.bucket)}</span></td></tr>`).join("");
  bindPersonLinks();
}

function renderProperties() {
  $("#properties-grid").innerHTML = state.properties.map((property) => { const snap = state.snapshots.get(property.accountId); const history = state.histories.get(property.accountId) || []; return `<article class="property-card"><div class="property-card-head"><span class="badge managed">Managed</span><h3>${escapeHtml(property.name)}</h3></div><p>${escapeHtml([property.city, property.county].filter(Boolean).join(" · ") || property.accountId)}</p><div class="property-meta"><div><span>Latest records</span><strong>${snap?.individuals?.length ?? "Not loaded"}</strong></div><div><span>Last refreshed</span><strong>${snap ? formatTime(snap.retrievedAt) : "Never"}</strong></div><div><span>Saved snapshots</span><strong>${history.length}</strong></div><div><span>Last result</span><strong>${snap ? "Successful" : "Waiting"}</strong></div></div><div class="card-actions"><button class="button secondary" data-refresh="${escapeHtml(property.accountId)}">Refresh</button><button class="button quiet" data-remove="${escapeHtml(property.accountId)}">Remove</button></div></article>`; }).join("") || `<div class="empty-state"><h2>No managed properties</h2><p>Add at least one property to begin.</p></div>`;
  $$('[data-refresh]').forEach((button) => button.addEventListener("click", () => refreshProperty(button.dataset.refresh, button)));
  $$('[data-remove]').forEach((button) => button.addEventListener("click", () => removeProperty(button.dataset.remove)));
}

function renderChanges() {
  const grouped = new Map(); for (const event of state.changes) { if (!grouped.has(event.property.accountId)) grouped.set(event.property.accountId, { property: event.property, events: [] }); grouped.get(event.property.accountId).events.push(event); }
  $("#change-count").textContent = state.changes.length; $("#change-count").classList.toggle("hidden", !state.changes.length);
  $("#changes-list").innerHTML = grouped.size ? [...grouped.values()].map(({ property, events }) => `<section class="change-group"><h3>${escapeHtml(property.name)} <span class="badge">${events.length} changes</span></h3>${events.map((event) => `<div class="change-row"><span class="badge ${event.type === "not_returned" ? "attention" : ""}">${escapeHtml(event.type.replaceAll("_", " "))}</span><span><strong>${escapeHtml(event.person)}</strong><small>${escapeHtml(event.message)}</small></span><small>${escapeHtml(event.license || "")}</small></div>`).join("")}</section>`).join("") : `<div class="empty-state"><h2>No comparison available</h2><p>Changes appear after a property has two successful saved refreshes.</p></div>`;
}

function bindPersonLinks() { $$('[data-person]').forEach((row) => { row.onclick = () => openPerson(row.dataset.person); }); }
function propertyStandingChips(person) { return person.propertyStandings.map((standing) => `<span class="property-chip ${standing.bucket}"><span>${escapeHtml(shortName(standing.name))}</span><strong>${bucketLabel(standing.bucket)}</strong></span>`).join(" "); }
function attentionSummary(person) { return person.propertyStandings.filter((standing) => ["attention", "renewalPending", "expiring30", "pending"].includes(standing.bucket)).map((standing) => `${shortName(standing.name)}: ${bucketLabel(standing.bucket)}`).join(" · ") || person.properties.map((property) => property.name).join(" · "); }
function licenseCard(license, outside = false) { return `<section class="license-card ${license.superseded ? "prior-record" : ""}"><div class="license-top"><div><strong>${escapeHtml(license.licenseType || "License record")}</strong><small>${escapeHtml(license.propertyName)}${outside ? " · Public individual lookup" : ""}${license.superseded ? ` · Prior record replaced by ${escapeHtml(license.supersededBy || "a renewed license")}` : ""}</small></div><span class="badge ${license.superseded ? "superseded" : license.bucket}">${license.superseded ? "Renewed" : bucketLabel(license.bucket)}</span></div><dl><div><dt>License number</dt><dd>${escapeHtml(license.licenseNumber || "—")}</dd></div><div><dt>WSGC status</dt><dd>${escapeHtml(license.status)}</dd></div><div><dt>Received date</dt><dd>${formatDate(license.receivedDate)}</dd></div><div><dt>Expiration</dt><dd>${formatDate(license.expirationDate)}</dd></div></dl></section>`; }
function openPerson(key) { const person = state.people.find((item) => item.key === key); if (!person) return; $("#person-detail").innerHTML = `<div class="detail-head"><p class="kicker">PERSON DETAIL</p><h2>${escapeHtml(person.fullName)}</h2><p>${person.properties.length} managed ${person.properties.length === 1 ? "property" : "properties"} · ${person.licenses.length} license records</p><div class="detail-actions"><button id="full-profile" class="button secondary">Check full WSGC profile</button><small>On-demand lookup; results are not saved.</small></div></div><div class="standing-summary">${propertyStandingChips(person)}</div><div id="full-profile-results"></div><div class="section-label">Managed property records</div>${person.licenses.map((license) => licenseCard(license)).join("")}`; $("#person-dialog").showModal(); $("#full-profile").addEventListener("click", () => loadFullProfile(person)); }

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
async function refreshProperty(accountId, button) { const property = state.properties.find((p) => p.accountId === accountId); if (!property) return; if (button) { button.disabled = true; button.textContent = "Refreshing…"; } try { await retrieveAndSave(property); await reloadSnapshots(); render(); showNotice(`${property.name}: roster refreshed successfully.`); } catch (error) { showNotice(`${property.name}: ${error.message} Existing data was kept.`, true); } finally { if (button) { button.disabled = false; button.textContent = "Refresh"; } } }
async function retrieveAndSave(property) { const response = await chrome.runtime.sendMessage({ type: "RETRIEVE_ROSTER", accountId: property.accountId }); if (!response.ok) throw new Error(response.error); const data = response.data; const snapshot = { id: `${property.accountId}:${data.retrievedAt}`, accountId: property.accountId, propertyName: property.name, retrievedAt: data.retrievedAt, individuals: data.individuals, organizations: data.organizations }; await DB.putSnapshot(snapshot); return snapshot; }

async function removeProperty(accountId) { const property = state.properties.find((p) => p.accountId === accountId); if (!property) return; const accepted = await confirmAction("Remove property?", `${property.name} will be removed from this workspace. Its saved snapshots will remain available if you add it again.`, "Remove"); if (!accepted) return; await DB.deleteProperty(accountId); state.properties = state.properties.filter((p) => p.accountId !== accountId); await reloadSnapshots(); render(); }
function confirmAction(title, copy, action = "Delete") { const dialog = $("#confirm-dialog"); $("#confirm-title").textContent = title; $("#confirm-copy").textContent = copy; dialog.querySelector('.danger').textContent = action; dialog.showModal(); return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true })); }

function exportCsv() { const rows = [["Person", "Contact ID", "Managed property", "Property standing", "License number", "License type", "WSGC status", "Received date", "Expiration", "Workbench record"]]; for (const person of filteredPeople()) for (const l of person.licenses) { const standing = person.propertyStandings.find((item) => item.accountId === l.propertyId); rows.push([person.fullName, person.contactId, l.propertyName, bucketLabel(standing?.bucket || l.bucket), l.licenseNumber, l.licenseType, l.status, l.receivedDate, l.expirationDate, l.superseded ? `Prior record; renewed as ${l.supersededBy || "new license"}` : "Current record"]); } download(`wsgc-roster-${new Date().toISOString().slice(0,10)}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv"); }
async function exportBackup() { const snapshots = Object.fromEntries(await Promise.all(state.properties.map(async (p) => [p.accountId, await DB.getSnapshots(p.accountId)]))); download(`wsgc-workbench-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), properties: state.properties, snapshots }, null, 2), "application/json"); }
async function importBackup(event) { const file = event.target.files[0]; event.target.value = ""; if (!file) return; try { const data = JSON.parse(await file.text()); if (data.version !== 1 || !Array.isArray(data.properties)) throw new Error("This is not a supported Workbench backup."); for (const property of data.properties) await DB.putProperty(property); for (const values of Object.values(data.snapshots || {})) for (const snapshot of values) await DB.putSnapshot(snapshot); state.properties = await DB.getProperties(); await reloadSnapshots(); render(); showNotice("Backup imported successfully."); } catch (error) { showNotice(error.message, true); } }
async function clearData() { const accepted = await confirmAction("Delete all local data?", "This permanently deletes selected properties, saved rosters, and change history from this browser. Export a backup first if you may need it."); if (!accepted) return; await DB.clearAll(); state.properties = []; await reloadSnapshots(); render(); switchView("overview"); showNotice("All local Workbench data was deleted."); }

function download(filename, text, type) { const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function csvCell(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function bucketLabel(bucket) { return ({ active: "Active", pending: "Pending", renewalPending: "Renewal pending", historical: "Historical / inactive", attention: "Attention", expiring30: "≤30 days", expiring60: "31–60 days", expiring90: "61–90 days", other: "Other" })[bucket] || bucket; }
function shortName(name) { return name.replace(/casino|cardroom|card room/ig, "").trim() || name; }
function showNotice(message, error = false) { const notice = $("#notice"); notice.textContent = message; notice.className = error ? "notice error" : "notice"; clearTimeout(showNotice.timer); showNotice.timer = setTimeout(() => notice.classList.add("hidden"), error ? 12000 : 5000); }

initialize().catch((error) => showNotice(`Could not start the Workbench: ${error.message}`, true));
