import { KOTH_UI, KOTH_UI_COLORS } from '../config/koth-ui.ts';
import type { KothHillControlState } from '../state/koth-hill-state.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import {
    formatClockMessage,
    formatScore3Message,
    getHillLetterMessage,
    getKothControlStateMessage,
    getKothTeamId,
    isParticipantTeam,
    KOTH_TEAM_1,
    KOTH_TEAM_2,
} from './koth-sdk-utils.ts';

const KOTH_TOP_HUD_LAYOUT = {
    rootX: 0,
    rootY: 18,
    rootWidth: 620,
    rootHeight: 86,
    scoreBoxCenterX: 250,
    scoreBoxY: 4,
    scoreBoxWidth: 118,
    scoreBoxHeight: 40,
    scoreTextY: 7,
    scoreTextHeight: 34,
    crownX: 0,
    crownY: 8,
    crownWidth: 44,
    crownHeight: 32,
    targetScoreX: 0,
    targetScoreY: 38,
    targetScoreWidth: 88,
    targetScoreHeight: 24,
    hillX: -48,
    hillY: 42,
    hillWidth: 68,
    hillHeight: 30,
    timerX: 48,
    timerY: 42,
    timerWidth: 86,
    timerHeight: 30,
    stateX: 0,
    stateY: 64,
    stateWidth: 260,
    stateHeight: 18,
    friendlyBarX: -286,
    enemyBarX: 46,
    barY: 48,
} as const;

export class KothUiService {
    public constructor(private readonly _context: KothLiveModeContext) {}

    public ensurePlayerHud(playerId: number): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
        if (!isParticipantTeam(mod.GetTeam(playerState.player))) return;

        const rootName = this._name(playerId, 'Root');
        if (this._findWidget(rootName)) return;

        const player = playerState.player;
        const root = this._addContainer(
            rootName,
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.rootX, KOTH_TOP_HUD_LAYOUT.rootY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.rootWidth, KOTH_TOP_HUD_LAYOUT.rootHeight, 0),
            mod.UIAnchor.TopCenter,
            mod.GetUIRoot(),
            player,
            KOTH_UI_COLORS.background,
            0.28
        );
        if (!root) return;

        this._addContainerWithFill(
            this._name(playerId, 'FriendlyScoreBox'),
            mod.CreateVector(-KOTH_TOP_HUD_LAYOUT.scoreBoxCenterX, KOTH_TOP_HUD_LAYOUT.scoreBoxY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreBoxWidth, KOTH_TOP_HUD_LAYOUT.scoreBoxHeight, 0),
            mod.UIAnchor.TopCenter,
            root,
            player,
            KOTH_UI_COLORS.team1,
            0.6,
            mod.UIBgFill.Blur
        );
        this._addContainerWithFill(
            this._name(playerId, 'EnemyScoreBox'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreBoxCenterX, KOTH_TOP_HUD_LAYOUT.scoreBoxY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreBoxWidth, KOTH_TOP_HUD_LAYOUT.scoreBoxHeight, 0),
            mod.UIAnchor.TopCenter,
            root,
            player,
            KOTH_UI_COLORS.team2,
            0.6,
            mod.UIBgFill.Blur
        );
        this._addText(
            this._name(playerId, 'FriendlyScore'),
            mod.CreateVector(-KOTH_TOP_HUD_LAYOUT.scoreBoxCenterX, KOTH_TOP_HUD_LAYOUT.scoreTextY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreBoxWidth, KOTH_TOP_HUD_LAYOUT.scoreTextHeight, 0),
            root,
            player,
            30
        );
        this._addText(
            this._name(playerId, 'EnemyScore'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreBoxCenterX, KOTH_TOP_HUD_LAYOUT.scoreTextY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreBoxWidth, KOTH_TOP_HUD_LAYOUT.scoreTextHeight, 0),
            root,
            player,
            30
        );
        this._addImage(
            this._name(playerId, 'Crown'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.crownX, KOTH_TOP_HUD_LAYOUT.crownY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.crownWidth, KOTH_TOP_HUD_LAYOUT.crownHeight, 0),
            root,
            player
        );
        this._addText(
            this._name(playerId, 'TargetScore'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreX, KOTH_TOP_HUD_LAYOUT.targetScoreY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreWidth, KOTH_TOP_HUD_LAYOUT.targetScoreHeight, 0),
            root,
            player,
            18
        );
        this._addText(
            this._name(playerId, 'Hill'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.hillX, KOTH_TOP_HUD_LAYOUT.hillY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.hillWidth, KOTH_TOP_HUD_LAYOUT.hillHeight, 0),
            root,
            player,
            24
        );
        this._addText(
            this._name(playerId, 'Timer'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.timerX, KOTH_TOP_HUD_LAYOUT.timerY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.timerWidth, KOTH_TOP_HUD_LAYOUT.timerHeight, 0),
            root,
            player,
            24
        );
        this._addText(
            this._name(playerId, 'State'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.stateX, KOTH_TOP_HUD_LAYOUT.stateY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.stateWidth, KOTH_TOP_HUD_LAYOUT.stateHeight, 0),
            root,
            player,
            14
        );

        this._addContainer(
            this._name(playerId, 'Team1BarBg'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.friendlyBarX, KOTH_TOP_HUD_LAYOUT.barY, 0),
            mod.CreateVector(KOTH_UI.scoreBarWidth, KOTH_UI.scoreBarHeight, 0),
            mod.UIAnchor.TopLeft,
            root,
            player,
            KOTH_UI_COLORS.neutral,
            0.35
        );
        this._addContainer(
            this._name(playerId, 'Team1BarFill'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.friendlyBarX, KOTH_TOP_HUD_LAYOUT.barY, 0),
            mod.CreateVector(0, KOTH_UI.scoreBarHeight, 0),
            mod.UIAnchor.TopLeft,
            root,
            player,
            KOTH_UI_COLORS.team1,
            1
        );
        this._addContainer(
            this._name(playerId, 'Team2BarBg'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.enemyBarX, KOTH_TOP_HUD_LAYOUT.barY, 0),
            mod.CreateVector(KOTH_UI.scoreBarWidth, KOTH_UI.scoreBarHeight, 0),
            mod.UIAnchor.TopLeft,
            root,
            player,
            KOTH_UI_COLORS.neutral,
            0.35
        );
        this._addContainer(
            this._name(playerId, 'Team2BarFill'),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.enemyBarX + KOTH_UI.scoreBarWidth,
                KOTH_TOP_HUD_LAYOUT.barY,
                0
            ),
            mod.CreateVector(0, KOTH_UI.scoreBarHeight, 0),
            mod.UIAnchor.TopLeft,
            root,
            player,
            KOTH_UI_COLORS.team2,
            1
        );

        this._ensureObjectiveHud(playerId, player);

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
        const teamId = getKothTeamId(mod.GetTeam(playerState.player));
        const isTeam1Viewer = teamId === 1;
        const friendlyScore = isTeam1Viewer ? runtime.team1Score : runtime.team2Score;
        const enemyScore = isTeam1Viewer ? runtime.team2Score : runtime.team1Score;
        const friendlyBarScore = this._scoreRatio(friendlyScore);
        const enemyBarScore = this._scoreRatio(enemyScore);

        this._safeSetText(this._name(playerId, 'FriendlyScore'), formatScore3Message(friendlyScore));
        this._safeSetText(this._name(playerId, 'EnemyScore'), formatScore3Message(enemyScore));
        this._safeSetText(this._name(playerId, 'TargetScore'), mod.Message(mod.stringkeys.KothScoreTarget));
        this._safeSetText(this._name(playerId, 'Hill'), getHillLetterMessage(activeHill.letter));
        this._safeSetText(this._name(playerId, 'Timer'), formatClockMessage(runtime.hill.activeObjectiveRemainingSeconds));
        this._safeSetText(this._name(playerId, 'State'), getKothControlStateMessage(runtime.hill.currentControlState));
        this._safeSetTextColor(this._name(playerId, 'State'), this._getStateColor(runtime.hill.currentControlState));
        this._safeSetTextColor(this._name(playerId, 'FriendlyScore'), KOTH_UI_COLORS.team1);
        this._safeSetTextColor(this._name(playerId, 'EnemyScore'), KOTH_UI_COLORS.team2);

        const friendlyWidth = KOTH_UI.scoreBarWidth * friendlyBarScore;
        const enemyWidth = KOTH_UI.scoreBarWidth * enemyBarScore;
        const enemyFillX = KOTH_TOP_HUD_LAYOUT.enemyBarX + KOTH_UI.scoreBarWidth - enemyWidth;
        this._safeSetPosition(
            this._name(playerId, 'Team1BarFill'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.friendlyBarX, KOTH_TOP_HUD_LAYOUT.barY, 0)
        );
        this._safeSetSize(this._name(playerId, 'Team1BarFill'), mod.CreateVector(friendlyWidth, KOTH_UI.scoreBarHeight, 0));
        this._safeSetPosition(
            this._name(playerId, 'Team2BarFill'),
            mod.CreateVector(enemyFillX, KOTH_TOP_HUD_LAYOUT.barY, 0)
        );
        this._safeSetSize(this._name(playerId, 'Team2BarFill'), mod.CreateVector(enemyWidth, KOTH_UI.scoreBarHeight, 0));
        this._updateObjectiveHud(playerId);
    }

    public hideLiveHud(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            const root = this._findWidget(this._name(playerState.id, 'Root'));
            if (root) this._safeSetVisible(root, false);
            const objectiveRoot = this._findWidget(this._name(playerState.id, 'ObjectiveRoot'));
            if (objectiveRoot) this._safeSetVisible(objectiveRoot, false);
        });
    }

    public showPostmatch(winner: mod.Team): void {
        this.hideLiveHud();
        this._showPostmatchForTeam(KOTH_TEAM_1, winner);
        this._showPostmatchForTeam(KOTH_TEAM_2, winner);
    }

    private _showPostmatchForTeam(receiver: mod.Team, winner: mod.Team): void {
        const teamId = getKothTeamId(receiver);
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

    private _ensureObjectiveHud(playerId: number, player: mod.Player): void {
        const rootName = this._name(playerId, 'ObjectiveRoot');
        if (this._findWidget(rootName)) return;

        const root = this._addContainerWithFill(
            rootName,
            mod.CreateVector(0, -300, 0),
            mod.CreateVector(KOTH_UI.objectiveFlagSize, KOTH_UI.objectiveFlagSize, 0),
            mod.UIAnchor.Center,
            mod.GetUIRoot(),
            player,
            KOTH_UI_COLORS.neutral,
            1,
            mod.UIBgFill.Blur
        );
        if (!root) return;

        this._addText(this._name(playerId, 'ObjectiveLetter'), mod.CreateVector(0, 0, 0), mod.CreateVector(80, 80, 0), root, player, 50);
        this._addContainerWithFill(
            this._name(playerId, 'ObjectiveBorder'),
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(80, 80, 0),
            mod.UIAnchor.Center,
            root,
            player,
            KOTH_UI_COLORS.border,
            1,
            mod.UIBgFill.OutlineThick
        );
        this._addText(this._name(playerId, 'ObjectiveContested'), mod.CreateVector(0, 56, 0), mod.CreateVector(140, 50, 0), root, player, 24);
        this._addText(this._name(playerId, 'ObjectiveFriendlyCount'), mod.CreateVector(-54, 92, 0), mod.CreateVector(52, 28, 0), root, player, 20);
        this._addText(this._name(playerId, 'ObjectiveEnemyCount'), mod.CreateVector(54, 92, 0), mod.CreateVector(52, 28, 0), root, player, 20);
        this._addContainerWithFill(
            this._name(playerId, 'ObjectiveFriendlyBar'),
            mod.CreateVector(-44, 84, 0),
            mod.CreateVector(0, KOTH_UI.objectiveBarHeight, 0),
            mod.UIAnchor.Center,
            root,
            player,
            KOTH_UI_COLORS.team1,
            1,
            mod.UIBgFill.Solid
        );
        this._addContainerWithFill(
            this._name(playerId, 'ObjectiveEnemyBar'),
            mod.CreateVector(44, 84, 0),
            mod.CreateVector(0, KOTH_UI.objectiveBarHeight, 0),
            mod.UIAnchor.Center,
            root,
            player,
            KOTH_UI_COLORS.team2,
            1,
            mod.UIBgFill.Solid
        );
    }

    private _updateObjectiveHud(playerId: number): void {
        const runtime = this._context.runtime;
        const playerState = runtime.playersById.get(playerId);
        const root = this._findWidget(this._name(playerId, 'ObjectiveRoot'));
        if (!playerState || !root || !mod.IsPlayerValid(playerState.player)) return;

        const visible = runtime.isMatchActive && playerState.isInsideActiveHill;
        this._safeSetVisible(root, visible);
        if (!visible) return;

        const activeHill = this._context.hills[runtime.hill.currentHillIndex];
        const teamId = getKothTeamId(mod.GetTeam(playerState.player));
        const friendlyCount =
            teamId === 1 ? runtime.hill.activeHillTeam1Players.size : runtime.hill.activeHillTeam2Players.size;
        const enemyCount =
            teamId === 1 ? runtime.hill.activeHillTeam2Players.size : runtime.hill.activeHillTeam1Players.size;
        const contested = friendlyCount > 0 && enemyCount > 0;
        const total = friendlyCount + enemyCount;
        const friendlyWidth = total > 0 ? KOTH_UI.objectiveBarWidth * (friendlyCount / total) : 0;
        const enemyWidth = total > 0 ? KOTH_UI.objectiveBarWidth * (enemyCount / total) : 0;

        this._safeSetText(this._name(playerId, 'ObjectiveLetter'), getHillLetterMessage(activeHill.letter));
        this._safeSetText(this._name(playerId, 'ObjectiveContested'), mod.Message(mod.stringkeys.KothObjectiveContestedShort));
        this._safeSetText(this._name(playerId, 'ObjectiveFriendlyCount'), mod.Message(mod.stringkeys.CounterText, friendlyCount));
        this._safeSetText(this._name(playerId, 'ObjectiveEnemyCount'), mod.Message(mod.stringkeys.CounterText, enemyCount));
        this._safeSetTextColor(this._name(playerId, 'ObjectiveContested'), KOTH_UI_COLORS.contested);
        this._safeSetTextColor(this._name(playerId, 'ObjectiveFriendlyCount'), KOTH_UI_COLORS.team1);
        this._safeSetTextColor(this._name(playerId, 'ObjectiveEnemyCount'), KOTH_UI_COLORS.team2);
        this._safeSetBgColor(root, this._getObjectiveFlagColor(runtime.hill.currentControlState, teamId));

        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveContested'), contested);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveFriendlyCount'), contested);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveEnemyCount'), contested);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveFriendlyBar'), contested);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveEnemyBar'), contested);
        this._safeSetSize(
            this._name(playerId, 'ObjectiveFriendlyBar'),
            mod.CreateVector(friendlyWidth, KOTH_UI.objectiveBarHeight, 0)
        );
        this._safeSetSize(
            this._name(playerId, 'ObjectiveEnemyBar'),
            mod.CreateVector(enemyWidth, KOTH_UI.objectiveBarHeight, 0)
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
        return this._addContainerWithFill(name, position, size, anchor, parent, receiver, color, alpha, mod.UIBgFill.Blur);
    }

    private _addContainerWithFill(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        anchor: mod.UIAnchor,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team,
        color: mod.Vector,
        alpha: number,
        fill: mod.UIBgFill
    ): mod.UIWidget | undefined {
        try {
            mod.AddUIContainer(name, position, size, anchor, parent, true, 0, color, alpha, fill, receiver);
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
                mod.Message(mod.stringkeys.EmptyText),
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
                KOTH_UI_COLORS.crown,
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

    private _safeSetPosition(name: string, position: mod.Vector): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUIWidgetPosition(widget, position);
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

    private _safeSetVisibleByName(name: string, visible: boolean): void {
        const widget = this._findWidget(name);
        if (widget) this._safeSetVisible(widget, visible);
    }

    private _safeSetBgColor(widget: mod.UIWidget, color: mod.Vector): void {
        try {
            mod.SetUIWidgetBgColor(widget, color);
        } catch (_err) {
            return;
        }
    }

    private _getObjectiveFlagColor(controlState: KothHillControlState, viewerTeamId: 0 | 1 | 2): mod.Vector {
        if (controlState === 'contested') return KOTH_UI_COLORS.contested;
        if (controlState === 'team1') return viewerTeamId === 1 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        if (controlState === 'team2') return viewerTeamId === 2 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        return KOTH_UI_COLORS.neutral;
    }

    private _getStateLabel(controlState: KothHillControlState): string {
        if (controlState === 'team1') return 'TEAM 1 HOLDS';
        if (controlState === 'team2') return 'TEAM 2 HOLDS';
        if (controlState === 'contested') return 'CONTESTED';
        return 'NEUTRAL';
    }

    private _scoreRatio(score: number): number {
        const ratio = score / this._context.rules.scoreToWin;
        if (ratio < 0) return 0;
        if (ratio > 1) return 1;
        return ratio;
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

