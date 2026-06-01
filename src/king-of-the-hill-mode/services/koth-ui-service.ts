import { KOTH_UI, KOTH_UI_COLORS } from '../config/koth-ui.ts';
import type { KothHillControlState } from '../state/koth-hill-state.ts';
import type { KothModeContext } from '../state/koth-mode-context.ts';
import { formatClockText, getTeamId, isParticipantTeam, KOTH_TEAM_1, KOTH_TEAM_2 } from './koth-sdk-utils.ts';

export class KothUiService {
    public constructor(private readonly _context: KothModeContext) {}

    public ensurePlayerHud(playerId: number): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
        if (!isParticipantTeam(mod.GetTeam(playerState.player))) return;

        const rootName = this._name(playerId, 'Root');
        if (this._findWidget(rootName)) return;

        const player = playerState.player;
        const root = this._addContainer(
            rootName,
            mod.CreateVector(0, 18, 0),
            mod.CreateVector(620, 86, 0),
            mod.UIAnchor.TopCenter,
            mod.GetUIRoot(),
            player,
            KOTH_UI_COLORS.background,
            0.28
        );
        if (!root) return;

        this._addText(this._name(playerId, 'Team1Score'), mod.CreateVector(-286, 8, 0), mod.CreateVector(86, 34, 0), root, player, 30);
        this._addText(this._name(playerId, 'Team2Score'), mod.CreateVector(200, 8, 0), mod.CreateVector(86, 34, 0), root, player, 30);
        this._addImage(this._name(playerId, 'Crown'), mod.CreateVector(-22, 8, 0), mod.CreateVector(44, 32, 0), root, player);
        this._addText(this._name(playerId, 'Hill'), mod.CreateVector(-78, 42, 0), mod.CreateVector(68, 30, 0), root, player, 24);
        this._addText(this._name(playerId, 'Timer'), mod.CreateVector(10, 42, 0), mod.CreateVector(86, 30, 0), root, player, 24);
        this._addText(this._name(playerId, 'State'), mod.CreateVector(-130, 64, 0), mod.CreateVector(260, 18, 0), root, player, 14);

        this._addContainer(
            this._name(playerId, 'Team1BarBg'),
            mod.CreateVector(-286, 48, 0),
            mod.CreateVector(KOTH_UI.scoreBarWidth, KOTH_UI.scoreBarHeight, 0),
            mod.UIAnchor.TopLeft,
            root,
            player,
            KOTH_UI_COLORS.neutral,
            0.35
        );
        this._addContainer(
            this._name(playerId, 'Team1BarFill'),
            mod.CreateVector(-286, 48, 0),
            mod.CreateVector(0, KOTH_UI.scoreBarHeight, 0),
            mod.UIAnchor.TopLeft,
            root,
            player,
            KOTH_UI_COLORS.team1,
            1
        );
        this._addContainer(
            this._name(playerId, 'Team2BarBg'),
            mod.CreateVector(46, 48, 0),
            mod.CreateVector(KOTH_UI.scoreBarWidth, KOTH_UI.scoreBarHeight, 0),
            mod.UIAnchor.TopLeft,
            root,
            player,
            KOTH_UI_COLORS.neutral,
            0.35
        );
        this._addContainer(
            this._name(playerId, 'Team2BarFill'),
            mod.CreateVector(46, 48, 0),
            mod.CreateVector(0, KOTH_UI.scoreBarHeight, 0),
            mod.UIAnchor.TopLeft,
            root,
            player,
            KOTH_UI_COLORS.team2,
            1
        );

        this.updatePlayerHud(playerId);
    }

    public updateAll(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            this.ensurePlayerHud(playerState.id);
            this.updatePlayerHud(playerState.id);
        });
        this._context.runtime.hudDirty = false;
    }

    public updatePlayerHud(playerId: number): void {
        const runtime = this._context.runtime;
        const playerState = runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;

        const root = this._findWidget(this._name(playerId, 'Root'));
        if (!root) return;

        const activeHill = this._context.hills[runtime.hill.currentHillIndex];
        this._safeSetVisible(root, runtime.isMatchActive);
        this._safeSetText(this._name(playerId, 'Team1Score'), mod.Message(runtime.team1Score));
        this._safeSetText(this._name(playerId, 'Team2Score'), mod.Message(runtime.team2Score));
        this._safeSetText(this._name(playerId, 'Hill'), mod.Message(activeHill.letter));
        this._safeSetText(this._name(playerId, 'Timer'), mod.Message(formatClockText(runtime.hill.activeObjectiveRemainingSeconds)));
        this._safeSetText(this._name(playerId, 'State'), mod.Message(this._getStateLabel(runtime.hill.currentControlState)));
        this._safeSetTextColor(this._name(playerId, 'State'), this._getStateColor(runtime.hill.currentControlState));

        const team1Width = KOTH_UI.scoreBarWidth * (runtime.team1Score / this._context.rules.scoreToWin);
        const team2Width = KOTH_UI.scoreBarWidth * (runtime.team2Score / this._context.rules.scoreToWin);
        this._safeSetSize(this._name(playerId, 'Team1BarFill'), mod.CreateVector(team1Width, KOTH_UI.scoreBarHeight, 0));
        this._safeSetSize(this._name(playerId, 'Team2BarFill'), mod.CreateVector(team2Width, KOTH_UI.scoreBarHeight, 0));
    }

    public hideLiveHud(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            const root = this._findWidget(this._name(playerState.id, 'Root'));
            if (root) this._safeSetVisible(root, false);
        });
    }

    public showPostmatch(winner: mod.Team): void {
        this.hideLiveHud();
        this._showPostmatchForTeam(KOTH_TEAM_1, winner);
        this._showPostmatchForTeam(KOTH_TEAM_2, winner);
    }

    private _showPostmatchForTeam(receiver: mod.Team, winner: mod.Team): void {
        const teamId = getTeamId(receiver);
        const rootName = `KOTH_POSTMATCH_${teamId}`;
        const existing = this._findWidget(rootName);
        if (existing) this._safeSetVisible(existing, true);

        const root =
            existing ??
            this._addContainer(
                rootName,
                mod.CreateVector(0, 145, 0),
                mod.CreateVector(720, 180, 0),
                mod.UIAnchor.TopCenter,
                mod.GetUIRoot(),
                receiver,
                KOTH_UI_COLORS.background,
                0.5
            );
        if (!root) return;

        const won = mod.Equals(receiver, winner);
        const resultName = `KOTH_POSTMATCH_RESULT_${teamId}`;
        const scoreName = `KOTH_POSTMATCH_SCORE_${teamId}`;
        if (!this._findWidget(resultName)) {
            this._addText(resultName, mod.CreateVector(0, 24, 0), mod.CreateVector(620, 56, 0), root, receiver, 44);
        }
        if (!this._findWidget(scoreName)) {
            this._addText(scoreName, mod.CreateVector(0, 92, 0), mod.CreateVector(620, 36, 0), root, receiver, 26);
        }

        this._safeSetText(resultName, won ? mod.Message(mod.stringkeys.KothMatchWon) : mod.Message(mod.stringkeys.KothMatchLost));
        this._safeSetTextColor(resultName, this._getPostmatchResultColor(receiver, won));
        this._safeSetText(
            scoreName,
            mod.Message(mod.stringkeys.KothFinalScore, this._context.runtime.team1Score, this._context.runtime.team2Score)
        );
    }

    private _name(playerId: number, suffix: string): string {
        return `${KOTH_UI.rootNamePrefix}${playerId}_${suffix}`;
    }

    private _findWidget(name: string): mod.UIWidget | undefined {
        try {
            const widget = mod.FindUIWidgetWithName(name);
            return widget || undefined;
        } catch (_err) {
            return undefined;
        }
    }

    private _addContainer(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        anchor: mod.UIAnchor,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team,
        color: mod.Vector,
        alpha: number
    ): mod.UIWidget | undefined {
        try {
            mod.AddUIContainer(name, position, size, anchor, parent, true, 0, color, alpha, mod.UIBgFill.Blur, receiver);
            return this._findWidget(name);
        } catch (_err) {
            return undefined;
        }
    }

    private _addText(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team,
        textSize: number
    ): mod.UIWidget | undefined {
        try {
            mod.AddUIText(
                name,
                position,
                size,
                mod.UIAnchor.TopCenter,
                parent,
                true,
                0,
                mod.CreateVector(0, 0, 0),
                0,
                mod.UIBgFill.Solid,
                mod.Message(""),
                textSize,
                KOTH_UI_COLORS.text,
                1,
                mod.UIAnchor.Center,
                receiver
            );
            return this._findWidget(name);
        } catch (_err) {
            return undefined;
        }
    }

    private _addImage(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team
    ): mod.UIWidget | undefined {
        try {
            mod.AddUIImage(
                name,
                position,
                size,
                mod.UIAnchor.TopCenter,
                parent,
                true,
                0,
                mod.CreateVector(0, 0, 0),
                0,
                mod.UIBgFill.Solid,
                mod.UIImageType.CrownSolid,
                KOTH_UI_COLORS.contested,
                1,
                receiver
            );
            return this._findWidget(name);
        } catch (_err) {
            return undefined;
        }
    }

    private _safeSetText(name: string, message: mod.Message): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUITextLabel(widget, message);
        } catch (_err) {
            return;
        }
    }

    private _safeSetTextColor(name: string, color: mod.Vector): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUITextColor(widget, color);
        } catch (_err) {
            return;
        }
    }

    private _safeSetSize(name: string, size: mod.Vector): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUIWidgetSize(widget, size);
        } catch (_err) {
            return;
        }
    }

    private _safeSetVisible(widget: mod.UIWidget, visible: boolean): void {
        try {
            mod.SetUIWidgetVisible(widget, visible);
        } catch (_err) {
            return;
        }
    }

    private _getStateLabel(controlState: KothHillControlState): string {
        if (controlState === 'team1') return 'TEAM 1 HOLDS';
        if (controlState === 'team2') return 'TEAM 2 HOLDS';
        if (controlState === 'contested') return 'CONTESTED';
        return 'NEUTRAL';
    }

    private _getStateColor(controlState: KothHillControlState): mod.Vector {
        if (controlState === 'team1') return KOTH_UI_COLORS.team1;
        if (controlState === 'team2') return KOTH_UI_COLORS.team2;
        if (controlState === 'contested') return KOTH_UI_COLORS.contested;
        return KOTH_UI_COLORS.neutral;
    }

    private _getPostmatchResultColor(receiver: mod.Team, won: boolean): mod.Vector {
        if (won) return mod.Equals(receiver, KOTH_TEAM_1) ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        return mod.Equals(receiver, KOTH_TEAM_1) ? KOTH_UI_COLORS.team2 : KOTH_UI_COLORS.team1;
    }
}
