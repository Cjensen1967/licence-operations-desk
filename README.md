# Licence Operations Desk

Licence Operations Desk is a browser extension for organizing and reviewing public Washington State gambling-license information returned by the Washington State Gambling Commission (WSGC) public License Lookup.

The extension is designed as a local, attention-first workspace for licensing and compliance work. Managed properties, roster snapshots, comparisons, filters, and other working data are kept in the user's browser.

## Current status

Current development version: **1.0.4**

Version 1.0.4 remains the published baseline. The approved v1.0.5 work is being developed and reviewed without changing the manifest version prematurely. See [ROADMAP.md](ROADMAP.md).

The current development branch adds:

- local **My Staff** flags, departments, and tags that survive roster refreshes;
- property dashboards and property-specific review workspaces;
- settings-only JSON export/import with merge and replace choices;
- full-backup support for workspace labels; and
- responsive stacked records and touch-friendly dialogs for narrow screens.

Manager labels are stored locally and displayed separately from public WSGC facts. They are organizational aids, not employment, disciplinary, enforcement, or legal conclusions.

## Design principles

- Use public WSGC license information only.
- Keep the user's working data local to the browser.
- Make network requests intentionally and transparently.
- Minimize permissions and external dependencies.
- Preserve the distinction between current, pending, expired, and historical/inactive records.
- Treat WSGC-returned data as source data rather than silently inventing or correcting regulatory facts.

## Privacy

See [PRIVACY.md](PRIVACY.md) for information about data processing and storage.

## Development

AI-assisted and human development should follow [AGENTS.md](AGENTS.md). Proposed changes should be discussed and documented in [ROADMAP.md](ROADMAP.md) before implementation when practical.

Run the local regression checks with:

```sh
node --test tests/*.test.js
node --check app.js background.js db.js shared/model.js shared/workspace.js
```

## Independence

Licence Operations Desk is an independent project. It is not an official Washington State Gambling Commission product and is not affiliated with, sponsored by, or endorsed by WSGC.

## License

No open-source license has currently been selected. Licensing is under review. Public availability of this repository should not be interpreted as a grant of additional rights beyond those provided by applicable law or GitHub's terms.
