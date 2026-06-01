import { KothPlayerState } from '../state/koth-player-state.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothHillService } from './koth-hill-service.ts';
import type { KothScoreService } from './koth-score-service.ts';
import type { KothScoreboardService } from './koth-scoreboard-service.ts';
import type { KothSpawnService } from './koth-spawn-service.ts';
import type { KothUiService } from './koth-ui-service.ts';
import { getKothPlayerId, isKothPlayerAlive, isParticipantTeam } from './koth-sdk-utils.ts';

export class KothPlayerTrackerService {
    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _hillService: KothHillService,
        private readonly _scoreService: KothScoreService,
        private readonly _scoreboardService: KothScoreboardService,
        private readonly _spawnService: KothSpawnService,
        private readonly _uiService: KothUiService
    ) {}

    public onPlayerJoinGame(eventPlayer: mod.Player): void {
        if (this._isSpectator(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const team = mod.GetTeam(eventPlayer);
        if (!isParticipantTeam(team)) return;

        const existing = this._context.runtime.playersById.get(playerId);
        if (existing) {
            existing.player = eventPlayer;
            existing.setTeam(team);
        } else {
            this._context.runtime.playersById.set(playerId, new KothPlayerState(eventPlayer, playerId, team));
        }

        this._spawnService.queueSpawnForPlayer(eventPlayer);
        this._scoreboardService.updatePlayer(playerId);

        if (this._context.runtime.isMatchActive) {
            this._uiService.ensurePlayerHud(playerId);
            this._uiService.updatePlayerHud(playerId);
        }
    }

    public onPlayerLeaveGame(eventNumber: number): void {
        const playerState = this._context.runtime.playersById.get(eventNumber);
        if (!playerState) return;

        this._hillService.removePlayerFromAllHills(playerState.id);
        this._spawnService.removePlayerFromAllSpawnClusters(playerState.id);
        this._context.runtime.disconnectedPlayerIds.push(playerState.id);
        this._context.runtime.playersById.delete(playerState.id);
    }

    public onPlayerDeployed(eventPlayer: mod.Player): void {
        if (this._isSpectator(eventPlayer)) return;

        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this._ensurePlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = true;
        playerState.setTeam(mod.GetTeam(eventPlayer));
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);

        this._spawnService.teleportToQueuedSpawn(eventPlayer);
        this._uiService.ensurePlayerHud(playerId);
        this._uiService.updatePlayerHud(playerId);
        this._hillService.updateActiveHillState();
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): void {
        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState) return;

        playerState.isDeployed = false;
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.removePlayerFromAllSpawnClusters(playerId);

        if (this._context.runtime.isMatchActive) {
            this._spawnService.queueSpawnForPlayer(eventPlayer);
        }
    }

    public onPlayerDied(eventPlayer: mod.Player): void {
        const playerId = getKothPlayerId(eventPlayer);
        if (!this._context.runtime.playersById.has(playerId)) return;

        this._scoreService.addDeath(eventPlayer);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.removePlayerFromAllSpawnClusters(playerId);
        this._spawnService.queueSpawnForPlayer(eventPlayer);
    }

    public onMandown(eventPlayer: mod.Player): void {
        const playerId = getKothPlayerId(eventPlayer);
        if (!this._context.runtime.playersById.has(playerId)) return;

        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.removePlayerFromAllSpawnClusters(playerId);
    }

    public onPlayerEarnedKill(eventPlayer: mod.Player, eventOtherPlayer: mod.Player): void {
        if (!this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(eventPlayer)) return;
        if (mod.IsPlayerValid(eventOtherPlayer) && mod.Equals(eventPlayer, eventOtherPlayer)) return;
        if (this._isSpectator(eventPlayer)) return;

        this._scoreService.addKillScore(eventPlayer);
    }

    public onPlayerEarnedKillAssist(eventPlayer: mod.Player): void {
        if (!this._context.runtime.isMatchActive) return;
        if (!mod.IsPlayerValid(eventPlayer)) return;
        if (this._isSpectator(eventPlayer)) return;

        this._scoreService.addAssistScore(eventPlayer);
    }

    public resetPlayersForNewMatch(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            if (!mod.IsPlayerValid(playerState.player)) return;
            playerState.resetForNewRound();
            playerState.setTeam(mod.GetTeam(playerState.player));
            this._spawnService.queueSpawnForPlayer(playerState.player);
        });
    }

    public bootstrapLiveStartPlayers(): void {
        const allPlayers = mod.AllPlayers();
        for (let i = 0; i < mod.CountOf(allPlayers); i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (!mod.IsPlayerValid(player)) continue;
            if (this._isSpectator(player)) continue;

            const team = mod.GetTeam(player);
            if (!isParticipantTeam(team)) continue;

            const playerState = this._ensurePlayer(player);
            if (!playerState) continue;

            playerState.player = player;
            playerState.setTeam(team);
            playerState.isDeployed = isKothPlayerAlive(player);

            if (playerState.isDeployed) {
                mod.SetRedeployTime(player, this._context.rules.redeployTimeSeconds);
            }
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

    private _ensurePlayer(player: mod.Player): KothPlayerState | undefined {
        const playerId = getKothPlayerId(player);
        const team = mod.GetTeam(player);
        if (!isParticipantTeam(team)) return undefined;

        const existing = this._context.runtime.playersById.get(playerId);
        if (existing) return existing;

        const created = new KothPlayerState(player, playerId, team);
        this._context.runtime.playersById.set(playerId, created);
        return created;
    }

    private _isSpectator(player: mod.Player): boolean {
        return this._context.spectatorController?.isSpectator(player) ?? false;
    }
}

