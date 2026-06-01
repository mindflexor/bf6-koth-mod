import { Events } from 'bf6-portal-utils/events/index.ts';

import { KothModeHandlers } from '../services/koth-runtime.ts';

let registered = false;

export function registerKothEvents(): void {
    if (registered) return;
    registered = true;

    Events.OnGameModeStarted.subscribe(KothModeHandlers.OnGameModeStarted);
    Events.OnGameModeEnding.subscribe(KothModeHandlers.OnGameModeEnding);

    Events.OnPlayerJoinGame.subscribe(KothModeHandlers.OnPlayerJoinGame);
    Events.OnPlayerLeaveGame.subscribe(KothModeHandlers.OnPlayerLeaveGame);
    Events.OnPlayerDeployed.subscribe(KothModeHandlers.OnPlayerDeployed);
    Events.OnPlayerUndeploy.subscribe(KothModeHandlers.OnPlayerUndeploy);
    Events.OnPlayerDied.subscribe(KothModeHandlers.OnPlayerDied);
    Events.OnMandown.subscribe(KothModeHandlers.OnMandown);
    Events.OnPlayerEarnedKill.subscribe(KothModeHandlers.OnPlayerEarnedKill);
    Events.OnPlayerEarnedKillAssist.subscribe(KothModeHandlers.OnPlayerEarnedKillAssist);

    Events.OnPlayerEnterAreaTrigger.subscribe(KothModeHandlers.OnPlayerEnterAreaTrigger);
    Events.OnPlayerExitAreaTrigger.subscribe(KothModeHandlers.OnPlayerExitAreaTrigger);
}
