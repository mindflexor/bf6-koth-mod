import { Events } from 'bf6-portal-utils/events/index.ts';
import { MultiClickDetector } from 'bf6-portal-utils/multi-click-detector/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { UI } from 'bf6-portal-utils/ui/index.ts';
import { UIContainer } from 'bf6-portal-utils/ui/components/container/index.ts';
import { UIText } from 'bf6-portal-utils/ui/components/text/index.ts';
import type { OptionalObserverController } from '../contracts/observer-controller.ts';

export type SpectatorModeController = OptionalObserverController;

type RuntimeVector = { x: number; y: number; z: number };
type VectorOffset = { x: number; y: number; z: number };
type SpectatorCameraMode = 'target' | 'free';

const DEFAULT_TRIGGER_REQUIRED_CLICKS = 3;
const DEFAULT_TRIGGER_WINDOW_MS = 2_000;
const DEFAULT_FIXED_CAMERA_INDEX = 9301;
const DEFAULT_FIXED_CAMERA_FALLBACK_INDEX = 0;
const DEFAULT_VIEW_TICK_MS = 33;
const DEFAULT_UI_REFRESH_INTERVAL_MS = 250;
const DEFAULT_FOLLOW_BACK_DISTANCE_METERS = 3;
const DEFAULT_FOLLOW_HEIGHT_METERS = 0.9;
const DEFAULT_FOLLOW_RIGHT_OFFSET_METERS = 0.55;
const DEFAULT_FOLLOW_PITCH_OFFSET_RADIANS = 10 * (Math.PI / 180);
const DEFAULT_FOLLOW_ROTATION_SMOOTHING = 0.12;
const DEFAULT_FOLLOW_TARGET_Y_SMOOTHING = 0.08;
const DEFAULT_PITCH_LIMIT_RADIANS = 89 * (Math.PI / 180);
const DEFAULT_CAMERA_FOLLOW_SMOOTHING_SECONDS = 0.2;
const DEFAULT_FREECAM_SPEED_METERS_PER_SECOND = 6;
const DEFAULT_FREECAM_SPRINT_MULTIPLIER = 3;
const SPECTATOR_TEAM_ID = 3;
const SPECTATOR_DEPLOY_DELAY_SECONDS = 0.1;
const SPECTATOR_TEAM_REASSERT_DELAY_SECONDS = 0.15;
const SPECTATOR_TEAM_REASSERT_MAX_ATTEMPTS = 3;
const CONTROL_ROOM_DEFAULT_OFFSET_Y = -50;
const CONTROL_ROOM_SKY_OFFSET_Y = 300;
const CONTROL_ROOM_WATER_CHECK_DELAY_SECONDS = 1;
const MOVEMENT_INPUT_THRESHOLD_METERS_PER_SECOND = 0.05;
const VECTOR_EPSILON = 0.0001;
const OVERLAY_SIGNATURE_EMPTY = '';

const CONTROL_ROOM_GEOMETRY = {
    size: 0.005,
    wallHeight: 6.4,
    wallFaceOffsetX: 0.94,
    wallFaceOffsetZ: 0.3,
    wallOverlap: 0.5,
    floor: {
        minX: 0,
        maxX: 5,
        maxY: 0,
        minZ: -3.56,
        maxZ: 0,
    },
    ceiling: {
        minX: -0.01,
        maxX: 18.01,
        minY: -0.01,
        minZ: -0.01,
        maxZ: 10.25,
    },
};

export interface SpectatorModeConfig {
    canEnter(player: mod.Player): boolean;
    resolveSpawnPoint?(player: mod.Player, teamId: number): number | null;
    entryTeamId?: number;
    fixedCamera?: {
        preferredIndex?: number;
        fallbackIndex?: number;
    };
    cameraOffsets?: {
        third?: {
            x?: number;
            y?: number;
            z?: number;
        };
    };
    cameraFollow?: {
        smoothingSeconds?: number;
    };
    freeCam?: {
        speedMetersPerSecond?: number;
        sprintMultiplier?: number;
    };
    trigger?: {
        requiredClicks?: number;
        windowMs?: number;
    };
    ui?: {
        refreshIntervalMs?: number;
    };
}

interface SpectatorOverlayRefs {
    root: UIContainer;
    statusText: UIText;
}

interface SpectatorControlRoom {
    centerPosition: RuntimeVector;
    objects: mod.SpatialObject[];
    skySpawn: boolean;
}

interface SpectatorPlayerState {
    player: mod.Player;
    detector: MultiClickDetector;
    isDeployed: boolean;
    isSpectator: boolean;
    pendingControlRoomTeleport: boolean;
    deployTaskQueued: boolean;
    teamReassertTaskQueued: boolean;
    selectedTargetPlayerId: number | null;
    cameraMode: SpectatorCameraMode;
    lastJumpState: boolean;
    lastAppliedCameraSignature: string;
    lastOverlaySignature: string;
    smoothedCameraPosition: VectorOffset | null;
    smoothedCameraRotation: VectorOffset | null;
    smoothedTargetY: number | null;
    smoothedTargetPlayerId: number | null;
    freeCamPosition: VectorOffset | null;
    overlay?: SpectatorOverlayRefs;
}

class SpectatorMode implements SpectatorModeController {
    private readonly _canEnter: (player: mod.Player) => boolean;
    private readonly _resolveSpawnPoint: (player: mod.Player, teamId: number) => number | null;
    private readonly _entryTeamId: number;
    private readonly _requiredClicks: number;
    private readonly _windowMs: number;
    private readonly _uiRefreshIntervalMs: number;
    private readonly _fixedCameraPreferredIndex: number;
    private readonly _fixedCameraFallbackIndex: number;
    private readonly _followBackDistanceMeters: number;
    private readonly _followHeightMeters: number;
    private readonly _followRightOffsetMeters: number;
    private readonly _cameraFollowSmoothingSeconds: number;
    private readonly _freeCamSpeedMetersPerSecond: number;
    private readonly _freeCamSprintMultiplier: number;
    private readonly _playerStates = new Map<number, SpectatorPlayerState>();
    private readonly _unsubscribeFns: Array<() => void> = [];
    private readonly _viewTickIntervalId: number;
    private readonly _uiRefreshIntervalId: number;
    private _activeSpectatorPlayerId: number | null = null;
    private _resolvedFixedCameraIndex: number | undefined;
    private _fixedCameraInitialPosition: RuntimeVector | null = null;
    private _controlRoom: SpectatorControlRoom | null = null;

    public constructor(config: SpectatorModeConfig) {
        this._canEnter = config.canEnter;
        this._resolveSpawnPoint = config.resolveSpawnPoint ?? (() => null);
        this._entryTeamId = this._normalizePlayableTeamId(config.entryTeamId ?? 1);
        this._requiredClicks = Math.max(1, config.trigger?.requiredClicks ?? DEFAULT_TRIGGER_REQUIRED_CLICKS);
        this._windowMs = Math.max(250, config.trigger?.windowMs ?? DEFAULT_TRIGGER_WINDOW_MS);
        this._uiRefreshIntervalMs = Math.max(100, config.ui?.refreshIntervalMs ?? DEFAULT_UI_REFRESH_INTERVAL_MS);
        this._fixedCameraPreferredIndex = Math.max(
            0,
            Math.floor(config.fixedCamera?.preferredIndex ?? DEFAULT_FIXED_CAMERA_INDEX)
        );
        this._fixedCameraFallbackIndex = Math.max(
            0,
            Math.floor(config.fixedCamera?.fallbackIndex ?? DEFAULT_FIXED_CAMERA_FALLBACK_INDEX)
        );

        const thirdOffset = config.cameraOffsets?.third;
        this._followBackDistanceMeters = Math.max(
            1,
            Math.abs(thirdOffset?.z ?? -DEFAULT_FOLLOW_BACK_DISTANCE_METERS)
        );
        this._followHeightMeters = Math.max(0, thirdOffset?.y ?? DEFAULT_FOLLOW_HEIGHT_METERS);
        this._followRightOffsetMeters = thirdOffset?.x ?? DEFAULT_FOLLOW_RIGHT_OFFSET_METERS;
        this._cameraFollowSmoothingSeconds = Math.max(
            0,
            config.cameraFollow?.smoothingSeconds ?? DEFAULT_CAMERA_FOLLOW_SMOOTHING_SECONDS
        );
        this._freeCamSpeedMetersPerSecond = Math.max(
            0.1,
            config.freeCam?.speedMetersPerSecond ?? DEFAULT_FREECAM_SPEED_METERS_PER_SECOND
        );
        this._freeCamSprintMultiplier = Math.max(
            1,
            config.freeCam?.sprintMultiplier ?? DEFAULT_FREECAM_SPRINT_MULTIPLIER
        );

        this._unsubscribeFns.push(Events.OnPlayerJoinGame.subscribe((player) => this._handlePlayerJoinGame(player)));
        this._unsubscribeFns.push(Events.OnPlayerLeaveGame.subscribe((playerId) => this._handlePlayerLeaveGame(playerId)));
        this._unsubscribeFns.push(Events.OnPlayerDeployed.subscribe((player) => this._handlePlayerDeployed(player)));
        this._unsubscribeFns.push(Events.OnPlayerUndeploy.subscribe((player) => this._handlePlayerUndeployed(player)));
        this._unsubscribeFns.push(Events.OnGameModeEnding.subscribe(() => this.destroy()));

        this._bootstrapExistingPlayers();

        this._viewTickIntervalId = Timers.setInterval(() => {
            this._runViewTick();
        }, DEFAULT_VIEW_TICK_MS);

        this._uiRefreshIntervalId = Timers.setInterval(() => {
            this._runUiRefreshTick();
        }, this._uiRefreshIntervalMs);
    }

    public isSpectator(player: mod.Player): boolean {
        return mod.IsPlayerValid(player) && this.isSpectatorId(mod.GetObjId(player));
    }

    public isSpectatorId(playerId: number): boolean {
        return this._playerStates.get(playerId)?.isSpectator === true;
    }

    public destroy(): void {
        this._unsubscribeFns.forEach((unsubscribe) => unsubscribe());
        this._unsubscribeFns.length = 0;
        Timers.clearInterval(this._viewTickIntervalId);
        Timers.clearInterval(this._uiRefreshIntervalId);

        this._playerStates.forEach((state) => {
            state.detector.destroy();
            state.overlay?.root.delete();

            if (mod.IsPlayerValid(state.player)) {
                mod.EnablePlayerDeploy(state.player, true);
                mod.EnableAllInputRestrictions(state.player, false);
                mod.EnableUIInputMode(false, state.player);
                mod.SetPlayerIncomingDamageFactor(state.player, 100);
                mod.SetCameraTypeForPlayer(state.player, mod.Cameras.FirstPerson);
            }
        });

        this._playerStates.clear();
        this._activeSpectatorPlayerId = null;
        this._resolvedFixedCameraIndex = undefined;
        this._fixedCameraInitialPosition = null;
        this._unspawnControlRoom();
    }

    private _bootstrapExistingPlayers(): void {
        const players = mod.AllPlayers();

        for (let index = 0; index < mod.CountOf(players); index++) {
            const player = mod.ValueInArray(players, index) as mod.Player;

            if (player && mod.IsPlayerValid(player)) {
                this._handlePlayerJoinGame(player);
            }
        }
    }

    private _handlePlayerJoinGame(player: mod.Player): void {
        const playerId = mod.GetObjId(player);
        const existing = this._playerStates.get(playerId);

        if (existing) {
            existing.detector.destroy();
            existing.overlay?.root.delete();
        }

        this._playerStates.set(playerId, this._createPlayerState(player));
    }

    private _handlePlayerLeaveGame(playerId: number): void {
        const state = this._playerStates.get(playerId);

        if (state) {
            state.detector.destroy();
            state.overlay?.root.delete();
            this._playerStates.delete(playerId);
        }

        if (this._activeSpectatorPlayerId === playerId) {
            this._activeSpectatorPlayerId = null;
            this._unspawnControlRoom();
        }
    }

    private _handlePlayerDeployed(player: mod.Player): void {
        const playerId = mod.GetObjId(player);
        const state = this._playerStates.get(playerId);

        if (!state) {
            return;
        }

        state.isDeployed = true;

        if (!state.isSpectator) {
            return;
        }

        state.lastAppliedCameraSignature = OVERLAY_SIGNATURE_EMPTY;

        if (state.pendingControlRoomTeleport) {
            return;
        }

        state.deployTaskQueued = false;
        mod.EnablePlayerDeploy(player, false);
        mod.SetPlayerIncomingDamageFactor(player, 0);
        this._applySpectatorInputRestrictions(state);
        this._restoreSpectatorControlRoomState(state, true);
    }

    private _handlePlayerUndeployed(player: mod.Player): void {
        const playerId = mod.GetObjId(player);
        const state = this._playerStates.get(playerId);

        if (!state) {
            return;
        }

        state.isDeployed = false;

        if (state.isSpectator) {
            this._showOverlayForActiveSpectator(state);
            this._forceSpawnAndTeleportSpectatorAfterDelay(playerId);
        }
    }

    private _createPlayerState(player: mod.Player): SpectatorPlayerState {
        const playerId = mod.GetObjId(player);
        const detector = new MultiClickDetector(
            player,
            () => {
                this._handleSpectatorTrigger(playerId);
            },
            {
                soldierState: mod.SoldierStateBool.IsInteracting,
                requiredClicks: this._requiredClicks,
                windowMs: this._windowMs,
            }
        );

        return {
            player,
            detector,
            isDeployed: this._isPlayerCurrentlyDeployed(player),
            isSpectator: false,
            pendingControlRoomTeleport: false,
            deployTaskQueued: false,
            teamReassertTaskQueued: false,
            selectedTargetPlayerId: null,
            cameraMode: 'target',
            lastJumpState: false,
            lastAppliedCameraSignature: OVERLAY_SIGNATURE_EMPTY,
            lastOverlaySignature: OVERLAY_SIGNATURE_EMPTY,
            smoothedCameraPosition: null,
            smoothedCameraRotation: null,
            smoothedTargetY: null,
            smoothedTargetPlayerId: null,
            freeCamPosition: null,
        };
    }

    private _handleSpectatorTrigger(playerId: number): void {
        const state = this._playerStates.get(playerId);

        if (!state || !mod.IsPlayerValid(state.player) || this._isBotPlayer(state.player)) {
            return;
        }

        if (state.isSpectator) {
            return;
        }

        if (this._activeSpectatorPlayerId !== null && this._activeSpectatorPlayerId !== playerId) {
            this._showNotification(state.player, 'SpectatorSlotBusy');
            return;
        }

        if (!this._isCombatTeam(mod.GetTeam(state.player))) {
            return;
        }

        if (!this._canEnter(state.player)) {
            return;
        }

        this._enterSpectatorMode(state);
    }

    private _enterSpectatorMode(state: SpectatorPlayerState): void {
        const player = state.player;
        const playerId = mod.GetObjId(player);

        if (!this._ensureControlRoom(false)) {
            this._showNotification(player, 'SpectatorControlRoomUnavailable');
            return;
        }

        this._activeSpectatorPlayerId = playerId;
        state.isSpectator = true;
        state.pendingControlRoomTeleport = false;
        state.deployTaskQueued = false;
        state.teamReassertTaskQueued = false;
        state.selectedTargetPlayerId = null;
        state.cameraMode = 'target';
        state.lastJumpState = false;
        state.lastAppliedCameraSignature = OVERLAY_SIGNATURE_EMPTY;
        state.lastOverlaySignature = OVERLAY_SIGNATURE_EMPTY;
        state.smoothedCameraPosition = null;
        state.smoothedCameraRotation = null;
        state.smoothedTargetY = null;
        state.smoothedTargetPlayerId = null;
        state.freeCamPosition = null;

        this._showOverlayForActiveSpectator(state);
        this._showNotification(player, 'SpectatorEntered');

        mod.SetPlayerIncomingDamageFactor(player, 0);
        mod.EnablePlayerDeploy(player, true);
        mod.SetRedeployTime(player, 0);
        this._applySpectatorInputRestrictions(state);

        this._forceSpawnAndTeleportSpectatorAfterDelay(playerId);
    }

    private _ensureSpectatorTeam(state: SpectatorPlayerState): void {
        if (!state.isSpectator || !mod.IsPlayerValid(state.player)) {
            return;
        }

        const spectatorTeam = mod.GetTeam(SPECTATOR_TEAM_ID);
        const currentTeam = mod.GetTeam(state.player);

        if (mod.Equals(currentTeam, spectatorTeam)) {
            return;
        }

        mod.SetTeam(state.player, spectatorTeam);
        this._queueSpectatorTeamReassertion(mod.GetObjId(state.player));
    }

    private _forceSpawnAndTeleportSpectatorAfterDelay(playerId: number): void {
        const state = this._playerStates.get(playerId);

        if (!state || !state.isSpectator || !mod.IsPlayerValid(state.player)) {
            return;
        }

        if (state.deployTaskQueued) {
            return;
        }

        state.pendingControlRoomTeleport = true;
        state.deployTaskQueued = true;
        mod.EnablePlayerDeploy(state.player, true);
        mod.SetRedeployTime(state.player, 0);
        this._showOverlayForActiveSpectator(state);

        void (async () => {
            try {
                const spawn = this._resolveSpectatorSpawnPoint(state);

                if (!spawn) {
                    state.pendingControlRoomTeleport = false;
                    this._showNotification(state.player, 'SpectatorControlRoomUnavailable');
                    return;
                }

                if (state.isDeployed || this._isPlayerCurrentlyDeployed(state.player)) {
                    try {
                        mod.UndeployPlayer(state.player);
                    } catch {
                        // If the engine already considers the player undeployed, continue into the forced spawn path.
                    }

                    await mod.Wait(SPECTATOR_DEPLOY_DELAY_SECONDS);
                }

                let refreshedState = this._playerStates.get(playerId);

                if (!this._canFinishControlRoomTeleport(refreshedState)) {
                    return;
                }

                refreshedState.isDeployed = this._isPlayerCurrentlyDeployed(refreshedState.player);

                if (refreshedState.isDeployed) {
                    this._ensureSpectatorTeam(refreshedState);
                    refreshedState.pendingControlRoomTeleport = false;
                    return;
                }

                this._ensureSpectatorTeam(refreshedState);
                mod.SpawnPlayerFromSpawnPoint(refreshedState.player, spawn.spawnPointId);
                await mod.Wait(SPECTATOR_DEPLOY_DELAY_SECONDS);

                refreshedState = this._playerStates.get(playerId);

                if (!this._canFinishControlRoomTeleport(refreshedState)) {
                    return;
                }

                refreshedState.isDeployed = this._isPlayerCurrentlyDeployed(refreshedState.player);

                if (!refreshedState.isDeployed) {
                    this._setTemporarySpawnTeam(refreshedState, spawn.teamId);
                    mod.SpawnPlayerFromSpawnPoint(refreshedState.player, spawn.spawnPointId);
                    await mod.Wait(SPECTATOR_DEPLOY_DELAY_SECONDS);
                }

                refreshedState = this._playerStates.get(playerId);

                if (!this._canFinishControlRoomTeleport(refreshedState)) {
                    return;
                }

                refreshedState.isDeployed = this._isPlayerCurrentlyDeployed(refreshedState.player);

                if (!refreshedState.isDeployed) {
                    this._ensureSpectatorTeam(refreshedState);
                    refreshedState.pendingControlRoomTeleport = false;
                    return;
                }

                mod.EnablePlayerDeploy(refreshedState.player, false);
                mod.SetPlayerIncomingDamageFactor(refreshedState.player, 0);
                this._applySpectatorInputRestrictions(refreshedState);
                this._restoreSpectatorControlRoomState(refreshedState, true);
            } finally {
                const latestState = this._playerStates.get(playerId);

                if (latestState) {
                    latestState.deployTaskQueued = false;
                }
            }
        })();
    }

    private _restoreSpectatorControlRoomState(state: SpectatorPlayerState, forceCamera: boolean): void {
        if (!state.isSpectator || !mod.IsPlayerValid(state.player)) {
            return;
        }

        this._teleportSpectatorIntoControlRoom(state, true);
        this._showOverlayForActiveSpectator(state);
        this._ensureSpectatorTeam(state);
        this._ensureTargetSelection(state);
        this._applySpectatorCamera(state, forceCamera);
        this._refreshOverlay(state, true);
    }

    private _resolveSpectatorSpawnPoint(
        state: SpectatorPlayerState
    ): { spawnPointId: number; teamId: number } | null {
        const primaryTeamId = this._entryTeamId;
        const primarySpawnPointId = this._sanitizeSpawnPointId(
            this._resolveSpawnPoint(state.player, primaryTeamId)
        );

        if (primarySpawnPointId > 0) {
            return {
                spawnPointId: primarySpawnPointId,
                teamId: primaryTeamId,
            };
        }

        const fallbackTeamId = primaryTeamId === 1 ? 2 : 1;
        const fallbackSpawnPointId = this._sanitizeSpawnPointId(
            this._resolveSpawnPoint(state.player, fallbackTeamId)
        );

        if (fallbackSpawnPointId > 0) {
            return {
                spawnPointId: fallbackSpawnPointId,
                teamId: fallbackTeamId,
            };
        }

        return null;
    }

    private _setTemporarySpawnTeam(state: SpectatorPlayerState, teamId: number): void {
        if (!state.isSpectator || !mod.IsPlayerValid(state.player)) {
            return;
        }

        const spawnTeam = mod.GetTeam(this._normalizePlayableTeamId(teamId));

        if (!mod.Equals(mod.GetTeam(state.player), spawnTeam)) {
            mod.SetTeam(state.player, spawnTeam);
        }
    }

    private _queueSpectatorTeamReassertion(playerId: number): void {
        const state = this._playerStates.get(playerId);

        if (!state || state.teamReassertTaskQueued) {
            return;
        }

        state.teamReassertTaskQueued = true;

        void (async () => {
            try {
                for (let attempt = 0; attempt < SPECTATOR_TEAM_REASSERT_MAX_ATTEMPTS; attempt++) {
                    await mod.Wait(SPECTATOR_TEAM_REASSERT_DELAY_SECONDS);

                    const latestState = this._playerStates.get(playerId);

                    if (
                        !latestState ||
                        !latestState.isSpectator ||
                        this._activeSpectatorPlayerId !== playerId ||
                        !mod.IsPlayerValid(latestState.player)
                    ) {
                        return;
                    }

                    const spectatorTeam = mod.GetTeam(SPECTATOR_TEAM_ID);
                    const currentTeam = mod.GetTeam(latestState.player);

                    if (mod.Equals(currentTeam, spectatorTeam)) {
                        return;
                    }

                    mod.SetTeam(latestState.player, spectatorTeam);
                }
            } finally {
                const latestState = this._playerStates.get(playerId);

                if (latestState) {
                    latestState.teamReassertTaskQueued = false;
                }
            }
        })();
    }

    private _canFinishControlRoomTeleport(state: SpectatorPlayerState | undefined): state is SpectatorPlayerState {
        return (
            state !== undefined &&
            state.isSpectator &&
            state.pendingControlRoomTeleport &&
            mod.IsPlayerValid(state.player)
        );
    }

    private _teleportSpectatorIntoControlRoom(state: SpectatorPlayerState, runWaterCheck: boolean): boolean {
        const room = this._controlRoom ?? this._ensureControlRoom(false);

        if (!room || !state.isSpectator || !mod.IsPlayerValid(state.player)) {
            return false;
        }

        try {
            mod.Teleport(state.player, this._toModVector(room.centerPosition), 0);
        } catch {
            return false;
        }

        state.pendingControlRoomTeleport = false;
        state.lastAppliedCameraSignature = OVERLAY_SIGNATURE_EMPTY;
        state.lastOverlaySignature = OVERLAY_SIGNATURE_EMPTY;

        if (runWaterCheck) {
            this._queueControlRoomWaterCheck(mod.GetObjId(state.player));
        }

        return true;
    }

    private _queueControlRoomWaterCheck(playerId: number): void {
        void (async () => {
            await mod.Wait(CONTROL_ROOM_WATER_CHECK_DELAY_SECONDS);

            const state = this._playerStates.get(playerId);

            if (
                !state ||
                !state.isSpectator ||
                this._activeSpectatorPlayerId !== playerId ||
                !mod.IsPlayerValid(state.player)
            ) {
                return;
            }

            if (!this._getSoldierStateBoolSafe(state.player, mod.SoldierStateBool.IsInWater)) {
                return;
            }

            this._unspawnControlRoom();

            if (!this._ensureControlRoom(true)) {
                this._showNotification(state.player, 'SpectatorControlRoomUnavailable');
                return;
            }

            this._teleportSpectatorIntoControlRoom(state, false);
        })();
    }

    private _ensureControlRoom(skySpawn: boolean): SpectatorControlRoom | null {
        if (this._controlRoom) {
            if (this._controlRoom.skySpawn === skySpawn || !skySpawn) {
                return this._controlRoom;
            }

            this._unspawnControlRoom();
        }

        const fixedCameraInitialPosition = this._getFixedCameraInitialPosition();

        if (!fixedCameraInitialPosition) {
            return null;
        }

        const room = this._spawnControlRoomAt(fixedCameraInitialPosition, skySpawn);

        if (room || skySpawn) {
            return room;
        }

        return this._spawnControlRoomAt(fixedCameraInitialPosition, true);
    }

    private _spawnControlRoomAt(
        fixedCameraInitialPosition: RuntimeVector,
        skySpawn: boolean
    ): SpectatorControlRoom | null {
        const room = CONTROL_ROOM_GEOMETRY;
        const centerPosition = this._vectorAdd(fixedCameraInitialPosition, {
            x: 0,
            y: skySpawn ? CONTROL_ROOM_SKY_OFFSET_Y : CONTROL_ROOM_DEFAULT_OFFSET_Y,
            z: 0,
        });
        const halfInterior = room.size / 2;
        const coverSize = Math.max(
            room.size + room.wallFaceOffsetX * 2,
            room.size + room.wallFaceOffsetZ * 2
        );
        const floorUniformScale = Math.max(
            coverSize / (room.floor.maxX - room.floor.minX),
            coverSize / (room.floor.maxZ - room.floor.minZ)
        );
        const ceilingUniformScale = Math.max(
            coverSize / (room.ceiling.maxX - room.ceiling.minX),
            coverSize / (room.ceiling.maxZ - room.ceiling.minZ)
        );
        const floorCenterLocalX = (room.floor.minX + room.floor.maxX) / 2;
        const floorCenterLocalZ = (room.floor.minZ + room.floor.maxZ) / 2;
        const ceilingCenterLocalX = (room.ceiling.minX + room.ceiling.maxX) / 2;
        const ceilingCenterLocalZ = (room.ceiling.minZ + room.ceiling.maxZ) / 2;
        const leftX = centerPosition.x - halfInterior;
        const rightX = centerPosition.x + halfInterior;
        const frontZ = centerPosition.z - halfInterior;
        const backZ = centerPosition.z + halfInterior;
        const spawned: mod.SpatialObject[] = [];

        try {
            spawned.push(
                this._spawnRuntimeObject(
                    mod.RuntimeSpawn_Common.FiringRange_Wall_2048_01,
                    {
                        x: leftX - room.wallOverlap,
                        y: centerPosition.y,
                        z: frontZ + room.wallFaceOffsetZ,
                    },
                    { x: 0, y: 0, z: 0 }
                )
            );
            spawned.push(
                this._spawnRuntimeObject(
                    mod.RuntimeSpawn_Common.FiringRange_Wall_2048_01,
                    {
                        x: rightX + room.wallOverlap,
                        y: centerPosition.y,
                        z: backZ - room.wallFaceOffsetZ,
                    },
                    { x: 0, y: Math.PI, z: 0 }
                )
            );
            spawned.push(
                this._spawnRuntimeObject(
                    mod.RuntimeSpawn_Common.FiringRange_Wall_2048_01,
                    {
                        x: leftX - room.wallFaceOffsetX,
                        y: centerPosition.y,
                        z: frontZ + room.wallOverlap,
                    },
                    { x: 0, y: Math.PI / 2, z: 0 }
                )
            );
            spawned.push(
                this._spawnRuntimeObject(
                    mod.RuntimeSpawn_Common.FiringRange_Wall_2048_01,
                    {
                        x: rightX + room.wallFaceOffsetX,
                        y: centerPosition.y,
                        z: backZ - room.wallOverlap,
                    },
                    { x: 0, y: -Math.PI / 2, z: 0 }
                )
            );
            spawned.push(
                this._spawnRuntimeObject(
                    mod.RuntimeSpawn_Common.FiringRange_Floor_A,
                    {
                        x: centerPosition.x - floorCenterLocalX * floorUniformScale,
                        y: centerPosition.y - room.floor.maxY * floorUniformScale,
                        z: centerPosition.z - floorCenterLocalZ * floorUniformScale,
                    },
                    { x: 0, y: 0, z: 0 },
                    { x: floorUniformScale, y: floorUniformScale, z: floorUniformScale }
                )
            );
            spawned.push(
                this._spawnRuntimeObject(
                    mod.RuntimeSpawn_Common.FiringRange_Ceiling_02,
                    {
                        x: centerPosition.x - ceilingCenterLocalX * ceilingUniformScale,
                        y: centerPosition.y - room.ceiling.minY * (ceilingUniformScale + 1) + room.wallHeight,
                        z: centerPosition.z - ceilingCenterLocalZ * ceilingUniformScale,
                    },
                    { x: 0, y: 0, z: 0 },
                    {
                        x: ceilingUniformScale,
                        y: ceilingUniformScale + 1,
                        z: ceilingUniformScale,
                    }
                )
            );
        } catch {
            this._unspawnObjects(spawned);
            return null;
        }

        this._controlRoom = {
            centerPosition,
            objects: spawned,
            skySpawn,
        };

        return this._controlRoom;
    }

    private _spawnRuntimeObject(
        prefab: mod.RuntimeSpawn_Common,
        position: VectorOffset,
        rotation: VectorOffset,
        scale?: VectorOffset
    ): mod.SpatialObject {
        if (scale) {
            return mod.SpawnObject(
                prefab,
                this._toModVector(position),
                this._toModVector(rotation),
                this._toModVector(scale)
            ) as mod.SpatialObject;
        }

        return mod.SpawnObject(prefab, this._toModVector(position), this._toModVector(rotation)) as mod.SpatialObject;
    }

    private _unspawnControlRoom(): void {
        if (!this._controlRoom) {
            return;
        }

        this._unspawnObjects(this._controlRoom.objects);
        this._controlRoom = null;
    }

    private _unspawnObjects(objects: mod.SpatialObject[]): void {
        for (const object of objects) {
            try {
                mod.UnspawnObject(object);
            } catch {
                // Runtime cleanup is best-effort; the slot state still needs to be cleared.
            }
        }
    }

    private _runViewTick(): void {
        if (this._activeSpectatorPlayerId === null) {
            return;
        }

        const state = this._playerStates.get(this._activeSpectatorPlayerId);

        if (!state || !state.isSpectator || !state.isDeployed || !mod.IsPlayerValid(state.player)) {
            return;
        }

        this._ensureSpectatorTeam(state);
        this._applySpectatorInputRestrictions(state);
        this._handleSpectatorControls(state);
        this._applySpectatorCamera(state, false);
    }

    private _runUiRefreshTick(): void {
        if (this._activeSpectatorPlayerId === null) {
            this._playerStates.forEach((state) => state.overlay?.root.hide());
            return;
        }

        const state = this._playerStates.get(this._activeSpectatorPlayerId);

        if (!state || !state.isSpectator || !mod.IsPlayerValid(state.player)) {
            this._playerStates.forEach((playerState) => playerState.overlay?.root.hide());
            return;
        }

        this._refreshOverlay(state, false);
    }

    private _handleSpectatorControls(state: SpectatorPlayerState): void {
        const isJumping = this._getSoldierStateBoolSafe(state.player, mod.SoldierStateBool.IsJumping);

        if (isJumping && !state.lastJumpState) {
            this._selectNextTarget(state);
        }

        state.lastJumpState = isJumping;

        if (state.cameraMode === 'target' && this._hasMoveInput(state.player)) {
            state.cameraMode = 'free';
            state.freeCamPosition =
                state.smoothedCameraPosition ?? this._getFixedCameraPosition() ?? this._getPlayerWorldPosition(state.player);
            state.lastAppliedCameraSignature = OVERLAY_SIGNATURE_EMPTY;
            state.lastOverlaySignature = OVERLAY_SIGNATURE_EMPTY;
        }
    }

    private _selectNextTarget(state: SpectatorPlayerState): void {
        const targets = this._getSpectatablePlayers();

        if (targets.length <= 0) {
            state.selectedTargetPlayerId = null;
            state.cameraMode = 'target';
            state.freeCamPosition = null;
            state.smoothedTargetY = null;
            state.smoothedTargetPlayerId = null;
            state.lastAppliedCameraSignature = OVERLAY_SIGNATURE_EMPTY;
            state.lastOverlaySignature = OVERLAY_SIGNATURE_EMPTY;
            return;
        }

        const currentIndex = state.selectedTargetPlayerId === null
            ? -1
            : targets.findIndex((target) => mod.GetObjId(target) === state.selectedTargetPlayerId);
        const nextTarget = targets[(currentIndex + 1 + targets.length) % targets.length];

        state.selectedTargetPlayerId = mod.GetObjId(nextTarget);
        state.cameraMode = 'target';
        state.freeCamPosition = null;
        state.smoothedTargetY = null;
        state.smoothedTargetPlayerId = null;
        state.lastAppliedCameraSignature = OVERLAY_SIGNATURE_EMPTY;
        state.lastOverlaySignature = OVERLAY_SIGNATURE_EMPTY;
    }

    private _applySpectatorCamera(state: SpectatorPlayerState, force: boolean): void {
        this._ensureTargetSelection(state);

        if (state.cameraMode === 'free') {
            this._applyFreeCamera(state, force);
            return;
        }

        this._applyTargetCamera(state, force);
    }

    private _applyTargetCamera(state: SpectatorPlayerState, force: boolean): void {
        const target = this._getSelectedTargetPlayer(state);
        const signature = `target:${target ? mod.GetObjId(target) : 0}`;

        if (!target) {
            const observerPosition = this._getPlayerWorldPosition(state.player);

            if (!observerPosition) {
                state.lastAppliedCameraSignature = signature;
                return;
            }

            const lookAt = this._getLookAheadPoint(state.player, observerPosition);
            this._applyFixedCameraView(state, signature, observerPosition, lookAt, force);
            return;
        }

        const targetPosition = this._getViewTargetPosition(target);

        if (!targetPosition) {
            state.selectedTargetPlayerId = null;
            state.smoothedTargetY = null;
            state.smoothedTargetPlayerId = null;
            state.lastAppliedCameraSignature = OVERLAY_SIGNATURE_EMPTY;
            return;
        }

        const cameraPlacement = this._buildFollowCameraPlacement(state, target, targetPosition);

        if (
            this._applyFixedCameraView(
                state,
                signature,
                cameraPlacement.position,
                cameraPlacement.lookAt,
                force,
                DEFAULT_FOLLOW_PITCH_OFFSET_RADIANS
            )
        ) {
            return;
        }

        if (force || state.lastAppliedCameraSignature !== signature) {
            mod.SetCameraTypeForPlayer(state.player, mod.Cameras.ThirdPerson);
        }

        state.lastAppliedCameraSignature = signature;
    }

    private _applyFreeCamera(state: SpectatorPlayerState, force: boolean): void {
        const observerPosition = this._getPlayerWorldPosition(state.player);

        if (!state.freeCamPosition) {
            state.freeCamPosition =
                state.smoothedCameraPosition ?? this._getFixedCameraPosition() ?? observerPosition ?? this._zeroVector();
        }

        if (observerPosition) {
            const inputDirection = this._getMoveInputDirection(state.player);

            if (inputDirection && this._isFiniteVector(inputDirection)) {
                const speedMultiplier = this._getSoldierStateBoolSafe(state.player, mod.SoldierStateBool.IsSprinting)
                    ? this._freeCamSprintMultiplier
                    : 1;
                const distance = this._freeCamSpeedMetersPerSecond * speedMultiplier * (DEFAULT_VIEW_TICK_MS / 1_000);

                state.freeCamPosition = this._vectorAdd(state.freeCamPosition, {
                    x: inputDirection.x * distance,
                    y: inputDirection.y * distance,
                    z: inputDirection.z * distance,
                });
            }
        }

        const target = this._getSelectedTargetPlayer(state);
        const freeCamPosition = state.freeCamPosition as RuntimeVector;
        const lookAt = this._getLookAheadPoint(state.player, freeCamPosition);
        const signature = `free:${target ? mod.GetObjId(target) : 0}`;

        if (this._applyFixedCameraView(state, signature, freeCamPosition, lookAt, force)) {
            return;
        }

        if (force || state.lastAppliedCameraSignature !== signature) {
            mod.SetCameraTypeForPlayer(state.player, mod.Cameras.Free);
        }

        state.lastAppliedCameraSignature = signature;
    }

    private _applyFixedCameraView(
        state: SpectatorPlayerState,
        signature: string,
        desiredPosition: RuntimeVector,
        lookAtPosition: RuntimeVector,
        force: boolean,
        pitchOffsetRadians = 0
    ): boolean {
        const cameraIndex = this._tryGetFixedCameraIndex();

        if (cameraIndex === null) {
            return false;
        }

        const fixedCamera = this._tryGetFixedCamera(cameraIndex);

        if (!fixedCamera) {
            return false;
        }

        const desiredRotation = this._buildRotationTowards(desiredPosition, lookAtPosition, pitchOffsetRadians);
        const smoothingAlpha = this._getSmoothingAlpha(force);
        const rotationSmoothingAlpha = this._getRotationSmoothingAlpha(force);
        const nextPosition =
            state.smoothedCameraPosition === null
                ? desiredPosition
                : (this._vectorLerp(state.smoothedCameraPosition, desiredPosition, smoothingAlpha) as RuntimeVector);
        const nextRotation =
            state.smoothedCameraRotation === null
                ? desiredRotation
                : this._lerpRotation(state.smoothedCameraRotation, desiredRotation, rotationSmoothingAlpha);

        state.smoothedCameraPosition = nextPosition;
        state.smoothedCameraRotation = nextRotation;

        this._setFixedCameraTransform(fixedCamera, nextPosition, nextRotation.x, nextRotation.y);

        if (force || state.lastAppliedCameraSignature !== signature) {
            mod.SetCameraTypeForPlayer(state.player, mod.Cameras.Fixed, cameraIndex);
        }

        state.lastAppliedCameraSignature = signature;
        return true;
    }

    private _buildFollowCameraPlacement(
        state: SpectatorPlayerState,
        target: mod.Player,
        targetPosition: RuntimeVector
    ): { position: RuntimeVector; lookAt: RuntimeVector } {
        const targetPlayerId = mod.GetObjId(target);

        if (state.smoothedTargetPlayerId !== targetPlayerId) {
            state.smoothedTargetPlayerId = targetPlayerId;
            state.smoothedTargetY = null;
        }

        const smoothedTargetY =
            state.smoothedTargetY === null
                ? targetPosition.y
                : this._lerp(state.smoothedTargetY, targetPosition.y, DEFAULT_FOLLOW_TARGET_Y_SMOOTHING);
        state.smoothedTargetY = smoothedTargetY;

        const trackedPosition = {
            x: targetPosition.x,
            y: smoothedTargetY,
            z: targetPosition.z,
        };
        const facing = this._getPlayerFacingDirection(target);
        const flatFacing = this._normalizeVector({
            x: facing?.x ?? 0,
            y: 0,
            z: facing?.z ?? -1,
        });
        const safeFacing =
            Math.abs(flatFacing.x) <= VECTOR_EPSILON && Math.abs(flatFacing.z) <= VECTOR_EPSILON
                ? { x: 0, y: 0, z: -1 }
                : flatFacing;
        const rightFromFacing = this._normalizeVector({
            x: -safeFacing.z,
            y: 0,
            z: safeFacing.x,
        });
        const position = this._vectorAdd(trackedPosition, {
            x:
                -safeFacing.x * this._followBackDistanceMeters +
                rightFromFacing.x * this._followRightOffsetMeters,
            y: this._followHeightMeters,
            z:
                -safeFacing.z * this._followBackDistanceMeters +
                rightFromFacing.z * this._followRightOffsetMeters,
        });

        return {
            position,
            lookAt: trackedPosition,
        };
    }

    private _applySpectatorInputRestrictions(state: SpectatorPlayerState): void {
        const player = state.player;

        if (!mod.IsPlayerValid(player)) {
            return;
        }

        mod.EnableAllInputRestrictions(player, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.Reload, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.CycleFire, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.CyclePrimary, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.SelectCharacterGadget, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.SelectMelee, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.SelectOpenGadget, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.SelectPrimary, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.SelectSecondary, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.SelectThrowable, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.Crouch, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.Prone, true);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.Interact, true);
    }

    private _ensureOverlay(state: SpectatorPlayerState): SpectatorOverlayRefs {
        if (state.overlay) {
            return state.overlay;
        }

        const root = new UIContainer({
            receiver: state.player,
            y: 110,
            width: 520,
            height: 52,
            anchor: mod.UIAnchor.BottomCenter,
            bgColor: UI.COLORS.BLACK,
            bgAlpha: 0.62,
            bgFill: mod.UIBgFill.Blur,
            visible: false,
            uiInputModeWhenVisible: false,
        });

        const statusText = new UIText({
            parent: root,
            width: 500,
            height: 44,
            anchor: mod.UIAnchor.Center,
            message: this._spectatorMessage('SpectatorNoTarget'),
            textSize: 28,
            textColor: UI.COLORS.WHITE,
            textAnchor: mod.UIAnchor.Center,
        });

        state.overlay = {
            root,
            statusText,
        };

        return state.overlay;
    }

    private _isActiveSpectatorState(state: SpectatorPlayerState): boolean {
        return (
            state.isSpectator &&
            mod.IsPlayerValid(state.player) &&
            this._activeSpectatorPlayerId === mod.GetObjId(state.player)
        );
    }

    private _showOverlayForActiveSpectator(state: SpectatorPlayerState): SpectatorOverlayRefs | null {
        if (!this._isActiveSpectatorState(state)) {
            state.overlay?.root.hide();
            return null;
        }

        const overlay = this._ensureOverlay(state);
        overlay.root.show();
        return overlay;
    }

    private _refreshOverlay(state: SpectatorPlayerState, force: boolean): void {
        const target = this._getSelectedTargetPlayer(state);
        const targetId = target ? mod.GetObjId(target) : 0;
        const signature = `${state.cameraMode}:${targetId}`;
        const overlay = this._showOverlayForActiveSpectator(state);

        if (!overlay) {
            state.lastOverlaySignature = signature;
            return;
        }

        if (!force && state.lastOverlaySignature === signature) {
            return;
        }

        if (!target) {
            overlay.statusText.setMessage(this._spectatorMessage('SpectatorNoTarget'));
        } else if (state.cameraMode === 'free') {
            overlay.statusText.setMessage(this._spectatorMessage('SpectatorOverlayFreeCam', target));
        } else {
            overlay.statusText.setMessage(this._spectatorMessage('SpectatorOverlaySpectating', target));
        }

        state.lastOverlaySignature = signature;
    }

    private _ensureTargetSelection(state: SpectatorPlayerState): void {
        const selected = this._getSelectedTargetPlayer(state);

        if (selected) {
            return;
        }

        const targets = this._getSpectatablePlayers();
        const nextTarget = targets[0] ?? null;
        state.selectedTargetPlayerId = nextTarget ? mod.GetObjId(nextTarget) : null;
        state.lastOverlaySignature = OVERLAY_SIGNATURE_EMPTY;
    }

    private _getSelectedTargetPlayer(state: SpectatorPlayerState): mod.Player | null {
        if (state.selectedTargetPlayerId === null) {
            return null;
        }

        const targetState = this._playerStates.get(state.selectedTargetPlayerId);

        if (
            targetState &&
            mod.IsPlayerValid(targetState.player) &&
            !targetState.isSpectator &&
            this._isAlivePlayer(targetState.player)
        ) {
            return targetState.player;
        }

        return this._findPlayerById(state.selectedTargetPlayerId);
    }

    private _findPlayerById(playerId: number): mod.Player | null {
        const players = mod.AllPlayers();

        for (let index = 0; index < mod.CountOf(players); index++) {
            const player = mod.ValueInArray(players, index) as mod.Player;

            if (!player || !mod.IsPlayerValid(player) || mod.GetObjId(player) !== playerId) {
                continue;
            }

            if (this.isSpectatorId(playerId) || !this._isAlivePlayer(player)) {
                return null;
            }

            return player;
        }

        return null;
    }

    private _getSpectatablePlayers(): mod.Player[] {
        const targets: mod.Player[] = [];
        const players = mod.AllPlayers();

        for (let index = 0; index < mod.CountOf(players); index++) {
            const player = mod.ValueInArray(players, index) as mod.Player;

            if (!player || !mod.IsPlayerValid(player)) {
                continue;
            }

            const playerId = mod.GetObjId(player);

            if (this.isSpectatorId(playerId) || !this._isAlivePlayer(player)) {
                continue;
            }

            targets.push(player);
        }

        return targets;
    }

    private _tryGetFixedCameraIndex(): number | null {
        const candidates: number[] = [];

        if (this._resolvedFixedCameraIndex !== undefined) {
            candidates.push(this._resolvedFixedCameraIndex);
        }

        if (!candidates.includes(this._fixedCameraPreferredIndex)) {
            candidates.push(this._fixedCameraPreferredIndex);
        }

        if (!candidates.includes(this._fixedCameraFallbackIndex)) {
            candidates.push(this._fixedCameraFallbackIndex);
        }

        for (const candidate of candidates) {
            try {
                mod.GetFixedCamera(candidate);
                this._resolvedFixedCameraIndex = candidate;
                return candidate;
            } catch {
                continue;
            }
        }

        this._resolvedFixedCameraIndex = undefined;
        return null;
    }

    private _tryGetFixedCamera(index: number): mod.FixedCamera | null {
        try {
            return mod.GetFixedCamera(index);
        } catch {
            return null;
        }
    }

    private _getFixedCameraPosition(): RuntimeVector | null {
        const cameraIndex = this._tryGetFixedCameraIndex();

        if (cameraIndex === null) {
            return null;
        }

        const fixedCamera = this._tryGetFixedCamera(cameraIndex);

        if (!fixedCamera) {
            return null;
        }

        try {
            return this._fromModVector(mod.GetObjectPosition(fixedCamera));
        } catch {
            return null;
        }
    }

    private _getFixedCameraInitialPosition(): RuntimeVector | null {
        if (this._fixedCameraInitialPosition) {
            return this._fixedCameraInitialPosition;
        }

        const position = this._getFixedCameraPosition();

        if (!position) {
            return null;
        }

        this._fixedCameraInitialPosition = this._copyVector(position);
        return this._fixedCameraInitialPosition;
    }

    private _getViewTargetPosition(player: mod.Player): RuntimeVector | null {
        if (!mod.IsPlayerValid(player)) {
            return null;
        }

        try {
            const eyePosition = this._fromModVector(
                mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition)
            );

            if (eyePosition) {
                return eyePosition;
            }
        } catch {
            // noop
        }

        return this._getPlayerWorldPosition(player);
    }

    private _getPlayerWorldPosition(player: mod.Player): RuntimeVector | null {
        if (!mod.IsPlayerValid(player)) {
            return null;
        }

        try {
            const position = this._fromModVector(mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition));

            if (position) {
                return position;
            }
        } catch {
            // noop
        }

        try {
            const position = this._fromModVector(mod.GetObjectPosition(player));

            if (position) {
                return position;
            }
        } catch {
            // noop
        }

        return null;
    }

    private _getPlayerFacingDirection(player: mod.Player): RuntimeVector | null {
        if (!mod.IsPlayerValid(player)) {
            return null;
        }

        try {
            return this._fromModVector(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
        } catch {
            return null;
        }
    }

    private _getPlayerLinearVelocity(player: mod.Player): RuntimeVector | null {
        if (!mod.IsPlayerValid(player)) {
            return null;
        }

        try {
            return this._fromModVector(mod.GetSoldierState(player, mod.SoldierStateVector.GetLinearVelocity));
        } catch {
            return null;
        }
    }

    private _hasMoveInput(player: mod.Player): boolean {
        const velocity = this._getPlayerLinearVelocity(player);

        if (!velocity) {
            return false;
        }

        const horizontalSpeedSq = velocity.x * velocity.x + velocity.z * velocity.z;
        return horizontalSpeedSq > MOVEMENT_INPUT_THRESHOLD_METERS_PER_SECOND * MOVEMENT_INPUT_THRESHOLD_METERS_PER_SECOND;
    }

    private _getMoveInputDirection(player: mod.Player): RuntimeVector | null {
        const velocity = this._getPlayerLinearVelocity(player);
        const facing = this._getPlayerFacingDirection(player);

        if (!velocity || !facing) {
            return null;
        }

        const horizontalVelocity = { x: velocity.x, y: 0, z: velocity.z };
        const horizontalSpeedSq =
            horizontalVelocity.x * horizontalVelocity.x + horizontalVelocity.z * horizontalVelocity.z;

        if (horizontalSpeedSq <= MOVEMENT_INPUT_THRESHOLD_METERS_PER_SECOND * MOVEMENT_INPUT_THRESHOLD_METERS_PER_SECOND) {
            return null;
        }

        const moveInput = this._normalizeVector(horizontalVelocity);
        const horizontalFacing = this._normalizeVector({ x: facing.x, y: 0, z: facing.z });
        const fullForward = this._normalizeVector(facing);
        const rightFromFacing = this._normalizeVector({ x: -horizontalFacing.z, y: 0, z: horizontalFacing.x });
        const forwardAmount = moveInput.x * horizontalFacing.x + moveInput.z * horizontalFacing.z;
        const rightAmount = moveInput.x * -horizontalFacing.z + moveInput.z * horizontalFacing.x;

        return this._normalizeVector({
            x: fullForward.x * forwardAmount + rightFromFacing.x * rightAmount,
            y: fullForward.y * forwardAmount + rightFromFacing.y * rightAmount,
            z: fullForward.z * forwardAmount + rightFromFacing.z * rightAmount,
        }) as RuntimeVector;
    }

    private _getLookAheadPoint(player: mod.Player, fromPosition: RuntimeVector): RuntimeVector {
        const facing = this._getPlayerFacingDirection(player);

        if (facing) {
            return this._vectorAdd(fromPosition, {
                x: facing.x * 12,
                y: facing.y * 12,
                z: facing.z * 12,
            });
        }

        return this._vectorAdd(fromPosition, { x: 0, y: 0, z: -12 });
    }

    private _buildRotationTowards(from: RuntimeVector, to: RuntimeVector, pitchOffsetRadians = 0): VectorOffset {
        const yaw = this._yawTowards(from, to);
        const pitch = this._clamp(
            this._pitchTowards(from, to) - pitchOffsetRadians,
            -DEFAULT_PITCH_LIMIT_RADIANS,
            DEFAULT_PITCH_LIMIT_RADIANS
        );

        return { x: pitch, y: yaw, z: 0 };
    }

    private _setFixedCameraTransform(
        fixedCamera: mod.FixedCamera,
        position: RuntimeVector,
        pitch: number,
        yaw: number
    ): void {
        mod.SetObjectTransform(
            fixedCamera,
            mod.CreateTransform(
                mod.CreateVector(position.x, position.y, position.z),
                mod.CreateVector(pitch, yaw, 0)
            )
        );
    }

    private _yawTowards(from: RuntimeVector, to: RuntimeVector): number {
        return Math.atan2(to.x - from.x, to.z - from.z);
    }

    private _pitchTowards(from: RuntimeVector, to: RuntimeVector): number {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const horizontalDistance = Math.max(Math.sqrt(dx * dx + dz * dz), VECTOR_EPSILON);

        return -Math.atan2(dy, horizontalDistance);
    }

    private _lerpRotation(from: VectorOffset, to: VectorOffset, alpha: number): VectorOffset {
        return {
            x: this._lerpAngleRadians(from.x, to.x, alpha),
            y: this._lerpAngleRadians(from.y, to.y, alpha),
            z: this._lerp(from.z, to.z, alpha),
        };
    }

    private _lerpAngleRadians(from: number, to: number, alpha: number): number {
        return this._normalizeAngleRadians(from + this._normalizeAngleRadians(to - from) * alpha);
    }

    private _normalizeAngleRadians(angle: number): number {
        let normalized = angle;
        const fullTurn = Math.PI * 2;

        while (normalized > Math.PI) {
            normalized -= fullTurn;
        }

        while (normalized < -Math.PI) {
            normalized += fullTurn;
        }

        return normalized;
    }

    private _getSmoothingAlpha(force: boolean): number {
        if (force || this._cameraFollowSmoothingSeconds <= 0) {
            return 1;
        }

        return this._clamp(DEFAULT_VIEW_TICK_MS / 1_000 / this._cameraFollowSmoothingSeconds, 0, 1);
    }

    private _getRotationSmoothingAlpha(force: boolean): number {
        return force ? 1 : DEFAULT_FOLLOW_ROTATION_SMOOTHING;
    }

    private _isCombatTeam(team: mod.Team): boolean {
        return mod.Equals(team, mod.GetTeam(1)) || mod.Equals(team, mod.GetTeam(2));
    }

    private _normalizePlayableTeamId(teamId: number): number {
        return Math.floor(teamId) === 2 ? 2 : 1;
    }

    private _sanitizeSpawnPointId(spawnPointId: number | null | undefined): number {
        if (spawnPointId === null || spawnPointId === undefined) {
            return 0;
        }

        const sanitized = Math.floor(spawnPointId);
        return Number.isFinite(sanitized) && sanitized > 0 ? sanitized : 0;
    }

    private _isPlayerCurrentlyDeployed(player: mod.Player): boolean {
        return this._isAlivePlayer(player) || this._getSoldierStateBoolSafe(player, mod.SoldierStateBool.IsDead);
    }

    private _isAlivePlayer(player: mod.Player): boolean {
        return this._getSoldierStateBoolSafe(player, mod.SoldierStateBool.IsAlive);
    }

    private _isBotPlayer(player: mod.Player): boolean {
        return this._getSoldierStateBoolSafe(player, mod.SoldierStateBool.IsAISoldier);
    }

    private _getSoldierStateBoolSafe(player: mod.Player, state: mod.SoldierStateBool): boolean {
        if (!mod.IsPlayerValid(player)) {
            return false;
        }

        try {
            return mod.GetSoldierState(player, state);
        } catch {
            return false;
        }
    }

    private _spectatorStringKey(key: string): any {
        return (mod.stringkeys as unknown as Record<string, any>)[key] ?? key;
    }

    private _spectatorMessage(key: string, ...args: any[]): any {
        const resolvedKey = this._spectatorStringKey(key);

        if (args.length <= 0) return mod.Message(resolvedKey);
        if (args.length === 1) return mod.Message(resolvedKey, args[0]);
        if (args.length === 2) return mod.Message(resolvedKey, args[0], args[1]);
        return mod.Message(resolvedKey, args[0], args[1], args[2]);
    }

    private _showNotification(player: mod.Player, key: string): void {
        if (!mod.IsPlayerValid(player)) {
            return;
        }

        mod.DisplayNotificationMessage(this._spectatorMessage(key), player);
    }

    private _fromModVector(vector: mod.Vector): RuntimeVector | null {
        const converted = {
            x: mod.XComponentOf(vector),
            y: mod.YComponentOf(vector),
            z: mod.ZComponentOf(vector),
        };

        return this._isFiniteVector(converted) ? converted : null;
    }

    private _isFiniteVector(vector: unknown): vector is RuntimeVector {
        return (
            vector !== null &&
            vector !== undefined &&
            Number.isFinite((vector as RuntimeVector).x) &&
            Number.isFinite((vector as RuntimeVector).y) &&
            Number.isFinite((vector as RuntimeVector).z)
        );
    }

    private _zeroVector(): RuntimeVector {
        return { x: 0, y: 0, z: 0 } as RuntimeVector;
    }

    private _copyVector(vector: VectorOffset): RuntimeVector {
        return {
            x: vector.x,
            y: vector.y,
            z: vector.z,
        } as RuntimeVector;
    }

    private _toModVector(vector: VectorOffset): mod.Vector {
        return mod.CreateVector(vector.x, vector.y, vector.z);
    }

    private _vectorAdd(base: RuntimeVector | VectorOffset, offset: VectorOffset): RuntimeVector {
        return {
            x: base.x + offset.x,
            y: base.y + offset.y,
            z: base.z + offset.z,
        } as RuntimeVector;
    }

    private _vectorLerp(from: VectorOffset, to: VectorOffset, alpha: number): VectorOffset {
        return {
            x: from.x + (to.x - from.x) * alpha,
            y: from.y + (to.y - from.y) * alpha,
            z: from.z + (to.z - from.z) * alpha,
        };
    }

    private _lerp(from: number, to: number, alpha: number): number {
        return from + (to - from) * alpha;
    }

    private _normalizeVector(vector: VectorOffset): RuntimeVector {
        const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);

        if (length <= VECTOR_EPSILON) {
            return this._zeroVector();
        }

        return {
            x: vector.x / length,
            y: vector.y / length,
            z: vector.z / length,
        } as RuntimeVector;
    }

    private _clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
}

export function registerSpectatorMode(config: SpectatorModeConfig): SpectatorModeController {
    return new SpectatorMode(config);
}
