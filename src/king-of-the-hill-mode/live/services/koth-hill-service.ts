import {
    KOTH_HILL_AREA_TRIGGER_IDS,
    KOTH_HILL_CAPTURE_POINT_IDS,
    KOTH_HILL_SECTOR_IDS,
} from '../config/koth-hills.ts';
import type { KothHillControlState, KothHillOwnerState } from '../state/koth-hill-state.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothBannerService } from './koth-banner-service.ts';
import {
    displayWorldLog,
    getKothPlayerId,
    isKothPlayerLiving,
    isParticipantTeam,
    KOTH_TEAM_1,
    KOTH_TEAM_2,
    KOTH_TEAM_NEUTRAL,
} from './koth-sdk-utils.ts';
import type { KothSfxService } from './koth-sfx-service.ts';

export class KothHillService {
    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _bannerService: KothBannerService,
        private readonly _sfxService: KothSfxService
    ) {}

    public initializeForMatch(): void {
        this._context.runtime.hill.playerIdsByAreaTriggerId.clear();

        for (const triggerId of KOTH_HILL_AREA_TRIGGER_IDS) {
            this._context.runtime.hill.playerIdsByAreaTriggerId.set(triggerId, new Set<number>());
            this._safeEnableAreaTrigger(triggerId, true);
        }

        for (const capturePointId of KOTH_HILL_CAPTURE_POINT_IDS) {
            this._safeConfigureCapturePoint(capturePointId);
        }

        this.activateHill(0, false, true);
    }

    public reset(): void {
        this._context.runtime.hill.activeHillTeam1Players.clear();
        this._context.runtime.hill.activeHillTeam2Players.clear();
        this._context.runtime.hill.playerIdsByAreaTriggerId.clear();
        this._context.runtime.hill.activeLockRemainingSeconds = 0;
        this._context.runtime.hill.currentControlState = 'inactive';
        this._context.runtime.hill.currentOwnerState = 'neutral';
        this._disableAllObjectiveLayers();

        for (const triggerId of KOTH_HILL_AREA_TRIGGER_IDS) {
            this._safeEnableAreaTrigger(triggerId, false);
        }

        this._sfxService.stopObjectiveContestedLoops();
    }

    public activateHill(index: number, announce: boolean = true, useInitialLock: boolean = false): void {
        const hillCount = this._context.hills.length;
        const normalizedIndex = ((index % hillCount) + hillCount) % hillCount;
        const nextIndex = (normalizedIndex + 1) % hillCount;
        const hill = this._context.hills[normalizedIndex];
        const shouldLock = useInitialLock && this._context.rules.initialObjectiveLockSeconds > 0;

        this._context.runtime.hill.currentHillIndex = normalizedIndex;
        this._context.runtime.hill.currentHillLetter = hill.letter;
        this._context.runtime.hill.nextHillIndex = nextIndex;
        this._context.runtime.hill.activeObjectiveRemainingSeconds = this._context.rules.objectiveDurationSeconds;
        this._context.runtime.hill.activeLockRemainingSeconds = shouldLock
            ? this._context.rules.initialObjectiveLockSeconds
            : 0;
        this._context.runtime.hill.nextPreviewRemainingSeconds = 0;
        this._context.runtime.hill.currentControlState = shouldLock ? 'locked' : 'neutral';
        this._context.runtime.hill.currentOwnerState = 'neutral';
        this._context.runtime.hudDirty = true;

        this.updateActiveHillState(true);
        this._applyObjectiveLayers();

        if (announce) {
            this._bannerService.showObjectiveActivated(hill.letter);
            this._sfxService.playObjectiveActivated();
        }
    }

    public tickObjectiveTimer(): void {
        const runtime = this._context.runtime;
        if (!runtime.isMatchActive) return;

        if (runtime.hill.activeLockRemainingSeconds > 0) {
            runtime.hill.activeLockRemainingSeconds -= 1;
            if (runtime.hill.activeLockRemainingSeconds <= 0) {
                runtime.hill.activeLockRemainingSeconds = 0;
                this._unlockActiveHill();
            } else {
                runtime.hudDirty = true;
                this._applyObjectiveLayers();
            }
            return;
        }

        runtime.hill.activeObjectiveRemainingSeconds -= 1;
        if (runtime.hill.activeObjectiveRemainingSeconds <= 0) {
            this.activateHill(runtime.hill.nextHillIndex, true);
            return;
        }

        if (runtime.hill.activeObjectiveRemainingSeconds <= this._context.rules.nextObjectivePreviewSeconds) {
            runtime.hill.nextPreviewRemainingSeconds = runtime.hill.activeObjectiveRemainingSeconds;
            this._applyObjectiveLayers();

            if (runtime.hill.nextPreviewRemainingSeconds === this._context.rules.nextObjectivePreviewSeconds) {
                const previewHill = this._context.hills[runtime.hill.nextHillIndex];
                this._bannerService.showObjectiveLocked(previewHill.letter, runtime.hill.nextPreviewRemainingSeconds);
                this._sfxService.playObjectiveLocked();
            }
        } else {
            runtime.hill.nextPreviewRemainingSeconds = 0;
        }

        runtime.hudDirty = true;
    }

    public updateActiveHillState(forceVisualSync: boolean = false): void {
        const hillState = this._context.runtime.hill;
        const previousState = hillState.currentControlState;
        const previousOwnerState = hillState.currentOwnerState;
        const previousTeam1Players = [...hillState.activeHillTeam1Players];
        const previousTeam2Players = [...hillState.activeHillTeam2Players];
        this._syncActivePresence();
        const membershipChanged =
            !this._hasSamePlayerIds(previousTeam1Players, hillState.activeHillTeam1Players) ||
            !this._hasSamePlayerIds(previousTeam2Players, hillState.activeHillTeam2Players);

        if (previousState === 'locked') {
            if (forceVisualSync) {
                hillState.currentOwnerState = 'neutral';
                this._context.runtime.hudDirty = true;
                this._applyObjectiveLayers();
            } else if (membershipChanged) {
                this._context.runtime.hudDirty = true;
            }
            this._syncObjectiveContestedLoop();
            return;
        }

        const nextState = this._resolveControlState();
        const nextOwnerState = this._resolveOwnerState(nextState, previousOwnerState);

        if (previousState !== nextState || previousOwnerState !== nextOwnerState || forceVisualSync) {
            hillState.currentControlState = nextState;
            hillState.currentOwnerState = nextOwnerState;
            this._context.runtime.hudDirty = true;
            this._applyObjectiveLayers();

            if (nextState === 'contested' && previousState !== 'contested') {
                this._bannerService.showObjectiveContested(this._context.runtime.hill.currentHillLetter);
                this._sfxService.playObjectiveContestedForPlayers(this._getActiveHillHumanPlayers());
            }
        } else if (membershipChanged) {
            this._context.runtime.hudDirty = true;
        }

        this._syncObjectiveContestedLoop();
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined || !this._isHillAreaTrigger(triggerId)) return false;
        if (!mod.IsPlayerValid(eventPlayer)) return true;

        const playerId = getKothPlayerId(eventPlayer);
        if (!this._isLivingDeployedParticipant(eventPlayer)) {
            this._getPlayersForAreaTrigger(triggerId).delete(playerId);
            this.updateActiveHillState();
            return true;
        }

        this._getPlayersForAreaTrigger(triggerId).add(playerId);
        this._playObjectiveEnterSfx(eventPlayer, triggerId);
        this.updateActiveHillState();
        return true;
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined || !this._isHillAreaTrigger(triggerId)) return false;
        if (!mod.IsPlayerValid(eventPlayer)) return true;

        const playerId = getKothPlayerId(eventPlayer);
        this._getPlayersForAreaTrigger(triggerId).delete(playerId);
        this.updateActiveHillState();
        return true;
    }

    public removePlayerFromAllHills(playerId: number): void {
        this._context.runtime.hill.playerIdsByAreaTriggerId.forEach((playerIds) => playerIds.delete(playerId));

        const playerState = this._context.runtime.playersById.get(playerId);
        if (playerState) {
            playerState.isInsideActiveHill = false;
            playerState.activeHillAreaTriggerId = null;
            playerState.lastHillEnterTime = null;
        }

        this.updateActiveHillState();
    }

    public getActiveHillPlayerIds(): number[] {
        return [
            ...this._context.runtime.hill.activeHillTeam1Players,
            ...this._context.runtime.hill.activeHillTeam2Players,
        ];
    }

    public isActiveHillTrulyContested(): boolean {
        this._syncActivePresence();
        return (
            this._context.runtime.hill.activeHillTeam1Players.size > 0 &&
            this._context.runtime.hill.activeHillTeam2Players.size > 0
        );
    }

    private _getActiveHillHumanPlayers(): mod.Player[] {
        const players: mod.Player[] = [];

        for (const playerId of this.getActiveHillPlayerIds()) {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState || playerState.isBot || !mod.IsPlayerValid(playerState.player)) continue;

            players.push(playerState.player);
        }

        return players;
    }

    private _playObjectiveEnterSfx(player: mod.Player, triggerId: number): void {
        const activeHill = this._context.hills[this._context.runtime.hill.currentHillIndex];
        if (!activeHill || triggerId !== activeHill.areaTriggerId) return;

        this._sfxService.playObjectiveEnter(player, this._isObjectiveEnterFriendly(player));
    }

    private _isObjectiveEnterFriendly(player: mod.Player): boolean {
        const ownerState = this._context.runtime.hill.currentOwnerState;
        if (ownerState === 'neutral') return true;

        const team = mod.GetTeam(player);
        if (ownerState === 'team1') return mod.Equals(team, KOTH_TEAM_1);
        if (ownerState === 'team2') return mod.Equals(team, KOTH_TEAM_2);
        return true;
    }

    private _syncObjectiveContestedLoop(): void {
        const hillState = this._context.runtime.hill;
        const isContested =
            hillState.currentControlState === 'contested' &&
            hillState.activeHillTeam1Players.size > 0 &&
            hillState.activeHillTeam2Players.size > 0;

        if (!isContested) {
            this._sfxService.syncObjectiveContestedLoopForPlayers([]);
            return;
        }

        this._sfxService.syncObjectiveContestedLoopForPlayers(this._getActiveHillHumanPlayers());
    }

    private _hasSamePlayerIds(previousPlayerIds: readonly number[], currentPlayerIds: Set<number>): boolean {
        if (previousPlayerIds.length !== currentPlayerIds.size) return false;

        for (const playerId of previousPlayerIds) {
            if (!currentPlayerIds.has(playerId)) return false;
        }

        return true;
    }

    private _syncActivePresence(): void {
        const hillState = this._context.runtime.hill;
        const activeHill = this._context.hills[hillState.currentHillIndex];
        const activePlayerIds = this._getPlayersForAreaTrigger(activeHill.areaTriggerId);
        const touchedPlayerIds = new Set<number>([
            ...hillState.activeHillTeam1Players,
            ...hillState.activeHillTeam2Players,
        ]);
        activePlayerIds.forEach((playerId) => touchedPlayerIds.add(playerId));

        hillState.activeHillTeam1Players.clear();
        hillState.activeHillTeam2Players.clear();

        touchedPlayerIds.forEach((playerId) => {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState) return;

            playerState.isInsideActiveHill = false;
            playerState.activeHillAreaTriggerId = null;
        });

        activePlayerIds.forEach((playerId) => {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState || !this._isLivingDeployedParticipant(playerState.player)) {
                activePlayerIds.delete(playerId);
                return;
            }

            const team = mod.GetTeam(playerState.player);
            playerState.setTeam(team);
            playerState.isInsideActiveHill = true;
            playerState.activeHillAreaTriggerId = activeHill.areaTriggerId;

            if (mod.Equals(team, KOTH_TEAM_1)) {
                hillState.activeHillTeam1Players.add(playerId);
            } else if (mod.Equals(team, KOTH_TEAM_2)) {
                hillState.activeHillTeam2Players.add(playerId);
            }
        });
    }

    private _resolveControlState(): KothHillControlState {
        const hasTeam1 = this._context.runtime.hill.activeHillTeam1Players.size > 0;
        const hasTeam2 = this._context.runtime.hill.activeHillTeam2Players.size > 0;

        if (hasTeam1 && hasTeam2) return 'contested';
        if (hasTeam1) return 'team1';
        if (hasTeam2) return 'team2';
        return 'neutral';
    }

    private _resolveOwnerState(
        controlState: KothHillControlState,
        previousOwnerState: KothHillOwnerState
    ): KothHillOwnerState {
        if (controlState === 'team1') return 'team1';
        if (controlState === 'team2') return 'team2';
        return previousOwnerState;
    }

    private _applyObjectiveLayers(): void {
        // KOTH uses area triggers, custom HUD, and custom world icons. Keeping native objectives
        // disabled prevents the engine capture-objective HUD from surfacing during revive flows.
        this._disableAllObjectiveLayers();
    }

    private _unlockActiveHill(): void {
        const activeHill = this._context.hills[this._context.runtime.hill.currentHillIndex];
        this._syncActivePresence();
        const nextState = this._resolveControlState();
        this._context.runtime.hill.currentControlState = nextState;
        this._context.runtime.hill.currentOwnerState = this._resolveOwnerState(nextState, 'neutral');
        this._context.runtime.hudDirty = true;
        this._applyObjectiveLayers();
        this._bannerService.showObjectiveActivated(activeHill.letter);
        this._sfxService.playObjectiveActivated();
    }

    private _getVisualObjectiveControlState(): KothHillControlState {
        const hillState = this._context.runtime.hill;
        if (hillState.currentControlState === 'contested' && hillState.currentOwnerState !== 'neutral') {
            return hillState.currentOwnerState;
        }

        return hillState.currentControlState;
    }

    private _disableAllObjectiveLayers(): void {
        for (const sectorId of KOTH_HILL_SECTOR_IDS) {
            this._safeEnableSector(sectorId, false);
        }

        for (const capturePointId of KOTH_HILL_CAPTURE_POINT_IDS) {
            this._safeEnableCapturePoint(capturePointId, false, KOTH_TEAM_NEUTRAL);
        }
    }

    private _safeConfigureCapturePoint(capturePointId: number): void {
        try {
            const capturePoint = mod.GetCapturePoint(capturePointId);
            mod.SetCapturePointCapturingTime(capturePoint, 9999);
            mod.SetCapturePointNeutralizationTime(capturePoint, 9999);
            mod.SetMaxCaptureMultiplier(capturePoint, 1);
            mod.EnableCapturePointDeploying(capturePoint, false);
            mod.EnableGameModeObjective(capturePoint, false);
        } catch (_err) {
            this._warnMissingObjective(capturePointId);
        }
    }

    private _safeEnableCapturePoint(capturePointId: number, enabled: boolean, owner: mod.Team): void {
        try {
            const capturePoint = mod.GetCapturePoint(capturePointId);
            mod.SetCapturePointOwner(capturePoint, owner);
            mod.EnableGameModeObjective(capturePoint, enabled);
        } catch (_err) {
            this._warnMissingObjective(capturePointId);
        }
    }

    private _safeEnableSector(sectorId: number, enabled: boolean): void {
        try {
            mod.EnableGameModeObjective(mod.GetSector(sectorId), enabled);
        } catch (_err) {
            this._warnMissingObjective(sectorId);
        }
    }

    private _safeEnableAreaTrigger(triggerId: number, enabled: boolean): void {
        try {
            mod.EnableAreaTrigger(mod.GetAreaTrigger(triggerId), enabled);
        } catch (_err) {
            this._warnMissingObjective(triggerId);
        }
    }

    private _warnMissingObjective(objectId: number): void {
        const warnings = this._context.runtime.warnedMissingObjectiveIds;
        if (warnings[objectId]) return;

        warnings[objectId] = true;
        displayWorldLog(mod.Message("[KOTH] Missing or unavailable objective object {}", objectId));
    }

    private _getAreaTriggerId(eventAreaTrigger: mod.AreaTrigger): number | undefined {
        try {
            return mod.GetObjId(eventAreaTrigger);
        } catch (_err) {
            return undefined;
        }
    }

    private _isHillAreaTrigger(triggerId: number): boolean {
        return KOTH_HILL_AREA_TRIGGER_IDS.indexOf(triggerId) >= 0;
    }

    private _getPlayersForAreaTrigger(triggerId: number): Set<number> {
        const existing = this._context.runtime.hill.playerIdsByAreaTriggerId.get(triggerId);
        if (existing) return existing;

        const created = new Set<number>();
        this._context.runtime.hill.playerIdsByAreaTriggerId.set(triggerId, created);
        return created;
    }

    private _isLivingDeployedParticipant(player: mod.Player): boolean {
        if (!mod.IsPlayerValid(player)) return false;

        const playerState = this._context.runtime.playersById.get(getKothPlayerId(player));
        if (!playerState?.isDeployed) return false;

        const team = mod.GetTeam(player);
        return isParticipantTeam(team) && isKothPlayerLiving(player);
    }
}

