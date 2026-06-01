export type PlayerScoreboardSnapshot = [number, number, number, number, number];

export class PlayerState {
    public constructor(
        public player: mod.Player,
        public id: number,
        public team: mod.Team
    ) {}

    public isDeployed = false;

    private _firstDeploy = true;
    private _ready = false;
    private _capturePoint: mod.CapturePoint | null = null;

    // [score, kills, deaths, assists, captures]
    private _scoreboard: PlayerScoreboardSnapshot = [0, 0, 0, 0, 0];

    public setCapturePoint(capturePoint: mod.CapturePoint | null): void {
        this._capturePoint = capturePoint;
    }

    public getCapturePoint(): mod.CapturePoint | null {
        return this._capturePoint;
    }

    public consumeFirstDeploy(): boolean {
        if (!this._firstDeploy) return false;

        this._firstDeploy = false;
        return true;
    }

    public resetFirstDeploy(): void {
        this._firstDeploy = true;
    }

    public isReady(): boolean {
        return this._ready;
    }

    public setReady(value: boolean): void {
        this._ready = value;
    }

    public toggleReady(): void {
        this._ready = !this._ready;
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

    public addKillAssist(): void {
        this._scoreboard[3] += 1;
    }

    public addCapture(): void {
        this._scoreboard[4] += 1;
    }

    // Compatibility aliases while legacy names are still phased out.
    public addArmed(): void {
        this.addKillAssist();
    }

    public addDestroyed(): void {
        this.addCapture();
    }

    public resetForNewRound(): void {
        this.isDeployed = false;
        this._firstDeploy = true;
        this._ready = false;
        this._capturePoint = null;
        this._scoreboard = [0, 0, 0, 0, 0];
    }

    public getScoreboardSnapshot(): PlayerScoreboardSnapshot {
        return [...this._scoreboard] as PlayerScoreboardSnapshot;
    }
}
