# King of the Hill Mode

King of the Hill is a Hardpoint-style BF6 Portal mode with one active hill at a time. Teams fight for the active hill, score while holding it, and rotate through a fixed A to E hill sequence.

## Rules

- Hills rotate in order: `A -> B -> C -> D -> E`.
- Each hill lasts `85` seconds.
- The next hill appears as a locked preview during the final `6` seconds.
- Team 1 alone on the active hill controls it and scores `+1` per second.
- Team 2 alone on the active hill controls it and scores `+1` per second.
- Any player presence from both teams contests the hill.
- Empty hills and locked-preview hills do not score.
- First team to `250` points wins.
- The default match time limit is `60000` seconds.

Core rule values live in:

- `src/king-of-the-hill-mode/live/config/koth-rules.ts`
- `src/king-of-the-hill-mode/config/rules.ts`

## Object IDs

Active hill presence is driven by area trigger IDs:

- Hill A: `501`
- Hill B: `502`
- Hill C: `503`
- Hill D: `504`
- Hill E: `505`

Objective visibility uses shared sector layers:

- Team 1 owned hill sector: `200`
- Team 2 owned hill sector: `300`
- Neutral, locked, empty, and contested sector: `400`

Capture point display objects are grouped by ownership state:

- Team 1 hill CPs: `201-205`
- Team 2 hill CPs: `301-305`
- Neutral hill CPs: `401-405`

The full hill mapping is in `src/king-of-the-hill-mode/live/config/koth-hills.ts`.

## Spawns

The deploy screen keeps the two team HQ spawners enabled:

- Team 1 HQ: `1`
- Team 2 HQ: `2`

After deploy, KOTH queues players to runtime spawn anchors near the active objective. Spawn cluster area triggers are:

- Team 1 default clusters: `901-905`
- Team 2 default clusters: `921-925`

Anchor object IDs are configured in `src/king-of-the-hill-mode/live/config/koth-spawns.ts`:

- Team 1 anchors: `601-625`
- Team 2 anchors: `701-725`

If a configured anchor is missing, the service logs a one-time warning and falls back to the HQ deployment path instead of failing the match.

## Runtime Systems

- `KothHillService`: hill membership, control state, objective layer visibility, and rotation.
- `KothScoreService`: team score, hill time, win detection, and imminent win/loss banners.
- `KothWorldIconService`: runtime world icons at hill capture point positions.
- `KothSpawnService`: HQ deploy setup, spawn cluster ownership, queued teleport jobs, and safety checks.
- `KothScoreboardService`: native custom scoreboard columns for score, kills, deaths, assists, and hill time.
- `KothUiService`: live HUD widgets, objective status, score display, and timers.

The phase runtime in `src/king-of-the-hill-mode/services/` handles prematch, ready-up, prelive, live handoff, and postmatch flow. The live KOTH services take over once the match enters the live phase.

## Strings

Mode strings live in `src/strings.json` and are merged into `dist/bundle.strings.json` during `npm run build`.

Important string groups:

- `Text_KingOfTheHill`, `Text_Mode_KingOfTheHill`
- `KothObjectiveActivated`, `KothObjectiveLocked`, `KothObjectiveContested`
- `KothVictoryImminent`, `KothDefeatImminent`
- `KothScoreboardScore`, `KothScoreboardKills`, `KothScoreboardDeaths`, `KothScoreboardAssists`, `KothScoreboardHillTime`

Run `npm run check:bundle:stringkeys` after editing strings.

## Map Authoring Notes

Use the spatial files in `spatials/` as optional references. They are not imported by the TypeScript bundle directly.

When authoring a map for this mode:

- Place the hill area triggers and display CP objects with the IDs listed above.
- Place spawn anchor common objects for every configured anchor ID.
- Keep HQ spawners `1` and `2` available for deployment.
- Keep the live KOTH config files in sync with the authored object IDs.

## Publishing Checklist

Before uploading a new Portal build:

```bash
npm run typecheck
npm run build
npm run check:bundle:symbols
npm run check:bundle:stringkeys
```

Then deploy with the appropriate version bump:

```bash
npm run deploy:patch
```
