# Development Roadmap

This document is the planning surface for Licence Operations Desk. Items may be discussed here without being committed to a release.

## Baseline

**Current development baseline:** v1.0.4

v1.0.4 remains the published baseline. The v1.0.5 scope below was discussed and approved on October 1, 2026. The manifest remains at v1.0.4 until release-candidate review.

## v1.0.5 — In development

### Approved

- **My Staff:** locally flag people a manager oversees, with optional department and tags. Labels persist independently of refreshed WSGC snapshots and remain visibly separate from source facts.
- **Settings-only portability:** export and import managed-property selections, My Staff flags, departments, tags, preferences, and alert thresholds without roster snapshots, history, credentials, cookies, or tokens. Import supports merge and replace.
- **Actionable property dashboards:** property cards expose roster, active, pending/renewal, attention, recent-change, and last-refresh information with direct actions.
- **Property workspaces:** property-specific summary, filtered roster, My Staff, attention queue, expiration counts, recent changes, refresh, and CSV export.
- **Responsive reference view:** narrow-screen tables become stacked cards, dialogs use the full screen, and important actions do not depend on hover. Desktop remains the primary target.

### Candidates under discussion

- Custom department-list editing beyond the approved default department choices.
- Optional notification scheduling. This would require a separate permission and policy review.

### Implementation planning

- No new WSGC endpoint, permission, automated polling, or background refresh is introduced.
- Local person preferences use the existing IndexedDB settings store and a stable person key already used by the register.
- Settings files use a distinct, validated schema and explicitly omit roster/history and browser session material.
- Replacing settings changes selected properties and local labels but intentionally leaves dormant snapshots available if a property is re-added.
- Full backups are versioned at schema 2 while restore remains compatible with schema 1.
- Node regression tests cover settings normalization/merge boundaries and renewed/pending status behavior.

## Known issues / observations

Add confirmed defects or confusing behavior here as they are identified. Separate bugs from feature requests.

- Public individual profile results are on-demand and intentionally not persisted. Outside-property associations should continue to be presented as source observations, not employment conclusions.

## Future / deferred

Ideas that are worthwhile but not appropriate for the next release belong here rather than being lost or forced into v1.0.5.

- Mobile extension availability research is deferred and must not delay desktop extension development. Narrow-screen rendering remains useful for reference where a browser permits extension use.

## WSGC access review

The project is intentionally taking a conservative approach to WSGC access.

Before expanding the existing integration, clarify whether WSGC places additional restrictions on software making user-initiated requests to its public License Lookup and on internal business/compliance use of information returned through that lookup.

Until then, do not expand the extension into authenticated/nonpublic WSGC resources, unattended scraping, bulk harvesting, or additional endpoints solely because they are technically accessible.

## Licensing

Repository licensing remains under review. Do not add an open-source or source-available license until that decision is made.
