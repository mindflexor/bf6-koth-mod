import { Events } from 'bf6-portal-utils/events/index.ts';

import { KothPhaseModeHandlers } from '../services/koth-mode-runtime.ts';

let registered = false;

export function registerKingOfTheHillEvents(): void {
    if (registered) return;
    registered = true;

    Events.OnGameModeStarted.subscribe(KothPhaseModeHandlers.OnGameModeStarted);
    Events.OnGameModeEnding.subscribe(KothPhaseModeHandlers.OnGameModeEnding);
    Events.OngoingGlobal.subscribe(KothPhaseModeHandlers.OngoingGlobal);

    Events.OnPlayerJoinGame.subscribe(KothPhaseModeHandlers.OnPlayerJoinGame);
    Events.OnPlayerLeaveGame.subscribe(KothPhaseModeHandlers.OnPlayerLeaveGame);
    Events.OnPlayerDeployed.subscribe(KothPhaseModeHandlers.OnPlayerDeployed);
    Events.OnPlayerUndeploy.subscribe(KothPhaseModeHandlers.OnPlayerUndeploy);
    Events.OnPlayerInteract.subscribe(KothPhaseModeHandlers.OnPlayerInteract);
    Events.OnPlayerUIButtonEvent.subscribe(KothPhaseModeHandlers.OnPlayerUIButtonEvent);

    Events.OnPlayerDamaged.subscribe(KothPhaseModeHandlers.OnPlayerDamaged);
    Events.OnMandown.subscribe(KothPhaseModeHandlers.OnMandown);
    Events.OnRevived.subscribe(KothPhaseModeHandlers.OnRevived);
    Events.OnPlayerDied.subscribe(KothPhaseModeHandlers.OnPlayerDied);
    Events.OnPlayerEarnedKill.subscribe(KothPhaseModeHandlers.OnPlayerEarnedKill);
    Events.OnPlayerEarnedKillAssist.subscribe(KothPhaseModeHandlers.OnPlayerEarnedKillAssist);

    Events.OnPlayerEnterAreaTrigger.subscribe(KothPhaseModeHandlers.OnPlayerEnterAreaTrigger);
    Events.OnPlayerExitAreaTrigger.subscribe(KothPhaseModeHandlers.OnPlayerExitAreaTrigger);
}

