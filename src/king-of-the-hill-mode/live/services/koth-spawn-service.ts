import type { KothHillConfig, KothHillLetter } from '../config/koth-hills.ts';
import {
    KOTH_PRESENCE_ZONE_AREA_TRIGGER_IDS,
    getOppositeCardinalSide,
    getPresenceZoneForAreaTriggerId,
    getRegionForActiveObjective,
    getSectorKey,
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
import type { KothSpawnJob, QueuedKothSpawnAnchor } from '../state/koth-spawn-state.ts';
import { displayWorldLog, getKothPlayerId, getKothTeamId, isParticipantTeam, isKothPlayerAlive } from './koth-sdk-utils.ts';
import type { KothSpawnJobService } from './koth-spawn-job-service.ts';

interface ResolvedKothSpawnDestination {
    position: mod.Vector;
    orientationRadians: number;
    label: string;
    pressureZones: readonly KothPresenceZone[];
}

interface KothSpawnCandidateTier {
    sectors: readonly KothSpawnSectorConfig[];
    isEmergencyFallback: boolean;
}

interface ScoredSpawnCandidateSelection {
    candidate: KothSpawnCandidateScore;
    anchorIndex: number;
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

        this._initializePresenceAreaTriggers();

        this._context.runtime.playersById.forEach((playerState) => {
            if (mod.IsPlayerValid(playerState.player)) {
                mod.SetRedeployTime(playerState.player, this._context.rules.redeployTimeSeconds);
                this.queueSpawnForPlayer(playerState.player);
                if (this._isLivingDeployedParticipant(playerState)) {
                    this._seedPlayerPresenceFromQueuedAnchor(playerState);
                }
            }
        });
    }

    public reset(): void {
        this._jobService.clearAll();
        this._context.runtime.spawn.queuedAnchorByPlayerId.clear();
        this._clearPresenceState();
        this._context.runtime.spawn.nextAnchorIndexBySectorKey = {};

        for (const triggerId of KOTH_PRESENCE_ZONE_AREA_TRIGGER_IDS) {
            this._safeEnablePresenceAreaTrigger(triggerId, false);
        }
    }

    public onObjectiveActivated(): void {
        this._context.runtime.spawn.queuedAnchorByPlayerId.clear();

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

        const activeLetter = this._context.runtime.hill.currentHillLetter;
        const candidate = this._selectBestSpawnCandidateForTeam(teamId, activeLetter, true);
        if (!candidate) {
            this._warnMissingAnchorsOnce();
            return;
        }

        this._queueCandidateForPlayer(getKothPlayerId(player), candidate);
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
        const zone = this._getPresenceZoneFromAreaTrigger(eventAreaTrigger);
        if (!zone) return false;

        this._addPlayerToPresenceZone(getKothPlayerId(eventPlayer), zone);
        return true;
    }

    public onPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger): boolean {
        const zone = this._getPresenceZoneFromAreaTrigger(eventAreaTrigger);
        if (!zone) return false;

        this._removePlayerFromPresenceZone(getKothPlayerId(eventPlayer), zone);
        return true;
    }

    public removePlayerFromAllPresenceZones(playerId: number): void {
        this._removePlayerFromAllPresenceZones(playerId);
        this.clearQueuedSpawn(playerId);
    }

    public clearQueuedSpawn(playerId: number): void {
        this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerId);
        this._jobService.clearPlayerJobs(playerId);
    }

    public selectBestSpawnCandidate(
        player: mod.Player,
        teamId: KothTeamId,
        activeObjectiveLetter: KothHillLetter
    ): KothSpawnCandidateScore | undefined {
        if (!mod.IsPlayerValid(player)) return undefined;
        return this._selectBestSpawnCandidateForTeam(teamId, activeObjectiveLetter, true);
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
        allowUnsafeAnchors: boolean
    ): ResolvedKothSpawnDestination | undefined {
        const teamId = getKothTeamId(playerState.team);
        if (teamId !== 1 && teamId !== 2) return undefined;

        const queuedDestination = this._selectQueuedDestination(playerState, teamId, allowUnsafeAnchors);
        if (queuedDestination) return queuedDestination;

        const activeLetter = this._context.runtime.hill.currentHillLetter;
        const candidate = this._selectBestSpawnCandidateForTeam(teamId, activeLetter, allowUnsafeAnchors);
        if (!candidate) return undefined;

        this._queueCandidateForPlayer(playerState.id, candidate);
        return this._resolveAnchorDestination(candidate.sector, candidate.anchorObjectId);
    }

    private _selectQueuedDestination(
        playerState: KothPlayerState,
        teamId: KothTeamId,
        allowUnsafeAnchors: boolean
    ): ResolvedKothSpawnDestination | undefined {
        this._updateQueuedAnchorIfStale(playerState.player, teamId);

        const queued = this._context.runtime.spawn.queuedAnchorByPlayerId.get(playerState.id);
        if (!queued) return undefined;
        if (queued.objectiveLetter !== undefined && queued.objectiveLetter !== this._context.runtime.hill.currentHillLetter) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        const sector = this._getSectorForQueuedAnchor(queued);
        if (!sector) return undefined;

        const destination = this._resolveAnchorDestination(sector, queued.anchorObjectId);
        if (!destination) return undefined;

        if (!allowUnsafeAnchors && !this._isPositionSafeFromEnemies(destination.position, teamId, sector)) {
            this._context.runtime.spawn.queuedAnchorByPlayerId.delete(playerState.id);
            return undefined;
        }

        return destination;
    }

    private _updateQueuedAnchorIfStale(player: mod.Player, teamId: KothTeamId): void {
        const playerId = getKothPlayerId(player);
        const queued = this._context.runtime.spawn.queuedAnchorByPlayerId.get(playerId);
        const activeLetter = this._context.runtime.hill.currentHillLetter;

        if (!queued || (queued.objectiveLetter !== undefined && queued.objectiveLetter !== activeLetter)) {
            const candidate = this._selectBestSpawnCandidateForTeam(teamId, activeLetter, true);
            if (candidate) {
                this._queueCandidateForPlayer(playerId, candidate);
            }
        }
    }

    private _selectBestSpawnCandidateForTeam(
        teamId: KothTeamId,
        activeObjectiveLetter: KothHillLetter,
        allowUnsafeAnchors: boolean
    ): KothSpawnCandidateScore | undefined {
        const activeRegion = getRegionForActiveObjective(activeObjectiveLetter);
        if (!activeRegion) return undefined;

        const activeObjectivePosition = this._getActiveObjectivePosition(activeObjectiveLetter);
        if (!activeObjectivePosition) return undefined;

        const assignedTeamSide = this._getAssignedTeamSide(activeRegion, teamId);
        const preferredVariantSide = this._getPreferredVariantSide(activeRegion, teamId);
        const tiers = this._buildCandidateTiers(activeRegion, assignedTeamSide, preferredVariantSide);

        for (const tier of tiers) {
            const selection = this._selectBestCandidateFromSectors(
                tier.sectors,
                teamId,
                activeObjectiveLetter,
                activeObjectivePosition,
                assignedTeamSide,
                preferredVariantSide,
                allowUnsafeAnchors,
                tier.isEmergencyFallback
            );

            if (!selection) continue;

            this._setNextAnchorIndex(selection.candidate.sector, selection.anchorIndex + 1);
            return selection.candidate;
        }

        return undefined;
    }

    private _buildCandidateTiers(
        activeRegion: KothSpawnRegionConfig,
        assignedTeamSide: KothCardinalSide,
        preferredVariantSide: KothCardinalSide | undefined
    ): readonly KothSpawnCandidateTier[] {
        const activeAssignedSectors = activeRegion.sectors.filter((sector) => sector.teamSide === assignedTeamSide);
        const supportAssignedSectors = this._getSupportSectors().filter((sector) => sector.teamSide === assignedTeamSide);
        const activePreferred = this._filterByPreferredVariant(activeAssignedSectors, preferredVariantSide, true);
        const activeOther = this._filterByPreferredVariant(activeAssignedSectors, preferredVariantSide, false);
        const supportPreferred = this._filterByPreferredVariant(supportAssignedSectors, preferredVariantSide, true);
        const supportOther = this._filterByPreferredVariant(supportAssignedSectors, preferredVariantSide, false);
        const emergencySectors = [...activeRegion.sectors, ...this._getSupportSectors()];

        return [
            { sectors: activePreferred, isEmergencyFallback: false },
            { sectors: activeOther, isEmergencyFallback: false },
            { sectors: supportPreferred, isEmergencyFallback: false },
            { sectors: supportOther, isEmergencyFallback: false },
            { sectors: emergencySectors, isEmergencyFallback: true },
        ];
    }

    private _filterByPreferredVariant(
        sectors: readonly KothSpawnSectorConfig[],
        preferredVariantSide: KothCardinalSide | undefined,
        shouldMatchPreferred: boolean
    ): KothSpawnSectorConfig[] {
        if (!preferredVariantSide) return shouldMatchPreferred ? [...sectors] : [];

        return sectors.filter((sector) =>
            shouldMatchPreferred
                ? sector.variantSide === preferredVariantSide
                : sector.variantSide !== preferredVariantSide
        );
    }

    private _selectBestCandidateFromSectors(
        sectors: readonly KothSpawnSectorConfig[],
        teamId: KothTeamId,
        activeObjectiveLetter: KothHillLetter,
        activeObjectivePosition: mod.Vector,
        assignedTeamSide: KothCardinalSide,
        preferredVariantSide: KothCardinalSide | undefined,
        allowUnsafeAnchors: boolean,
        isEmergencyFallback: boolean
    ): ScoredSpawnCandidateSelection | undefined {
        let bestSelection: ScoredSpawnCandidateSelection | undefined;
        let bestScore = Number.MAX_SAFE_INTEGER;

        for (const sector of sectors) {
            const sectorPressure = this.scoreSectorPressure(sector, teamId);
            const anchorCount = sector.anchorObjectIds.length;
            if (anchorCount <= 0) continue;

            const startIndex = this._getNextAnchorIndex(sector);
            for (let offset = 0; offset < anchorCount; offset++) {
                const anchorIndex = (startIndex + offset) % anchorCount;
                const anchorObjectId = sector.anchorObjectIds[anchorIndex];
                const destination = this._resolveAnchorDestination(sector, anchorObjectId);
                if (!destination) continue;

                const distanceScore = this.scoreAnchorDistanceToObjective(
                    anchorObjectId,
                    destination.position,
                    activeObjectivePosition,
                    this._getDistanceConfigForSector(sector)
                );
                if (!isEmergencyFallback && !distanceScore.isWithinHardRange) continue;

                const enemySafetyPenalty = this._getEnemySafetyPenalty(destination.position, teamId, sector);
                if (!allowUnsafeAnchors && enemySafetyPenalty > 0) continue;

                const score = this._scoreCandidate(
                    sector,
                    activeObjectiveLetter,
                    assignedTeamSide,
                    preferredVariantSide,
                    sectorPressure,
                    distanceScore.distancePenalty,
                    enemySafetyPenalty
                );

                if (score >= bestScore) continue;

                bestScore = score;
                bestSelection = {
                    anchorIndex,
                    candidate: {
                        sector,
                        anchorObjectId,
                        score,
                        sectorPressure,
                        distanceToObjectiveMeters: distanceScore.distanceToObjectiveMeters,
                        distancePenalty: distanceScore.distancePenalty,
                        enemySafetyPenalty,
                        isPreferredDistance: distanceScore.isWithinPreferredRange,
                        isEmergencyFallback,
                    },
                };
            }
        }

        return bestSelection;
    }

    public scoreSectorPressure(sector: KothSpawnSectorConfig, teamId: KothTeamId): KothSpawnSectorPressure {
        const friendlyIds = new Set<number>();
        const enemyIds = new Set<number>();
        const enemyTeamId = this._getEnemyTeamId(teamId);

        for (const zone of sector.pressureZones) {
            const playerIds = this._context.runtime.spawn.playersByPresenceZone[zone];
            playerIds.forEach((playerId) => {
                const playerState = this._context.runtime.playersById.get(playerId);
                if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;

                const cachedTeamId = getKothTeamId(playerState.team);
                if (cachedTeamId === teamId) {
                    friendlyIds.add(playerId);
                } else if (cachedTeamId === enemyTeamId) {
                    enemyIds.add(playerId);
                }
            });
        }

        const friendlyCount = friendlyIds.size;
        const enemyCount = enemyIds.size;
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
        const distanceToObjectiveMeters = mod.DistanceBetween(anchorPosition, activeObjectivePosition);
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

    private _scoreCandidate(
        sector: KothSpawnSectorConfig,
        activeObjectiveLetter: KothHillLetter,
        assignedTeamSide: KothCardinalSide,
        preferredVariantSide: KothCardinalSide | undefined,
        sectorPressure: KothSpawnSectorPressure,
        distancePenalty: number,
        enemySafetyPenalty: number
    ): number {
        let score = 0;

        if (sector.teamSide !== assignedTeamSide) {
            score += 500;
        }

        if (preferredVariantSide && sector.variantSide !== preferredVariantSide) {
            score += 50;
        }

        score += sectorPressure.score;
        score += distancePenalty;
        score += enemySafetyPenalty;

        if (sector.objectiveLetter !== activeObjectiveLetter) {
            score += 300;
        }

        return score;
    }

    private _queueCandidateForPlayer(playerId: number, candidate: KothSpawnCandidateScore): void {
        this._context.runtime.spawn.queuedAnchorByPlayerId.set(playerId, {
            regionId: candidate.sector.regionId,
            objectiveLetter: candidate.sector.objectiveLetter,
            teamSide: candidate.sector.teamSide,
            variantSide: candidate.sector.variantSide,
            anchorObjectId: candidate.anchorObjectId,
            distanceToObjectiveMeters: candidate.distanceToObjectiveMeters,
        });
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
        const team1Side = region.defaultTeamSideByTeamId[1];
        const team2Side = region.defaultTeamSideByTeamId[2];

        if (team1Side === team2Side) {
            return teamId === 1 ? team1Side : getOppositeCardinalSide(team1Side);
        }

        return teamId === 1 ? team1Side : team2Side;
    }

    private _getPreferredVariantSide(
        region: KothSpawnRegionConfig,
        teamId: KothTeamId
    ): KothCardinalSide | undefined {
        return region.defaultVariantSideByTeamId?.[teamId];
    }

    private _getSupportSectors(): KothSpawnSectorConfig[] {
        const result: KothSpawnSectorConfig[] = [];

        for (const region of this._context.spawns.regions) {
            if (region.objectiveLetter) continue;
            result.push(...region.sectors);
        }

        return result;
    }

    private _getSectorForQueuedAnchor(queued: QueuedKothSpawnAnchor): KothSpawnSectorConfig | undefined {
        for (const region of this._context.spawns.regions) {
            if (region.regionId !== queued.regionId) continue;

            for (const sector of region.sectors) {
                if (sector.teamSide === queued.teamSide && sector.variantSide === queued.variantSide) {
                    return sector;
                }
            }
        }

        return undefined;
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
    }

    private _addPlayerToPresenceZone(playerId: number, zone: KothPresenceZone): void {
        this._context.runtime.spawn.playersByPresenceZone[zone].add(playerId);

        let zones = this._context.runtime.spawn.presenceZonesByPlayerId.get(playerId);
        if (!zones) {
            zones = new Set<KothPresenceZone>();
            this._context.runtime.spawn.presenceZonesByPlayerId.set(playerId, zones);
        }

        zones.add(zone);
    }

    private _removePlayerFromPresenceZone(playerId: number, zone: KothPresenceZone): void {
        this._context.runtime.spawn.playersByPresenceZone[zone].delete(playerId);

        const zones = this._context.runtime.spawn.presenceZonesByPlayerId.get(playerId);
        if (!zones) return;

        zones.delete(zone);
        if (zones.size <= 0) {
            this._context.runtime.spawn.presenceZonesByPlayerId.delete(playerId);
        }
    }

    private _removePlayerFromAllPresenceZones(playerId: number): void {
        this._context.runtime.spawn.playersByPresenceZone.northWest.delete(playerId);
        this._context.runtime.spawn.playersByPresenceZone.northEast.delete(playerId);
        this._context.runtime.spawn.playersByPresenceZone.southWest.delete(playerId);
        this._context.runtime.spawn.playersByPresenceZone.southEast.delete(playerId);
        this._context.runtime.spawn.presenceZonesByPlayerId.delete(playerId);
    }

    private _setPlayerPresenceZonesFromTeleport(playerId: number, zones: readonly KothPresenceZone[]): void {
        this._removePlayerFromAllPresenceZones(playerId);
        for (const zone of zones) {
            this._addPlayerToPresenceZone(playerId, zone);
        }
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

            try {
                return mod.GetObjectPosition(mod.GetCapturePoint(capturePointId));
            } catch (_err) {
                this._warnMissingObjectiveOnce(capturePointId);
            }
        }

        return undefined;
    }

    private _getPreferredCapturePointId(activeHill: KothHillConfig): number {
        switch (this._context.runtime.hill.currentControlState) {
            case 'team1':
                return activeHill.team1CapturePointId;
            case 'team2':
                return activeHill.team2CapturePointId;
            case 'neutral':
            case 'contested':
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

        if (this._isZeroVector(position)) {
            this._warnInvalidAnchorPositionOnce(anchorObjectId);
            return undefined;
        }

        return {
            position,
            orientationRadians: this._yawTowardActiveObjective(position),
            label: `${sector.regionId}-${sector.teamSide}-${sector.variantSide}-${anchorObjectId}`,
            pressureZones: sector.pressureZones,
        };
    }

    private _teleportPlayer(player: mod.Player, destination: ResolvedKothSpawnDestination): void {
        try {
            mod.Teleport(player, destination.position, destination.orientationRadians);
            this._setPlayerPresenceZonesFromTeleport(getKothPlayerId(player), destination.pressureZones);
        } catch (_err) {
            displayWorldLog(mod.Message("[KOTH] Spawn teleport failed for {}", destination.label));
        }
    }

    private _getEnemySafetyPenalty(
        position: mod.Vector,
        teamId: KothTeamId,
        sector: KothSpawnSectorConfig
    ): number {
        const enemyCount = this._countEnemiesNearPosition(position, teamId, sector);
        if (enemyCount <= 0) return 0;

        return enemyCount * this._context.spawns.safety.unsafeAnchorPenalty;
    }

    private _isPositionSafeFromEnemies(
        position: mod.Vector,
        teamId: KothTeamId,
        sector: KothSpawnSectorConfig
    ): boolean {
        return this._countEnemiesNearPosition(position, teamId, sector) <= 0;
    }

    private _countEnemiesNearPosition(
        position: mod.Vector,
        teamId: KothTeamId,
        sector: KothSpawnSectorConfig
    ): number {
        let count = 0;
        const enemyIds = this._getCachedEnemyIdsForSector(sector, teamId);

        enemyIds.forEach((playerId) => {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;
            const enemyPosition = this._getPlayerPosition(playerState.player);
            if (!enemyPosition) return;

            if (mod.DistanceBetween(position, enemyPosition) <= this._context.spawns.safety.enemySafetyRadiusMeters) {
                count += 1;
            }
        });

        return count;
    }

    private _getCachedEnemyIdsForSector(sector: KothSpawnSectorConfig, teamId: KothTeamId): Set<number> {
        const enemyIds = new Set<number>();
        const enemyTeamId = this._getEnemyTeamId(teamId);

        for (const zone of sector.pressureZones) {
            const playerIds = this._context.runtime.spawn.playersByPresenceZone[zone];
            playerIds.forEach((playerId) => {
                const playerState = this._context.runtime.playersById.get(playerId);
                if (!playerState || !this._isLivingDeployedParticipant(playerState)) return;
                if (getKothTeamId(playerState.team) === enemyTeamId) enemyIds.add(playerId);
            });
        }

        return enemyIds;
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
        const objectivePosition = this._getActiveObjectivePosition(this._context.runtime.hill.currentHillLetter);
        if (!objectivePosition) return 0;

        const deltaX = mod.XComponentOf(objectivePosition) - mod.XComponentOf(fromPosition);
        const deltaZ = mod.ZComponentOf(objectivePosition) - mod.ZComponentOf(fromPosition);
        return Math.atan2(deltaX, deltaZ);
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

    private _isLivingDeployedParticipant(playerState: KothPlayerState): boolean {
        const player = playerState.player;
        if (!mod.IsPlayerValid(player)) return false;
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
        displayWorldLog(mod.Message("[KOTH] No KOTH spawn anchors configured for active objective"));
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
