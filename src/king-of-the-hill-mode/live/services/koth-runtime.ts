import { createKothLiveModeContext } from '../state/koth-mode-context.ts';
import { KothBannerService } from './koth-banner-service.ts';
import { KothHillService } from './koth-hill-service.ts';
import { KothLifecycleService } from './koth-lifecycle-service.ts';
import { KothPlayerTrackerService } from './koth-player-tracker-service.ts';
import { KothSchedulerService } from './koth-scheduler-service.ts';
import { KothScoreService } from './koth-score-service.ts';
import { KothScoreboardService } from './koth-scoreboard-service.ts';
import { KothSfxService } from './koth-sfx-service.ts';
import { KothSpawnJobService } from './koth-spawn-job-service.ts';
import { KothSpawnService } from './koth-spawn-service.ts';
import { KothUiService } from './koth-ui-service.ts';
import { KothWorldIconService } from './koth-world-icon-service.ts';

class KothRuntimeFacade {
    private readonly _context = createKothLiveModeContext();

    private readonly _bannerService = new KothBannerService();
    private readonly _sfxService = new KothSfxService();
    private readonly _schedulerService = new KothSchedulerService(this._context);
    private readonly _worldIconService = new KothWorldIconService(this._context);
    private readonly _hillService = new KothHillService(this._context, this._bannerService, this._sfxService);
    private readonly _scoreboardService = new KothScoreboardService(this._context);
    private readonly _scoreService = new KothScoreService(
        this._context,
        this._hillService,
        this._scoreboardService,
        this._bannerService,
        this._sfxService
    );
    private readonly _spawnJobService = new KothSpawnJobService(this._context);
    private readonly _spawnService = new KothSpawnService(this._context, this._spawnJobService);
    private readonly _uiService = new KothUiService(this._context);
    private readonly _playerTrackerService = new KothPlayerTrackerService(
        this._context,
        this._hillService,
        this._scoreService,
        this._scoreboardService,
        this._spawnService,
        this._uiService
    );
    private readonly _lifecycleService = new KothLifecycleService(
        this._context,
        this._schedulerService,
        this._hillService,
        this._scoreService,
        this._scoreboardService,
        this._uiService,
        this._worldIconService,
        this._spawnService,
        this._playerTrackerService,
        this._bannerService,
        this._sfxService
    );

    public onGameModeStarted(): void {
        this._lifecycleService.onGameModeStarted();
        this._startLiveTimers();
    }

    public onGameModeEnding(): void {
        this._lifecycleService.onGameModeEnding();
    }

    public onPlayerJoinGame(eventPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerJoinGame(eventPlayer);
    }

    public onPlayerLeaveGame(eventNumber: number): void {
        this._playerTrackerService.onPlayerLeaveGame(eventNumber);
    }

    public onPlayerDeployed(eventPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerDeployed(eventPlayer);
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerUndeploy(eventPlayer);
    }

    public onPlayerDied(eventPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerDied(eventPlayer);
    }

    public onMandown(eventPlayer: mod.Player): void {
        this._playerTrackerService.onMandown(eventPlayer);
    }

    public onPlayerEarnedKill(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerEarnedKill(eventPlayer, eventOtherPlayer);
    }

    public onPlayerEarnedKillAssist(eventPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerEarnedKillAssist(eventPlayer);
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        if (!this._playerTrackerService.syncGameplayPlayer(eventPlayer)) return;
        this._hillService.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
        this._spawnService.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        if (mod.IsPlayerValid(eventPlayer)) {
            this._playerTrackerService.syncGameplayPlayer(eventPlayer);
        }
        this._hillService.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
        this._spawnService.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
    }

    private _startLiveTimers(): void {
        this._schedulerService.setHillStateInterval(() => {
            this._playerTrackerService.syncGameplayPlayers();
            this._hillService.updateActiveHillState();
            this._flushVisuals();
        });

        this._schedulerService.setObjectiveTimerInterval(() => {
            const previousHillIndex = this._context.runtime.hill.currentHillIndex;
            this._hillService.tickObjectiveTimer();
            if (this._context.runtime.hill.currentHillIndex !== previousHillIndex) {
                this._spawnService.onObjectiveActivated();
            }
            this._worldIconService.update();
            this._flushVisuals();
        });

        this._schedulerService.setScoreTickInterval(() => {
            const winner = this._scoreService.tickScore();
            if (winner) {
                this._lifecycleService.endMatch(winner);
                return;
            }

            this._flushVisuals();
        });

        this._schedulerService.setWorldIconInterval(() => {
            this._worldIconService.update();
        });

        this._schedulerService.setSpawnJobInterval(() => {
            this._spawnService.processSpawnJobs();
        });
    }

    private _flushVisuals(): void {
        if (this._context.runtime.hudDirty) {
            this._uiService.updateAll();
        }

        if (this._context.runtime.scoreboardDirty) {
            this._scoreboardService.updateAll();
        }
    }
}

const kothLiveFacade = new KothRuntimeFacade();

export const KothLiveModeHandlers = {
    OnGameModeStarted: (): void => kothLiveFacade.onGameModeStarted(),
    OnGameModeEnding: (): void => kothLiveFacade.onGameModeEnding(),
    OnPlayerJoinGame: (eventPlayer: mod.Player): void => kothLiveFacade.onPlayerJoinGame(eventPlayer),
    OnPlayerLeaveGame: (eventNumber: number): void => kothLiveFacade.onPlayerLeaveGame(eventNumber),
    OnPlayerDeployed: (eventPlayer: mod.Player): void => kothLiveFacade.onPlayerDeployed(eventPlayer),
    OnPlayerUndeploy: (eventPlayer: mod.Player): void => kothLiveFacade.onPlayerUndeploy(eventPlayer),
    OnPlayerDied: (eventPlayer: mod.Player): void => kothLiveFacade.onPlayerDied(eventPlayer),
    OnMandown: (eventPlayer: mod.Player): void => kothLiveFacade.onMandown(eventPlayer),
    OnPlayerEarnedKill: (eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void =>
        kothLiveFacade.onPlayerEarnedKill(eventPlayer, eventOtherPlayer),
    OnPlayerEarnedKillAssist: (eventPlayer: mod.Player): void => kothLiveFacade.onPlayerEarnedKillAssist(eventPlayer),
    OnPlayerEnterAreaTrigger: (eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void =>
        kothLiveFacade.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger),
    OnPlayerExitAreaTrigger: (eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void =>
        kothLiveFacade.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger),
};
