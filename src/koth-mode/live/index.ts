import type { OptionalObserverController } from '../../contracts/observer-controller.ts';
import { registerKothEvents } from './events/register-koth-events.ts';
import {
    configureKothLiveRuntime,
    runtimeCanEnterKothLiveSpectatorMode,
    runtimeResolveKothLiveSpectatorSpawnPoint,
} from './services/koth-runtime.ts';

export interface KingOfTheHillRegistrationOptions {
    spectatorController?: OptionalObserverController;
}

export function registerKingOfTheHillMode(options: KingOfTheHillRegistrationOptions = {}): void {
    configureKothLiveRuntime(options.spectatorController);
    registerKothEvents();
}

export function canEnterKothSpectatorMode(eventPlayer: mod.Player): boolean {
    return runtimeCanEnterKothLiveSpectatorMode(eventPlayer);
}

export function resolveKothSpectatorSpawnPoint(eventPlayer: mod.Player, teamId: number): number {
    return runtimeResolveKothLiveSpectatorSpawnPoint(eventPlayer, teamId);
}
