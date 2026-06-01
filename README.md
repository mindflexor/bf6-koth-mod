# KING OF THE HILL - CCL [DevKit]

Open-source Battlefield 6 Portal game mode project for **King of the Hill**.

This repository contains the TypeScript mode implementation, strings, deployment tooling, and map-authoring artifacts used to build and publish the experience.

The Portal mod API surface is vendored from SDK `1.2.3.0` under `src/vendor/portal-sdk/`, so the repo no longer depends on the stale `bf6-portal-mod-types` npm package for `mod` typings.

## What This Project Includes

- KOTH runtime facade and services under `src/koth-mode/`
- Runtime hill detection from area trigger IDs `501-505`
- KOTH objective, scoring, world icon, scoreboard, HUD, SFX, and spawn services
- Reusable spectator module (`src/spectator-mode/index.ts`) behind an opt-in build path
- Legacy prematch/prelive/postmatch kernel retained inside `src/koth-mode/` and repurposed for KOTH flow
- Build and deploy workflow via `bf6-portal-bundler` and `@bf6mods/portal`
- Spatial map data in `spatials/`
- Godot editor scene artifacts in `godot/levels/`

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Build the default KOTH bundle + strings:

```bash
npm run build
```

Optional: build the spectator-enabled bundle:

```bash
npm run build:spectator
```

3. Configure deploy credentials in `.env`:

```env
SESSION_ID="..."
AUTH_CODE="..." # optional, preferred when available
MOD_ID="..."
```

4. Deploy the default KOTH bundle to Portal:

```bash
npm run deploy
```

Optional: deploy the spectator-enabled bundle:

```bash
npm run deploy:spectator
```

## Repository Layout

- `src/index.ts`: default KOTH entrypoint
- `src/index.with-spectator.ts`: spectator-enabled KOTH entrypoint
- `src/koth-mode/index.ts`: KOTH composition root
- `src/koth-mode/events/register-events.ts`: KOTH event subscriptions
- `src/koth-mode/services/koth-mode-runtime.ts`: preserved phase runtime + KOTH live handoff
- `src/koth-mode/live/`: KOTH hill, score, UI, world icon, spawn, and scoreboard services
- `src/strings.json`: localized KOTH strings for the default bundle
- `docs/KING_OF_THE_HILL_MODE.md`: mode documentation

## Validation

```bash
npm run typecheck
npm run build
npm run check:bundle:symbols
```
