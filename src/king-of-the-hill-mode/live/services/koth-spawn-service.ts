import { Timers } from 'bf6-portal-utils/timers/index.ts';

import type { KothHillConfig, KothHillLetter } from '../config/koth-hills.ts';
import {
    KOTH_PRESENCE_ZONE_AREA_TRIGGER_IDS,
    getOppositeCardinalSide,
    getPresenceZoneForAreaTriggerId,
    getRegionForActiveObjective,
    getSectorKey,
    getVariantSidesForAxis,
    type KothAnchorDistanceScore,
    type KothCardinalSide,
    type KothPresenceZone,
    type KothSpawnCandidateScore,
    type KothSpawnDistanceConfig,
    type KothSpawnRegionConfig,
    type KothSpawnSectorConfig,
    type KothSpawnSectorPressure,
    type KothTeamId,
} from '../config/koth-spawns.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothPlayerState } from '../state/koth-player-state.ts';
import type {
    KothSpawnJob,
    KothSpawnPositionVector,
    KothSpawnSideAssignment,
    QueuedKothSpawnAnchor,
} from '../state/koth-spawn-state.ts';
import {
    displayWorldLog,
    getKothPlayerId,
    getKothTeamId,
    isKothPlayerLiving,
    isKothPlayerManDown,
    isParticipantTeam,
} from './koth-sdk-utils.ts';
import type { KothSpawnJobService } from './koth-spawn-job-service.ts';

const KOTH_REINFORCEMENT_TARGET_TTL_MS = 15000;
const KOTH_FORBIDDEN_SPAWN_POSITION_EPSILON_METERS = 8;
const KOTH_TELEPORT_ORIENTATION_CONFIRM_DELAY_MS = 100;
const KOTH_TELEPORT_ORIENTATION_CONFIRM_DOT_TOLERANCE = 0.85;
const KOTH_LIVE_START_DEPLOY_RECOVERY_DELAY_MS = 250;
const KOTH_LIVE_START_DEPLOY_RECOVERY_WINDOW_MS = 3000;
const KOTH_LIVE_START_DEPLOY_RECOVERY_MAX_ATTEMPTS = 8;

interface ResolvedKothSpawnDestination {
    position: mod.Vector;
    orientationRadians: number;
    label: string;
    pressureZones: readonly KothPresenceZone[];
    anchorObjectId?: number;
}

interface ScoredSpawnCandidateSelection {
    candidate: KothSpawnCandidateScore;
    anchorIndex: number;
}

interface KothSpawnSectorChoice {
    teamSide: KothCardinalSide;
    variantSide: KothCardinalSide;
}

interface KothSpawnSidePressure {
    friendlyCount: number;
    enemyCount: number;
    nearestFriendlyDistanceMeters: number;
    nearestEnemyDistanceMeters: number;
}

interface KothSpawnSidePressurePair {
    firstSide: KothCardinalSide;
    secondSide: KothCardinalSide;
    firstPressure: KothSpawnSidePressure;
    secondPressure: KothSpawnSidePressure;
}

interface KothPreferredTeamSideDecision {
    side: KothCardinalSide;
    enemyDominantSide?: KothCardinalSide;
    isHardPressure: boolean;
}

interface KothSpawnEvaluationPlayer {
    playerState: KothPlayerState;
    playerId: number;
    teamId: KothTeamId;
    position: mod.Vector;
    positionVector: KothSpawnPositionVector;
    presenceZones?: Set<KothPresenceZone>;
}

interface KothSpawnEvaluationContext {
    teamId: KothTeamId;
    enemyTeamId: KothTeamId;
    activeObjectiveLetter: KothHillLetter;
    activeRegion: KothSpawnRegionConfig;
    activeObjectivePosition: mod.Vector;
    activeObjectiveVector: KothSpawnPositionVector;
    assignedTeamSide: KothCardinalSide;
    assignedVariantSide: KothCardinalSide;
    players: KothSpawnEvaluationPlayer[];
}

export class KothSpawnService {
    private readonly _forbiddenSpawnPositionByObjectId = new Map<number, mod.Vector>();
    private readonly _queueSpawnRetryTimeoutByPlayerId = new Map<number, number>();
    private readonly _teleportRetryTimeoutByPlayerId = new Map<number, number>();
    private readonly _orientationConfirmTimeoutByPlayerId = new Map<number, number>();
    private readonly _deployRecoveryTimeoutByPlayerId = new Map<number, number>();

    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _jobService: KothSpawnJobService
    ) {
        this._jobService.setProcessor((job) => this._processSpawnJob(job));
    }

    public configureLiveDeploySpawns(): void {
        this.configureLiveDeploySpawnCore();

        this._context.runtime.playersById.forEach((playerState) => {
            this.configureLiveDeploySpawnForPlayer(playerState.id);
        });
    }

    public configureLiveDeploySpawnCore(): void {
        mod.SetSpawnMode(mod.SpawnModes.Deploy);

        this._safeEnableHq(this._context.spawns.hqSpawners.team1, true);
        this._safeEnableHq(this._context.spawns.hqSpawners.team2, true);

        for (const hqId of this._context.spawns.disabledLegacyHqIds) {
            this._safeEnableHq(hqId, false);
        }

        this._initializePresenceAreaTriggers();
    }

    public configureLiveDeploySpawnForPlayer(playerId: number): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;

        if (this._isLivingDeployedParticipant(playerState)) {
            if (this.isPlayerAtForbiddenSpawnPosition(playerState.player)) {
                this.teleportToQueuedSpawn(playerState.player);
                return;
            }

            mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
            this._seedPlayerPresenceFromQueuedAnchor(playerState);
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return;
        }

        this.queueSpawnForPlayer(playerState.player);
    }

    public reset(): void {
        this._jobService.clearAll();
        this._clearAllSpawnRetryTimeouts();
        this._context.runtime.spawn.queuedAnchorByPlayerId.clear();
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.clear();
        this._clearPresenceState();
        this._context.runtime.spawn.nextAnchorIndexBySectorKey = {};
        this._context.runtime.spawn.sideAssignmentByRegionId = {};
        this._context.runtime.spawn.sideAssignmentChangedAtMsByRegionId = {};
        this._context.runtime.spawn.reinforcementTargetByTeamId = {};
        this._context.runtime.spawn.anchorCooldownUntilMsByObjectId.clear();
        this._context.runtime.spawn.anchorPositionByObjectId.clear();
        this._context.runtime.spawn.anchorPositionVectorByObjectId.clear();
        this._context.runtime.spawn.capturePointPositionByObjectId.clear();
        this._context.runtime.spawn.capturePointPositionVectorByObjectId.clear();
        this._context.runtime.spawn.playerPositionSnapshotByPlayerId.clear();

        for (const triggerId of KOTH_PRESENCE_ZONE_AREA_TRIGGER_IDS) {
            this._safeEnablePresenceAreaTrigger(triggerId, false);
        }
    }

    public clearSpawnJobs(): void {
        this._jobService.clearAll();
        this._clearAllSpawnRetryTimeouts();
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.clear();
    }

    public onObjectiveActivated(): void {
        this._jobService.clearAll();
        this._clearAllSpawnRetryTimeouts();
        this._context.runtime.spawn.queuedAnchorByPlayerId.clear();
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.clear();
        this._context.runtime.spawn.sideAssignmentByRegionId = {};
        this._context.runtime.spawn.sideAssignmentChangedAtMsByRegionId = {};
        this._context.runtime.spawn.reinforcementTargetByTeamId = {};

        this._context.runtime.playersById.forEach((playerState) => {
            if (!mod.IsPlayerValid(playerState.player) || playerState.isDeployed) return;

            this._requestAnchorSpawnForPlayerState(playerState, 0);
        });
    }

    public queueSpawnForPlayer(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        const teamId = getKothTeamId(mod.GetTeam(player));
        if (teamId !== 1 && teamId !== 2) return;

        const playerId = getKothPlayerId(player);
        const playerState = this._context.runtime.playersById.get(playerId);
        if (playerState) {
            this._requestAnchorSpawnForPlayerState(playerState, 0);
            return;
        }

        this._enqueueQueueSpawnJob(playerId, 0);
    }

    public recoverLiveStartPlayer(playerState: KothPlayerState): void {
        if (!mod.IsPlayerValid(playerState.player)) return;

        const teamId = getKothTeamId(mod.GetTeam(playerState.player));
        if (teamId !== 1 && teamId !== 2) return;

        playerState.isDeployed = false;
        this._clearLiveInputRestrictions(playerState.player);
        mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
        this.clearPlayerPresenceCache(playerState.id);
        this._requestAnchorSpawnForPlayerState(playerState, 0);
        this._tryRecoverLiveStartDeploy(playerState);
        this._enqueueLiveStartDeployRecoveryJob(
            playerState.id,
            0,
            KOTH_LIVE_START_DEPLOY_RECOVERY_DELAY_MS,
            this._getMatchTimeMs()
        );
    }

    public queueSpawnForPlayerNow(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        const teamId = getKothTeamId(mod.GetTeam(player));
        if (teamId !== 1 && teamId !== 2) return;

        const playerId = getKothPlayerId(player);
        const activeLetter = this._context.runtime.hill.currentHillLetter;
        const candidate = this._selectBestSpawnCandidateForTeam(teamId, activeLetter);
        if (!candidate) {
            this._warnMissingAnchorsOnce();
            const playerState = this._context.runtime.playersById.get(playerId);
            if (playerState) this._requestAnchorSpawnForPlayerState(playerState, 1);
            return;
        }

        this._queueCandidateForPlayer(playerId, candidate, activeLetter);
    }

    public teleportToQueuedSpawn(player: mod.Player): boolean {
        if (!mod.IsPlayerValid(player)) return false;

        const playerId = getKothPlayerId(player);
        const playerState = this._context.runtime.playersById.get(playerId);
        if (playerState && this._tryTeleportDeployedPlayer(playerState)) return true;

        if (playerState) {
            this._enqueueTeleportDeployedJob(playerState.id, 0);
            this._undeployUnanchoredPlayer(playerState);
        }
        return false;
    }

    public isPlayerAtForbiddenSpawnPosition(player: mod.Player): boolean {
        if (!mod.IsPlayerValid(player)) return false;

        const playerPosition = this._getPlayerPosition(player);
        if (!playerPosition) return false;

        if (this._isNearForbiddenSpawnObject(playerPosition, this._context.spawns.hqSpawners.team1)) return true;
        if (this._isNearForbiddenSpawnObject(playerPosition, this._context.spawns.hqSpawners.team2)) return true;

        for (const hqId of this._context.spawns.disabledLegacyHqIds) {
            if (this._isNearForbiddenSpawnObject(playerPosition, hqId)) return true;
        }

        return false;
    }

    public processSpawnJobs(): void {
        this._jobService.tick((job) => this._processSpawnJob(job));
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const zone = this._getPresenceZoneFromAreaTrigger(eventAreaTrigger);
        if (!zone) return false;
        if (!mod.IsPlayerValid(eventPlayer)) return true;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !this._isLivingDeployedParticipant(playerState)) {
            this.clearPlayerPresenceCache(playerId);
            return true;
        }

        this._addPlayerToPresenceZone(playerId, zone);
        this._flipVariantAssignmentForExactSectorIntrusion(playerId, zone);
        this._recordReinforcementTargetIfEnemySide(playerId, zone);
        return true;
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const zone = this._getPresenceZoneFromAreaTrigger(eventAreaTrigger);
        if (!zone) return false;
        if (!mod.IsPlayerValid(eventPlayer)) return true;

        const playerId = getKothPlayerId(eventPlayer);
        this._removePlayerFromPresenceZone(playerId, zone);
        this._clearInvalidReinforcementTargetForPlayer(playerId);
        return true;
    }

    public removePlayerFromAllPresenceZones(playerId: number): void {
        this.clearPlayerPresenceCache(playerId);
        this.clearQueuedSpawn(playerId);
    }

    public clearPlayerPresenceCache(playerId: number): void {
        this._removePlayerFromAllPresenceZones(playerId);
        this._context.runtime.spawn.playerPositionSnapshotByPlayerId.delete(playerId);
        this._clearReinforcementTargetsForPlayer(playerId);
    }

    public clearQueuedSpawn(playerId: number): void {
        this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerId);
        this._jobService.clearPlayerJobs(playerId);
        this._clearSpawnRetryTimeoutsForPlayer(playerId);
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.delete(playerId);
    }

    public selectBestSpawnCandidate(
        player: mod.Player,
        teamId: KothTeamId,
        activeObjectiveLetter: KothHillLetter
    ): KothSpawnCandidateScore | undefined {
        if (!mod.IsPlayerValid(player)) return undefined;
        return this._selectBestSpawnCandidateForTeam(teamId, activeObjectiveLetter);
    }

    private _processSpawnJob(job: KothSpawnJob): void {
        if (job.kind === 'queue-spawn') {
            this._context.runtime.spawn.pendingQueueSpawnPlayerIds.delete(job.playerId);
        }

        const playerState = this._context.runtime.playersById.get(job.playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;

        if (job.kind === 'queue-spawn') {
            this._prepareQueuedAnchorForPlayer(playerState, job);
            return;
        }

        if (job.kind === 'confirm-teleport-orientation') {
            this._processTeleportOrientationConfirmJob(job, playerState);
            return;
        }

        if (job.kind === 'live-start-deploy-recovery') {
            this._processLiveStartDeployRecoveryJob(job, playerState);
            return;
        }

        this._processDeployTeleportJob(job, playerState);
    }

    private _prepareQueuedAnchorForPlayer(playerState: KothPlayerState, job: KothSpawnJob): void {
        if (!mod.IsPlayerValid(playerState.player)) return;

        if (this._isLivingDeployedParticipant(playerState)) {
            return;
        }

        const teamId = getKothTeamId(mod.GetTeam(playerState.player));
        if (teamId !== 1 && teamId !== 2) return;

        const activeLetter = this._context.runtime.hill.currentHillLetter;
        const candidate = this._selectBestSpawnCandidateForTeam(teamId, activeLetter);
        if (!candidate) {
            this._warnMissingAnchorsOnce();
            this._enqueueQueueSpawnJob(
                playerState.id,
                job.attempt + 1,
                this._context.spawns.rules.spawnRetryWindowMs
            );
            return;
        }

        this._queueCandidateForPlayer(playerState.id, candidate, activeLetter);
    }

    private _requestAnchorSpawnForPlayerState(playerState: KothPlayerState, attempt: number): void {
        if (!mod.IsPlayerValid(playerState.player)) return;
        if (this._isLivingDeployedParticipant(playerState)) return;

        this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
        this._jobService.clearPlayerJobs(playerState.id);
        this._clearSpawnRetryTimeoutsForPlayer(playerState.id);
        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.delete(playerState.id);
        if (attempt <= 0) {
            this._prepareQueuedAnchorForPlayer(playerState, {
                kind: 'queue-spawn',
                playerId: playerState.id,
                createdAtMs: this._getMatchTimeMs(),
                attempt,
            });
            return;
        }

        this._enqueueQueueSpawnJob(playerState.id, attempt);
    }

    private _enqueueQueueSpawnJob(playerId: number, attempt: number, delayMs = 0): void {
        if (this._context.runtime.spawn.pendingQueueSpawnPlayerIds.has(playerId)) return;

        if (delayMs > 0) {
            if (this._queueSpawnRetryTimeoutByPlayerId.has(playerId)) return;

            this._context.runtime.spawn.pendingQueueSpawnPlayerIds.add(playerId);
            const timeoutHandle = Timers.setTimeout(() => {
                this._queueSpawnRetryTimeoutByPlayerId.delete(playerId);
                this._context.runtime.spawn.pendingQueueSpawnPlayerIds.delete(playerId);
                if (!this._context.runtime.isMatchActive) return;
                const playerState = this._context.runtime.playersById.get(playerId);
                if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
                if (this._isLivingDeployedParticipant(playerState)) return;

                this._enqueueQueueSpawnJob(playerId, attempt);
            }, delayMs);
            this._queueSpawnRetryTimeoutByPlayerId.set(playerId, timeoutHandle);
            return;
        }

        this._context.runtime.spawn.pendingQueueSpawnPlayerIds.add(playerId);
        this._jobService.enqueueFront({
            kind: 'queue-spawn',
            playerId,
            createdAtMs: this._getMatchTimeMs(),
            attempt,
        });
    }

    private _enqueueTeleportDeployedJob(playerId: number, attempt: number, delayMs = 0): void {
        if (delayMs > 0) {
            if (this._teleportRetryTimeoutByPlayerId.has(playerId)) return;

            const timeoutHandle = Timers.setTimeout(() => {
                this._teleportRetryTimeoutByPlayerId.delete(playerId);
                if (!this._context.runtime.isMatchActive) return;
                const playerState = this._context.runtime.playersById.get(playerId);
                if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;

                this._enqueueTeleportDeployedJob(playerId, attempt);
            }, delayMs);
            this._teleportRetryTimeoutByPlayerId.set(playerId, timeoutHandle);
            return;
        }

        this._jobService.enqueueFront({
            kind: 'teleport-deployed',
            playerId,
            createdAtMs: this._getMatchTimeMs(),
            attempt,
        });
    }

    private _enqueueTeleportOrientationConfirmJob(playerId: number, delayMs: number): void {
        if (this._orientationConfirmTimeoutByPlayerId.has(playerId)) return;

        const timeoutHandle = Timers.setTimeout(() => {
            this._orientationConfirmTimeoutByPlayerId.delete(playerId);
            if (!this._context.runtime.isMatchActive) return;

            this._jobService.enqueue({
                kind: 'confirm-teleport-orientation',
                playerId,
                createdAtMs: this._getMatchTimeMs(),
                attempt: 0,
            });
        }, delayMs);
        this._orientationConfirmTimeoutByPlayerId.set(playerId, timeoutHandle);
    }

    private _enqueueLiveStartDeployRecoveryJob(
        playerId: number,
        attempt: number,
        delayMs: number,
        createdAtMs: number
    ): void {
        if (this._deployRecoveryTimeoutByPlayerId.has(playerId)) return;

        const timeoutHandle = Timers.setTimeout(() => {
            this._deployRecoveryTimeoutByPlayerId.delete(playerId);
            if (!this._context.runtime.isMatchActive) return;

            this._jobService.enqueueFront({
                kind: 'live-start-deploy-recovery',
                playerId,
                createdAtMs,
                attempt,
            });
        }, delayMs);
        this._deployRecoveryTimeoutByPlayerId.set(playerId, timeoutHandle);
    }

    private _clearSpawnRetryTimeoutsForPlayer(playerId: number): void {
        this._clearQueueSpawnRetryTimeout(playerId);
        this._clearTeleportRetryTimeout(playerId);
        this._clearOrientationConfirmTimeout(playerId);
        this._clearDeployRecoveryTimeout(playerId);
    }

    private _clearAllSpawnRetryTimeouts(): void {
        this._queueSpawnRetryTimeoutByPlayerId.forEach((timeoutHandle) => Timers.clearTimeout(timeoutHandle));
        this._teleportRetryTimeoutByPlayerId.forEach((timeoutHandle) => Timers.clearTimeout(timeoutHandle));
        this._orientationConfirmTimeoutByPlayerId.forEach((timeoutHandle) => Timers.clearTimeout(timeoutHandle));
        this._deployRecoveryTimeoutByPlayerId.forEach((timeoutHandle) => Timers.clearTimeout(timeoutHandle));
        this._queueSpawnRetryTimeoutByPlayerId.clear();
        this._teleportRetryTimeoutByPlayerId.clear();
        this._orientationConfirmTimeoutByPlayerId.clear();
        this._deployRecoveryTimeoutByPlayerId.clear();
    }

    private _clearQueueSpawnRetryTimeout(playerId: number): void {
        const timeoutHandle = this._queueSpawnRetryTimeoutByPlayerId.get(playerId);
        if (timeoutHandle === undefined) return;

        Timers.clearTimeout(timeoutHandle);
        this._queueSpawnRetryTimeoutByPlayerId.delete(playerId);
    }

    private _clearTeleportRetryTimeout(playerId: number): void {
        const timeoutHandle = this._teleportRetryTimeoutByPlayerId.get(playerId);
        if (timeoutHandle === undefined) return;

        Timers.clearTimeout(timeoutHandle);
        this._teleportRetryTimeoutByPlayerId.delete(playerId);
    }

    private _clearOrientationConfirmTimeout(playerId: number): void {
        const timeoutHandle = this._orientationConfirmTimeoutByPlayerId.get(playerId);
        if (timeoutHandle === undefined) return;

        Timers.clearTimeout(timeoutHandle);
        this._orientationConfirmTimeoutByPlayerId.delete(playerId);
    }

    private _clearDeployRecoveryTimeout(playerId: number): void {
        const timeoutHandle = this._deployRecoveryTimeoutByPlayerId.get(playerId);
        if (timeoutHandle === undefined) return;

        Timers.clearTimeout(timeoutHandle);
        this._deployRecoveryTimeoutByPlayerId.delete(playerId);
    }

    private _processDeployTeleportJob(job: KothSpawnJob, playerState: KothPlayerState): void {
        if (!this._isLivingDeployedParticipant(playerState)) return;

        if (this._tryTeleportDeployedPlayer(playerState)) return;

        if (this._shouldRetryTeleport(job)) {
            this._enqueueTeleportDeployedJob(
                playerState.id,
                job.attempt + 1,
                this._context.spawns.rules.spawnRetryWindowMs
            );
            return;
        }

        this._warnTeleportFailedOnce(playerState.id);
    }

    private _processLiveStartDeployRecoveryJob(job: KothSpawnJob, playerState: KothPlayerState): void {
        if (!this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(playerState.player)) return;

        this._clearLiveInputRestrictions(playerState.player);
        mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);

        if (isKothPlayerLiving(playerState.player)) {
            playerState.isDeployed = true;
            if (!this._tryTeleportDeployedPlayer(playerState)) {
                this._enqueueTeleportDeployedJob(playerState.id, 0);
            }
            return;
        }

        this._tryRecoverLiveStartDeploy(playerState);

        if (isKothPlayerLiving(playerState.player)) {
            playerState.isDeployed = true;
            if (!this._tryTeleportDeployedPlayer(playerState)) {
                this._enqueueTeleportDeployedJob(playerState.id, 0);
            }
            return;
        }

        if (
            job.attempt < KOTH_LIVE_START_DEPLOY_RECOVERY_MAX_ATTEMPTS &&
            this._getMatchTimeMs() - job.createdAtMs < KOTH_LIVE_START_DEPLOY_RECOVERY_WINDOW_MS
        ) {
            this._enqueueLiveStartDeployRecoveryJob(
                playerState.id,
                job.attempt + 1,
                KOTH_LIVE_START_DEPLOY_RECOVERY_DELAY_MS,
                job.createdAtMs
            );
        }
    }

    private _tryRecoverLiveStartDeploy(playerState: KothPlayerState): void {
        if (!mod.IsPlayerValid(playerState.player)) return;

        this._clearLiveInputRestrictions(playerState.player);

        try {
            mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
        } catch (_err) {
            return;
        }

        if (isKothPlayerManDown(playerState.player)) {
            try {
                mod.ForceRevive(playerState.player);
                return;
            } catch (_err) {
                return;
            }
        }

        try {
            mod.DeployPlayer(playerState.player);
        } catch (_err) {
            return;
        }
    }

    private _processTeleportOrientationConfirmJob(job: KothSpawnJob, playerState: KothPlayerState): void {
        if (job.attempt > 0) return;
        if (!this._isLivingDeployedParticipant(playerState)) return;

        const position = this._getPlayerPosition(playerState.player);
        if (!position || this._isZeroVector(position)) return;
        if (this._isPlayerFacingActiveObjective(playerState.player, position)) return;

        try {
            mod.Teleport(playerState.player, position, this._yawTowardActiveObjective(position));
        } catch (_err) {
            this._warnTeleportFailedOnce(playerState.id);
        }
    }

    private _tryTeleportDeployedPlayer(playerState: KothPlayerState): boolean {
        if (!this._isLivingDeployedParticipant(playerState)) return false;

        const destination = this._selectTeleportDestination(playerState);
        if (!destination) return false;

        if (!this._teleportPlayer(playerState.id, playerState.player, destination)) return false;

        this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
        return true;
    }

    private _selectTeleportDestination(playerState: KothPlayerState): ResolvedKothSpawnDestination | undefined {
        const teamId = getKothTeamId(playerState.team);
        if (teamId !== 1 && teamId !== 2) return undefined;

        const context = this._createSpawnEvaluationContext(teamId, this._context.runtime.hill.currentHillLetter);
        if (!context) return undefined;

        const queuedDestination = this._selectQueuedDestination(playerState, context);
        if (queuedDestination) return queuedDestination;

        const activeSelection = this._selectBoundedActiveSpawnCandidate(context);
        if (activeSelection && !this._isSpawnCandidateBlockedByQueuedEnemySafety(activeSelection.candidate)) {
            const activeCandidate = this._finalizeSpawnCandidateSelection(context, activeSelection);
            return this._resolveAndQueueCandidateDestination(playerState.id, context, activeCandidate);
        }

        const teammateDestination = this._selectTeammateDestination(playerState, context);
        if (teammateDestination) return teammateDestination;

        if (activeSelection) {
            const activeCandidate = this._finalizeSpawnCandidateSelection(context, activeSelection);
            return this._resolveAndQueueCandidateDestination(playerState.id, context, activeCandidate);
        }

        return undefined;
    }

    private _resolveAndQueueCandidateDestination(
        playerId: number,
        context: KothSpawnEvaluationContext,
        candidate: KothSpawnCandidateScore
    ): ResolvedKothSpawnDestination | undefined {
        this._queueCandidateForPlayer(playerId, candidate, context.activeObjectiveLetter);
        return this._resolveAnchorDestination(candidate.sector, candidate.anchorObjectId, context);
    }

    private _selectTeammateDestination(
        playerState: KothPlayerState,
        context: KothSpawnEvaluationContext
    ): ResolvedKothSpawnDestination | undefined {
        let bestTarget: KothSpawnEvaluationPlayer | undefined;
        let bestDistanceSquared = Number.POSITIVE_INFINITY;
        const minDistanceSquared = this._square(this._context.spawns.safety.teammateTeleportMinObjectiveDistanceMeters);
        const enemySafetyRadius = this._context.spawns.safety.teammateTeleportEnemySafetyRadiusMeters;

        for (const target of context.players) {
            if (target.playerId === playerState.id) continue;
            if (target.teamId !== context.teamId) continue;
            if (this._isPlayerInsideActiveObjective(target.playerState)) continue;
            if (!this._isEvaluationPlayerInEnemySidePresence(target, context)) continue;

            const distanceSquared = this._distanceSquared(target.positionVector, context.activeObjectiveVector);
            if (distanceSquared < minDistanceSquared) continue;
            if (!this._isPositionVectorSafeFromEnemies(target.positionVector, context, enemySafetyRadius)) continue;

            if (distanceSquared >= bestDistanceSquared) continue;
            bestDistanceSquared = distanceSquared;
            bestTarget = target;
        }

        if (!bestTarget) return undefined;

        return {
            position: bestTarget.position,
            orientationRadians: this._yawTowardActiveObjectiveFromVector(bestTarget.positionVector, context),
            label: `teammate-${bestTarget.playerId}`,
            pressureZones: bestTarget.presenceZones ? [...bestTarget.presenceZones] : [],
        };
    }

    private _selectQueuedDestination(
        playerState: KothPlayerState,
        context: KothSpawnEvaluationContext
    ): ResolvedKothSpawnDestination | undefined {
        const queued = this._context.runtime.spawn.queuedAnchorByPlayerId.get(playerState.id);
        if (!queued) return undefined;

        if (queued.selectedForObjectiveLetter !== context.activeObjectiveLetter) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        const sector = this._getSectorForQueuedAnchor(queued);
        if (!sector) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        if (sector.objectiveLetter !== context.activeObjectiveLetter) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        } else if (sector.teamSide !== context.assignedTeamSide || sector.variantSide !== context.assignedVariantSide) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        const destinationVector = this._getAnchorPositionVector(queued.anchorObjectId);
        if (!destinationVector) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        if (
            !this._isPositionVectorSafeFromEnemies(
                destinationVector,
                context,
                this._context.spawns.safety.queuedAnchorEnemySafetyRadiusMeters
            )
        ) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        const distanceScore = this.scoreAnchorVectorDistanceToObjective(
            queued.anchorObjectId,
            destinationVector,
            context.activeObjectiveVector,
            this._getDistanceConfigForSector(sector)
        );
        if (!distanceScore.isWithinHardRange) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        return this._resolveAnchorDestination(sector, queued.anchorObjectId, context);
    }

    private _selectBestSpawnCandidateForTeam(
        teamId: KothTeamId,
        activeObjectiveLetter: KothHillLetter
    ): KothSpawnCandidateScore | undefined {
        const context = this._createSpawnEvaluationContext(teamId, activeObjectiveLetter);
        if (!context) return undefined;

        const activeCandidate = this._selectBestActiveSpawnCandidate(context);
        if (activeCandidate) return activeCandidate;

        return undefined;
    }

    private _selectBestActiveSpawnCandidate(context: KothSpawnEvaluationContext): KothSpawnCandidateScore | undefined {
        const selection = this._selectBoundedActiveSpawnCandidate(context);
        if (selection) return this._finalizeSpawnCandidateSelection(context, selection);

        return undefined;
    }

    private _selectBoundedActiveSpawnCandidate(
        context: KothSpawnEvaluationContext
    ): ScoredSpawnCandidateSelection | undefined {
        let bestUnsafeSelection: ScoredSpawnCandidateSelection | undefined;
        let bestUnsafeScore = Number.MAX_SAFE_INTEGER;
        const sectorChoices = this._getBoundedActiveSectorChoices(context);

        for (let choiceIndex = 0; choiceIndex < sectorChoices.length; choiceIndex++) {
            const choice = sectorChoices[choiceIndex];
            const sector = this._getActiveSectorForChoice(context, choice);
            if (!sector) continue;

            const selection = this._selectBoundedAnchorFromSector(sector, context, choiceIndex);
            if (!selection) continue;
            if (!this._isSpawnCandidateBlockedByQueuedEnemySafety(selection.candidate)) return selection;

            if (selection.candidate.score < bestUnsafeScore) {
                bestUnsafeScore = selection.candidate.score;
                bestUnsafeSelection = selection;
            }
        }

        return bestUnsafeSelection;
    }

    private _getBoundedActiveSectorChoices(context: KothSpawnEvaluationContext): readonly KothSpawnSectorChoice[] {
        const assignedTeamSide = context.assignedTeamSide;
        const oppositeTeamSide = this._getOpposingSideForRegion(context.activeRegion, assignedTeamSide);
        const assignedVariantSide = context.assignedVariantSide;
        const oppositeVariantSide = getOppositeCardinalSide(assignedVariantSide);

        return [
            { teamSide: assignedTeamSide, variantSide: assignedVariantSide },
            { teamSide: assignedTeamSide, variantSide: oppositeVariantSide },
            { teamSide: oppositeTeamSide, variantSide: assignedVariantSide },
            { teamSide: oppositeTeamSide, variantSide: oppositeVariantSide },
        ];
    }

    private _getActiveSectorForChoice(
        context: KothSpawnEvaluationContext,
        choice: KothSpawnSectorChoice
    ): KothSpawnSectorConfig | undefined {
        for (const sector of context.activeRegion.sectors) {
            if (sector.objectiveLetter !== context.activeObjectiveLetter) continue;
            if (sector.teamSide !== choice.teamSide) continue;
            if (sector.variantSide !== choice.variantSide) continue;
            return sector;
        }

        return undefined;
    }

    private _selectBoundedAnchorFromSector(
        sector: KothSpawnSectorConfig,
        context: KothSpawnEvaluationContext,
        choiceIndex: number
    ): ScoredSpawnCandidateSelection | undefined {
        const anchorCount = sector.anchorObjectIds.length;
        if (anchorCount <= 0) return undefined;

        let bestUnsafeSelection: ScoredSpawnCandidateSelection | undefined;
        let bestUnsafeScore = Number.MAX_SAFE_INTEGER;
        let bestCooldownSelection: ScoredSpawnCandidateSelection | undefined;
        let bestCooldownUntilMs = Number.MAX_SAFE_INTEGER;
        let bestCooldownScore = Number.MAX_SAFE_INTEGER;
        const startIndex = this._getRandomAnchorStartIndex(anchorCount);
        const nowMs = this._getMatchTimeMs();

        for (let offset = 0; offset < anchorCount; offset++) {
            const anchorIndex = (startIndex + offset) % anchorCount;
            const anchorObjectId = sector.anchorObjectIds[anchorIndex];
            const candidate = this._createActiveSpawnCandidate(sector, anchorObjectId, context, choiceIndex, offset);
            if (!candidate) continue;

            const selection = { anchorIndex, candidate };
            const isEnemyBlocked = this._isSpawnCandidateBlockedByQueuedEnemySafety(candidate);
            const cooldownUntilMs = this._getAnchorCooldownUntilMs(anchorObjectId);
            const isCooldownBlocked = cooldownUntilMs > nowMs;

            if (!isEnemyBlocked && !isCooldownBlocked) return selection;

            if (isCooldownBlocked && this._isBetterCooldownFallback(candidate, cooldownUntilMs, bestCooldownScore, bestCooldownUntilMs)) {
                bestCooldownSelection = selection;
                bestCooldownUntilMs = cooldownUntilMs;
                bestCooldownScore = candidate.score;
            }

            if (isEnemyBlocked && !isCooldownBlocked && candidate.score < bestUnsafeScore) {
                bestUnsafeScore = candidate.score;
                bestUnsafeSelection = selection;
            }
        }

        return bestCooldownSelection ?? bestUnsafeSelection;
    }

    private _createActiveSpawnCandidate(
        sector: KothSpawnSectorConfig,
        anchorObjectId: number,
        context: KothSpawnEvaluationContext,
        choiceIndex: number,
        anchorOffset: number
    ): KothSpawnCandidateScore | undefined {
        if (this._isForbiddenSpawnAnchorObjectId(anchorObjectId)) return undefined;

        const destinationVector = this._getAnchorPositionVector(anchorObjectId);
        if (!destinationVector) return undefined;

        const distanceScore = this.scoreAnchorVectorDistanceToObjective(
            anchorObjectId,
            destinationVector,
            context.activeObjectiveVector,
            this._getDistanceConfigForSector(sector)
        );
        const enemyCount = this._countEnemiesNearPositionVector(
            destinationVector,
            context,
            this._context.spawns.safety.queuedAnchorEnemySafetyRadiusMeters
        );
        const enemySafetyPenalty = enemyCount * this._context.spawns.safety.unsafeAnchorPenalty;
        const sectorPressure = this.scoreSectorPressure(sector, context.teamId);
        const score =
            enemySafetyPenalty +
            choiceIndex * 100 +
            distanceScore.distancePenalty +
            anchorOffset * 0.01;

        return {
            sector,
            anchorObjectId,
            score,
            sectorPressure,
            distanceToObjectiveMeters: distanceScore.distanceToObjectiveMeters,
            distancePenalty: distanceScore.distancePenalty,
            enemySafetyPenalty,
            isPreferredDistance: distanceScore.isWithinPreferredRange,
            isEmergencyFallback: choiceIndex > 0 || enemySafetyPenalty > 0,
        };
    }

    private _isSpawnCandidateBlockedByQueuedEnemySafety(candidate: KothSpawnCandidateScore): boolean {
        return candidate.enemySafetyPenalty > 0;
    }

    private _isBetterCooldownFallback(
        candidate: KothSpawnCandidateScore,
        cooldownUntilMs: number,
        currentBestScore: number,
        currentBestCooldownUntilMs: number
    ): boolean {
        if (candidate.score !== currentBestScore) return candidate.score < currentBestScore;
        return cooldownUntilMs < currentBestCooldownUntilMs;
    }

    private _getAnchorCooldownUntilMs(anchorObjectId: number): number {
        return this._context.runtime.spawn.anchorCooldownUntilMsByObjectId.get(anchorObjectId) ?? 0;
    }

    private _markAnchorCooldown(anchorObjectId: number): void {
        this._context.runtime.spawn.anchorCooldownUntilMsByObjectId.set(
            anchorObjectId,
            this._getMatchTimeMs() + this._context.spawns.rules.anchorReuseCooldownMs
        );
    }

    private _getRandomAnchorStartIndex(anchorCount: number): number {
        if (anchorCount <= 1) return 0;

        return Math.floor(Math.random() * anchorCount) % anchorCount;
    }

    public scoreSectorPressure(sector: KothSpawnSectorConfig, teamId: KothTeamId): KothSpawnSectorPressure {
        const enemyTeamId = this._getEnemyTeamId(teamId);
        let friendlyCount = 0;
        let enemyCount = 0;

        for (const zone of sector.pressureZones) {
            const snapshot = this._context.runtime.spawn.pressureSnapshotByPresenceZone[zone];
            const team1Count = snapshot.team1Count;
            const team2Count = snapshot.team2Count;
            friendlyCount += teamId === 1 ? team1Count : team2Count;
            enemyCount += enemyTeamId === 1 ? team1Count : team2Count;
        }

        const pressureConfig = this._context.spawns.pressure;

        return {
            friendlyCount,
            enemyCount,
            score: enemyCount * pressureConfig.enemyPressurePenalty - friendlyCount * pressureConfig.friendlyPresenceBonus,
            isEnemyHeavy: enemyCount > friendlyCount || enemyCount >= pressureConfig.enemyHeavyThreshold,
        };
    }

    public scoreAnchorDistanceToObjective(
        anchorObjectId: number,
        anchorPosition: mod.Vector,
        activeObjectivePosition: mod.Vector,
        distanceConfig: KothSpawnDistanceConfig
    ): KothAnchorDistanceScore {
        return this.scoreAnchorVectorDistanceToObjective(
            anchorObjectId,
            this._toPositionVector(anchorPosition),
            this._toPositionVector(activeObjectivePosition),
            distanceConfig
        );
    }

    public scoreAnchorVectorDistanceToObjective(
        anchorObjectId: number,
        anchorPosition: KothSpawnPositionVector,
        activeObjectivePosition: KothSpawnPositionVector,
        distanceConfig: KothSpawnDistanceConfig
    ): KothAnchorDistanceScore {
        const distanceToObjectiveMeters = Math.sqrt(
            this._distanceSquared(anchorPosition, activeObjectivePosition)
        );
        const distanceErrorMeters = Math.abs(distanceToObjectiveMeters - distanceConfig.idealObjectiveDistanceMeters);
        const isWithinPreferredRange =
            distanceToObjectiveMeters >= distanceConfig.minObjectiveDistanceMeters &&
            distanceToObjectiveMeters <= distanceConfig.maxObjectiveDistanceMeters;
        const isWithinHardRange = distanceToObjectiveMeters <= distanceConfig.hardMaxObjectiveDistanceMeters;
        let distancePenalty = distanceErrorMeters * distanceConfig.distancePenaltyPerMeter;

        if (!isWithinPreferredRange) {
            distancePenalty += 100;
        }

        if (!isWithinHardRange) {
            distancePenalty += 1000;
        }

        return {
            anchorObjectId,
            distanceToObjectiveMeters,
            distanceErrorMeters,
            isWithinPreferredRange,
            isWithinHardRange,
            distancePenalty,
        };
    }

    private _createSpawnEvaluationContext(
        teamId: KothTeamId,
        activeObjectiveLetter: KothHillLetter
    ): KothSpawnEvaluationContext | undefined {
        const activeRegion = getRegionForActiveObjective(activeObjectiveLetter);
        if (!activeRegion) return undefined;

        const activeObjectivePosition = this._getActiveObjectivePosition(activeObjectiveLetter);
        if (!activeObjectivePosition) return undefined;

        const activeObjectiveVector = this._toPositionVector(activeObjectivePosition);
        const players: KothSpawnEvaluationPlayer[] = [];
        this._context.runtime.spawn.playerPositionSnapshotByPlayerId.clear();

        this._context.runtime.playersById.forEach((playerState) => {
            if (!this._isLivingDeployedParticipant(playerState)) return;

            const playerTeamId = getKothTeamId(playerState.team);
            if (playerTeamId !== 1 && playerTeamId !== 2) return;

            const position = this._getPlayerPosition(playerState.player);
            if (!position || this._isZeroVector(position)) return;

            const positionVector = this._toPositionVector(position);
            this._context.runtime.spawn.playerPositionSnapshotByPlayerId.set(playerState.id, {
                playerId: playerState.id,
                teamId: playerTeamId,
                position: positionVector,
            });
            players.push({
                playerState,
                playerId: playerState.id,
                teamId: playerTeamId,
                position,
                positionVector,
                presenceZones: this._context.runtime.spawn.presenceZonesByPlayerId.get(playerState.id),
            });
        });

        return {
            teamId,
            enemyTeamId: this._getEnemyTeamId(teamId),
            activeObjectiveLetter,
            activeRegion,
            activeObjectivePosition,
            activeObjectiveVector,
            assignedTeamSide: this._refreshAssignedTeamSideForPressure(activeRegion, teamId, activeObjectivePosition),
            assignedVariantSide: this._getAssignedVariantSide(activeRegion, teamId),
            players,
        };
    }

    private _isEvaluationPlayerInEnemySidePresence(
        player: KothSpawnEvaluationPlayer,
        context: KothSpawnEvaluationContext
    ): boolean {
        const zones = player.presenceZones;
        if (!zones) return false;

        for (const zone of zones) {
            const zoneTeamSide = this._getTeamSideForPresenceZone(context.activeRegion, zone);
            if (zoneTeamSide && zoneTeamSide !== context.assignedTeamSide) return true;
        }

        return false;
    }

    private _refreshAssignedTeamSideForPressure(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): KothCardinalSide {
        const currentSide = this._getAssignedTeamSide(region, teamId);
        const decision = this._getPreferredTeamSideForPressure(region, teamId, activeObjectivePosition);
        if (!decision || decision.side === currentSide) return currentSide;

        const currentSideHardBlocked =
            decision.enemyDominantSide === currentSide || this._isTeamSideHardBlocked(region, currentSide, teamId, activeObjectivePosition);
        const lastChangedAt = this._context.runtime.spawn.sideAssignmentChangedAtMsByRegionId[region.regionId];
        const elapsedSinceChange = this._getMatchTimeMs() - (lastChangedAt ?? 0);
        const canFlipByCooldown = lastChangedAt === undefined || elapsedSinceChange >= this._context.spawns.frontline.sideFlipCooldownMs;

        if (!decision.isHardPressure && !currentSideHardBlocked && !canFlipByCooldown) return currentSide;

        this._setSideAssignmentForTeam(region, teamId, decision.side);
        return decision.side;
    }

    private _getPreferredTeamSideForPressure(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): KothPreferredTeamSideDecision | undefined {
        const pair = this._getSidePressurePair(region, teamId, activeObjectivePosition);
        if (pair.firstPressure.enemyCount <= 0 && pair.secondPressure.enemyCount <= 0) return undefined;

        const enemyDelta = pair.firstPressure.enemyCount - pair.secondPressure.enemyCount;
        const minDelta = this._context.spawns.frontline.enemyDominantSideMinDelta;
        if (enemyDelta >= minDelta) {
            return {
                side: pair.secondSide,
                enemyDominantSide: pair.firstSide,
                isHardPressure: true,
            };
        }

        if (enemyDelta <= -minDelta) {
            return {
                side: pair.firstSide,
                enemyDominantSide: pair.secondSide,
                isHardPressure: true,
            };
        }

        const distanceMargin = this._context.spawns.frontline.friendlyAnchorMarginMeters;
        if (pair.firstPressure.nearestEnemyDistanceMeters >= pair.secondPressure.nearestEnemyDistanceMeters + distanceMargin) {
            return {
                side: pair.firstSide,
                isHardPressure: false,
            };
        }

        if (pair.secondPressure.nearestEnemyDistanceMeters >= pair.firstPressure.nearestEnemyDistanceMeters + distanceMargin) {
            return {
                side: pair.secondSide,
                isHardPressure: false,
            };
        }

        return undefined;
    }

    private _getSidePressurePair(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): KothSpawnSidePressurePair {
        const firstSide = region.opposingSides[0];
        const secondSide = region.opposingSides[1];

        return {
            firstSide,
            secondSide,
            firstPressure: this._scoreSidePressure(region, firstSide, teamId, activeObjectivePosition),
            secondPressure: this._scoreSidePressure(region, secondSide, teamId, activeObjectivePosition),
        };
    }

    private _scoreSidePressure(
        region: KothSpawnRegionConfig,
        side: KothCardinalSide,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): KothSpawnSidePressure {
        void activeObjectivePosition;

        const enemyTeamId = this._getEnemyTeamId(teamId);
        let friendlyCount = 0;
        let enemyCount = 0;

        for (const zone of this._getPresenceZonesForTeamSide(region, side)) {
            const snapshot = this._context.runtime.spawn.pressureSnapshotByPresenceZone[zone];
            const team1Count = snapshot.team1Count;
            const team2Count = snapshot.team2Count;
            friendlyCount += teamId === 1 ? team1Count : team2Count;
            enemyCount += enemyTeamId === 1 ? team1Count : team2Count;
        }

        return {
            friendlyCount,
            enemyCount,
            nearestFriendlyDistanceMeters: Number.POSITIVE_INFINITY,
            nearestEnemyDistanceMeters: Number.POSITIVE_INFINITY,
        };
    }

    private _isTeamSideHardBlocked(
        region: KothSpawnRegionConfig,
        side: KothCardinalSide,
        teamId: KothTeamId,
        activeObjectivePosition: mod.Vector
    ): boolean {
        const sidePressure = this._scoreSidePressure(region, side, teamId, activeObjectivePosition);
        if (sidePressure.enemyCount >= this._context.spawns.pressure.enemyHeavyThreshold) return true;

        const sideSectors = region.sectors.filter((sector) => sector.teamSide === side);
        if (sideSectors.length <= 0) return true;

        for (const sector of sideSectors) {
            if (!this.scoreSectorPressure(sector, teamId).isEnemyHeavy) return false;
        }

        return true;
    }

    private _finalizeSpawnCandidateSelection(
        context: KothSpawnEvaluationContext,
        selection: ScoredSpawnCandidateSelection
    ): KothSpawnCandidateScore {
        this._applyAssignmentForCandidateSector(context, selection.candidate.sector);
        this._setNextAnchorIndex(selection.candidate.sector, selection.anchorIndex + 1);
        return selection.candidate;
    }

    private _applyAssignmentForCandidateSector(
        context: KothSpawnEvaluationContext,
        sector: KothSpawnSectorConfig
    ): void {
        const region = this._getRegionForSector(sector);
        if (!region) return;

        const currentSide = this._getAssignedTeamSide(region, context.teamId);
        const currentVariantSide = this._getAssignedVariantSide(region, context.teamId);
        if (currentSide === sector.teamSide && currentVariantSide === sector.variantSide) return;

        this._setSideAndVariantAssignmentForTeam(region, context.teamId, sector.teamSide, sector.variantSide);

        if (region.regionId === context.activeRegion.regionId) {
            context.assignedTeamSide = this._getAssignedTeamSide(region, context.teamId);
            context.assignedVariantSide = this._getAssignedVariantSide(region, context.teamId);
        }
    }

    private _getRegionForSector(sector: KothSpawnSectorConfig): KothSpawnRegionConfig | undefined {
        for (const region of this._context.spawns.regions) {
            if (region.regionId === sector.regionId) return region;
        }

        return undefined;
    }

    private _setSideAssignmentForTeam(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        teamSide: KothCardinalSide
    ): void {
        const current = this._getOrCreateSideAssignment(region);
        const teamVariantSide = teamId === 1 ? current.team1VariantSide : current.team2VariantSide;
        this._setSideAndVariantAssignmentForTeam(region, teamId, teamSide, teamVariantSide);
    }

    private _setSideAndVariantAssignmentForTeam(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        teamSide: KothCardinalSide,
        variantSide: KothCardinalSide
    ): void {
        const current = this._getOrCreateSideAssignment(region);
        const nextAssignment = this._createAssignmentForTeam(region, teamId, teamSide, variantSide);

        if (this._isSameSideAssignment(current, nextAssignment)) return;

        this._context.runtime.spawn.sideAssignmentByRegionId[region.regionId] = nextAssignment;
        this._context.runtime.spawn.sideAssignmentChangedAtMsByRegionId[region.regionId] = this._getMatchTimeMs();
    }

    private _getOpposingSideForRegion(region: KothSpawnRegionConfig, side: KothCardinalSide): KothCardinalSide {
        return region.opposingSides[0] === side ? region.opposingSides[1] : region.opposingSides[0];
    }

    private _queueCandidateForPlayer(
        playerId: number,
        candidate: KothSpawnCandidateScore,
        selectedForObjectiveLetter: KothHillLetter
    ): void {
        if (!this._resolveAnchorDestination(candidate.sector, candidate.anchorObjectId)) return;

        this._context.runtime.spawn.queuedAnchorByPlayerId.set(playerId, {
            regionId: candidate.sector.regionId,
            selectedForObjectiveLetter,
            objectiveLetter: candidate.sector.objectiveLetter,
            teamSide: candidate.sector.teamSide,
            variantSide: candidate.sector.variantSide,
            anchorObjectId: candidate.anchorObjectId,
            distanceToObjectiveMeters: candidate.distanceToObjectiveMeters,
            isEmergencyFallback: candidate.isEmergencyFallback,
        });
        this._markAnchorCooldown(candidate.anchorObjectId);
    }

    private _getDistanceConfigForSector(sector: KothSpawnSectorConfig): KothSpawnDistanceConfig {
        const globalDistance = this._context.spawns.distance;

        return {
            idealObjectiveDistanceMeters: sector.idealDistanceMeters ?? globalDistance.idealObjectiveDistanceMeters,
            minObjectiveDistanceMeters: sector.minDistanceMeters ?? globalDistance.minObjectiveDistanceMeters,
            maxObjectiveDistanceMeters: sector.maxDistanceMeters ?? globalDistance.maxObjectiveDistanceMeters,
            hardMaxObjectiveDistanceMeters: globalDistance.hardMaxObjectiveDistanceMeters,
            distancePenaltyPerMeter: globalDistance.distancePenaltyPerMeter,
        };
    }

    private _getAssignedTeamSide(region: KothSpawnRegionConfig, teamId: KothTeamId): KothCardinalSide {
        const assignment = this._getOrCreateSideAssignment(region);
        return teamId === 1 ? assignment.team1Side : assignment.team2Side;
    }

    private _getAssignedVariantSide(region: KothSpawnRegionConfig, teamId: KothTeamId): KothCardinalSide {
        const assignment = this._getOrCreateSideAssignment(region);
        return teamId === 1 ? assignment.team1VariantSide : assignment.team2VariantSide;
    }

    private _getOrCreateSideAssignment(region: KothSpawnRegionConfig): KothSpawnSideAssignment {
        const existing = this._context.runtime.spawn.sideAssignmentByRegionId[region.regionId];
        if (existing) {
            const normalized = this._normalizeSideAssignment(region, existing);
            if (!this._isSameSideAssignment(existing, normalized)) {
                this._context.runtime.spawn.sideAssignmentByRegionId[region.regionId] = normalized;
            }
            return normalized;
        }

        const assignment = this._normalizeSideAssignment(region, {
            team1Side: region.defaultTeamSideByTeamId[1],
            team2Side: region.defaultTeamSideByTeamId[2],
            team1VariantSide: this._getDefaultVariantSide(region, 1),
            team2VariantSide: this._getDefaultVariantSide(region, 2),
        });

        this._context.runtime.spawn.sideAssignmentByRegionId[region.regionId] = assignment;
        return assignment;
    }

    private _setVariantAssignmentForTeam(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        variantSide: KothCardinalSide
    ): void {
        const current = this._getOrCreateSideAssignment(region);
        const teamSide = teamId === 1 ? current.team1Side : current.team2Side;
        this._setSideAndVariantAssignmentForTeam(region, teamId, teamSide, variantSide);
    }

    private _createAssignmentForTeam(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId,
        teamSide: KothCardinalSide,
        variantSide: KothCardinalSide
    ): KothSpawnSideAssignment {
        const otherSide = this._getOpposingSideForRegion(region, teamSide);
        const otherVariantSide = getOppositeCardinalSide(variantSide);

        return this._normalizeSideAssignment(
            region,
            teamId === 1
                ? {
                      team1Side: teamSide,
                      team2Side: otherSide,
                      team1VariantSide: variantSide,
                      team2VariantSide: otherVariantSide,
                  }
                : {
                      team1Side: otherSide,
                      team2Side: teamSide,
                      team1VariantSide: otherVariantSide,
                      team2VariantSide: variantSide,
                  }
        );
    }

    private _normalizeSideAssignment(
        region: KothSpawnRegionConfig,
        assignment: KothSpawnSideAssignment
    ): KothSpawnSideAssignment {
        const team1Side = this._isRegionTeamSide(region, assignment.team1Side)
            ? assignment.team1Side
            : region.defaultTeamSideByTeamId[1];
        const team2Side =
            this._isRegionTeamSide(region, assignment.team2Side) && assignment.team2Side !== team1Side
                ? assignment.team2Side
                : this._getOpposingSideForRegion(region, team1Side);
        const team1VariantSide = this._isRegionVariantSide(region, assignment.team1VariantSide)
            ? assignment.team1VariantSide
            : this._getDefaultVariantSide(region, 1);
        const team2VariantSide =
            this._isRegionVariantSide(region, assignment.team2VariantSide) &&
            assignment.team2VariantSide !== team1VariantSide
                ? assignment.team2VariantSide
                : getOppositeCardinalSide(team1VariantSide);

        return {
            team1Side,
            team2Side,
            team1VariantSide,
            team2VariantSide,
        };
    }

    private _getDefaultVariantSide(region: KothSpawnRegionConfig, teamId: KothTeamId): KothCardinalSide {
        const configured = region.defaultVariantSideByTeamId?.[teamId];
        if (configured && this._isRegionVariantSide(region, configured)) return configured;

        const variantSides = getVariantSidesForAxis(region.axis);
        return teamId === 1 ? variantSides[0] : variantSides[1];
    }

    private _isRegionTeamSide(region: KothSpawnRegionConfig, side: KothCardinalSide): boolean {
        return side === region.opposingSides[0] || side === region.opposingSides[1];
    }

    private _isRegionVariantSide(region: KothSpawnRegionConfig, side: KothCardinalSide): boolean {
        for (const variantSide of getVariantSidesForAxis(region.axis)) {
            if (side === variantSide) return true;
        }

        return false;
    }

    private _isSameSideAssignment(first: KothSpawnSideAssignment, second: KothSpawnSideAssignment): boolean {
        return (
            first.team1Side === second.team1Side &&
            first.team2Side === second.team2Side &&
            first.team1VariantSide === second.team1VariantSide &&
            first.team2VariantSide === second.team2VariantSide
        );
    }

    private _getSectorForQueuedAnchor(queued: QueuedKothSpawnAnchor): KothSpawnSectorConfig | undefined {
        for (const region of this._context.spawns.regions) {
            if (!this._isObjectiveSpawnRegion(region)) continue;
            if (region.regionId !== queued.regionId) continue;

            for (const sector of region.sectors) {
                if (
                    sector.teamSide === queued.teamSide &&
                    sector.variantSide === queued.variantSide &&
                    this._sectorHasAnchorObjectId(sector, queued.anchorObjectId)
                ) {
                    return sector;
                }
            }
        }

        return undefined;
    }

    private _isObjectiveSpawnRegion(region: KothSpawnRegionConfig): boolean {
        return region.objectiveLetter !== undefined;
    }

    private _isObjectiveSpawnSector(sector: KothSpawnSectorConfig): boolean {
        return sector.objectiveLetter !== undefined;
    }

    private _isConfiguredObjectiveAnchorObjectId(objectId: number): boolean {
        for (const region of this._context.spawns.regions) {
            if (!this._isObjectiveSpawnRegion(region)) continue;

            for (const sector of region.sectors) {
                if (!this._isObjectiveSpawnSector(sector)) continue;
                if (this._sectorHasAnchorObjectId(sector, objectId)) return true;
            }
        }

        return false;
    }

    private _sectorHasAnchorObjectId(sector: KothSpawnSectorConfig, objectId: number): boolean {
        for (const anchorObjectId of sector.anchorObjectIds) {
            if (anchorObjectId === objectId) return true;
        }

        return false;
    }

    private _initializePresenceAreaTriggers(): void {
        this._clearPresenceState();

        for (const triggerId of KOTH_PRESENCE_ZONE_AREA_TRIGGER_IDS) {
            this._safeEnablePresenceAreaTrigger(triggerId, true);
        }
    }

    private _clearPresenceState(): void {
        this._context.runtime.spawn.presenceZonesByPlayerId.clear();
        this._context.runtime.spawn.playersByPresenceZone.northWest.clear();
        this._context.runtime.spawn.playersByPresenceZone.northEast.clear();
        this._context.runtime.spawn.playersByPresenceZone.southWest.clear();
        this._context.runtime.spawn.playersByPresenceZone.southEast.clear();
        this._refreshAllPresenceZonePressureSnapshots();
    }

    private _addPlayerToPresenceZone(playerId: number, zone: KothPresenceZone): void {
        this._context.runtime.spawn.playersByPresenceZone[zone].add(playerId);

        let zones = this._context.runtime.spawn.presenceZonesByPlayerId.get(playerId);
        if (!zones) {
            zones = new Set<KothPresenceZone>();
            this._context.runtime.spawn.presenceZonesByPlayerId.set(playerId, zones);
        }

        zones.add(zone);
        this._refreshPresenceZonePressureSnapshot(zone);
    }

    private _removePlayerFromPresenceZone(playerId: number, zone: KothPresenceZone): void {
        this._context.runtime.spawn.playersByPresenceZone[zone].delete(playerId);

        const zones = this._context.runtime.spawn.presenceZonesByPlayerId.get(playerId);
        if (!zones) return;

        zones.delete(zone);
        if (zones.size <= 0) {
            this._context.runtime.spawn.presenceZonesByPlayerId.delete(playerId);
        }
        this._refreshPresenceZonePressureSnapshot(zone);
    }

    private _removePlayerFromAllPresenceZones(playerId: number): void {
        let removedNorthWest = this._context.runtime.spawn.playersByPresenceZone.northWest.delete(playerId);
        let removedNorthEast = this._context.runtime.spawn.playersByPresenceZone.northEast.delete(playerId);
        let removedSouthWest = this._context.runtime.spawn.playersByPresenceZone.southWest.delete(playerId);
        let removedSouthEast = this._context.runtime.spawn.playersByPresenceZone.southEast.delete(playerId);
        this._context.runtime.spawn.presenceZonesByPlayerId.delete(playerId);

        if (removedNorthWest) this._refreshPresenceZonePressureSnapshot('northWest');
        if (removedNorthEast) this._refreshPresenceZonePressureSnapshot('northEast');
        if (removedSouthWest) this._refreshPresenceZonePressureSnapshot('southWest');
        if (removedSouthEast) this._refreshPresenceZonePressureSnapshot('southEast');
    }

    private _setPlayerPresenceZonesFromTeleport(playerId: number, zones: readonly KothPresenceZone[]): void {
        this._removePlayerFromAllPresenceZones(playerId);
        for (const zone of zones) {
            this._addPlayerToPresenceZone(playerId, zone);
        }
    }

    private _refreshAllPresenceZonePressureSnapshots(): void {
        for (const zone of this._context.spawns.presenceZones) {
            this._refreshPresenceZonePressureSnapshot(zone.zone);
        }
    }

    private _refreshPresenceZonePressureSnapshot(zone: KothPresenceZone): void {
        let team1Count = 0;
        let team2Count = 0;

        this._context.runtime.spawn.playersByPresenceZone[zone].forEach((playerId) => {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;

            const teamId = getKothTeamId(playerState.team);
            if (teamId === 1) {
                team1Count += 1;
            } else if (teamId === 2) {
                team2Count += 1;
            }
        });

        const current = this._context.runtime.spawn.pressureSnapshotByPresenceZone[zone];
        this._context.runtime.spawn.pressureSnapshotByPresenceZone[zone] = {
            team1Count,
            team2Count,
            revision: current.revision + 1,
        };
    }

    private _seedPlayerPresenceFromQueuedAnchor(playerState: KothPlayerState): void {
        const queued = this._context.runtime.spawn.queuedAnchorByPlayerId.get(playerState.id);
        if (!queued) return;

        const sector = this._getSectorForQueuedAnchor(queued);
        if (!sector) return;

        this._setPlayerPresenceZonesFromTeleport(playerState.id, sector.pressureZones);
    }

    private _getPresenceZoneFromAreaTrigger(eventAreaTrigger: mod.AreaTrigger): KothPresenceZone | undefined {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined) return undefined;

        return getPresenceZoneForAreaTriggerId(triggerId);
    }

    private _flipVariantAssignmentForExactSectorIntrusion(playerId: number, zone: KothPresenceZone): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;

        const teamId = getKothTeamId(playerState.team);
        if (teamId !== 1 && teamId !== 2) return;

        const activeRegion = getRegionForActiveObjective(this._context.runtime.hill.currentHillLetter);
        if (!activeRegion) return;

        const zoneTeamSide = this._getTeamSideForPresenceZone(activeRegion, zone);
        const zoneVariantSide = this._getVariantSideForPresenceZone(activeRegion, zone);
        if (!zoneTeamSide || !zoneVariantSide) return;

        const enemyTeamId = this._getEnemyTeamId(teamId);
        if (zoneTeamSide !== this._getAssignedTeamSide(activeRegion, enemyTeamId)) return;
        if (zoneVariantSide !== this._getAssignedVariantSide(activeRegion, enemyTeamId)) return;

        this._setVariantAssignmentForTeam(activeRegion, teamId, zoneVariantSide);
    }

    private _recordReinforcementTargetIfEnemySide(playerId: number, zone: KothPresenceZone): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;
        if (this._isPlayerInsideActiveObjective(playerState)) return;

        const teamId = getKothTeamId(playerState.team);
        if (teamId !== 1 && teamId !== 2) return;

        const activeRegion = getRegionForActiveObjective(this._context.runtime.hill.currentHillLetter);
        if (!activeRegion) return;
        const activeObjectivePosition = this._getActiveObjectivePosition(this._context.runtime.hill.currentHillLetter);
        if (!activeObjectivePosition) return;

        const zoneTeamSide = this._getTeamSideForPresenceZone(activeRegion, zone);
        if (!zoneTeamSide) return;

        const assignedTeamSide = this._refreshAssignedTeamSideForPressure(activeRegion, teamId, activeObjectivePosition);
        if (zoneTeamSide === assignedTeamSide) return;

        this._context.runtime.spawn.reinforcementTargetByTeamId[teamId] = {
            playerId,
            teamId,
            createdAtMs: this._getMatchTimeMs(),
        };
    }

    private _isReinforcementTargetValid(playerId: number, teamId: KothTeamId, createdAtMs: number): boolean {
        if (this._getMatchTimeMs() - createdAtMs > KOTH_REINFORCEMENT_TARGET_TTL_MS) return false;

        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !this._isLivingDeployedParticipant(playerState)) return false;
        if (getKothTeamId(playerState.team) !== teamId) return false;
        if (this._isPlayerInsideActiveObjective(playerState)) return false;

        return this._isPlayerInEnemySidePresence(playerId, teamId);
    }

    private _isPlayerInEnemySidePresence(playerId: number, teamId: KothTeamId): boolean {
        const activeRegion = getRegionForActiveObjective(this._context.runtime.hill.currentHillLetter);
        if (!activeRegion) return false;
        const activeObjectivePosition = this._getActiveObjectivePosition(this._context.runtime.hill.currentHillLetter);
        if (!activeObjectivePosition) return false;

        const assignedTeamSide = this._refreshAssignedTeamSideForPressure(activeRegion, teamId, activeObjectivePosition);
        const zones = this._context.runtime.spawn.presenceZonesByPlayerId.get(playerId);
        if (!zones) return false;

        for (const zone of zones) {
            const zoneTeamSide = this._getTeamSideForPresenceZone(activeRegion, zone);
            if (zoneTeamSide && zoneTeamSide !== assignedTeamSide) return true;
        }

        return false;
    }

    private _getTeamSideForPresenceZone(
        region: KothSpawnRegionConfig,
        zone: KothPresenceZone
    ): KothCardinalSide | undefined {
        if (region.axis === 'horizontal') {
            if (zone === 'northWest' || zone === 'southWest') return 'west';
            if (zone === 'northEast' || zone === 'southEast') return 'east';
            return undefined;
        }

        if (zone === 'northWest' || zone === 'northEast') return 'north';
        if (zone === 'southWest' || zone === 'southEast') return 'south';
        return undefined;
    }

    private _getVariantSideForPresenceZone(
        region: KothSpawnRegionConfig,
        zone: KothPresenceZone
    ): KothCardinalSide | undefined {
        if (region.axis === 'horizontal') {
            if (zone === 'northWest' || zone === 'northEast') return 'north';
            if (zone === 'southWest' || zone === 'southEast') return 'south';
            return undefined;
        }

        if (zone === 'northWest' || zone === 'southWest') return 'west';
        if (zone === 'northEast' || zone === 'southEast') return 'east';
        return undefined;
    }

    private _getPresenceZonesForTeamSide(
        region: KothSpawnRegionConfig,
        side: KothCardinalSide
    ): readonly KothPresenceZone[] {
        if (region.axis === 'horizontal') {
            if (side === 'west') return ['northWest', 'southWest'];
            if (side === 'east') return ['northEast', 'southEast'];
            return [];
        }

        if (side === 'north') return ['northWest', 'northEast'];
        if (side === 'south') return ['southWest', 'southEast'];
        return [];
    }

    private _clearInvalidReinforcementTargetForPlayer(playerId: number): void {
        const team1Target = this._context.runtime.spawn.reinforcementTargetByTeamId[1];
        if (
            team1Target?.playerId === playerId &&
            !this._isReinforcementTargetValid(playerId, 1, team1Target.createdAtMs)
        ) {
            delete this._context.runtime.spawn.reinforcementTargetByTeamId[1];
        }

        const team2Target = this._context.runtime.spawn.reinforcementTargetByTeamId[2];
        if (
            team2Target?.playerId === playerId &&
            !this._isReinforcementTargetValid(playerId, 2, team2Target.createdAtMs)
        ) {
            delete this._context.runtime.spawn.reinforcementTargetByTeamId[2];
        }
    }

    private _clearReinforcementTargetsForPlayer(playerId: number): void {
        if (this._context.runtime.spawn.reinforcementTargetByTeamId[1]?.playerId === playerId) {
            delete this._context.runtime.spawn.reinforcementTargetByTeamId[1];
        }

        if (this._context.runtime.spawn.reinforcementTargetByTeamId[2]?.playerId === playerId) {
            delete this._context.runtime.spawn.reinforcementTargetByTeamId[2];
        }
    }

    private _isPlayerInsideActiveObjective(playerState: KothPlayerState): boolean {
        if (playerState.isInsideActiveHill) return true;

        const activeHill = this._context.hills[this._context.runtime.hill.currentHillIndex];
        if (activeHill && playerState.activeHillAreaTriggerId === activeHill.areaTriggerId) return true;

        const hillState = this._context.runtime.hill;
        return hillState.activeHillTeam1Players.has(playerState.id) || hillState.activeHillTeam2Players.has(playerState.id);
    }

    private _getActiveObjectivePosition(objectiveLetter: KothHillLetter): mod.Vector | undefined {
        const activeHill = this._getHillByLetter(objectiveLetter);
        if (!activeHill) return undefined;

        const preferredCapturePointId = this._getPreferredCapturePointId(activeHill);
        const fallbackCapturePointIds = [
            preferredCapturePointId,
            activeHill.neutralCapturePointId,
            activeHill.team1CapturePointId,
            activeHill.team2CapturePointId,
        ];
        const triedIds = new Set<number>();

        for (const capturePointId of fallbackCapturePointIds) {
            if (triedIds.has(capturePointId)) continue;
            triedIds.add(capturePointId);

            const position = this._getCapturePointPosition(capturePointId);
            if (position) return position;
        }

        return undefined;
    }

    private _getPreferredCapturePointId(activeHill: KothHillConfig): number {
        switch (this._context.runtime.hill.currentControlState) {
            case 'team1':
                return activeHill.team1CapturePointId;
            case 'team2':
                return activeHill.team2CapturePointId;
            case 'contested':
                if (this._context.runtime.hill.currentOwnerState === 'team1') return activeHill.team1CapturePointId;
                if (this._context.runtime.hill.currentOwnerState === 'team2') return activeHill.team2CapturePointId;
                return activeHill.neutralCapturePointId;
            case 'neutral':
            case 'locked':
            case 'inactive':
                return activeHill.neutralCapturePointId;
        }
    }

    private _getHillByLetter(objectiveLetter: KothHillLetter): KothHillConfig | undefined {
        for (const hill of this._context.hills) {
            if (hill.letter === objectiveLetter) return hill;
        }

        return undefined;
    }

    private _resolveAnchorDestination(
        sector: KothSpawnSectorConfig,
        anchorObjectId: number,
        context?: KothSpawnEvaluationContext
    ): ResolvedKothSpawnDestination | undefined {
        if (!this._isObjectiveSpawnSector(sector)) return undefined;
        if (this._isForbiddenSpawnAnchorObjectId(anchorObjectId)) return undefined;
        if (!this._isConfiguredObjectiveAnchorObjectId(anchorObjectId)) return undefined;
        if (!this._sectorHasAnchorObjectId(sector, anchorObjectId)) return undefined;

        const position = this._getAnchorPosition(anchorObjectId);
        if (!position) return undefined;

        if (this._isZeroVector(position)) {
            this._warnInvalidAnchorPositionOnce(anchorObjectId);
            return undefined;
        }

        const positionVector = context ? this._getAnchorPositionVector(anchorObjectId) : undefined;

        return {
            position,
            orientationRadians:
                context && positionVector
                    ? this._yawTowardActiveObjectiveFromVector(positionVector, context)
                    : this._yawTowardActiveObjective(position),
            label: `${sector.regionId}-${sector.teamSide}-${sector.variantSide}-${anchorObjectId}`,
            pressureZones: sector.pressureZones,
            anchorObjectId,
        };
    }

    private _getCapturePointPosition(capturePointId: number): mod.Vector | undefined {
        const cached = this._context.runtime.spawn.capturePointPositionByObjectId.get(capturePointId);
        if (cached) return cached;

        try {
            const position = mod.GetObjectPosition(mod.GetCapturePoint(capturePointId));
            this._context.runtime.spawn.capturePointPositionByObjectId.set(capturePointId, position);
            this._context.runtime.spawn.capturePointPositionVectorByObjectId.set(
                capturePointId,
                this._toPositionVector(position)
            );
            return position;
        } catch (_err) {
            this._warnMissingObjectiveOnce(capturePointId);
            return undefined;
        }
    }

    private _getAnchorPosition(anchorObjectId: number): mod.Vector | undefined {
        const cached = this._context.runtime.spawn.anchorPositionByObjectId.get(anchorObjectId);
        if (cached) return cached;

        try {
            const spatialObject = mod.GetSpatialObject(anchorObjectId);
            const position = mod.GetObjectPosition(spatialObject);
            if (this._isZeroVector(position)) {
                this._warnInvalidAnchorPositionOnce(anchorObjectId);
                return undefined;
            }

            this._context.runtime.spawn.anchorPositionByObjectId.set(anchorObjectId, position);
            this._context.runtime.spawn.anchorPositionVectorByObjectId.set(
                anchorObjectId,
                this._toPositionVector(position)
            );
            return position;
        } catch (_err) {
            this._warnMissingAnchorOnce(anchorObjectId);
            return undefined;
        }
    }

    private _getAnchorPositionVector(anchorObjectId: number): KothSpawnPositionVector | undefined {
        const cached = this._context.runtime.spawn.anchorPositionVectorByObjectId.get(anchorObjectId);
        if (cached) return cached;

        const position = this._getAnchorPosition(anchorObjectId);
        if (!position) return undefined;

        const positionVector = this._toPositionVector(position);
        this._context.runtime.spawn.anchorPositionVectorByObjectId.set(anchorObjectId, positionVector);
        return positionVector;
    }

    private _teleportPlayer(
        playerId: number,
        player: mod.Player,
        destination: ResolvedKothSpawnDestination
    ): boolean {
        try {
            const orientationRadians = this._yawTowardActiveObjective(destination.position);
            mod.Teleport(player, destination.position, orientationRadians);
            if (destination.anchorObjectId !== undefined) this._markAnchorCooldown(destination.anchorObjectId);
            this._setPlayerPresenceZonesFromTeleport(playerId, destination.pressureZones);
            this._enqueueTeleportOrientationConfirmJob(playerId, KOTH_TELEPORT_ORIENTATION_CONFIRM_DELAY_MS);
            return true;
        } catch (_err) {
            displayWorldLog(mod.Message("[KOTH] Spawn teleport failed for {}", destination.label));
            return false;
        }
    }

    private _isPositionVectorSafeFromEnemies(
        position: KothSpawnPositionVector,
        context: KothSpawnEvaluationContext,
        radiusMeters: number
    ): boolean {
        return this._countEnemiesNearPositionVector(position, context, radiusMeters) <= 0;
    }

    private _countEnemiesNearPositionVector(
        position: KothSpawnPositionVector,
        context: KothSpawnEvaluationContext,
        radiusMeters: number
    ): number {
        const radiusSquared = this._square(radiusMeters);
        let count = 0;

        for (const player of context.players) {
            if (player.teamId !== context.enemyTeamId) continue;
            if (this._distanceSquared(position, player.positionVector) <= radiusSquared) {
                count += 1;
            }
        }

        return count;
    }

    private _getPlayerPosition(player: mod.Player): mod.Vector | undefined {
        try {
            return mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        } catch (_err) {
            try {
                return mod.GetObjectPosition(player);
            } catch (_innerErr) {
                return undefined;
            }
        }
    }

    private _toPositionVector(position: mod.Vector): KothSpawnPositionVector {
        return {
            x: mod.XComponentOf(position),
            y: mod.YComponentOf(position),
            z: mod.ZComponentOf(position),
        };
    }

    private _distanceSquared(first: KothSpawnPositionVector, second: KothSpawnPositionVector): number {
        const deltaX = first.x - second.x;
        const deltaY = first.y - second.y;
        const deltaZ = first.z - second.z;

        return deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
    }

    private _square(value: number): number {
        return value * value;
    }

    private _yawTowardActiveObjectiveFromVector(
        fromPosition: KothSpawnPositionVector,
        context: KothSpawnEvaluationContext
    ): number {
        const deltaX = context.activeObjectiveVector.x - fromPosition.x;
        const deltaZ = context.activeObjectiveVector.z - fromPosition.z;
        return this._normalizeRadians(Math.atan2(deltaX, deltaZ));
    }

    private _yawTowardActiveObjective(fromPosition: mod.Vector): number {
        const objectivePosition = this._getActiveObjectivePosition(this._context.runtime.hill.currentHillLetter);
        if (!objectivePosition) return 0;

        return this._normalizeRadians(
            Math.atan2(
                mod.XComponentOf(objectivePosition) - mod.XComponentOf(fromPosition),
                mod.ZComponentOf(objectivePosition) - mod.ZComponentOf(fromPosition)
            )
        );
    }

    private _isPlayerFacingActiveObjective(player: mod.Player, fromPosition: mod.Vector): boolean {
        const objectivePosition = this._getActiveObjectivePosition(this._context.runtime.hill.currentHillLetter);
        if (!objectivePosition) return true;

        const deltaX = mod.XComponentOf(objectivePosition) - mod.XComponentOf(fromPosition);
        const deltaZ = mod.ZComponentOf(objectivePosition) - mod.ZComponentOf(fromPosition);
        const desiredMagnitude = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
        if (desiredMagnitude <= 0) return true;

        try {
            const facingDirection = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
            const facingX = mod.XComponentOf(facingDirection);
            const facingZ = mod.ZComponentOf(facingDirection);
            const facingMagnitude = Math.sqrt(facingX * facingX + facingZ * facingZ);
            if (facingMagnitude <= 0) return false;

            const dot =
                (facingX / facingMagnitude) * (deltaX / desiredMagnitude) +
                (facingZ / facingMagnitude) * (deltaZ / desiredMagnitude);
            return dot >= KOTH_TELEPORT_ORIENTATION_CONFIRM_DOT_TOLERANCE;
        } catch (_err) {
            return true;
        }
    }

    private _normalizeRadians(value: number): number {
        let normalized = value;
        while (normalized > Math.PI) normalized -= Math.PI * 2;
        while (normalized < -Math.PI) normalized += Math.PI * 2;
        return normalized;
    }

    private _getNextAnchorIndex(sector: KothSpawnSectorConfig): number {
        const key = this._getSectorKey(sector);
        return this._context.runtime.spawn.nextAnchorIndexBySectorKey[key] ?? 0;
    }

    private _setNextAnchorIndex(sector: KothSpawnSectorConfig, index: number): void {
        if (sector.anchorObjectIds.length <= 0) return;

        const key = this._getSectorKey(sector);
        this._context.runtime.spawn.nextAnchorIndexBySectorKey[key] = index % sector.anchorObjectIds.length;
    }

    private _getSectorKey(sector: KothSpawnSectorConfig): string {
        return getSectorKey(sector.regionId, sector.teamSide, sector.variantSide);
    }

    private _getAreaTriggerId(eventAreaTrigger: mod.AreaTrigger): number | undefined {
        try {
            return mod.GetObjId(eventAreaTrigger);
        } catch (_err) {
            return undefined;
        }
    }

    private _safeEnablePresenceAreaTrigger(triggerId: number, enabled: boolean): void {
        try {
            mod.EnableAreaTrigger(mod.GetAreaTrigger(triggerId), enabled);
        } catch (_err) {
            const warnings = this._context.runtime.spawn.warnedPresenceAreaTriggerResolveByObjectId;
            if (!warnings[triggerId]) {
                warnings[triggerId] = true;
                displayWorldLog(mod.Message("[KOTH] Presence area trigger {} is not available", triggerId));
            }
        }
    }

    private _safeEnableHq(hqId: number, enabled: boolean): void {
        try {
            mod.EnableHQ(mod.GetHQ(hqId), enabled);
        } catch (_err) {
            return;
        }
    }

    private _isForbiddenSpawnAnchorObjectId(objectId: number): boolean {
        if (objectId === this._context.spawns.hqSpawners.team1 || objectId === this._context.spawns.hqSpawners.team2) {
            return true;
        }

        for (const hqId of this._context.spawns.disabledLegacyHqIds) {
            if (objectId === hqId) return true;
        }

        return false;
    }

    private _isNearForbiddenSpawnObject(playerPosition: mod.Vector, objectId: number): boolean {
        const forbiddenPosition = this._getForbiddenSpawnPosition(objectId);
        if (!forbiddenPosition) return false;

        return mod.DistanceBetween(playerPosition, forbiddenPosition) <= KOTH_FORBIDDEN_SPAWN_POSITION_EPSILON_METERS;
    }

    private _getForbiddenSpawnPosition(objectId: number): mod.Vector | undefined {
        const cached = this._forbiddenSpawnPositionByObjectId.get(objectId);
        if (cached) return cached;

        try {
            const position = mod.GetObjectPosition(mod.GetSpawnPoint(objectId));
            this._forbiddenSpawnPositionByObjectId.set(objectId, position);
            return position;
        } catch (_spawnPointErr) {
            try {
                const position = mod.GetObjectPosition(mod.GetHQ(objectId));
                this._forbiddenSpawnPositionByObjectId.set(objectId, position);
                return position;
            } catch (_hqErr) {
                return undefined;
            }
        }
    }

    private _undeployUnanchoredPlayer(playerState: KothPlayerState): void {
        if (!mod.IsPlayerValid(playerState.player)) return;

        try {
            mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
            mod.UndeployPlayer(playerState.player);
            playerState.isDeployed = false;
            this.clearPlayerPresenceCache(playerState.id);
            this._requestAnchorSpawnForPlayerState(playerState, 0);
        } catch (_err) {
            return;
        }
    }

    private _clearLiveInputRestrictions(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        mod.EnableAllInputRestrictions(player, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.Interact, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, false);
    }

    private _isLivingDeployedParticipant(playerState: KothPlayerState): boolean {
        const player = playerState.player;
        if (!mod.IsPlayerValid(player)) return false;
        if (!playerState.isDeployed) return false;
        if (!isKothPlayerLiving(player)) return false;

        const team = mod.GetTeam(player);
        playerState.setTeam(team);
        return isParticipantTeam(team);
    }

    private _shouldRetryTeleport(job: KothSpawnJob): boolean {
        return job.attempt < 4 && this._getMatchTimeMs() - job.createdAtMs < this._context.spawns.rules.spawnRetryWindowMs;
    }

    private _getMatchTimeMs(): number {
        return mod.GetMatchTimeElapsed() * 1000;
    }

    private _getEnemyTeamId(teamId: KothTeamId): KothTeamId {
        return teamId === 1 ? 2 : 1;
    }

    private _isZeroVector(position: mod.Vector): boolean {
        return (
            mod.XComponentOf(position) === 0 &&
            mod.YComponentOf(position) === 0 &&
            mod.ZComponentOf(position) === 0
        );
    }

    private _warnMissingAnchorOnce(anchorObjectId: number): void {
        const warnings = this._context.runtime.spawn.warnedSpawnAnchorResolveByObjectId;
        if (warnings[anchorObjectId]) return;

        warnings[anchorObjectId] = true;
        displayWorldLog(mod.Message("[KOTH] Spawn anchor object {} is not available", anchorObjectId));
    }

    private _warnInvalidAnchorPositionOnce(anchorObjectId: number): void {
        const warnings = this._context.runtime.spawn.warnedSpawnAnchorResolveByObjectId;
        if (warnings[anchorObjectId]) return;

        warnings[anchorObjectId] = true;
        displayWorldLog(mod.Message("[KOTH] Spawn anchor object {} resolved to origin and was skipped", anchorObjectId));
    }

    private _warnMissingAnchorsOnce(): void {
        if (this._context.runtime.spawn.warnedMissingSpawnAnchors) return;

        this._context.runtime.spawn.warnedMissingSpawnAnchors = true;
        displayWorldLog(mod.Message("[KOTH] No safe KOTH objective spawn anchors available"));
    }

    private _warnMissingObjectiveOnce(objectId: number): void {
        const warnings = this._context.runtime.warnedMissingObjectiveIds;
        if (warnings[objectId]) return;

        warnings[objectId] = true;
        displayWorldLog(mod.Message("[KOTH] Objective object {} is not available", objectId));
    }

    private _warnTeleportFailedOnce(playerId: number): void {
        const warnings = this._context.runtime.spawn.warnedSpawnTeleportByPlayerId;
        if (warnings[playerId]) return;

        warnings[playerId] = true;
        displayWorldLog(mod.Message("[KOTH] No non-HQ spawn destination available for player {}", playerId));
    }
}
