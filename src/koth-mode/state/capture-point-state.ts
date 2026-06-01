export type CapturePointLane = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

function clampCaptureProgress01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

export class CapturePointState {
    public constructor(public capturePoint: mod.CapturePoint, public id: number, public lane: CapturePointLane) {}

    private _owner: mod.Team = mod.GetTeam(0);
    private _capturingTeam: mod.Team = mod.GetTeam(0);
    private _onPointPlayerIds: number[] = [];

    private _captureProgress = 0;
    private _previousCaptureProgress = 0;
    private _fade = mod.Pi();

    private _onPointCounts: [number, number] = [0, 0];

    public get owner(): mod.Team {
        return this._owner;
    }

    public set owner(value: mod.Team) {
        this._owner = value;
    }

    public get capturingTeam(): mod.Team {
        return this._capturingTeam;
    }

    public set capturingTeam(value: mod.Team) {
        this._capturingTeam = value;
    }

    public get captureProgress(): number {
        return this._captureProgress;
    }

    public set captureProgress(value: number) {
        this._previousCaptureProgress = this._captureProgress;
        this._captureProgress = clampCaptureProgress01(value);
    }

    public get previousCaptureProgress(): number {
        return this._previousCaptureProgress;
    }

    public set previousCaptureProgress(value: number) {
        this._previousCaptureProgress = clampCaptureProgress01(value);
    }

    public get fade(): number {
        return this._fade;
    }

    public set fade(value: number) {
        this._fade = value;
    }

    public setOnPointCounts(team1: number, team2: number): void {
        this._onPointCounts = [team1, team2];
    }

    public getOnPointCounts(): [number, number] {
        return [...this._onPointCounts] as [number, number];
    }

    public addPlayerOnPoint(playerId: number): void {
        if (this._onPointPlayerIds.includes(playerId)) return;
        this._onPointPlayerIds.push(playerId);
    }

    public removePlayerOnPoint(playerId: number): void {
        const index = this._onPointPlayerIds.indexOf(playerId);
        if (index >= 0) this._onPointPlayerIds.splice(index, 1);
    }

    public clearOnPointPlayers(): void {
        this._onPointPlayerIds = [];
    }

    public getOnPointPlayers(): number[] {
        return [...this._onPointPlayerIds];
    }
}
