import { KothPlayerState } from '../state/koth-player-state.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothHillService } from './koth-hill-service.ts';
import type { KothScoreService } from './koth-score-service.ts';
import type { KothScoreboardService } from './koth-scoreboard-service.ts';
import type { KothSfxService } from './koth-sfx-service.ts';
import type { KothSpawnService } from './koth-spawn-service.ts';
import type { KothUiService } from './koth-ui-service.ts';
import {
    getKothPlayerId,
    isKothAiSoldier,
    isKothPlayerLiving,
    isParticipantTeam,
} from './koth-sdk-utils.ts';

export class KothPlayerTrackerService {
    private readonly _preservedLiveStartPlayerIds = new Set<number>();
    private readonly _liveStartRecoveryPlayerIds = new Set<number>();

    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _hillService: KothHillService,
        private readonly _scoreService: KothScoreService,
        private readonly _scoreboardService: KothScoreboardService,
        private readonly _spawnService: KothSpawnService,
        private readonly _uiService: KothUiService,
        private readonly _sfxService: KothSfxService
    ) {}

    public onPlayerJoinGame(eventPlayer: mod.Player): void {
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        this._spawnService.queueSpawnForPlayer(eventPlayer);
        this._markPlayerPresentationDirty();
    }

    public onPlayerLeaveGame(eventNumber: number): void {
        this._removePlayerById(eventNumber, true);
    }

    public onPlayerDeployed(eventPlayer: mod.Player): void {
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = true;
        this._liveStartRecoveryPlayerIds.delete(playerId);
        this._clearLiveInputRestrictions(eventPlayer);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);

        if (this._preservedLiveStartPlayerIds.delete(playerId)) {
            if (this._spawnService.isPlayerAtForbiddenSpawnPosition(eventPlayer)) {
                this._spawnService.teleportToQueuedSpawn(eventPlayer);
            }
            this._markPlayerPresentationDirty();
            this._hillService.updateActiveHillState();
            return;
        }

        if (!this._spawnService.teleportToQueuedSpawn(eventPlayer)) {
            this._markPlayerPresentationDirty();
            this._hillService.updateActiveHillState();
            return;
        }

        this._markPlayerPresentationDirty();
        this._hillService.updateActiveHillState();
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): void {
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = false;
        this._preservedLiveStartPlayerIds.delete(playerId);
        this._liveStartRecoveryPlayerIds.delete(playerId);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.clearPlayerPresenceCache(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);

        if (this._context.runtime.isMatchActive) {
            this._spawnService.queueSpawnForPlayer(eventPlayer);
        }
    }

    public onPlayerDied(eventPlayer: mod.Player): void {
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        if (!this.syncGameplayPlayer(eventPlayer)) return;

        this._preservedLiveStartPlayerIds.delete(playerId);
        const suppressDeathScore = this._liveStartRecoveryPlayerIds.delete(playerId);
        if (!suppressDeathScore) this._scoreService.addDeath(eventPlayer);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.clearPlayerPresenceCache(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);
        this._spawnService.queueSpawnForPlayer(eventPlayer);
    }

    public onMandown(eventPlayer: mod.Player): void {
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = false;
        this._preservedLiveStartPlayerIds.delete(playerId);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.clearPlayerPresenceCache(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);
    }

    public onPlayerRevived(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        void eventOtherPlayer;
        if (!mod.IsPlayerValid(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = true;
        this._liveStartRecoveryPlayerIds.delete(playerId);
        this._spawnService.clearQueuedSpawn(playerId);
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);

        this._markPlayerPresentationDirty();

        this._hillService.updateActiveHillState();
    }

    public onPlayerEarnedKill(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        if (!this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(eventPlayer)) return;
        if (mod.IsPlayerValid(eventOtherPlayer) && mod.Equals(eventPlayer, eventOtherPlayer)) return;
        if (!this.syncGameplayPlayer(eventPlayer)) return;

        this._scoreService.addKillScore(eventPlayer);
    }

    public onPlayerEarnedKillAssist(eventPlayer: mod.Player): void {
        if (!this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(eventPlayer)) return;
        if (!this.syncGameplayPlayer(eventPlayer)) return;

        this._scoreService.addAssistScore(eventPlayer);
    }

    public resetPlayersForNewMatch(preserveExistingDeployments = false): void {
        this.clearMandownState();
        this._preservedLiveStartPlayerIds.clear();
        this._context.runtime.playersById.forEach((playerState) => {
            this.resetPlayerForNewMatch(playerState.id, preserveExistingDeployments, true);
        });
    }

    public resetPlayerForNewMatch(
        playerId: number,
        preserveExistingDeployments = false,
        queueMissingSpawn = true
    ): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;

        const wasAlreadyLiving = preserveExistingDeployments && isKothPlayerLiving(playerState.player);
        playerState.resetForNewRound();
        playerState.setTeam(mod.GetTeam(playerState.player));
        playerState.isBot = isKothAiSoldier(playerState.player);
        playerState.isDeployed = wasAlreadyLiving;
        if (wasAlreadyLiving && !this._spawnService.isPlayerAtForbiddenSpawnPosition(playerState.player)) {
            this._preservedLiveStartPlayerIds.add(playerState.id);
            this._liveStartRecoveryPlayerIds.delete(playerState.id);
            this._clearLiveInputRestrictions(playerState.player);
        } else {
            this._preservedLiveStartPlayerIds.delete(playerState.id);
        }

        if (!wasAlreadyLiving && preserveExistingDeployments) {
            this._liveStartRecoveryPlayerIds.add(playerState.id);
            this._spawnService.recoverLiveStartPlayer(playerState);
            return;
        }

        if (!wasAlreadyLiving && queueMissingSpawn) {
            this._spawnService.queueSpawnForPlayer(playerState.player);
        }
    }

    public syncCurrentPlayersBatch(startIndex: number, maxPlayers: number): number {
        const allPlayers = mod.AllPlayers();
        const totalPlayers = mod.CountOf(allPlayers);
        let nextIndex = startIndex;
        let processed = 0;

        while (nextIndex < totalPlayers && processed < maxPlayers) {
            const player = mod.ValueInArray(allPlayers, nextIndex) as mod.Player;
            if (mod.IsPlayerValid(player)) {
                this.syncGameplayPlayer(player);
            }

            nextIndex += 1;
            processed += 1;
        }

        return nextIndex >= totalPlayers ? -1 : nextIndex;
    }

    public bootstrapLiveStartPlayersBatch(startIndex: number, maxPlayers: number): number {
        const allPlayers = mod.AllPlayers();
        const totalPlayers = mod.CountOf(allPlayers);
        let nextIndex = startIndex;
        let processed = 0;

        while (nextIndex < totalPlayers && processed < maxPlayers) {
            const player = mod.ValueInArray(allPlayers, nextIndex) as mod.Player;
            if (mod.IsPlayerValid(player)) {
                this.bootstrapLiveStartPlayer(player);
            }

            nextIndex += 1;
            processed += 1;
        }

        this._markPlayerPresentationDirty();
        return nextIndex >= totalPlayers ? -1 : nextIndex;
    }

    public bootstrapLiveStartPlayer(player: mod.Player): void {
        const playerState = this.syncGameplayPlayer(player);
        if (!playerState) return;

        if (this._liveStartRecoveryPlayerIds.has(playerState.id)) {
            if (isKothPlayerLiving(player)) {
                playerState.isDeployed = true;
                this._clearLiveInputRestrictions(player);
                this._spawnService.teleportToQueuedSpawn(player);
            } else {
                this._spawnService.recoverLiveStartPlayer(playerState);
            }
        } else if (isKothPlayerLiving(player)) {
            playerState.isDeployed = true;
            this._clearLiveInputRestrictions(player);
            if (this._spawnService.isPlayerAtForbiddenSpawnPosition(player)) {
                this._preservedLiveStartPlayerIds.delete(playerState.id);
                this._spawnService.teleportToQueuedSpawn(player);
            } else {
                this._preservedLiveStartPlayerIds.add(playerState.id);
            }
        }

        if (playerState.isDeployed) {
            mod.SetRedeployTime(player, this._context.rules.redeployTimeSeconds);
        }
    }

    public clearMandownState(): void {
        return;
    }

    public bootstrapLiveStartPlayers(): void {
        const allPlayers = mod.AllPlayers();
        for (let i = 0; i < mod.CountOf(allPlayers); i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (!mod.IsPlayerValid(player)) continue;

            this.bootstrapLiveStartPlayer(player);
        }

        this._context.runtime.hudDirty = true;
        this._context.runtime.scoreboardDirty = true;
    }

    public syncCurrentPlayers(): void {
        const allPlayers = mod.AllPlayers();
        for (let i = 0; i < mod.CountOf(allPlayers); i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (mod.IsPlayerValid(player)) {
                this.onPlayerJoinGame(player);
            }
        }
    }

    public syncGameplayPlayers(): void {
        const seenPlayerIds = new Set<number>();
        const allPlayers = mod.AllPlayers();

        for (let i = 0; i < mod.CountOf(allPlayers); i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            const playerState = this.syncGameplayPlayer(player);
            if (playerState) seenPlayerIds.add(playerState.id);
        }

        const stalePlayerIds: number[] = [];
        this._context.runtime.playersById.forEach((playerState, playerId) => {
            if (seenPlayerIds.has(playerId) && mod.IsPlayerValid(playerState.player)) return;
            stalePlayerIds.push(playerId);
        });

        for (const playerId of stalePlayerIds) {
            this._removeStalePlayer(playerId);
        }
    }

    public syncGameplayPlayer(player: mod.Player): KothPlayerState | undefined {
        if (!mod.IsPlayerValid(player)) return undefined;

        const playerId = getKothPlayerId(player);
        const team = mod.GetTeam(player);
        if (!isParticipantTeam(team)) {
            this._removePlayerById(playerId, true);
            return undefined;
        }

        const existing = this._context.runtime.playersById.get(playerId);
        if (existing) {
            const previousTeam = existing.team;
            const previousIsBot = existing.isBot;
            this._syncPlayerState(existing, player, team);
            if (!mod.Equals(previousTeam, team) || previousIsBot !== existing.isBot) {
                this._markPlayerPresentationDirty();
            }
            return existing;
        }

        const created = new KothPlayerState(player, playerId, team);
        this._syncPlayerState(created, player, team);
        this._context.runtime.playersById.set(playerId, created);
        this._markPlayerPresentationDirty();
        return created;
    }

    private _syncPlayerState(playerState: KothPlayerState, player: mod.Player, team: mod.Team): void {
        const wasLivingDeployed = playerState.isDeployed;
        const isLivingDeployed = this._isPlayerLivingForSpawn(player);

        playerState.player = player;
        playerState.setTeam(team);
        playerState.isBot = isKothAiSoldier(player);
        playerState.isDeployed = isLivingDeployed;

        if (wasLivingDeployed && !isLivingDeployed) {
            this._clearPlayerCombatPresence(playerState.id);
        }
    }

    private _removeStalePlayer(playerId: number): void {
        this._removePlayerById(playerId, true);
    }

    private _markPlayerPresentationDirty(): void {
        this._context.runtime.hudDirty = true;
        this._context.runtime.scoreboardDirty = true;
    }

    private _clearPlayerCombatPresence(playerId: number): void {
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.clearPlayerPresenceCache(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        this._context.runtime.hudDirty = true;
    }

    private _removePlayerById(playerId: number, forgetUi: boolean): void {
        this._preservedLiveStartPlayerIds.delete(playerId);
        this._liveStartRecoveryPlayerIds.delete(playerId);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.removePlayerFromAllPresenceZones(playerId);
        this._spawnService.clearQueuedSpawn(playerId);
        this._sfxService.clearPlayerAudioState(playerId);
        if (forgetUi) this._uiService.forgetPlayerHud(playerId);

        if (this._context.runtime.playersById.delete(playerId)) {
            this._markPlayerPresentationDirty();
        }
    }

    private _isPlayerLivingForSpawn(player: mod.Player): boolean {
        return isKothPlayerLiving(player);
    }

    private _clearLiveInputRestrictions(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;

        mod.EnableAllInputRestrictions(player, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.Interact, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, false);
        mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, false);
    }
}

