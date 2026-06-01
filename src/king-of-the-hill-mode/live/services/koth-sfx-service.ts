import { KOTH_SFX } from '../config/koth-sfx.ts';

export class KothSfxService {
    private _initialized = false;
    private _objectiveActivated?: mod.SFX;
    private _objectiveLocked?: mod.SFX;
    private _objectiveContested?: mod.SFX;
    private _victoryImminent?: mod.SFX;
    private _matchWon?: mod.SFX;
    private _matchLost?: mod.SFX;
    private _timerWarning?: mod.SFX;

    public ensureSpawned(): void {
        if (this._initialized) return;
        this._initialized = true;

        this._objectiveActivated = this._spawn(KOTH_SFX.objectiveActivated);
        this._objectiveLocked = this._spawn(KOTH_SFX.objectiveLocked);
        this._objectiveContested = this._spawn(KOTH_SFX.objectiveContested);
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

    public playObjectiveContested(): void {
        this._playGlobal(this._objectiveContested, 0.8);
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
}
