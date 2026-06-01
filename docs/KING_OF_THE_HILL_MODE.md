# King Of The Hill Mode Documentation

King of the Hill is a Hardpoint-style mode with one active hill at a time. Hills rotate `A -> B -> C -> D -> E`, each hill lasts 85 seconds, and the next hill appears as a locked preview during the final 6 seconds.

## Objective Rules

- Active hill presence is driven only by area trigger IDs `501-505`.
- Native capture point ownership and capture progress do not decide hill control.
- Team 1 alone on the active hill owns it and scores +1 per second.
- Team 2 alone on the active hill owns it and scores +1 per second.
- Any presence from both teams contests the hill, regardless of player counts.
- Empty and locked-preview hills do not score.

## Object Layers

- Team 1 owned hill sector: `200`
- Team 2 owned hill sector: `300`
- Neutral, locked, empty, and contested sector: `400`
- Team 1 CPs: `201-205`
- Team 2 CPs: `301-305`
- Neutral CPs: `401-405`

## Runtime Systems

- `KothHillService` owns area-trigger membership, control state, objective layer visibility, and rotation.
- `KothScoreService` owns team scores, hill time, imminent banners, and win detection.
- `KothWorldIconService` spawns runtime world icons at capture point positions with `Y + 6`.
- `KothSpawnService` keeps deploy-screen HQ spawns on object IDs `1` and `2`, then teleports players to queued spawn anchors when those common-object IDs are configured.
- `KothScoreboardService` uses native custom scoreboard columns: score, kills, deaths, assists, and hill time.

## Spawn Anchors

Spawn anchor common-object IDs are intentionally placeholders in `src/king-of-the-hill-mode/config/koth-spawns.ts`. Until anchors are configured, players deploy from the two HQ spawners and the service logs a one-time warning instead of failing the match.
