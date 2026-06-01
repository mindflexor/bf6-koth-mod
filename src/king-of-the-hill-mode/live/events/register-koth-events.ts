import { Events } from 'bf6-portal-utils/events/index.ts';

import { KothLiveModeHandlers } from '../services/koth-runtime.ts';

let registered = false;

export function registerKothEvents(): void {
    if (registered) return;
    registered = true;

    Events.OnGameModeStarted.subscribe(KothLiveModeHandlers.OnGameModeStarted);
    Events.OnGameModeEnding.subscribe(KothLiveModeHandlers.OnGameModeEnding);

    Events.OnPlayerJoinGame.subscribe(KothLiveModeHandlers.OnPlayerJoinGame);
    Events.OnPlayerLeaveGame.subscribe(KothLiveModeHandlers.OnPlayerLeaveGame);
    Events.OnPlayerDeployed.subscribe(KothLiveModeHandlers.OnPlayerDeployed);
    Events.OnPlayerUndeploy.subscribe(KothLiveModeHandlers.OnPlayerUndeploy);
    Events.OnPlayerDied.subscribe(KothLiveModeHandlers.OnPlayerDied);
    Events.OnMandown.subscribe(KothLiveModeHandlers.OnMandown);
    Events.OnPlayerEarnedKill.subscribe(KothLiveModeHandlers.OnPlayerEarnedKill);
    Events.OnPlayerEarnedKillAssist.subscribe(KothLiveModeHandlers.OnPlayerEarnedKillAssist);

    Events.OnPlayerEnterAreaTrigger.subscribe(KothLiveModeHandlers.OnPlayerEnterAreaTrigger);
    Events.OnPlayerExitAreaTrigger.subscribe(KothLiveModeHandlers.OnPlayerExitAreaTrigger);
}
