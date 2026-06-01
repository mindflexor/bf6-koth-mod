import { Events } from 'bf6-portal-utils/events/index.ts';

import { SquadObliterationHandlers } from '../legacy/squad-obliteration-mode.ts';

let registered = false;

export function registerSquadObliterationEvents(): void {
    if (registered) return;
    registered = true;

    Events.OnGameModeStarted.subscribe(SquadObliterationHandlers.OnGameModeStarted);
    Events.OnGameModeEnding.subscribe(SquadObliterationHandlers.OnGameModeEnding);

    Events.OnPlayerJoinGame.subscribe(SquadObliterationHandlers.OnPlayerJoinGame);
    Events.OnPlayerLeaveGame.subscribe(SquadObliterationHandlers.OnPlayerLeaveGame);
    Events.OnPlayerDeployed.subscribe(SquadObliterationHandlers.OnPlayerDeployed);
    Events.OnPlayerUndeploy.subscribe(SquadObliterationHandlers.OnPlayerUndeploy);
    Events.OnPlayerInteract.subscribe(SquadObliterationHandlers.OnPlayerInteract);
    Events.OnPlayerUIButtonEvent.subscribe(SquadObliterationHandlers.OnPlayerUIButtonEvent);

    Events.OnPlayerEnterCapturePoint.subscribe(SquadObliterationHandlers.OnPlayerEnterCapturePoint);
    Events.OnPlayerExitCapturePoint.subscribe(SquadObliterationHandlers.OnPlayerExitCapturePoint);
    Events.OnCapturePointCaptured.subscribe(SquadObliterationHandlers.OnCapturePointCaptured);
    Events.OnCapturePointLost.subscribe(SquadObliterationHandlers.OnCapturePointLost);
    Events.OnCapturePointCapturing.subscribe(SquadObliterationHandlers.OnCapturePointCapturing);

    Events.OnPlayerDamaged.subscribe(SquadObliterationHandlers.OnPlayerDamaged);
    Events.OnMandown.subscribe(SquadObliterationHandlers.OnMandown);
    Events.OnPlayerEarnedKill.subscribe(SquadObliterationHandlers.OnPlayerEarnedKill);
    Events.OnPlayerEarnedKillAssist.subscribe(SquadObliterationHandlers.OnPlayerEarnedKillAssist);

    Events.OnPlayerEnterAreaTrigger.subscribe(SquadObliterationHandlers.OnPlayerEnterAreaTrigger);
    Events.OnPlayerExitAreaTrigger.subscribe(SquadObliterationHandlers.OnPlayerExitAreaTrigger);
}
