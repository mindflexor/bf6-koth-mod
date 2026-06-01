export class PlayerState {
    public constructor(
        public player: mod.Player,
        public id: number,
        public team: mod.Team
    ) {}

    public isDeployed = false;

    // [score, kills, deaths, armed, destroyed]
    private _scoreboard: [number, number, number, number, number] = [0, 0, 0, 0, 0];

    public addScore(value: number): void {
        this._scoreboard[0] += value;
    }

    public addKill(): void {
        this._scoreboard[1] += 1;
    }

    public addDeath(): void {
        this._scoreboard[2] += 1;
    }

    public addArmed(): void {
        this._scoreboard[3] += 1;
    }

    public addDestroyed(): void {
        this._scoreboard[4] += 1;
    }

    public getScoreboardSnapshot(): [number, number, number, number, number] {
        return [...this._scoreboard] as [number, number, number, number, number];
    }
}
