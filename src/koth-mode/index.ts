import type { OptionalObserverController } from '../contracts/observer-controller.ts';
import { registerKothModeEvents } from './events/register-events.ts';
import {
    configureKothModeRuntime,
    runtimeCanEnterKothPhaseSpectatorMode,
    runtimeResolveKothPhaseSpectatorSpawnPoint,
} from './services/koth-mode-runtime.ts';

export interface KothModeRegistrationOptions {
    spectatorController?: OptionalObserverController;
}

export function registerKothMode(options: KothModeRegistrationOptions = {}): void {
    configureKothModeRuntime(options.spectatorController);
    registerKothModeEvents();
}

export function canEnterKothSpectatorMode(eventPlayer: mod.Player): boolean {
    return runtimeCanEnterKothPhaseSpectatorMode(eventPlayer);
}

export function resolveKothSpectatorSpawnPoint(eventPlayer: mod.Player, teamId: number): number {
    return runtimeResolveKothPhaseSpectatorSpawnPoint(eventPlayer, teamId);
}

