import { displayWorldLog } from './koth-sdk-utils.ts';

export class KothBannerService {
    public showObjectiveActivated(letter: string): void {
        this._showGlobal(mod.Message(mod.stringkeys.KothObjectiveActivated, letter));
    }

    public showObjectiveLocked(letter: string, seconds: number): void {
        this._showGlobal(mod.Message(mod.stringkeys.KothObjectiveLocked, letter, seconds));
    }

    public showObjectiveContested(letter: string): void {
        this._showGlobal(mod.Message(mod.stringkeys.KothObjectiveContested, letter));
    }

    public showVictoryImminent(team: mod.Team): void {
        this._showTeam(team, mod.Message(mod.stringkeys.KothVictoryImminent));
    }

    public showDefeatImminent(team: mod.Team): void {
        this._showTeam(team, mod.Message(mod.stringkeys.KothDefeatImminent));
    }

    public showMatchWon(team: mod.Team): void {
        this._showTeam(team, mod.Message(mod.stringkeys.KothMatchWon));
    }

    public showMatchLost(team: mod.Team): void {
        this._showTeam(team, mod.Message(mod.stringkeys.KothMatchLost));
    }

    private _showGlobal(message: mod.Message): void {
        mod.DisplayCustomNotificationMessage(message, mod.CustomNotificationSlots.HeaderText, 3);
        displayWorldLog(message);
    }

    private _showTeam(team: mod.Team, message: mod.Message): void {
        mod.DisplayCustomNotificationMessage(message, mod.CustomNotificationSlots.HeaderText, 3, team);
        displayWorldLog(message, team);
    }
}
