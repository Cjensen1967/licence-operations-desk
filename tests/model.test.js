"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { markRenewedRecords, standingForLicenses, statusBucket, compareSnapshots } = require("../shared/model.js");

test("a renewed expired record does not control the property standing", () => {
  const licenses = markRenewedRecords([
    { propertyId: "p1", licenseType: "Card Room Employee", licenseNumber: "old", bucket: "historical", expirationDate: "2026-08-19" },
    { propertyId: "p1", licenseType: "Card Room Employee", licenseNumber: "new", bucket: "active", expirationDate: "2027-08-19" },
  ]);
  assert.equal(licenses[0].superseded, true);
  assert.equal(standingForLicenses(licenses).bucket, "active");
});

test("active plus pending at one property is renewal pending", () => {
  const standing = standingForLicenses([{ bucket: "active", expirationDate: "2026-12-01", daysRemaining: 61 }, { bucket: "pending", expirationDate: "2027-12-01", daysRemaining: 426 }]);
  assert.equal(standing.bucket, "renewalPending");
});


test("active licence only enters the action window at ten days", () => {
  const now = new Date(2026, 9, 2);
  assert.equal(statusBucket("Active", "2026-11-01", now), "approaching");
  assert.equal(statusBucket("Active", "2026-10-13", now), "approaching");
  assert.equal(statusBucket("Active", "2026-10-12", now), "expiring10");
});

test("expected inactive and pending statuses are not attention exceptions", () => {
  const now = new Date(2026, 9, 2);
  assert.equal(statusBucket("Inactive", "2026-09-01", now), "historical");
  assert.equal(statusBucket("Pending", "2027-09-01", now), "pending");
  assert.equal(statusBucket("Suspended", "2027-09-01", now), "attention");
  assert.equal(statusBucket("Unexpected Review State", "2027-09-01", now), "attention");
});

test("pending successor suppresses ten-day expiration attention", () => {
  const standing = standingForLicenses([
    { bucket: "expiring10", expirationDate: "2026-10-08", daysRemaining: 6 },
    { bucket: "pending", expirationDate: "2027-10-08", daysRemaining: 371 },
  ]);
  assert.equal(standing.bucket, "renewalPending");
});

test("snapshot comparison reports records no longer returned", () => {
  const previous = { accountId: "p1", propertyName: "Example", individuals: [{ fullname: "Person One", contactid: "c1", licensenumber: "L1", status: "Active" }] };
  const current = { accountId: "p1", propertyName: "Example", individuals: [] };
  const result = compareSnapshots(previous, current);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, "not_returned");
});


test("pending activation to active is a positive status change", () => {
  const previous = { accountId: "p1", individuals: [{ fullname: "Person One", contactid: "c1", licensenumber: "L1", status: "Pending Activation" }] };
  const current = { accountId: "p1", individuals: [{ fullname: "Person One", contactid: "c1", licensenumber: "L1", status: "Active" }] };
  const event = compareSnapshots(previous, current).events.find((item) => item.type === "status");
  assert.equal(event.direction, "positive");
});
