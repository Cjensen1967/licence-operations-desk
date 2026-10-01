# AGENTS.md

## Purpose

This file defines guardrails for humans and AI coding agents working on Licence Operations Desk. Read it before modifying application behavior, WSGC access, storage, permissions, privacy language, or release metadata.

## Product model

Licence Operations Desk is a browser extension that organizes public Washington State gambling-license information in a local browser workspace.

The extension is not a WSGC product. Do not imply WSGC affiliation, endorsement, sponsorship, or authorization.

## Conservative WSGC access boundary

Treat the existing WSGC integration as sensitive infrastructure.

Do not, without explicit project-owner review:

- add access to authenticated, nonpublic, administrative, application, or account-only WSGC records;
- bypass authentication, authorization, rate limits, CAPTCHAs, access controls, or other technical restrictions;
- introduce credential collection, credential storage, impersonation, or session hijacking;
- add unattended/background scraping, crawling, bulk harvesting, or high-frequency polling;
- expand to additional WSGC endpoints merely because they are technically reachable;
- attempt to defeat a WSGC change intended to prevent or restrict automated access;
- move WSGC-returned records to a developer-controlled server or third-party analytics service;
- add resale, lead-generation, marketing, or other secondary commercial use of individual licensee information.

The current design should remain user-initiated and limited to information made available through WSGC's public License Lookup unless a proposed change has been separately reviewed.

If WSGC changes its public site, tokens, endpoints, access behavior, or terms, stop and evaluate the change rather than automatically working around it.

## Data and privacy

Prefer local browser storage. Collect and transmit only what the feature requires.

Do not add telemetry, analytics, advertising, tracking, remote databases, or third-party data services without explicit approval and a corresponding privacy review.

Do not treat a license number as a person's identity when multiple returned records may belong to the same person.

Preserve source distinctions among active, pending, expired, historical, and inactive records. Do not silently transform uncertain regulatory data into a definitive status.

WSGC's organization roster labels the value currently sourced from `gmb_effectivedate` as **Received Date**. Preserve the user-facing WSGC meaning unless source behavior changes and is verified.

## Permissions and security

Keep extension permissions as narrow as practical. Any new host permission, browser permission, remote code, externally loaded script, or new network destination requires explicit review.

Never add secrets, private credentials, API keys, personal account data, or store credentials to the repository.

## Release discipline

Do not change the manifest version casually. A version change means a release candidate is intentionally being prepared.

Before a store submission, verify:

1. manifest version and permissions;
2. privacy disclosures against actual behavior;
3. first-run behavior;
4. property lookup and roster refresh;
5. individual/quick lookup behavior;
6. local persistence and upgrade behavior;
7. current/pending/expired/historical classification;
8. absence of developer-specific seed data or branding;
9. Chrome/Edge packaging requirements.

## Planning

Use `ROADMAP.md` for proposed product changes. Discussion does not automatically mean a feature is approved for the next release.

Prefer small, reviewable releases over combining unrelated experimental features.

## Licensing

No open-source license has currently been selected. Do not add or change repository licensing without explicit project-owner approval.
