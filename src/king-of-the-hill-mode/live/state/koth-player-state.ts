export type KothPlayerScoreboardSnapshot = [number, number, number, number, number];

export class KothPlayerState {
    public isBot = false;
    public isDeployed = false;
    public isInsideActiveHill = false;
    public activeHillAreaTriggerId: number | null = null;
    public totalHillTimeSeconds = 0;
    public lastHillEnterTime: number | null = null;

    private _scoreboard: KothPlayerScoreboardSnapshot = [0, 0, 0, 0, 0];

    public constructor(
        public player: mod.Player,
        public id: number,
        public team: mod.Team
    ) {}

    public setTeam(team: mod.Team): void {
        this.team = team;
    }

    public addScore(value: number): void {
        this._scoreboard[0] += value;
    }

    public addKill(): void {
        this._scoreboard[1] += 1;
    }

    public addDeath(): void {
        this._scoreboard[2] += 1;
    }

    public addAssist(): void {
        this._scoreboard[3] += 1;
    }

    public addHillTime(seconds: number): void {
        this.totalHillTimeSeconds += seconds;
        this._scoreboard[4] = this.totalHillTimeSeconds;
    }

    public resetForNewRound(): void {
        this.isDeployed = false;
        this.isInsideActiveHill = false;
        this.activeHillAreaTriggerId = null;
        this.totalHillTimeSeconds = 0;
        this.lastHillEnterTime = null;
        this._scoreboard = [0, 0, 0, 0, 0];
    }

    public getScoreboardSnapshot(): KothPlayerScoreboardSnapshot {
        return [...this._scoreboard] as KothPlayerScoreboardSnapshot;
    }
}
