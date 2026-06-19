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
import { KothWorkQueueService } from './koth-work-queue-service.ts';
import { KothWorldIconService } from './koth-world-icon-service.ts';
import { displayWorldLog, getKothPlayerId } from './koth-sdk-utils.ts';
import type { KothHillControlState, KothHillOwnerState } from '../state/koth-hill-state.ts';

type KothHudDirtyPriority = 'critical' | 'normal';

interface KothObjectiveHudSnapshot {
    playerIds: number[];
    controlState: KothHillControlState;
    ownerState: KothHillOwnerState;
}

class KothRuntimeFacade {
    private readonly _context = createKothLiveModeContext();
    private _maintenanceSyncStartIndex = 0;
    private readonly _criticalHudPlayerIds = new Set<number>();
    private readonly _dirtyHudPlayerIds = new Set<number>();
    private _criticalHudFlushQueued = false;
    private _hudFlushQueued = false;
    private _scoreboardFlushPlayerIds: number[] = [];
    private _scoreboardFlushIndex = 0;
    private _scoreboardFlushQueued = false;

    private readonly _bannerService = new KothBannerService();
    private readonly _sfxService = new KothSfxService();
    private readonly _schedulerService = new KothSchedulerService(this._context);
    private readonly _workQueueService = new KothWorkQueueService(this._context);
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
    private readonly _spawnJobService = new KothSpawnJobService(this._context, this._workQueueService);
    private readonly _spawnService = new KothSpawnService(this._context, this._spawnJobService);
    private readonly _uiService = new KothUiService(this._context);
    private readonly _playerTrackerService = new KothPlayerTrackerService(
        this._context,
        this._hillService,
        this._scoreService,
        this._scoreboardService,
        this._spawnService,
        this._uiService,
        this._sfxService
    );
    private readonly _lifecycleService = new KothLifecycleService(
        this._context,
        this._schedulerService,
        this._hillService,
        this._scoreService,
        this._scoreboardService,
        this._uiService,
        this._workQueueService,
        this._worldIconService,
        this._spawnService,
        this._playerTrackerService,
        this._bannerService,
        this._sfxService
    );

    public onGameModeStarted(): void {
        this._clearRuntimeQueues();
        this._maintenanceSyncStartIndex = 0;
        this._lifecycleService.onGameModeStarted();
        this._startLiveTimers();
    }

    public onKernelGameModeStarted(): void {
        if (this._context.runtime.isMatchActive) return;

        this._clearRuntimeQueues();
        this._schedulerService.clearAll();
        this._workQueueService.clearAll();
        this._context.runtime.isMatchActive = false;
        this._context.runtime.isPostGame = false;
        this._startWorkQueueOnly();
        this._enqueuePrecreateHiddenHudForCurrentPlayers(0);
    }

    public onGameModeEnding(): void {
        this._lifecycleService.onGameModeEnding();
        this._clearRuntimeQueues();
    }

    public onPlayerJoinGame(eventPlayer: mod.Player): void {
        if (this._context.runtime.isPostGame) {
            this._playerTrackerService.syncGameplayPlayer(eventPlayer);
            this._lifecycleService.lockPostmatchInputForPlayer(eventPlayer);
            return;
        }

        this._playerTrackerService.onPlayerJoinGame(eventPlayer);
        const playerId = this._precreateHiddenHudForPlayer(eventPlayer);
        if (playerId !== undefined && this._context.runtime.isMatchActive) {
            this._uiService.refreshObjectiveHudForPlayer(playerId, true);
        }
    }

    public onKernelPlayerJoinGame(eventPlayer: mod.Player): void {
        if (this._context.runtime.isPostGame) {
            this._lifecycleService.lockPostmatchInputForPlayer(eventPlayer);
            return;
        }

        if (this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);

        this._workQueueService.enqueue(
            'ui',
            () => this._precreateHiddenHudForPlayer(eventPlayer),
            `ui:precreate:${playerId}`
        );
    }

    public onPlayerLeaveGame(eventNumber: number): void {
        this._playerTrackerService.onPlayerLeaveGame(eventNumber);
        this._forgetRuntimePlayerQueues(eventNumber);
    }

    public onKernelPlayerLeaveGame(eventNumber: number): void {
        if (this._context.runtime.isMatchActive) return;

        this._playerTrackerService.onPlayerLeaveGame(eventNumber);
        this._forgetRuntimePlayerQueues(eventNumber);
    }

    public onPlayerDeployed(eventPlayer: mod.Player): void {
        if (this._context.runtime.isPostGame) {
            this._playerTrackerService.syncGameplayPlayer(eventPlayer);
            this._lifecycleService.lockPostmatchInputForPlayer(eventPlayer);
            return;
        }

        this._playerTrackerService.onPlayerDeployed(eventPlayer);
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): void {
        const before = this._getObjectiveHudSnapshot();
        const playerId = mod.IsPlayerValid(eventPlayer) ? getKothPlayerId(eventPlayer) : undefined;
        this._playerTrackerService.onPlayerUndeploy(eventPlayer);
        if (playerId !== undefined) this._queueObjectiveTriggerHudRefresh(playerId, before);
    }

    public onPlayerDied(eventPlayer: mod.Player): void {
        const before = this._getObjectiveHudSnapshot();
        const playerId = mod.IsPlayerValid(eventPlayer) ? getKothPlayerId(eventPlayer) : undefined;
        this._playerTrackerService.onPlayerDied(eventPlayer);
        if (playerId !== undefined) this._queueObjectiveTriggerHudRefresh(playerId, before);
    }

    public onMandown(eventPlayer: mod.Player): void {
        const before = this._getObjectiveHudSnapshot();
        const playerId = mod.IsPlayerValid(eventPlayer) ? getKothPlayerId(eventPlayer) : undefined;
        this._playerTrackerService.onMandown(eventPlayer);
        if (playerId !== undefined) this._queueObjectiveTriggerHudRefresh(playerId, before);
    }

    public onPlayerRevived(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        const before = this._getObjectiveHudSnapshot();
        const playerId = mod.IsPlayerValid(eventPlayer) ? getKothPlayerId(eventPlayer) : undefined;
        this._playerTrackerService.onPlayerRevived(eventPlayer, eventOtherPlayer);
        if (playerId !== undefined) this._queueObjectiveTriggerHudRefresh(playerId, before);
    }

    public onPlayerEarnedKill(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerEarnedKill(eventPlayer, eventOtherPlayer);
    }

    public onPlayerEarnedKillAssist(eventPlayer: mod.Player): void {
        this._playerTrackerService.onPlayerEarnedKillAssist(eventPlayer);
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        const playerState = this._playerTrackerService.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        const before = this._getObjectiveHudSnapshot();
        const handledHillTrigger = this._hillService.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
        this._spawnService.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger);
        if (handledHillTrigger) {
            this._uiService.refreshObjectiveHudOnlyForPlayer(playerState.id, true);
            this._queueObjectiveTriggerHudRefresh(playerState.id, before);
        }
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): void {
        let playerId: number | undefined;
        if (mod.IsPlayerValid(eventPlayer)) {
            const playerState = this._playerTrackerService.syncGameplayPlayer(eventPlayer);
            playerId = playerState?.id ?? getKothPlayerId(eventPlayer);
        }

        const before = this._getObjectiveHudSnapshot();
        const handledHillTrigger = this._hillService.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
        this._spawnService.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger);
        if (handledHillTrigger && playerId !== undefined) {
            this._uiService.refreshObjectiveHudOnlyForPlayer(playerId, true);
            this._queueObjectiveTriggerHudRefresh(playerId, before);
        }
    }

    private _startLiveTimers(): void {
        this._schedulerService.setWorkJobInterval(() => {
            this._workQueueService.tick();
        });

        this._schedulerService.setHillStateInterval(() => {
            this._workQueueService.enqueue(
                'maintenance',
                () => {
                    const nextIndex = this._playerTrackerService.syncCurrentPlayersBatch(
                        this._maintenanceSyncStartIndex,
                        this._context.rules.workQueueBudgets.maintenance
                    );
                    this._maintenanceSyncStartIndex = nextIndex >= 0 ? nextIndex : 0;
                    this._hillService.updateActiveHillState();
                    this._flushVisuals();
                },
                'runtime:hill-state'
            );
        });

        this._schedulerService.setObjectiveTimerInterval(() => {
            const previousHillIndex = this._context.runtime.hill.currentHillIndex;
            this._hillService.tickObjectiveTimer();
            if (this._context.runtime.hill.currentHillIndex !== previousHillIndex) {
                this._spawnService.onObjectiveActivated();
            }
            this._queueWorldIconUpdate();
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
            this._queueWorldIconUpdate();
        });
    }

    private _startWorkQueueOnly(): void {
        this._schedulerService.setWorkJobInterval(() => {
            this._workQueueService.tick();
        });
    }

    private _flushVisuals(): void {
        if (this._context.runtime.hudDirty) {
            this._context.runtime.hudDirty = false;
            this.markAllHudDirty();
        }

        if (this._context.runtime.scoreboardDirty) {
            this._context.runtime.scoreboardDirty = false;
            this._queueScoreboardFlush();
        }

        this._uiService.syncContestedBlinkTimer();
    }

    private _queueWorldIconUpdate(): void {
        if (
            this._workQueueService.getTotalQueuedCount() > this._context.rules.workQueueBacklogDegradeThreshold &&
            this._workQueueService.getLaneQueuedCount('world') > 0
        ) {
            return;
        }

        this._workQueueService.enqueue('world', () => this._worldIconService.update(), 'world:update');
    }

    private markPlayerHudDirty(playerId: number, priority: KothHudDirtyPriority = 'normal'): void {
        if (!this._context.runtime.playersById.has(playerId)) return;

        if (priority === 'critical') {
            this._criticalHudPlayerIds.add(playerId);
            this._queueCriticalHudFlush();
            return;
        }

        this._dirtyHudPlayerIds.add(playerId);
        this._queueHudFlush();
    }

    private markPlayersHudDirty(playerIds: readonly number[], priority: KothHudDirtyPriority = 'normal'): void {
        for (const playerId of playerIds) {
            this.markPlayerHudDirty(playerId, priority);
        }
    }

    private markAllHudDirty(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            this.markPlayerHudDirty(playerState.id, 'normal');
        });
    }

    private _queueCriticalHudFlush(): void {
        if (this._criticalHudFlushQueued) return;

        this._criticalHudFlushQueued = true;
        this._workQueueService.enqueue('critical', () => this._processCriticalHudFlushJob(), 'ui:hud-critical-flush');
    }

    private _processCriticalHudFlushJob(): void {
        const playerId = this._takeNextDirtyPlayerId(this._criticalHudPlayerIds);
        if (playerId === undefined) {
            this._criticalHudFlushQueued = false;
            return;
        }

        this._refreshHudPlayer(playerId);

        if (this._criticalHudPlayerIds.size > 0) {
            this._workQueueService.enqueue('critical', () => this._processCriticalHudFlushJob(), 'ui:hud-critical-flush');
            return;
        }

        this._criticalHudFlushQueued = false;
    }

    private _queueHudFlush(): void {
        if (this._hudFlushQueued) return;

        this._hudFlushQueued = true;
        this._workQueueService.enqueue('ui', () => this._processHudFlushJob(), 'ui:hud-flush');
    }

    private _processHudFlushJob(): void {
        const playerId = this._takeNextDirtyPlayerId(this._dirtyHudPlayerIds);
        if (playerId === undefined) {
            this._hudFlushQueued = false;
            return;
        }

        this._refreshHudPlayer(playerId);

        if (this._dirtyHudPlayerIds.size > 0) {
            this._workQueueService.enqueue('ui', () => this._processHudFlushJob(), 'ui:hud-flush');
            return;
        }

        this._hudFlushQueued = false;
    }

    private _takeNextDirtyPlayerId(playerIds: Set<number>): number | undefined {
        while (true) {
            const next = playerIds.values().next();
            if (next.done) return undefined;

            playerIds.delete(next.value);
            if (this._context.runtime.playersById.has(next.value)) return next.value;

            this._uiService.forgetPlayerHud(next.value);
        }
    }

    private _refreshHudPlayer(playerId: number): void {
        this._uiService.refreshObjectiveHudForPlayer(playerId, true);
    }

    private _queueObjectiveTriggerHudRefresh(eventPlayerId: number, before: KothObjectiveHudSnapshot): void {
        const after = this._getObjectiveHudSnapshot();
        const affectedPlayerIds = this._mergePlayerIds([eventPlayerId], before.playerIds, after.playerIds);
        const controlChanged = before.controlState !== after.controlState || before.ownerState !== after.ownerState;

        this.markPlayerHudDirty(eventPlayerId, 'critical');
        this.markPlayersHudDirty(affectedPlayerIds, 'critical');

        if (controlChanged) {
            this.markAllHudDirty();
        }

        this._uiService.syncContestedBlinkTimer();
    }

    private _getObjectiveHudSnapshot(): KothObjectiveHudSnapshot {
        return {
            playerIds: this._hillService.getActiveHillPlayerIds(),
            controlState: this._context.runtime.hill.currentControlState,
            ownerState: this._context.runtime.hill.currentOwnerState,
        };
    }

    private _mergePlayerIds(...groups: readonly (readonly number[])[]): number[] {
        const merged = new Set<number>();
        for (const group of groups) {
            for (const playerId of group) merged.add(playerId);
        }

        return [...merged];
    }

    private _queueScoreboardFlush(): void {
        if (!this._scoreboardFlushQueued) {
            this._scoreboardFlushPlayerIds = [...this._context.runtime.playersById.keys()];
            this._scoreboardFlushIndex = 0;
            this._scoreboardFlushQueued = true;
        }

        this._workQueueService.enqueue('ui', () => this._processScoreboardFlushJob(), 'ui:scoreboard-flush');
    }

    private _processScoreboardFlushJob(): void {
        if (this._scoreboardFlushIndex >= this._scoreboardFlushPlayerIds.length) {
            this._scoreboardFlushQueued = false;
            this._scoreboardFlushPlayerIds = [];
            this._scoreboardFlushIndex = 0;
            return;
        }

        const playerId = this._scoreboardFlushPlayerIds[this._scoreboardFlushIndex];
        this._scoreboardFlushIndex += 1;
        if (this._context.runtime.playersById.has(playerId)) {
            this._scoreboardService.updatePlayer(playerId);
        } else {
            this._uiService.forgetPlayerHud(playerId);
        }

        if (this._scoreboardFlushIndex < this._scoreboardFlushPlayerIds.length) {
            this._workQueueService.enqueue('ui', () => this._processScoreboardFlushJob(), 'ui:scoreboard-flush');
            return;
        }

        this._scoreboardFlushQueued = false;
        this._scoreboardFlushPlayerIds = [];
        this._scoreboardFlushIndex = 0;
    }

    private _forgetRuntimePlayerQueues(playerId: number): void {
        this._criticalHudPlayerIds.delete(playerId);
        this._dirtyHudPlayerIds.delete(playerId);
        let removedBeforeFlushCursor = 0;
        this._scoreboardFlushPlayerIds = this._scoreboardFlushPlayerIds.filter((queuedPlayerId, index) => {
            if (queuedPlayerId !== playerId) return true;
            if (index < this._scoreboardFlushIndex) removedBeforeFlushCursor += 1;
            return false;
        });
        this._scoreboardFlushIndex = Math.max(0, this._scoreboardFlushIndex - removedBeforeFlushCursor);
        if (this._scoreboardFlushIndex > this._scoreboardFlushPlayerIds.length) {
            this._scoreboardFlushIndex = this._scoreboardFlushPlayerIds.length;
        }
        this._uiService.forgetPlayerHud(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
    }

    private _clearRuntimeQueues(): void {
        this._criticalHudPlayerIds.clear();
        this._dirtyHudPlayerIds.clear();
        this._criticalHudFlushQueued = false;
        this._hudFlushQueued = false;
        this._scoreboardFlushPlayerIds = [];
        this._scoreboardFlushIndex = 0;
        this._scoreboardFlushQueued = false;
    }

    private _enqueuePrecreateHiddenHudForCurrentPlayers(startIndex: number): void {
        this._workQueueService.enqueue(
            'ui',
            () => {
                const allPlayers = mod.AllPlayers();
                const totalPlayers = mod.CountOf(allPlayers);
                if (startIndex >= totalPlayers) return;

                const player = mod.ValueInArray(allPlayers, startIndex) as mod.Player;
                if (mod.IsPlayerValid(player)) {
                    this._precreateHiddenHudForPlayer(player);
                }

                if (startIndex + 1 < totalPlayers) {
                    this._enqueuePrecreateHiddenHudForCurrentPlayers(startIndex + 1);
                }
            },
            `ui:precreate-current:${startIndex}`
        );
    }

    private _precreateHiddenHudForPlayer(player: mod.Player): number | undefined {
        const playerState = this._playerTrackerService.syncGameplayPlayer(player);
        if (!playerState) return undefined;

        this._uiService.precreatePlayerHudHidden(playerState.id);
        return playerState.id;
    }
}

const kothLiveFacade = new KothRuntimeFacade();
const warnedKothHandlerFailureByName: Record<string, boolean> = {};

function safeKothHandler<TArgs extends readonly unknown[]>(
    name: string,
    handler: (...args: TArgs) => void
): (...args: TArgs) => void {
    return (...args: TArgs): void => {
        try {
            handler(...args);
        } catch (_err) {
            if (warnedKothHandlerFailureByName[name]) return;

            warnedKothHandlerFailureByName[name] = true;
            displayWorldLog(mod.Message("[KOTH] Live handler {} failed", name));
        }
    };
}

export const KothLiveModeHandlers = {
    OnKernelGameModeStarted: safeKothHandler('OnKernelGameModeStarted', () => kothLiveFacade.onKernelGameModeStarted()),
    OnGameModeStarted: safeKothHandler('OnGameModeStarted', () => kothLiveFacade.onGameModeStarted()),
    OnGameModeEnding: safeKothHandler('OnGameModeEnding', () => kothLiveFacade.onGameModeEnding()),
    OnKernelPlayerJoinGame: safeKothHandler('OnKernelPlayerJoinGame', (eventPlayer: mod.Player) =>
        kothLiveFacade.onKernelPlayerJoinGame(eventPlayer)
    ),
    OnPlayerJoinGame: safeKothHandler('OnPlayerJoinGame', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerJoinGame(eventPlayer)
    ),
    OnKernelPlayerLeaveGame: safeKothHandler('OnKernelPlayerLeaveGame', (eventNumber: number) =>
        kothLiveFacade.onKernelPlayerLeaveGame(eventNumber)
    ),
    OnPlayerLeaveGame: safeKothHandler('OnPlayerLeaveGame', (eventNumber: number) =>
        kothLiveFacade.onPlayerLeaveGame(eventNumber)
    ),
    OnPlayerDeployed: safeKothHandler('OnPlayerDeployed', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerDeployed(eventPlayer)
    ),
    OnPlayerUndeploy: safeKothHandler('OnPlayerUndeploy', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerUndeploy(eventPlayer)
    ),
    OnPlayerDied: safeKothHandler('OnPlayerDied', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerDied(eventPlayer)
    ),
    OnMandown: safeKothHandler('OnMandown', (eventPlayer: mod.Player) => kothLiveFacade.onMandown(eventPlayer)),
    OnRevived: safeKothHandler('OnRevived', (eventPlayer: mod.Player, eventOtherPlayer: mod.Player) =>
        kothLiveFacade.onPlayerRevived(eventPlayer, eventOtherPlayer)
    ),
    OnPlayerEarnedKill: safeKothHandler('OnPlayerEarnedKill', (eventPlayer: mod.Player, eventOtherPlayer: mod.Player) =>
        kothLiveFacade.onPlayerEarnedKill(eventPlayer, eventOtherPlayer)
    ),
    OnPlayerEarnedKillAssist: safeKothHandler('OnPlayerEarnedKillAssist', (eventPlayer: mod.Player) =>
        kothLiveFacade.onPlayerEarnedKillAssist(eventPlayer)
    ),
    OnPlayerEnterAreaTrigger: safeKothHandler(
        'OnPlayerEnterAreaTrigger',
        (eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger) =>
            kothLiveFacade.onPlayerEnterAreaTrigger(eventPlayer, eventAreaTrigger)
    ),
    OnPlayerExitAreaTrigger: safeKothHandler(
        'OnPlayerExitAreaTrigger',
        (eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger) =>
            kothLiveFacade.onPlayerExitAreaTrigger(eventPlayer, eventAreaTrigger)
    ),
};
