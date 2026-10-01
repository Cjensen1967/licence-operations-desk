"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { markRenewedRecords, standingForLicenses } = require("../shared/model.js");

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
