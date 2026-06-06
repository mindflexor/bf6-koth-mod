import { KothPlayerState } from '../state/koth-player-state.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothHillService } from './koth-hill-service.ts';
import type { KothScoreService } from './koth-score-service.ts';
import type { KothScoreboardService } from './koth-scoreboard-service.ts';
import type { KothSpawnService } from './koth-spawn-service.ts';
import type { KothUiService } from './koth-ui-service.ts';
import { getKothPlayerId, isKothAiSoldier, isKothPlayerAlive, isParticipantTeam } from './koth-sdk-utils.ts';

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
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        this._spawnService.queueSpawnForPlayer(eventPlayer);
        this._scoreboardService.updatePlayer(playerState.id);

        if (this._context.runtime.isMatchActive && !playerState.isBot) {
            this._uiService.ensurePlayerHud(playerState.id);
            this._uiService.updatePlayerHud(playerState.id);
        }
    }

    public onPlayerLeaveGame(eventNumber: number): void {
        const playerState = this._context.runtime.playersById.get(eventNumber);
        if (!playerState) return;

        this._hillService.removePlayerFromAllHills(playerState.id);
        this._spawnService.removePlayerFromAllPresenceZones(playerState.id);
        this._context.runtime.disconnectedPlayerIds.push(playerState.id);
        this._context.runtime.playersById.delete(playerState.id);
    }

    public onPlayerDeployed(eventPlayer: mod.Player): void {
        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = true;
        mod.SetRedeployTime(eventPlayer, this._context.rules.redeployTimeSeconds);

        this._spawnService.teleportToQueuedSpawn(eventPlayer);
        if (!playerState.isBot) {
            this._uiService.ensurePlayerHud(playerId);
            this._uiService.updatePlayerHud(playerId);
        }
        this._hillService.updateActiveHillState();
    }

    public onPlayerUndeploy(eventPlayer: mod.Player): void {
        const playerId = getKothPlayerId(eventPlayer);
        const playerState = this.syncGameplayPlayer(eventPlayer);
        if (!playerState) return;

        playerState.isDeployed = false;
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.removePlayerFromAllPresenceZones(playerId);

        if (this._context.runtime.isMatchActive) {
            this._spawnService.queueSpawnForPlayer(eventPlayer);
        }
    }

    public onPlayerDied(eventPlayer: mod.Player): void {
        const playerId = getKothPlayerId(eventPlayer);
        if (!this.syncGameplayPlayer(eventPlayer)) return;

        this._scoreService.addDeath(eventPlayer);
        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.removePlayerFromAllPresenceZones(playerId);
        this._spawnService.queueSpawnForPlayer(eventPlayer);
    }

    public onMandown(eventPlayer: mod.Player): void {
        const playerId = getKothPlayerId(eventPlayer);
        if (!this.syncGameplayPlayer(eventPlayer)) return;

        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.removePlayerFromAllPresenceZones(playerId);
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

    public resetPlayersForNewMatch(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            if (!mod.IsPlayerValid(playerState.player)) return;
            playerState.resetForNewRound();
            playerState.setTeam(mod.GetTeam(playerState.player));
            playerState.isBot = isKothAiSoldier(playerState.player);
            this._spawnService.queueSpawnForPlayer(playerState.player);
        });
    }

    public bootstrapLiveStartPlayers(): void {
        const allPlayers = mod.AllPlayers();
        for (let i = 0; i < mod.CountOf(allPlayers); i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (!mod.IsPlayerValid(player)) continue;

            const playerState = this.syncGameplayPlayer(player);
            if (!playerState) continue;

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
        if (!isParticipantTeam(team)) return undefined;

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
        playerState.player = player;
        playerState.setTeam(team);
        playerState.isBot = isKothAiSoldier(player);
        playerState.isDeployed = isKothPlayerAlive(player);
    }

    private _removeStalePlayer(playerId: number): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState) return;

        this._hillService.removePlayerFromAllHills(playerId);
        this._spawnService.removePlayerFromAllPresenceZones(playerId);
        this._context.runtime.disconnectedPlayerIds.push(playerId);
        this._context.runtime.playersById.delete(playerId);
        this._markPlayerPresentationDirty();
    }

    private _markPlayerPresentationDirty(): void {
        this._context.runtime.hudDirty = true;
        this._context.runtime.scoreboardDirty = true;
    }
}

