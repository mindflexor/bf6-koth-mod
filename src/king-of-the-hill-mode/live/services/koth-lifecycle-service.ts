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
import type { KothWorkQueueService } from './koth-work-queue-service.ts';
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
        private readonly _workQueueService: KothWorkQueueService,
        private readonly _worldIconService: KothWorldIconService,
        private readonly _spawnService: KothSpawnService,
        private readonly _playerTrackerService: KothPlayerTrackerService,
        private readonly _bannerService: KothBannerService,
        private readonly _sfxService: KothSfxService
    ) {}

    public onGameModeStarted(): void {
        const existingPlayers = this._context.runtime.playersById;

        this._sfxService.resetPlayerAudioState();
        this._schedulerService.clearAll();
        this._workQueueService.clearAll();
        this._context.runtime = createKothRuntimeState();
        existingPlayers.forEach((playerState, playerId) => {
            this._context.runtime.playersById.set(playerId, playerState);
        });
        this._spawnService.clearSpawnJobs();

        this._context.runtime.phase = KothGamePhase.Live;
        this._context.runtime.isMatchActive = true;
        this._context.runtime.isPostGame = false;

        mod.SetGameModeTargetScore(this._context.rules.scoreToWin + 1);
        mod.SetGameModeTimeLimit(this._context.rules.matchTimeLimitSeconds);
        this._scoreService.resetScores();
        this._scoreboardService.configure();
        this._enqueueLiveStartupJobs();
    }

    public onGameModeEnding(): void {
        this._schedulerService.clearAll();
        this._workQueueService.clearAll();
        this._playerTrackerService.clearMandownState();
        this._hillService.reset();
        this._spawnService.reset();
        this._worldIconService.reset();
        this._uiService.hideLiveHud();
        this._sfxService.resetPlayerAudioState();
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
        this._workQueueService.clearAll();
        this._playerTrackerService.clearMandownState();
        this._hillService.reset();
        this._spawnService.reset();
        this._worldIconService.reset();
        this._sfxService.resetPlayerAudioState();
        this._lockPostmatchInputForAllPlayers();
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

    public lockPostmatchInputForPlayer(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        const team = mod.GetTeam(player);
        if (!mod.Equals(team, KOTH_TEAM_1) && !mod.Equals(team, KOTH_TEAM_2)) return;

        mod.EnableAllInputRestrictions(player, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.CameraPitch, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.CameraYaw, false);
    }

    private _lockPostmatchInputForAllPlayers(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            this.lockPostmatchInputForPlayer(playerState.player);
        });
    }

    private _enqueueLiveStartupJobs(): void {
        this._workQueueService.enqueue('startup', () => this._sfxService.ensureSpawned(), 'startup:sfx');
        this._enqueueCurrentPlayerSyncBatch(0);
    }

    private _enqueueCurrentPlayerSyncBatch(startIndex: number): void {
        this._workQueueService.enqueue(
            'maintenance',
            () => {
                const nextIndex = this._playerTrackerService.syncCurrentPlayersBatch(
                    startIndex,
                    this._context.rules.workQueueBudgets.maintenance
                );
                if (nextIndex >= 0) {
                    this._enqueueCurrentPlayerSyncBatch(nextIndex);
                    return;
                }

                this._workQueueService.enqueue('startup', () => {
                    this._hillService.initializeForMatch();
                    this._enqueuePlayerResetBatch([...this._context.runtime.playersById.keys()], 0);
                }, 'startup:hill-init');
            },
            `startup:sync-players:${startIndex}`
        );
    }

    private _enqueuePlayerResetBatch(playerIds: readonly number[], startIndex: number): void {
        this._workQueueService.enqueue(
            'maintenance',
            () => {
                const maxPlayers = this._context.rules.workQueueBudgets.maintenance;
                const endIndex = Math.min(startIndex + maxPlayers, playerIds.length);

                for (let i = startIndex; i < endIndex; i++) {
                    this._playerTrackerService.resetPlayerForNewMatch(playerIds[i], true, false);
                }

                if (endIndex < playerIds.length) {
                    this._enqueuePlayerResetBatch(playerIds, endIndex);
                    return;
                }

                this._workQueueService.enqueue('startup', () => {
                    this._spawnService.configureLiveDeploySpawnCore();
                    this._enqueueSpawnConfigureBatch([...this._context.runtime.playersById.keys()], 0);
                }, 'startup:spawn-core');
            },
            `startup:reset-players:${startIndex}`
        );
    }

    private _enqueueSpawnConfigureBatch(playerIds: readonly number[], startIndex: number): void {
        this._workQueueService.enqueue(
            'maintenance',
            () => {
                const maxPlayers = this._context.rules.workQueueBudgets.maintenance;
                const endIndex = Math.min(startIndex + maxPlayers, playerIds.length);

                for (let i = startIndex; i < endIndex; i++) {
                    this._spawnService.configureLiveDeploySpawnForPlayer(playerIds[i]);
                }

                if (endIndex < playerIds.length) {
                    this._enqueueSpawnConfigureBatch(playerIds, endIndex);
                    return;
                }

                this._enqueueBootstrapBatch(0);
            },
            `startup:configure-spawns:${startIndex}`
        );
    }

    private _enqueueBootstrapBatch(startIndex: number): void {
        this._workQueueService.enqueue(
            'maintenance',
            () => {
                const nextIndex = this._playerTrackerService.bootstrapLiveStartPlayersBatch(
                    startIndex,
                    this._context.rules.workQueueBudgets.maintenance
                );
                if (nextIndex >= 0) {
                    this._enqueueBootstrapBatch(nextIndex);
                    return;
                }

                this._workQueueService.enqueue('startup', () => {
                    this._hillService.updateActiveHillState(true);
                    this._context.runtime.hudDirty = true;
                    this._context.runtime.scoreboardDirty = true;
                }, 'startup:final-hill-sync');
                this._workQueueService.enqueue('world', () => this._worldIconService.update(), 'world:update');
            },
            `startup:bootstrap:${startIndex}`
        );
    }
}
