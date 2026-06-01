import {
    KOTH_HILL_AREA_TRIGGER_IDS,
    KOTH_HILL_CAPTURE_POINT_IDS,
    KOTH_HILL_SECTOR_IDS,
    type KothHillConfig,
} from '../config/koth-hills.ts';
import type { KothHillControlState } from '../state/koth-hill-state.ts';
import type { KothModeContext } from '../state/koth-mode-context.ts';
import type { KothBannerService } from './koth-banner-service.ts';
import { displayWorldLog, getPlayerId, isParticipantTeam, isPlayerAlive, KOTH_TEAM_1, KOTH_TEAM_2, KOTH_TEAM_NEUTRAL } from './koth-sdk-utils.ts';
import type { KothSfxService } from './koth-sfx-service.ts';

export class KothHillService {
    public constructor(
        private readonly _context: KothModeContext,
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

        this.activateHill(0, false);
    }

    public reset(): void {
        this._context.runtime.hill.activeHillTeam1Players.clear();
        this._context.runtime.hill.activeHillTeam2Players.clear();
        this._context.runtime.hill.playerIdsByAreaTriggerId.clear();
        this._context.runtime.hill.currentControlState = 'inactive';
        this._disableAllObjectiveLayers();

        for (const triggerId of KOTH_HILL_AREA_TRIGGER_IDS) {
            this._safeEnableAreaTrigger(triggerId, false);
        }
    }

    public activateHill(index: number, announce: boolean = true): void {
        const hillCount = this._context.hills.length;
        const normalizedIndex = ((index % hillCount) + hillCount) % hillCount;
        const nextIndex = (normalizedIndex + 1) % hillCount;
        const hill = this._context.hills[normalizedIndex];

        this._context.runtime.hill.currentHillIndex = normalizedIndex;
        this._context.runtime.hill.currentHillLetter = hill.letter;
        this._context.runtime.hill.nextHillIndex = nextIndex;
        this._context.runtime.hill.activeObjectiveRemainingSeconds = this._context.rules.objectiveDurationSeconds;
        this._context.runtime.hill.nextPreviewRemainingSeconds = 0;
        this._context.runtime.hill.currentControlState = 'neutral';
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
        const previousState = this._context.runtime.hill.currentControlState;
        this._syncActivePresence();
        const nextState = this._resolveControlState();

        if (previousState !== nextState || forceVisualSync) {
            this._context.runtime.hill.currentControlState = nextState;
            this._context.runtime.hudDirty = true;
            this._applyObjectiveLayers();

            if (nextState === 'contested' && previousState !== 'contested') {
                this._bannerService.showObjectiveContested(this._context.runtime.hill.currentHillLetter);
                this._sfxService.playObjectiveContested();
            }
        }
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined || !this._isHillAreaTrigger(triggerId)) return false;

        const playerId = getPlayerId(eventPlayer);
        this._getPlayersForAreaTrigger(triggerId).add(playerId);
        this.updateActiveHillState();
        return true;
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined || !this._isHillAreaTrigger(triggerId)) return false;

        const playerId = getPlayerId(eventPlayer);
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

    private _syncActivePresence(): void {
        const hillState = this._context.runtime.hill;
        const activeHill = this._context.hills[hillState.currentHillIndex];
        const activePlayerIds = this._getPlayersForAreaTrigger(activeHill.areaTriggerId);

        hillState.activeHillTeam1Players.clear();
        hillState.activeHillTeam2Players.clear();

        this._context.runtime.playersById.forEach((playerState) => {
            playerState.isInsideActiveHill = false;
            playerState.activeHillAreaTriggerId = null;
        });

        activePlayerIds.forEach((playerId) => {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState) return;
            if (!this._isLivingDeployedParticipant(playerState.player)) return;

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

    private _applyObjectiveLayers(): void {
        const hillState = this._context.runtime.hill;
        const activeHill = this._context.hills[hillState.currentHillIndex];
        const previewHill =
            hillState.nextPreviewRemainingSeconds > 0 ? this._context.hills[hillState.nextHillIndex] : undefined;

        this._disableAllObjectiveLayers();

        if (previewHill) {
            this._safeEnableSector(previewHill.neutralSectorId, true);
            this._safeEnableCapturePoint(previewHill.neutralCapturePointId, true, KOTH_TEAM_NEUTRAL);
        }

        if (hillState.currentControlState === 'team1') {
            this._safeEnableSector(activeHill.team1SectorId, true);
            this._safeEnableCapturePoint(activeHill.team1CapturePointId, true, KOTH_TEAM_1);
            return;
        }

        if (hillState.currentControlState === 'team2') {
            this._safeEnableSector(activeHill.team2SectorId, true);
            this._safeEnableCapturePoint(activeHill.team2CapturePointId, true, KOTH_TEAM_2);
            return;
        }

        if (hillState.currentControlState === 'neutral' || hillState.currentControlState === 'contested') {
            this._safeEnableSector(activeHill.neutralSectorId, true);
            this._safeEnableCapturePoint(activeHill.neutralCapturePointId, true, KOTH_TEAM_NEUTRAL);
        }
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
        if (this._context.spectatorController?.isSpectator(player)) return false;

        const playerState = this._context.runtime.playersById.get(getPlayerId(player));
        if (!playerState?.isDeployed) return false;

        const team = mod.GetTeam(player);
        return isParticipantTeam(team) && isPlayerAlive(player);
    }
}
