# Development Roadmap

This document is the planning surface for Licence Operations Desk. Items may be discussed here without being committed to a release.

## Baseline

**Current published baseline:** v1.0.4 (`manifest.json` remains at `1.0.4` until final release packaging)  
**Current development candidate:** v1.0.5

## v1.0.5 — Release Candidate Scope (Completed in `main`)

### Implemented and verified

- **People & All Licence Records registers:**
  - **People register (person-centric):** defaults to **All returned people**, provides one-click **Show all people** reset, readable filter controls, local property short-name search, and grouped records per person.
  - **All licence records register (record-centric):** displays one row per returned licence observation and its managed property association, defaults to **All returned records** (including active, pending, expired, inactive, and superseded records), preserves duplicate licence observations across properties, and reports returned observation counts separately from unique licence counts without merging unnumbered pending records.
- **My Staff & property preferences:**
  - Locally flag people a manager oversees with optional department and tags; labels persist across roster refreshes and remain visibly separate from WSGC facts.
  - Assign local property short names while keeping the official WSGC property name visible on property cards, workspaces, and change groups.
  - Designate a single **Home property** with visual card highlighting and first-position sorting.
- **Changes log clarity & status-transition accuracy:**
  - Prominently displays the person, licence number, licence type, managed property, observed change, and relevant dates (`Received Date` and `Expiration Date`).
  - Preserves positive green styling for genuine activations (`Pending Activation → Active`, `Pending → Active`) while preventing false positives on negative substrings such as `Pending → Inactive` or `Pending → Invalid`.
  - Preserves literal observation wording for **Not returned** events.
- **Settings-only portability & full backups:**
  - Export and import managed-property selections, short names, Home designation, My Staff flags, departments, tags, and alert thresholds without roster snapshots, history, credentials, cookies, or tokens (supporting **Merge** and **Replace**).
  - Full local backups at schema v2 with schema v1 restore compatibility.
- **Actionable property dashboards, workspaces & responsive view:**
  - Balanced property card grid for 1–2 or many properties, auto-closing card action menus, property-specific review workspaces, CSV exports for both people and licence records, and narrow-screen stacked tables.
- **Application information & acknowledgements:**
  - In-extension **About & acknowledgements** dialog accessible from the workspace actions menu and sidebar, crediting Ryan Wilson for early testing, feedback, and feature suggestions.

### Support contact & future alias transition plan

- `support.html` and store listings continue to use the active maintainer support address until a replacement alias is provisioned.
- When a dedicated support alias (such as a custom-domain forwarder or alias routing to the maintainer inbox) is ready to be introduced:
  1. Verify inbound delivery and reply-from behavior on the alias first.
  2. Update the `mailto:` link and visible address in `support.html`.
  3. Update the support email field in the Chrome Web Store and Microsoft Edge Add-ons developer dashboards during the next store submission.
- `privacy.html` remains aligned with the currently published v1.0.4 extension until v1.0.5 is packaged and published.

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
