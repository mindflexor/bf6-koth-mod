import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import { isParticipantTeam } from './koth-sdk-utils.ts';

export class KothScoreboardService {
    public constructor(private readonly _context: KothLiveModeContext) {}

    public configure(): void {
        mod.SetScoreboardType(mod.ScoreboardType.CustomTwoTeams);
        mod.SetScoreboardColumnNames(
            mod.Message(mod.stringkeys.KothScoreboardScore),
            mod.Message(mod.stringkeys.KothScoreboardKills),
            mod.Message(mod.stringkeys.KothScoreboardDeaths),
            mod.Message(mod.stringkeys.KothScoreboardAssists),
            mod.Message(mod.stringkeys.KothScoreboardHillTime)
        );
        mod.SetScoreboardColumnWidths(80, 70, 70, 80, 100);
        mod.SetScoreboardSorting(1, true);
    }

    public updateAll(): void {
        this._context.runtime.playersById.forEach((playerState) => this.updatePlayer(playerState.id));
        this._context.runtime.scoreboardDirty = false;
    }

    public updatePlayer(playerId: number): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState) return;
        if (!mod.IsPlayerValid(playerState.player)) return;
        if (!isParticipantTeam(mod.GetTeam(playerState.player))) return;

        const snapshot = playerState.getScoreboardSnapshot();
        mod.SetScoreboardPlayerValues(
            playerState.player,
            snapshot[0],
            snapshot[1],
            snapshot[2],
            snapshot[3],
            snapshot[4]
        );
    }
}
