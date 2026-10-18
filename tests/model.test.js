"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  markRenewedRecords,
  standingForLicenses,
  statusBucket,
  isPositiveStatusTransition,
  buildLicenseRecords,
  summarizeLicenseRecords,
  compareSnapshots,
} = require("../shared/model.js");

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
  const previous = { accountId: "p1", propertyName: "Example Casino", individuals: [{ fullname: "Person One", contactid: "c1", licensenumber: "L1", licensetype: "Card Room Employee", status: "Pending Activation" }] };
  const current = { accountId: "p1", propertyName: "Example Casino", individuals: [{ fullname: "Person One", contactid: "c1", licensenumber: "L1", licensetype: "Card Room Employee", status: "Active" }] };
  const event = compareSnapshots(previous, current).events.find((item) => item.type === "status");
  assert.equal(event.direction, "positive");
  assert.equal(event.license, "L1");
  assert.equal(event.licenseType, "Card Room Employee");
  assert.equal(event.propertyName, "Example Casino");
});

test("pending to inactive or invalid is never classified as a positive status change", () => {
  assert.equal(isPositiveStatusTransition("Pending", "Inactive"), false);
  assert.equal(isPositiveStatusTransition("Pending", "Invalid"), false);
  assert.equal(isPositiveStatusTransition("Pending Activation", "Not Active"), false);
  assert.equal(isPositiveStatusTransition("Pending", "Expired"), false);
  assert.equal(isPositiveStatusTransition("Active", "Inactive"), false);
  assert.equal(isPositiveStatusTransition("Pending", "Active"), true);
  assert.equal(isPositiveStatusTransition("Pending Activation", "Active"), true);

  const previous = {
    accountId: "p1",
    propertyName: "Example Casino",
    individuals: [
      { fullname: "Person One", contactid: "c1", licensenumber: "L1", licensetype: "Card Room Employee", status: "Pending", expirationdate: "2027-05-01" },
      { fullname: "Person Two", contactid: "c2", licensenumber: "L2", licensetype: "Card Room Employee", status: "Pending", expirationdate: "2027-05-01" },
    ],
  };
  const current = {
    accountId: "p1",
    propertyName: "Example Casino",
    individuals: [
      { fullname: "Person One", contactid: "c1", licensenumber: "L1", licensetype: "Card Room Employee", status: "Inactive", expirationdate: "2027-06-01" },
      { fullname: "Person Two", contactid: "c2", licensenumber: "L2", licensetype: "Card Room Employee", status: "Invalid", expirationdate: "2027-05-01" },
    ],
  };
  const events = compareSnapshots(previous, current).events;
  const statusEvents = events.filter((item) => item.type === "status");
  assert.equal(statusEvents.length, 2);
  assert.equal(statusEvents.every((item) => item.direction === "neutral"), true);

  const expEvent = events.find((item) => item.type === "expiration");
  assert.equal(expEvent.personKey, "contact:c1");
  assert.equal(expEvent.license, "L1");
  assert.equal(expEvent.licenseType, "Card Room Employee");
});

test("buildLicenseRecords preserves all observations and separates unique licence counts without merging unnumbered pending records", () => {
  const now = new Date(2026, 9, 2);
  const properties = [
    { accountId: "prop-a", name: "Casino Alpha" },
    { accountId: "prop-b", name: "Casino Beta" },
  ];
  const snapshots = [
    {
      accountId: "prop-a",
      individuals: [
        // Shared active licence across both properties
        { fullname: "Alice Smith", contactid: "c-alice", licensenumber: "68-09999", licensetype: "Card Room Employee", status: "Active", expirationdate: "2027-08-19", received_date: "2026-08-01" },
        // Prior superseded record for Alice at Casino Alpha
        { fullname: "Alice Smith", contactid: "c-alice", licensenumber: "68-01111", licensetype: "Card Room Employee", status: "Expired", expirationdate: "2026-08-19", received_date: "2025-08-01" },
        // Unnumbered pending application #1
        { fullname: "Bob Jones", contactid: "c-bob", licensenumber: "", licensetype: "Card Room Employee", status: "Pending", expirationdate: "", received_date: "2026-09-15" },
      ],
    },
    {
      accountId: "prop-b",
      individuals: [
        // Duplicate observation of 68-09999 at second property
        { fullname: "Alice Smith", contactid: "c-alice", licensenumber: "68-09999", licensetype: "Card Room Employee", status: "Active", expirationdate: "2027-08-19", received_date: "2026-08-01" },
        // Unnumbered pending application #2 (different person/property - must NOT merge with Bob's unnumbered record)
        { fullname: "Carol White", contactid: "c-carol", licensenumber: "", licensetype: "Class III Gaming Employee", status: "Pending", expirationdate: "", received_date: "2026-09-20" },
      ],
    },
  ];

  const records = buildLicenseRecords(properties, snapshots, now);
  assert.equal(records.length, 5);

  const summary = summarizeLicenseRecords(records);
  assert.equal(summary.observations, 5);
  assert.equal(summary.uniqueNumberedLicenses, 2); // 68-09999 and 68-01111
  assert.equal(summary.unnumberedRecords, 2); // Bob and Carol pending records kept distinct
  assert.equal(summary.uniqueLicenses, 4); // 2 numbered + 2 distinct unnumbered
  assert.equal(summary.duplicateObservations, 1); // 1 extra observation of 68-09999
  assert.equal(summary.multiPropertyLicenses, 1); // 68-09999 observed at 2 properties
  assert.equal(summary.supersededObservations, 1); // 68-01111 superseded by 68-09999 at Casino Alpha

  const sharedObs = records.filter((record) => record.licenseNumber === "68-09999");
  assert.equal(sharedObs.length, 2);
  assert.equal(sharedObs.every((record) => record.duplicateAcrossProperties && record.propertyObservationCount === 2), true);
});
