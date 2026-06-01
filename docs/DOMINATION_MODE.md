# Domination Mode Documentation

## Overview

Domination is a 3-flag control mode with a prematch ready-up phase, timed lifecycle transitions, ticket bleed, dynamic spawn routing, and a postmatch results flow that hands off to `EndGameMode`.

## Match Lifecycle

- Prematch: team assignment, ready-up, roster display
- Countdown: short transition into match start
- Prelive: limited transition state before full live play
- Live: capture-point gameplay and ticket draining
- Postmatch: result presentation, then `EndGameMode`

## Core Systems

- Capture-point control and ownership transitions
- Dynamic HQ routing and safe-spawn enforcement
- Combat event handling (damage smoothing, kill, assist, mandown)
- Restricted area handling with countdown/UI/audio
- Live and prematch UI state management
- Timer-driven ongoing loop via bf6 utility timers

## UI Summary

- Prematch panel with team rosters and ready status
- Live HUD objective lanes and score displays
- Match-start and state-transition UI messaging

## Event-Driven Structure

Entry wiring is in `src/domination-mode/events/register-events.ts`, which subscribes facade handlers from `src/domination-mode/services/domination-mode-runtime.ts` through `bf6-portal-utils/events`. The facade delegates to domain services and the modular runtime kernel.

The engine `OngoingGlobal` callback is kept minimal; periodic logic runs through the timer lane started on mode start and cleared on mode end.

The script hands off postmatch completion to `EndGameMode`. Team-side swapping for the next match is expected to come from Portal/engine team configuration rather than script-side `OnGameModeEnding` logic.

## Map and World Dependencies

The mode assumes specific IDs and placements for:

- Capture points and objective entities
- Interact points and world icons
- Spawner and area trigger objects

Configuration files under `src/domination-mode/config/` and embedded mappings in runtime code must match map setup.

Domination capture points are expected to be authored with `InitialOwner = TeamNeutral`. Since SDK `1.2.3.0`, the mode no longer relies on `mod.SetCapturePointOwner()` as a full neutral/progress reset.

## Key Files

- `src/domination-mode/index.ts`
- `src/domination-mode/events/register-events.ts`
- `src/domination-mode/services/domination-mode-runtime.ts` (runtime facade)
- `src/domination-mode/services/domination-kernel.ts` (runtime kernel)
- `src/domination-mode/archive/legacy-domination-core.reference.ts` (archived legacy reference)
- `src/domination-mode/config/world-ids.ts`
- `src/strings.json`

