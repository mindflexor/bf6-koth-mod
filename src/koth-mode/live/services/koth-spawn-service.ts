import type { KothHillConfig, KothHillLetter } from '../config/koth-hills.ts';
import {
    KOTH_SPAWN_CLUSTER_AREA_TRIGGER_IDS,
    type KothSpawnClusterConfig,
    type KothSpawnClusterSlot,
    type KothTeamId,
} from '../config/koth-spawns.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothPlayerState } from '../state/koth-player-state.ts';
import type { KothSpawnJob } from '../state/koth-spawn-state.ts';
import { displayWorldLog, getKothPlayerId, getKothTeamId, isParticipantTeam, isKothPlayerAlive } from './koth-sdk-utils.ts';
import type { KothSpawnJobService } from './koth-spawn-job-service.ts';

interface ResolvedKothSpawnDestination {
    position: mod.Vector;
    orientationRadians: number;
    label: string;
}

export class KothSpawnService {
    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _jobService: KothSpawnJobService
    ) {}

    public configureLiveDeploySpawns(): void {
        mod.SetSpawnMode(mod.SpawnModes.Deploy);

        this._safeEnableHq(this._context.spawns.hqSpawners.team1, true);
        this._safeEnableHq(this._context.spawns.hqSpawners.team2, true);

        for (const hqId of this._context.spawns.disabledLegacyHqIds) {
            this._safeEnableHq(hqId, false);
        }

        this._initializeSpawnAreaTriggers();
        this._updateActiveObjectiveClusterAssignments();

        this._context.runtime.playersById.forEach((playerState) => {
            if (mod.IsPlayerValid(playerState.player)) {
                mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
                this.queueSpawnForPlayer(playerState.player);
            }
        });
    }

    public reset(): void {
        this._jobService.clearAll();
        this._context.runtime.spawn.queuedAnchorByPlayerId.clear();
        this._context.runtime.spawn.playerIdsBySpawnAreaTriggerId.clear();
        this._context.runtime.spawn.forwardReinforcementCountByClusterTeamKey = {};

        for (const triggerId of KOTH_SPAWN_CLUSTER_AREA_TRIGGER_IDS) {
            this._safeEnableSpawnAreaTrigger(triggerId, false);
        }
    }

    public onObjectiveActivated(): void {
        this._context.runtime.spawn.forwardReinforcementCountByClusterTeamKey = {};
        this._updateActiveObjectiveClusterAssignments();

        this._context.runtime.playersById.forEach((playerState) => {
            if (!mod.IsPlayerValid(playerState.player) || playerState.isDeployed) return;

            this._jobService.enqueue({
                kind: 'queue-spawn',
                playerId: playerState.id,
                createdAtMs: this._getMatchTimeMs(),
                attempt: 0,
            });
        });
    }

    public queueSpawnForPlayer(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        const teamId = getKothTeamId(mod.GetTeam(player));
        if (teamId !== 1 && teamId !== 2) return;

        this._updateActiveObjectiveClusterAssignments();

        const cluster = this._getAssignedActiveCluster(teamId);
        if (!cluster || cluster.anchorObjectIds.length <= 0) {
            this._warnMissingAnchorsOnce();
            return;
        }

        const anchorObjectId = this._nextAnchorObjectId(cluster);
        this._context.runtime.spawn.queuedAnchorByPlayerId.set(getKothPlayerId(player), {
            objectiveLetter: cluster.objectiveLetter,
            clusterSlot: cluster.slot,
            anchorObjectId,
        });
    }

    public teleportToQueuedSpawn(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        this._jobService.enqueueFront({
            kind: 'teleport-deployed',
            playerId: getKothPlayerId(player),
            createdAtMs: this._getMatchTimeMs(),
            attempt: 0,
        });
    }

    public processSpawnJobs(): void {
        this._jobService.tick((job) => this._processSpawnJob(job));
    }

    public onPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined || !this._isSpawnAreaTrigger(triggerId)) return false;

        this._getPlayersForSpawnAreaTrigger(triggerId).add(getKothPlayerId(eventPlayer));
        this._updateActiveObjectiveClusterAssignments();
        return true;
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const triggerId = this._getAreaTriggerId(eventAreaTrigger);
        if (triggerId === undefined || !this._isSpawnAreaTrigger(triggerId)) return false;

        const playerId = getKothPlayerId(eventPlayer);
        this._getPlayersForSpawnAreaTrigger(triggerId).delete(playerId);
        this._resetForwardReinforcementCountersWithoutPressure();
        this._updateActiveObjectiveClusterAssignments();
        return true;
    }

    public removePlayerFromAllSpawnClusters(playerId: number): void {
        this._context.runtime.spawn.playerIdsBySpawnAreaTriggerId.forEach((playerIds) => playerIds.delete(playerId));
        this.clearQueuedSpawn(playerId);
        this._resetForwardReinforcementCountersWithoutPressure();
        this._updateActiveObjectiveClusterAssignments();
    }

    public clearQueuedSpawn(playerId: number): void {
        this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerId);
        this._jobService.clearPlayerJobs(playerId);
    }

    private _processSpawnJob(job: KothSpawnJob): void {
        const playerState = this._context.runtime.playersById.get(job.playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;

        if (job.kind === 'queue-spawn') {
            this.queueSpawnForPlayer(playerState.player);
            return;
        }

        this._processDeployTeleportJob(job, playerState);
    }

    private _processDeployTeleportJob(job: KothSpawnJob, playerState: KothPlayerState): void {
        if (!this._isLivingDeployedParticipant(playerState)) return;

        const destination = this._selectTeleportDestination(playerState, false);
        if (destination) {
            this._teleportPlayer(playerState.player, destination);
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return;
        }

        if (this._shouldRetryTeleport(job)) {
            this._jobService.enqueueFront({
                ...job,
                attempt: job.attempt + 1,
            });
            return;
        }

        const leastUnsafeDestination = this._selectTeleportDestination(playerState, true);
        if (leastUnsafeDestination) {
            this._teleportPlayer(playerState.player, leastUnsafeDestination);
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return;
        }

        this._warnTeleportFailedOnce(playerState.id);
    }

    private _selectTeleportDestination(
        playerState: KothPlayerState,
        allowLeastUnsafeAnchor: boolean
    ): ResolvedKothSpawnDestination | undefined {
        const teamId = getKothTeamId(playerState.team);
        if (teamId !== 1 && teamId !== 2) return undefined;

        const forwardSpawn = this._selectForwardReinforcementDestination(playerState, teamId);
        if (forwardSpawn) return forwardSpawn;

        const anchorSpawn = this._selectSafeAnchorDestination(playerState, teamId);
        if (anchorSpawn) return anchorSpawn;

        const teammateSpawn = this._selectSafeTeammateDestination(playerState, teamId);
        if (teammateSpawn) return teammateSpawn;

        if (allowLeastUnsafeAnchor) {
            return this._selectLeastUnsafeAnchorDestination(teamId);
        }

        return undefined;
    }

    private _selectForwardReinforcementDestination(
        deployingPlayerState: KothPlayerState,
        teamId: KothTeamId
    ): ResolvedKothSpawnDestination | undefined {
        const enemyTeamId = this._getEnemyTeamId(teamId);
        const enemyAssignedCluster = this._getAssignedActiveCluster(enemyTeamId);
        if (!enemyAssignedCluster) return undefined;

        const friendlyIds = this._getLivingTeamPlayerIdsInCluster(enemyAssignedCluster, teamId);
        if (
            friendlyIds.length <= 0 ||
            friendlyIds.length >= this._context.spawns.rules.clusterFlipMinEnemyPlayers
        ) {
            return undefined;
        }

        const counterKey = this._getForwardReinforcementCounterKey(
            enemyAssignedCluster.objectiveLetter,
            enemyAssignedCluster.slot,
            teamId
        );
        const usedReinforcements = this._context.runtime.spawn.forwardReinforcementCountByClusterTeamKey[counterKey] ?? 0;
        if (usedReinforcements >= this._context.spawns.rules.forwardReinforcementMaxBeforeFlip) return undefined;

        for (const forwardPlayerId of friendlyIds) {
            if (forwardPlayerId === deployingPlayerState.id) continue;

            const forwardPlayerState = this._context.runtime.playersById.get(forwardPlayerId);
            if (!forwardPlayerState || !this._isLivingDeployedParticipant(forwardPlayerState)) continue;

            const position = this._getPlayerPosition(forwardPlayerState.player);
            if (!position || !this._isPositionSafeFromEnemies(position, teamId)) continue;

            this._context.runtime.spawn.forwardReinforcementCountByClusterTeamKey[counterKey] =
                usedReinforcements + 1;

            return {
                position,
                orientationRadians: this._yawTowardActiveObjective(position),
                label: `forward-player-${forwardPlayerId}`,
            };
        }

        return undefined;
    }

    private _selectSafeAnchorDestination(
        playerState: KothPlayerState,
        teamId: KothTeamId
    ): ResolvedKothSpawnDestination | undefined {
        this._updateQueuedAnchorIfStale(playerState.player, teamId);

        const queued = this._context.runtime.spawn.queuedAnchorByPlayerId.get(playerState.id);
        const orderedClusters = this._getOrderedActiveClustersForTeam(teamId);

        if (queued) {
            const queuedCluster = this._getActiveClusterBySlot(queued.clusterSlot);
            if (queuedCluster) {
                const queuedDestination = this._resolveAnchorDestination(queuedCluster, queued.anchorObjectId);
                if (queuedDestination && this._isPositionSafeFromEnemies(queuedDestination.position, teamId)) {
                    return queuedDestination;
                }
            }
        }

        for (const cluster of orderedClusters) {
            const destination = this._selectSafeAnchorFromCluster(cluster, teamId);
            if (destination) return destination;
        }

        return undefined;
    }

    private _selectSafeAnchorFromCluster(
        cluster: KothSpawnClusterConfig,
        teamId: KothTeamId
    ): ResolvedKothSpawnDestination | undefined {
        const anchorCount = cluster.anchorObjectIds.length;
        if (anchorCount <= 0) return undefined;

        const startIndex = this._getNextAnchorIndex(cluster);
        for (let offset = 0; offset < anchorCount; offset++) {
            const index = (startIndex + offset) % anchorCount;
            const anchorObjectId = cluster.anchorObjectIds[index];
            const destination = this._resolveAnchorDestination(cluster, anchorObjectId);
            if (!destination || !this._isPositionSafeFromEnemies(destination.position, teamId)) continue;

            this._setNextAnchorIndex(cluster, index + 1);
            return destination;
        }

        return undefined;
    }

    private _selectLeastUnsafeAnchorDestination(teamId: KothTeamId): ResolvedKothSpawnDestination | undefined {
        let bestDestination: ResolvedKothSpawnDestination | undefined;
        let bestCluster: KothSpawnClusterConfig | undefined;
        let bestAnchorIndex = 0;
        let bestEnemyCount = Number.MAX_SAFE_INTEGER;

        for (const cluster of this._getOrderedActiveClustersForTeam(teamId)) {
            for (let i = 0; i < cluster.anchorObjectIds.length; i++) {
                const anchorObjectId = cluster.anchorObjectIds[i];
                const destination = this._resolveAnchorDestination(cluster, anchorObjectId);
                if (!destination) continue;

                const enemyCount = this._countEnemiesNearPosition(destination.position, teamId);
                if (enemyCount >= bestEnemyCount) continue;

                bestDestination = destination;
                bestCluster = cluster;
                bestAnchorIndex = i;
                bestEnemyCount = enemyCount;
            }
        }

        if (bestCluster) {
            this._setNextAnchorIndex(bestCluster, bestAnchorIndex + 1);
        }

        return bestDestination;
    }

    private _selectSafeTeammateDestination(
        deployingPlayerState: KothPlayerState,
        teamId: KothTeamId
    ): ResolvedKothSpawnDestination | undefined {
        let bestPosition: mod.Vector | undefined;
        let bestPlayerId = 0;
        let bestPenalty = Number.MAX_SAFE_INTEGER;

        this._context.runtime.playersById.forEach((teammateState) => {
            if (teammateState.id === deployingPlayerState.id) return;
            if (!this._isLivingDeployedParticipant(teammateState)) return;
            if (getKothTeamId(teammateState.team) !== teamId) return;
            if (this._isLimitedForwardReinforcementPlayer(teammateState.id, teamId)) return;

            const position = this._getPlayerPosition(teammateState.player);
            if (!position || !this._isPositionSafeFromEnemies(position, teamId)) return;

            const penalty = this._isPlayerInEnemyHeavySpawnCluster(teammateState.id, teamId) ? 1 : 0;
            if (penalty >= bestPenalty) return;

            bestPosition = position;
            bestPlayerId = teammateState.id;
            bestPenalty = penalty;
        });

        if (!bestPosition) return undefined;

        return {
            position: bestPosition,
            orientationRadians: this._yawTowardActiveObjective(bestPosition),
            label: `safe-teammate-${bestPlayerId}`,
        };
    }

    private _updateQueuedAnchorIfStale(player: mod.Player, teamId: KothTeamId): void {
        const playerId = getKothPlayerId(player);
        const queued = this._context.runtime.spawn.queuedAnchorByPlayerId.get(playerId);
        const activeLetter = this._context.runtime.hill.currentHillLetter;
        const assignedCluster = this._getAssignedActiveCluster(teamId);

        if (!queued || queued.objectiveLetter !== activeLetter || queued.clusterSlot !== assignedCluster?.slot) {
            this.queueSpawnForPlayer(player);
        }
    }

    private _initializeSpawnAreaTriggers(): void {
        for (const triggerId of KOTH_SPAWN_CLUSTER_AREA_TRIGGER_IDS) {
            this._getPlayersForSpawnAreaTrigger(triggerId);
            this._safeEnableSpawnAreaTrigger(triggerId, true);
        }
    }

    private _updateActiveObjectiveClusterAssignments(): void {
        const activeLetter = this._context.runtime.hill.currentHillLetter;
        const cluster01 = this._getCluster(activeLetter, '01');
        const cluster02 = this._getCluster(activeLetter, '02');
        if (!cluster01 || !cluster02) return;

        const cluster01Team1 = this._getLivingTeamPlayerIdsInCluster(cluster01, 1).length;
        const cluster01Team2 = this._getLivingTeamPlayerIdsInCluster(cluster01, 2).length;
        const cluster02Team1 = this._getLivingTeamPlayerIdsInCluster(cluster02, 1).length;
        const cluster02Team2 = this._getLivingTeamPlayerIdsInCluster(cluster02, 2).length;

        const team2ControlsCluster01 =
            cluster01Team2 >= this._context.spawns.rules.clusterFlipMinEnemyPlayers && cluster01Team2 > cluster01Team1;
        const team1ControlsCluster02 =
            cluster02Team1 >= this._context.spawns.rules.clusterFlipMinEnemyPlayers && cluster02Team1 > cluster02Team2;

        if (team2ControlsCluster01 || team1ControlsCluster02) {
            this._context.runtime.spawn.clusterAssignmentByObjective[activeLetter][1] = '02';
            this._context.runtime.spawn.clusterAssignmentByObjective[activeLetter][2] = '01';
            return;
        }

        this._context.runtime.spawn.clusterAssignmentByObjective[activeLetter][1] = '01';
        this._context.runtime.spawn.clusterAssignmentByObjective[activeLetter][2] = '02';
    }

    private _resetForwardReinforcementCountersWithoutPressure(): void {
        const nextCounters: Record<string, number> = {};

        for (const key in this._context.runtime.spawn.forwardReinforcementCountByClusterTeamKey) {
            const parts = key.split(':');
            if (parts.length !== 3) continue;

            const objectiveLetter = parts[0] as KothHillLetter;
            const clusterSlot = parts[1] as KothSpawnClusterSlot;
            const teamId = Number(parts[2]) as KothTeamId;
            const cluster = this._getCluster(objectiveLetter, clusterSlot);
            if (!cluster || this._getLivingTeamPlayerIdsInCluster(cluster, teamId).length <= 0) continue;

            nextCounters[key] = this._context.runtime.spawn.forwardReinforcementCountByClusterTeamKey[key];
        }

        this._context.runtime.spawn.forwardReinforcementCountByClusterTeamKey = nextCounters;
    }

    private _getOrderedActiveClustersForTeam(teamId: KothTeamId): KothSpawnClusterConfig[] {
        const assignedCluster = this._getAssignedActiveCluster(teamId);
        const oppositeCluster = assignedCluster
            ? this._getActiveClusterBySlot(this._getOppositeSlot(assignedCluster.slot))
            : undefined;
        const clusters: KothSpawnClusterConfig[] = [];

        if (assignedCluster) clusters.push(assignedCluster);
        if (oppositeCluster) clusters.push(oppositeCluster);

        return clusters;
    }

    private _getAssignedActiveCluster(teamId: KothTeamId): KothSpawnClusterConfig | undefined {
        const activeLetter = this._context.runtime.hill.currentHillLetter;
        const slot = this._context.runtime.spawn.clusterAssignmentByObjective[activeLetter][teamId];
        return this._getCluster(activeLetter, slot);
    }

    private _getActiveClusterBySlot(slot: KothSpawnClusterSlot): KothSpawnClusterConfig | undefined {
        return this._getCluster(this._context.runtime.hill.currentHillLetter, slot);
    }

    private _getCluster(
        objectiveLetter: KothHillLetter,
        slot: KothSpawnClusterSlot
    ): KothSpawnClusterConfig | undefined {
        for (const cluster of this._context.spawns.clusters) {
            if (cluster.objectiveLetter === objectiveLetter && cluster.slot === slot) return cluster;
        }

        return undefined;
    }

    private _isLimitedForwardReinforcementPlayer(playerId: number, teamId: KothTeamId): boolean {
        const enemyAssignedCluster = this._getAssignedActiveCluster(this._getEnemyTeamId(teamId));
        if (!enemyAssignedCluster) return false;

        const friendlyIds = this._getLivingTeamPlayerIdsInCluster(enemyAssignedCluster, teamId);
        return (
            friendlyIds.length > 0 &&
            friendlyIds.length < this._context.spawns.rules.clusterFlipMinEnemyPlayers &&
            friendlyIds.indexOf(playerId) >= 0
        );
    }

    private _nextAnchorObjectId(cluster: KothSpawnClusterConfig): number {
        const startIndex = this._getNextAnchorIndex(cluster);
        const anchorObjectId = cluster.anchorObjectIds[startIndex % cluster.anchorObjectIds.length];
        this._setNextAnchorIndex(cluster, startIndex + 1);
        return anchorObjectId;
    }

    private _getNextAnchorIndex(cluster: KothSpawnClusterConfig): number {
        const key = this._getClusterKey(cluster);
        return this._context.runtime.spawn.nextAnchorIndexByClusterKey[key] ?? 0;
    }

    private _setNextAnchorIndex(cluster: KothSpawnClusterConfig, index: number): void {
        const key = this._getClusterKey(cluster);
        this._context.runtime.spawn.nextAnchorIndexByClusterKey[key] = index % cluster.anchorObjectIds.length;
    }

    private _resolveAnchorDestination(
        cluster: KothSpawnClusterConfig,
        anchorObjectId: number
    ): ResolvedKothSpawnDestination | undefined {
        let spatialObject: mod.SpatialObject;
        let position: mod.Vector;

        try {
            spatialObject = mod.GetSpatialObject(anchorObjectId);
            position = mod.GetObjectPosition(spatialObject);
        } catch (_err) {
            this._warnMissingAnchorOnce(anchorObjectId);
            return undefined;
        }

        let orientationRadians = this._yawTowardActiveObjective(position);
        try {
            orientationRadians = mod.YComponentOf(mod.GetObjectRotation(spatialObject));
        } catch (_err) {
            // The anchor position is still usable; fall back to facing the active objective.
        }

        return {
            position,
            orientationRadians,
            label: `${cluster.objectiveLetter}-${cluster.slot}-${anchorObjectId}`,
        };
    }

    private _teleportPlayer(player: mod.Player, destination: ResolvedKothSpawnDestination): void {
        try {
            mod.Teleport(player, destination.position, destination.orientationRadians);
        } catch (_err) {
            displayWorldLog(mod.Message("[KOTH] Spawn teleport failed for {}", destination.label));
        }
    }

    private _getLivingTeamPlayerIdsInCluster(cluster: KothSpawnClusterConfig, teamId: KothTeamId): number[] {
        const playerIds = this._getPlayersForSpawnAreaTrigger(cluster.areaTriggerId);
        const result: number[] = [];

        playerIds.forEach((playerId) => {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;
            if (getKothTeamId(playerState.team) === teamId) {
                result.push(playerId);
            }
        });

        return result;
    }

    private _isPositionSafeFromEnemies(position: mod.Vector, teamId: KothTeamId): boolean {
        return this._countEnemiesNearPosition(position, teamId) <= 0;
    }

    private _countEnemiesNearPosition(position: mod.Vector, teamId: KothTeamId): number {
        let count = 0;

        this._context.runtime.playersById.forEach((playerState) => {
            if (!this._isLivingDeployedParticipant(playerState)) return;
            if (getKothTeamId(playerState.team) !== this._getEnemyTeamId(teamId)) return;

            const enemyPosition = this._getPlayerPosition(playerState.player);
            if (!enemyPosition) return;

            if (mod.DistanceBetween(position, enemyPosition) <= this._context.spawns.rules.enemySafetyRadiusMeters) {
                count += 1;
            }
        });

        return count;
    }

    private _isPlayerInEnemyHeavySpawnCluster(playerId: number, teamId: KothTeamId): boolean {
        for (const cluster of this._context.spawns.clusters) {
            const playerIds = this._getPlayersForSpawnAreaTrigger(cluster.areaTriggerId);
            if (!playerIds.has(playerId)) continue;

            const friendlyCount = this._getLivingTeamPlayerIdsInCluster(cluster, teamId).length;
            const enemyCount = this._getLivingTeamPlayerIdsInCluster(cluster, this._getEnemyTeamId(teamId)).length;
            if (enemyCount > 0 && enemyCount >= friendlyCount) return true;
        }

        return false;
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

    private _yawTowardActiveObjective(fromPosition: mod.Vector): number {
        const activeHill = this._getActiveHill();
        if (!activeHill) return 0;

        try {
            const objectivePosition = mod.GetObjectPosition(mod.GetCapturePoint(activeHill.neutralCapturePointId));
            const deltaX = mod.XComponentOf(objectivePosition) - mod.XComponentOf(fromPosition);
            const deltaZ = mod.ZComponentOf(objectivePosition) - mod.ZComponentOf(fromPosition);
            return Math.atan2(deltaX, deltaZ);
        } catch (_err) {
            return 0;
        }
    }

    private _getActiveHill(): KothHillConfig | undefined {
        return this._context.hills[this._context.runtime.hill.currentHillIndex];
    }

    private _getPlayersForSpawnAreaTrigger(triggerId: number): Set<number> {
        const existing = this._context.runtime.spawn.playerIdsBySpawnAreaTriggerId.get(triggerId);
        if (existing) return existing;

        const created = new Set<number>();
        this._context.runtime.spawn.playerIdsBySpawnAreaTriggerId.set(triggerId, created);
        return created;
    }

    private _getAreaTriggerId(eventAreaTrigger: mod.AreaTrigger): number | undefined {
        try {
            return mod.GetObjId(eventAreaTrigger);
        } catch (_err) {
            return undefined;
        }
    }

    private _isSpawnAreaTrigger(triggerId: number): boolean {
        return KOTH_SPAWN_CLUSTER_AREA_TRIGGER_IDS.indexOf(triggerId) >= 0;
    }

    private _safeEnableSpawnAreaTrigger(triggerId: number, enabled: boolean): void {
        try {
            mod.EnableAreaTrigger(mod.GetAreaTrigger(triggerId), enabled);
        } catch (_err) {
            const warnings = this._context.runtime.spawn.warnedSpawnAreaTriggerResolveByObjectId;
            if (!warnings[triggerId]) {
                warnings[triggerId] = true;
                displayWorldLog(mod.Message("[KOTH] Spawn area trigger {} is not available", triggerId));
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

    private _isLivingDeployedParticipant(playerState: KothPlayerState): boolean {
        const player = playerState.player;
        if (!mod.IsPlayerValid(player)) return false;
        if (this._context.spectatorController?.isSpectator(player)) return false;
        if (!playerState.isDeployed) return false;
        if (!isKothPlayerAlive(player)) return false;

        const team = mod.GetTeam(player);
        playerState.setTeam(team);
        return isParticipantTeam(team);
    }

    private _shouldRetryTeleport(job: KothSpawnJob): boolean {
        return this._getMatchTimeMs() - job.createdAtMs < this._context.spawns.rules.spawnRetryWindowMs;
    }

    private _getMatchTimeMs(): number {
        return mod.GetMatchTimeElapsed() * 1000;
    }

    private _getEnemyTeamId(teamId: KothTeamId): KothTeamId {
        return teamId === 1 ? 2 : 1;
    }

    private _getOppositeSlot(slot: KothSpawnClusterSlot): KothSpawnClusterSlot {
        return slot === '01' ? '02' : '01';
    }

    private _getClusterKey(cluster: KothSpawnClusterConfig): string {
        return `${cluster.objectiveLetter}:${cluster.slot}`;
    }

    private _getForwardReinforcementCounterKey(
        objectiveLetter: KothHillLetter,
        slot: KothSpawnClusterSlot,
        teamId: KothTeamId
    ): string {
        return `${objectiveLetter}:${slot}:${teamId}`;
    }

    private _warnMissingAnchorOnce(anchorObjectId: number): void {
        const warnings = this._context.runtime.spawn.warnedSpawnAnchorResolveByObjectId;
        if (warnings[anchorObjectId]) return;

        warnings[anchorObjectId] = true;
        displayWorldLog(mod.Message("[KOTH] Spawn anchor object {} is not available", anchorObjectId));
    }

    private _warnMissingAnchorsOnce(): void {
        if (this._context.runtime.spawn.warnedMissingSpawnAnchors) return;

        this._context.runtime.spawn.warnedMissingSpawnAnchors = true;
        displayWorldLog(mod.Message("[KOTH] No KOTH spawn anchors configured for active objective"));
    }

    private _warnTeleportFailedOnce(playerId: number): void {
        const warnings = this._context.runtime.spawn.warnedSpawnTeleportByPlayerId;
        if (warnings[playerId]) return;

        warnings[playerId] = true;
        displayWorldLog(mod.Message("[KOTH] No non-HQ spawn destination available for player {}", playerId));
    }
}

