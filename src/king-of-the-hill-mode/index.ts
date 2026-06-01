import type { OptionalObserverController } from '../contracts/observer-controller.ts';
import { registerKothEvents } from './events/register-koth-events.ts';
import {
    configureKothRuntime,
    runtimeCanEnterKothSpectatorMode,
    runtimeResolveKothSpectatorSpawnPoint,
} from './services/koth-runtime.ts';

export interface KingOfTheHillRegistrationOptions {
    spectatorController?: OptionalObserverController;
}

export function registerKingOfTheHillMode(options: KingOfTheHillRegistrationOptions = {}): void {
    configureKothRuntime(options.spectatorController);
    registerKothEvents();
}

export function canEnterKothSpectatorMode(eventPlayer: mod.Player): boolean {
    return runtimeCanEnterKothSpectatorMode(eventPlayer);
}

export function resolveKothSpectatorSpawnPoint(eventPlayer: mod.Player, teamId: number): number {
    return runtimeResolveKothSpectatorSpawnPoint(eventPlayer, teamId);
}
