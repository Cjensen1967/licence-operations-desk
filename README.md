# Licence Operations Desk

Licence Operations Desk is a browser extension for organizing and reviewing public Washington State gambling-license information returned by the Washington State Gambling Commission (WSGC) public License Lookup.

The extension is designed as a local, attention-first workspace for licensing and compliance work. Managed properties, roster snapshots, comparisons, filters, and other working data are kept in the user's browser.

## Current status

Published extension version: **1.0.4**  
Current workspace development candidate: **1.0.5**

Version 1.0.4 remains the published store baseline and `manifest.json` version until final release packaging. See [ROADMAP.md](ROADMAP.md).

The v1.0.5 release candidate includes:

- **Person-centric and record-centric registers:** switch between the **People register** (grouped by individual) and the **All licence records** register (one row per returned WSGC licence observation and its managed property association, with returned observation counts distinguished from unique licence counts);
- **Local My Staff & property preferences:** locally flag people you oversee with optional department and tags, assign local property short names while retaining official WSGC property names, and designate a single **Home property** that sorts first;
- **Operational Changes log:** record-specific change events displaying the person, licence number, licence type, managed property, relevant dates, and strict positive-transition highlighting (`Pending Activation → Active`) without false-positive substring matches;
- **Actionable property dashboards and workspaces:** property cards and property-specific modal workspaces with freshness indicators, failure warnings that preserve prior snapshots, and direct roster/record/CSV actions;
- **Settings-only JSON portability and full backups:** export/import workspace settings with merge and replace modes (excluding roster snapshots, history, credentials, cookies, and tokens), plus schema v2 full backups;
- **Responsive layout and application information:** narrow-screen stacked tables, full-viewport dialogs, and an in-extension **About & acknowledgements** dialog.

Manager labels and short names are stored locally and displayed separately from public WSGC facts. They are organizational aids, not employment, disciplinary, enforcement, or legal conclusions.

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

## Independence and Acknowledgements

Licence Operations Desk is an independent project. It is not an official Washington State Gambling Commission product and is not affiliated with, sponsored by, or endorsed by WSGC.

Thanks to Ryan Wilson for early testing, feedback, and feature suggestions that helped improve Licence Operations Desk.

## License

No open-source license has currently been selected. Licensing is under review. Public availability of this repository should not be interpreted as a grant of additional rights beyond those provided by applicable law or GitHub's terms.
