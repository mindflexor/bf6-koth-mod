import { KOTH_SFX } from '../config/koth-sfx.ts';
import { getKothPlayerId } from './koth-sdk-utils.ts';

const KOTH_OBJECTIVE_ENTER_SFX_COOLDOWN_MS = 750;

export class KothSfxService {
    private _initialized = false;
    private _objectiveActivated?: mod.SFX;
    private _objectiveLocked?: mod.SFX;
    private _objectiveContested?: mod.SFX;
    private _objectiveContestedLoop?: mod.SFX;
    private _objectiveEnterFriendly?: mod.SFX;
    private _objectiveEnterEnemy?: mod.SFX;
    private _victoryImminent?: mod.SFX;
    private _matchWon?: mod.SFX;
    private _matchLost?: mod.SFX;
    private _timerWarning?: mod.SFX;
    private readonly _lastObjectiveEnterSfxAtMsByPlayerId: Record<number, number> = {};
    private readonly _contestedLoopPlayerById = new Map<number, mod.Player>();

    public ensureSpawned(): void {
        if (this._initialized) return;
        this._initialized = true;

        this._objectiveActivated = this._spawn(KOTH_SFX.objectiveActivated);
        this._objectiveLocked = this._spawn(KOTH_SFX.objectiveLocked);
        this._objectiveContested = this._spawn(KOTH_SFX.objectiveContested);
        this._objectiveContestedLoop = this._spawn(KOTH_SFX.objectiveContestedLoop);
        this._objectiveEnterFriendly = this._spawn(KOTH_SFX.objectiveEnterFriendly);
        this._objectiveEnterEnemy = this._spawn(KOTH_SFX.objectiveEnterEnemy);
        this._victoryImminent = this._spawn(KOTH_SFX.victoryImminent);
        this._matchWon = this._spawn(KOTH_SFX.matchWon);
        this._matchLost = this._spawn(KOTH_SFX.matchLost);
        this._timerWarning = this._spawn(KOTH_SFX.timerWarning);
    }

    public playObjectiveActivated(): void {
        this._playGlobal(this._objectiveActivated, 1);
    }

    public playObjectiveLocked(): void {
        this._playGlobal(this._objectiveLocked, 0.8);
    }

    public playObjectiveContestedForPlayers(players: readonly mod.Player[]): void {
        for (const player of players) {
            this._playPlayer(this._objectiveContested, 0.8, player);
        }
    }

    public playObjectiveEnter(player: mod.Player, isFriendly: boolean): void {
        if (!this._isHumanPlayer(player)) return;

        const playerId = getKothPlayerId(player);
        const now = this._getMatchTimeMs();
        const lastPlayedAt = this._lastObjectiveEnterSfxAtMsByPlayerId[playerId] ?? -999999;
        if (now - lastPlayedAt < KOTH_OBJECTIVE_ENTER_SFX_COOLDOWN_MS) return;

        this._lastObjectiveEnterSfxAtMsByPlayerId[playerId] = now;
        this._playPlayer(isFriendly ? this._objectiveEnterFriendly : this._objectiveEnterEnemy, 0.8, player);
    }

    public syncObjectiveContestedLoopForPlayers(players: readonly mod.Player[]): void {
        const activePlayerIds = new Set<number>();

        for (const player of players) {
            if (!this._isHumanPlayer(player)) continue;

            const playerId = getKothPlayerId(player);
            activePlayerIds.add(playerId);
            if (this._contestedLoopPlayerById.has(playerId)) continue;
            if (!this._objectiveContestedLoop) continue;

            this._playPlayer(this._objectiveContestedLoop, 0.8, player);
            this._contestedLoopPlayerById.set(playerId, player);
        }

        this._contestedLoopPlayerById.forEach((player, playerId) => {
            if (activePlayerIds.has(playerId)) return;

            this._stopPlayer(this._objectiveContestedLoop, player);
            this._contestedLoopPlayerById.delete(playerId);
        });
    }

    public stopObjectiveContestedLoops(): void {
        this._contestedLoopPlayerById.forEach((player) => {
            this._stopPlayer(this._objectiveContestedLoop, player);
        });
        this._contestedLoopPlayerById.clear();
    }

    public clearPlayerAudioState(playerId: number): void {
        const contestedLoopPlayer = this._contestedLoopPlayerById.get(playerId);
        if (contestedLoopPlayer) {
            this._stopPlayer(this._objectiveContestedLoop, contestedLoopPlayer);
            this._contestedLoopPlayerById.delete(playerId);
        }

        delete this._lastObjectiveEnterSfxAtMsByPlayerId[playerId];
    }

    public resetPlayerAudioState(): void {
        this.stopObjectiveContestedLoops();

        for (const playerId in this._lastObjectiveEnterSfxAtMsByPlayerId) {
            delete this._lastObjectiveEnterSfxAtMsByPlayerId[Number(playerId)];
        }
    }

    public playVictoryImminent(team: mod.Team): void {
        this._playTeam(this._victoryImminent, 0.9, team);
    }

    public playMatchWon(team: mod.Team): void {
        this._playTeam(this._matchWon, 1, team);
    }

    public playMatchLost(team: mod.Team): void {
        this._playTeam(this._matchLost, 1, team);
    }

    public playTimerWarning(): void {
        this._playGlobal(this._timerWarning, 0.8);
    }

    private _spawn(prefab: mod.RuntimeSpawn_Common): mod.SFX | undefined {
        try {
            return mod.SpawnObject(
                prefab,
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(0, 0, 0)
            ) as mod.SFX;
        } catch (_err) {
            return undefined;
        }
    }

    private _playGlobal(sound: mod.SFX | undefined, amplitude: number): void {
        if (!sound) return;
        mod.PlaySound(sound, amplitude);
    }

    private _playTeam(sound: mod.SFX | undefined, amplitude: number, team: mod.Team): void {
        if (!sound) return;
        mod.PlaySound(sound, amplitude, team);
    }

    private _playPlayer(sound: mod.SFX | undefined, amplitude: number, player: mod.Player): void {
        if (!sound || !this._isHumanPlayer(player)) return;
        mod.PlaySound(sound, amplitude, player);
    }

    private _stopPlayer(sound: mod.SFX | undefined, player: mod.Player): void {
        if (!sound || !mod.IsPlayerValid(player)) return;

        try {
            mod.StopSound(sound, player);
        } catch (_err) {
            return;
        }
    }

    private _isHumanPlayer(player: mod.Player): boolean {
        return mod.IsPlayerValid(player) && !this._isAiSoldier(player);
    }

    private _isAiSoldier(player: mod.Player): boolean {
        try {
            return mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
        } catch (_err) {
            return false;
        }
    }

    private _getMatchTimeMs(): number {
        return mod.GetMatchTimeElapsed() * 1000;
    }
}
