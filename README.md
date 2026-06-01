# KING OF THE HILL - CCL

Open-source Battlefield 6 Portal King of the Hill mode by Enoc Bernal.

This repository contains the TypeScript source, strings, build scripts, deploy tooling, and optional spatial reference files used to build and publish the KOTH experience.

## Requirements

- Node.js 24 or newer
- An editable Battlefield Portal experience
- Portal deployment credentials in `.env` when deploying

The Portal SDK typing surface is vendored under `src/vendor/portal-sdk/` so the project does not rely on stale public `mod` type packages.

## Quick Start

```bash
npm install
npm run build
```

The default build creates:

- `dist/bundle.ts`
- `dist/bundle.strings.json`

Validate the bundle before publishing:

```bash
npm run typecheck
npm run build
npm run check:bundle:symbols
npm run check:bundle:stringkeys
```

## Deploy

Copy `.env.example` to `.env`, then set:

```env
SESSION_ID=""
AUTH_CODE=""
MOD_ID=""
```

`AUTH_CODE` is preferred when available. `SESSION_ID` can be copied from a fresh Portal browser session. `MOD_ID` is the experience id from the Portal editor URL.

Deploy the current bundle:

```bash
npm run deploy
```

Version-specific deploy helpers are also available:

```bash
npm run deploy:patch
npm run deploy:minor
npm run deploy:major
```

## Repository Layout

- `src/index.ts`: single KOTH entrypoint.
- `src/king-of-the-hill-mode/`: KOTH mode module and runtime.
- `src/king-of-the-hill-mode/live/`: active hill, scoring, HUD, world icon, spawn, and scoreboard systems.
- `src/strings.json`: string table merged into the Portal bundle.
- `spatials/`: optional spatial reference files for map authoring.
- `docs/KING_OF_THE_HILL_MODE.md`: rules, object IDs, and authoring notes.
- `scripts/deploy.js`: Portal upload helper built on `@bf6mods/portal`.

## Development

The KOTH module is registered through `registerKingOfTheHillMode()` and is intentionally the only mode exposed by this repo. Keep new gameplay work under `src/king-of-the-hill-mode/` and keep public docs focused on this mode.

Useful commands:

```bash
npm run typecheck
npm run lint
npm run build
npm run check:bundle:symbols
npm run check:bundle:stringkeys
```

## Credits

Primary KOTH mode and project integration: Enoc Bernal.

Template and tooling foundation: Mike De Luca, including the BF6 Portal TypeScript template, `bf6-portal-utils`, and bundling workflow used by this project.

Additional legacy gameplay logic inspiration is listed in `CREDITS.md`.
