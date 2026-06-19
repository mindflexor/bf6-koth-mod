import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothBannerService } from './koth-banner-service.ts';
import type { KothHillService } from './koth-hill-service.ts';
import type { KothScoreboardService } from './koth-scoreboard-service.ts';
import { KOTH_TEAM_1, KOTH_TEAM_2 } from './koth-sdk-utils.ts';
import type { KothSfxService } from './koth-sfx-service.ts';

export class KothScoreService {
    public constructor(
        private readonly _context: KothLiveModeContext,
        private readonly _hillService: KothHillService,
        private readonly _scoreboardService: KothScoreboardService,
        private readonly _bannerService: KothBannerService,
        private readonly _sfxService: KothSfxService
    ) {}

    public resetScores(): void {
        this._context.runtime.team1Score = 0;
        this._context.runtime.team2Score = 0;
        this._context.runtime.victoryImminentShownTeam1 = false;
        this._context.runtime.victoryImminentShownTeam2 = false;
        this.syncGameModeScores(true);
    }

    public syncGameModeScores(_force: boolean = false): void {
        mod.SetGameModeScore(KOTH_TEAM_1, this._clampScoreForEngine(this._context.runtime.team1Score));
        mod.SetGameModeScore(KOTH_TEAM_2, this._clampScoreForEngine(this._context.runtime.team2Score));
    }

    public tickScore(): mod.Team | null {
        const runtime = this._context.runtime;
        if (!runtime.isMatchActive) return null;

        this._awardHillTime();

        if (runtime.hill.currentControlState === 'team1') {
            runtime.team1Score += this._context.rules.scorePerOwnedSecond;
        } else if (runtime.hill.currentControlState === 'team2') {
            runtime.team2Score += this._context.rules.scorePerOwnedSecond;
        }

        if (runtime.team1Score > this._context.rules.scoreToWin) runtime.team1Score = this._context.rules.scoreToWin;
        if (runtime.team2Score > this._context.rules.scoreToWin) runtime.team2Score = this._context.rules.scoreToWin;

        this._checkImminentBanners();
        this.syncGameModeScores();
        runtime.scoreboardDirty = true;
        runtime.hudDirty = true;

        if (runtime.team1Score >= this._context.rules.scoreToWin) return KOTH_TEAM_1;
        if (runtime.team2Score >= this._context.rules.scoreToWin) return KOTH_TEAM_2;
        return null;
    }

    public addKillScore(player: mod.Player): void {
        const playerState = this._context.runtime.playersById.get(mod.GetObjId(player));
        if (!playerState) return;

        playerState.addKill();
        playerState.addScore(100);
        this._context.runtime.scoreboardDirty = true;
    }

    public addDeath(player: mod.Player): void {
        const playerState = this._context.runtime.playersById.get(mod.GetObjId(player));
        if (!playerState) return;

        playerState.addDeath();
        this._context.runtime.scoreboardDirty = true;
    }

    public addAssistScore(player: mod.Player): void {
        const playerState = this._context.runtime.playersById.get(mod.GetObjId(player));
        if (!playerState) return;

        playerState.addAssist();
        playerState.addScore(50);
        this._context.runtime.scoreboardDirty = true;
    }

    private _awardHillTime(): void {
        if (this._context.runtime.hill.currentControlState === 'locked') return;

        for (const playerId of this._hillService.getActiveHillPlayerIds()) {
            const playerState = this._context.runtime.playersById.get(playerId);
            if (!playerState) continue;
            playerState.addHillTime(1);
        }
    }

    private _clampScoreForEngine(score: number): number {
        if (score < 0) return 0;
        if (score > this._context.rules.scoreToWin) return this._context.rules.scoreToWin;
        return score;
    }

    private _checkImminentBanners(): void {
        const runtime = this._context.runtime;

        if (!runtime.victoryImminentShownTeam1 && runtime.team1Score >= this._context.rules.victoryImminentScore) {
            runtime.victoryImminentShownTeam1 = true;
            this._bannerService.showVictoryImminent(KOTH_TEAM_1);
            this._bannerService.showDefeatImminent(KOTH_TEAM_2);
            this._sfxService.playVictoryImminent(KOTH_TEAM_1);
        }

        if (!runtime.victoryImminentShownTeam2 && runtime.team2Score >= this._context.rules.victoryImminentScore) {
            runtime.victoryImminentShownTeam2 = true;
            this._bannerService.showVictoryImminent(KOTH_TEAM_2);
            this._bannerService.showDefeatImminent(KOTH_TEAM_1);
            this._sfxService.playVictoryImminent(KOTH_TEAM_2);
        }
    }
}
