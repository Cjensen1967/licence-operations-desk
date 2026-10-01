# Development Roadmap

This document is the planning surface for Licence Operations Desk. Items may be discussed here without being committed to a release.

## Baseline

**Current development baseline:** v1.0.4

v1.0.4 is the starting point for future development planning. Application code should not be changed for v1.0.5 until the intended scope has been discussed and agreed.

## v1.0.5 — Planning

### Approved

_No features approved yet._

### Candidates under discussion

_No candidates recorded yet._

### Implementation planning

For each feature accepted into v1.0.5, document:

- the problem being solved;
- expected user behavior;
- UI changes;
- WSGC/network implications;
- storage/data implications;
- privacy or store-policy implications;
- edge cases and failure behavior;
- implementation approach;
- testing required.

## Known issues / observations

Add confirmed defects or confusing behavior here as they are identified. Separate bugs from feature requests.

_None recorded yet._

## Future / deferred

Ideas that are worthwhile but not appropriate for the next release belong here rather than being lost or forced into v1.0.5.

_None recorded yet._

## WSGC access review

The project is intentionally taking a conservative approach to WSGC access.

Before expanding the existing integration, clarify whether WSGC places additional restrictions on software making user-initiated requests to its public License Lookup and on internal business/compliance use of information returned through that lookup.

Until then, do not expand the extension into authenticated/nonpublic WSGC resources, unattended scraping, bulk harvesting, or additional endpoints solely because they are technically accessible.

## Licensing

Repository licensing remains under review. Do not add an open-source or source-available license until that decision is made.
