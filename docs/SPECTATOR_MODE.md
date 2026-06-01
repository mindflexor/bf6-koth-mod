# Spectator Mode Module

## Overview

The spectator module is an opt-in Battlefield Portal subsystem for King of the Hill. It provides:

- Prematch triple-tap `Interact` entry through `MultiClickDetector`
- A one-way spectator role for the current round
- One active spectator at a time, backed by the configured Fixed Camera object
- A PCT-style runtime-spawned control room that keeps the spectator soldier out of combat
- Third-person target follow and custom free cam controls
- A small non-interactive overlay showing the current spectated player

The module intentionally does not include director mode, passcodes, path cameras, interact points, confirmation dialogs, cursor input mode, or UI buttons.

The default `npm run build` and `npm run deploy` path remains KOTH-only. The spectator-enabled bundle is built from `src/index.with-spectator.ts` via `npm run build:spectator`.

## Public API

`registerSpectatorMode(config): SpectatorModeController`

`SpectatorModeConfig` supports:

- `canEnter(player): boolean`
- `resolveSpawnPoint?(player, teamId): number | null` (compatibility only; the current spectator module does not use an authored spawn point)
- `entryTeamId?: number`
- `fixedCamera?: { preferredIndex?: number; fallbackIndex?: number }`
- `cameraOffsets?: { third?: { x?: number; y?: number; z?: number } }`
- `cameraFollow?: { smoothingSeconds?: number }`
- `freeCam?: { speedMetersPerSecond?: number; sprintMultiplier?: number }`
- `trigger?: { requiredClicks?: number; windowMs?: number }`
- `ui?: { refreshIntervalMs?: number }`

`SpectatorModeController` exposes:

- `isSpectator(player): boolean`
- `isSpectatorId(playerId): boolean`
- `destroy(): void`

## KOTH Integration

KOTH consumes the spectator module through `src/contracts/observer-controller.ts`. The spectator bootstrap creates the controller first, then passes it into `registerKingOfTheHillMode(...)` so spectator-flagged players are filtered out of live HUD work, spawn handling, hill control, scoring, and combat stats.

Once a player becomes spectator, they stay spectator until they leave or the game ends. If the spectator slot is occupied, later triple-taps only show a short notification.

On entry, the spectator module resolves the configured Fixed Camera, reads its initial position, spawns the same simple Firing Range floor, wall, and ceiling room pattern used by Portal Cinematic Toolkit at `fixedCameraPosition + (0, -50, 0)`, then teleports the spectator soldier into that room. If the soldier reports `IsInWater` after teleporting, the room is unspawned, respawned at `fixedCameraPosition + (0, 300, 0)`, and the spectator is teleported again. The room is cleaned up when the active spectator leaves or the controller is destroyed.

The spectator path no longer depends on authored spectator spawn point `9302`.

## Controls

- Triple-tap `Interact` in prematch to become the spectator.
- `Jump` cycles to the next deployed non-spectator player and returns to target-follow view.
- WASD/joystick movement breaks out into free cam.
- `Sprint` increases free cam speed.
- Look input continues to drive free cam direction from inside the control room.

Spectator-only strings live in `src/spectator-mode/strings.json`, so the default bundle omits spectator UI strings with the spectator code.
