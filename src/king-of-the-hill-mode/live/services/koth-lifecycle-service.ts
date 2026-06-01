import { createKothRuntimeState, KothGamePhase } from '../state/koth-runtime-state.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothBannerService } from './koth-banner-service.ts';
import type { KothHillService } from './koth-hill-service.ts';
import type { KothPlayerTrackerService } from './koth-player-tracker-service.ts';
import type { KothSchedulerService } from './koth-scheduler-service.ts';
import type { KothScoreService } from './koth-score-service.ts';
import type { KothScoreboardService } from './koth-scoreboard-service.ts';
import type { KothSfxService } from './koth-sfx-service.ts';
import type { KothSpawnService } from './koth-spawn-service.ts';
import type { KothUiService } from './koth-ui-service.ts';
import type { KothWorldIconService } from './koth-world-icon-service.ts';
import { KOTH_TEAM_1, KOTH_TEAM_2 } from './koth-sdk-utils.ts';

export class KothLifecycleService {
    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _schedulerService: KothSchedulerService,
        private readonly _hillService: KothHillService,
        private readonly _scoreService: KothScoreService,
        private readonly _scoreboardService: KothScoreboardService,
        private readonly _uiService: KothUiService,
        private readonly _worldIconService: KothWorldIconService,
        private readonly _spawnService: KothSpawnService,
        private readonly _playerTrackerService: KothPlayerTrackerService,
        private readonly _bannerService: KothBannerService,
        private readonly _sfxService: KothSfxService
    ) {}

    public onGameModeStarted(): void {
        const existingPlayers = this._context.runtime.playersById;

        this._schedulerService.clearAll();
        this._context.runtime = createKothRuntimeState();
        existingPlayers.forEach((playerState, playerId) => {
            this._context.runtime.playersById.set(playerId, playerState);
        });

        this._context.runtime.phase = KothGamePhase.Live;
        this._context.runtime.isMatchActive = true;
        this._context.runtime.isPostGame = false;

        this._sfxService.ensureSpawned();
        mod.SetGameModeTargetScore(this._context.rules.scoreToWin);
        mod.SetGameModeTimeLimit(this._context.rules.matchTimeLimitSeconds);
        this._scoreService.resetScores();
        this._scoreboardService.configure();
        this._playerTrackerService.syncCurrentPlayers();
        this._playerTrackerService.resetPlayersForNewMatch();
        this._spawnService.configureLiveDeploySpawns();
        this._playerTrackerService.bootstrapLiveStartPlayers();
        this._hillService.initializeForMatch();
        this._hillService.updateActiveHillState(true);
        this._worldIconService.update();
        this._uiService.updateAll();
    }

    public onGameModeEnding(): void {
        this._schedulerService.clearAll();
        this._hillService.reset();
        this._spawnService.reset();
        this._worldIconService.reset();
        this._uiService.hideLiveHud();
        this._context.runtime.phase = KothGamePhase.NotStarted;
        this._context.runtime.isMatchActive = false;
        this._context.runtime.isPostGame = false;
    }

    public endMatch(winner: mod.Team): void {
        if (!this._context.runtime.isMatchActive) return;

        this._context.runtime.isMatchActive = false;
        this._context.runtime.isPostGame = true;
        this._context.runtime.phase = KothGamePhase.Postmatch;
        this._scoreService.syncGameModeScores(true);
        this._schedulerService.clearAll();
        this._hillService.reset();
        this._spawnService.reset();
        this._worldIconService.reset();
        this._uiService.showPostmatch(winner);

        if (mod.Equals(winner, KOTH_TEAM_1)) {
            this._bannerService.showMatchWon(KOTH_TEAM_1);
            this._bannerService.showMatchLost(KOTH_TEAM_2);
            this._sfxService.playMatchWon(KOTH_TEAM_1);
            this._sfxService.playMatchLost(KOTH_TEAM_2);
        } else {
            this._bannerService.showMatchWon(KOTH_TEAM_2);
            this._bannerService.showMatchLost(KOTH_TEAM_1);
            this._sfxService.playMatchWon(KOTH_TEAM_2);
            this._sfxService.playMatchLost(KOTH_TEAM_1);
        }

        this._schedulerService.setPostmatchEndTimeout(() => {
            mod.EndGameMode(winner);
        });
    }
}
