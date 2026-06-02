import { Timers } from 'bf6-portal-utils/timers/index.ts';

import { KOTH_UI, KOTH_UI_COLORS } from '../config/koth-ui.ts';
import type { KothHillControlState } from '../state/koth-hill-state.ts';
import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import {
    formatScore3Message,
    getHillLetterMessage,
    getKothTeamId,
    isParticipantTeam,
    KOTH_TEAM_1,
    KOTH_TEAM_2,
} from './koth-sdk-utils.ts';

const KOTH_TOP_HUD_LAYOUT = {
    rootX: 0,
    rootY: 36,
    rootWidth: 7000,
    rootHeight: 7000,
    topHudY: -511.9,
    topHudWidth: 576,
    topHudHeight: 50,
    friendlyScoreBoxX: -238,
    enemyScoreBoxX: 226,
    scoreBoxY: -4,
    scoreBoxWidth: 82,
    scoreBoxHeight: 42,
    scoreTextX: 0,
    scoreTextY: 0,
    scoreTextWidth: 84,
    scoreTextHeight: 50,
    scoreTextSize: 24,
    friendlyBarX: 108,
    enemyBarX: 342,
    barY: 15,
    barWidth: 120,
    barHeight: 12,
    targetScoreBoxX: 258,
    targetScoreBoxY: 0,
    targetScoreBoxWidth: 60,
    targetScoreBoxHeight: 40,
    targetScoreTextX: 0,
    targetScoreTextY: 0,
    targetScoreTextWidth: 60,
    targetScoreTextHeight: 50,
    targetScoreTextSize: 24,
    crownX: 0,
    crownY: -531,
    crownWidth: 20,
    crownHeight: 18,
    objectiveX: 0,
    objectiveCompactY: -462.87,
    objectiveExpandedY: -430,
    objectiveCompactSize: 40,
    objectiveExpandedSize: 50,
    objectiveTextWidth: 100,
    objectiveTextHeight: 50,
    objectiveTextSize: 17,
    objectiveExpandedTextSize: 20,
    objectiveDetailLabelY: 59,
    objectiveDetailLabelWidth: 150,
    objectiveDetailLabelHeight: 22,
    objectiveDetailLabelSize: 14,
    objectiveDetailCountX: 40,
    objectiveDetailCountY: 33,
    objectiveDetailCountWidth: 34,
    objectiveDetailCountHeight: 18,
    objectiveDetailCountTextSize: 13,
    objectiveDetailBarY: 45,
    objectiveDetailBarGap: 4,
    objectiveDetailBarMaxWidth: 42,
    objectiveDetailBarHeight: 4,
    contestedOutlineSizes: [40, 50, 70] as const,
    contestedOutlineClosePadding: 10,
    contestedOutlineWidePadding: 30,
    contestedBlinkMs: 260,
    contestedBlinkFrameCount: 4,
} as const;

const KOTH_TOP_HUD_COLORS = {
    root: mod.CreateVector(0.051, 0.051, 0.051),
    dark: mod.CreateVector(0.2, 0.2, 0.2),
} as const;

export class KothUiService {
    private _contestedBlinkIntervalHandle: number | undefined = undefined;
    private _contestedBlinkStep = 0;

    public constructor(private readonly _context: KothLiveModeContext) {}

    public ensurePlayerHud(playerId: number): void {
        const playerState = this._context.runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
        if (playerState.isBot) {
            this._hidePlayerHudForPlayer(playerId);
            return;
        }
        if (!isParticipantTeam(mod.GetTeam(playerState.player))) return;

        const rootName = this._name(playerId, 'Root');
        if (this._findWidget(rootName)) return;

        const player = playerState.player;
        const root = this._addContainerWithFill(
            rootName,
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.rootX, KOTH_TOP_HUD_LAYOUT.rootY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.rootWidth, KOTH_TOP_HUD_LAYOUT.rootHeight, 0),
            mod.UIAnchor.Center,
            mod.GetUIRoot(),
            player,
            KOTH_TOP_HUD_COLORS.root,
            1,
            mod.UIBgFill.None
        );
        if (!root) return;

        const topHud = this._addContainerWithFill(
            this._name(playerId, 'TopHudContainer'),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.topHudY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.topHudWidth, KOTH_TOP_HUD_LAYOUT.topHudHeight, 0),
            mod.UIAnchor.Center,
            root,
            player,
            KOTH_TOP_HUD_COLORS.dark,
            1,
            mod.UIBgFill.None
        );
        if (!topHud) return;

        this._ensureScoreBox(
            playerId,
            player,
            topHud,
            'FriendlyScoreBox',
            'FriendlyScore',
            KOTH_TOP_HUD_LAYOUT.friendlyScoreBoxX,
            KOTH_UI_COLORS.team1,
            mod.Message(mod.stringkeys.Text_Friendly_Score),
            KOTH_UI_COLORS.team1
        );
        this._ensureScoreBox(
            playerId,
            player,
            topHud,
            'EnemyScoreBox',
            'EnemyScore',
            KOTH_TOP_HUD_LAYOUT.enemyScoreBoxX,
            KOTH_UI_COLORS.team2,
            mod.Message(mod.stringkeys.Text_Enemy_Score),
            KOTH_UI_COLORS.team2
        );
        this._ensureScoreBar(
            playerId,
            player,
            topHud,
            'Team1BarBg',
            'Team1BarFill',
            KOTH_TOP_HUD_LAYOUT.friendlyBarX,
            mod.UIAnchor.TopLeft,
            KOTH_UI_COLORS.team1,
            KOTH_UI_COLORS.team1
        );
        this._ensureScoreBar(
            playerId,
            player,
            topHud,
            'Team2BarBg',
            'Team2BarFill',
            KOTH_TOP_HUD_LAYOUT.enemyBarX,
            mod.UIAnchor.TopRight,
            KOTH_UI_COLORS.team2,
            KOTH_UI_COLORS.team2
        );

        const targetScoreBox = this._addContainerWithFill(
            this._name(playerId, 'TargetScoreBox'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreBoxX, KOTH_TOP_HUD_LAYOUT.targetScoreBoxY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreBoxWidth, KOTH_TOP_HUD_LAYOUT.targetScoreBoxHeight, 0),
            mod.UIAnchor.TopLeft,
            topHud,
            player,
            KOTH_TOP_HUD_COLORS.dark,
            0.5,
            mod.UIBgFill.Solid
        );
        if (targetScoreBox) {
            this._addTextWithStyle(
                this._name(playerId, 'TargetScore'),
                mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreTextX, KOTH_TOP_HUD_LAYOUT.targetScoreTextY, 0),
                mod.CreateVector(KOTH_TOP_HUD_LAYOUT.targetScoreTextWidth, KOTH_TOP_HUD_LAYOUT.targetScoreTextHeight, 0),
                mod.UIAnchor.Center,
                targetScoreBox,
                player,
                mod.Message(mod.stringkeys.Target_Score),
                KOTH_TOP_HUD_LAYOUT.targetScoreTextSize,
                KOTH_UI_COLORS.text,
                1,
                mod.UIAnchor.Center
            );
        }

        this._addImage(
            this._name(playerId, 'Crown'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.crownX, KOTH_TOP_HUD_LAYOUT.crownY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.crownWidth, KOTH_TOP_HUD_LAYOUT.crownHeight, 0),
            root,
            player
        );
        this._ensureObjectiveHud(playerId, player, root);

        this.updatePlayerHud(playerId);
    }

    public updateAll(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            if (playerState.isBot) {
                this._hidePlayerHudForPlayer(playerState.id);
                return;
            }
            this.ensurePlayerHud(playerState.id);
            this.updatePlayerHud(playerState.id);
        });
        this._syncContestedBlinkTimer();
        this._context.runtime.hudDirty = false;
    }

    public updatePlayerHud(playerId: number): void {
        const runtime = this._context.runtime;
        const playerState = runtime.playersById.get(playerId);
        if (!playerState || !mod.IsPlayerValid(playerState.player)) return;
        if (playerState.isBot) {
            this._hidePlayerHudForPlayer(playerId);
            return;
        }

        const root = this._findWidget(this._name(playerId, 'Root'));
        if (!root) return;

        const activeHill = this._context.hills[runtime.hill.currentHillIndex];
        this._safeSetVisible(root, runtime.isMatchActive);

        const teamId = getKothTeamId(mod.GetTeam(playerState.player));
        const isTeam1Viewer = teamId === 1;
        const friendlyScore = isTeam1Viewer ? runtime.team1Score : runtime.team2Score;
        const enemyScore = isTeam1Viewer ? runtime.team2Score : runtime.team1Score;

        this._safeSetText(this._name(playerId, 'FriendlyScore'), formatScore3Message(friendlyScore));
        this._safeSetText(this._name(playerId, 'EnemyScore'), formatScore3Message(enemyScore));
        this._safeSetText(this._name(playerId, 'TargetScore'), mod.Message(mod.stringkeys.Target_Score));
        this._safeSetText(this._name(playerId, 'ObjectiveLetter'), getHillLetterMessage(activeHill.letter));
        this._safeSetTextColor(this._name(playerId, 'FriendlyScore'), KOTH_UI_COLORS.team1);
        this._safeSetTextColor(this._name(playerId, 'EnemyScore'), KOTH_UI_COLORS.team2);

        this._safeSetSize(
            this._name(playerId, 'Team1BarFill'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.barWidth * this._scoreRatio(friendlyScore), KOTH_TOP_HUD_LAYOUT.barHeight, 0)
        );
        this._safeSetSize(
            this._name(playerId, 'Team2BarFill'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.barWidth * this._scoreRatio(enemyScore), KOTH_TOP_HUD_LAYOUT.barHeight, 0)
        );
        this._updateObjectiveHud(playerId, teamId);
        this._syncContestedBlinkTimer();
    }

    public hideLiveHud(): void {
        this._context.runtime.playersById.forEach((playerState) => {
            this._hidePlayerHudForPlayer(playerState.id);
        });
        this._stopContestedBlinkTimer();
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

    private _ensureScoreBox(
        playerId: number,
        player: mod.Player,
        parent: mod.UIWidget,
        boxSuffix: string,
        textSuffix: string,
        boxX: number,
        boxColor: mod.Vector,
        textLabel: mod.Message,
        textColor: mod.Vector
    ): void {
        const box = this._addContainerWithFill(
            this._name(playerId, boxSuffix),
            mod.CreateVector(boxX, KOTH_TOP_HUD_LAYOUT.scoreBoxY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreBoxWidth, KOTH_TOP_HUD_LAYOUT.scoreBoxHeight, 0),
            mod.UIAnchor.Center,
            parent,
            player,
            boxColor,
            0.5,
            mod.UIBgFill.Blur
        );
        if (!box) return;

        this._addTextWithStyle(
            this._name(playerId, textSuffix),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreTextX, KOTH_TOP_HUD_LAYOUT.scoreTextY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.scoreTextWidth, KOTH_TOP_HUD_LAYOUT.scoreTextHeight, 0),
            mod.UIAnchor.Center,
            box,
            player,
            textLabel,
            KOTH_TOP_HUD_LAYOUT.scoreTextSize,
            textColor,
            1,
            mod.UIAnchor.Center
        );
    }

    private _ensureScoreBar(
        playerId: number,
        player: mod.Player,
        parent: mod.UIWidget,
        bgSuffix: string,
        fillSuffix: string,
        bgX: number,
        fillAnchor: mod.UIAnchor,
        bgColor: mod.Vector,
        fillColor: mod.Vector
    ): void {
        const bg = this._addContainerWithFill(
            this._name(playerId, bgSuffix),
            mod.CreateVector(bgX, KOTH_TOP_HUD_LAYOUT.barY, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.barWidth, KOTH_TOP_HUD_LAYOUT.barHeight, 0),
            mod.UIAnchor.TopLeft,
            parent,
            player,
            bgColor,
            0.5,
            mod.UIBgFill.Blur
        );
        if (!bg) return;

        this._addContainerWithFill(
            this._name(playerId, fillSuffix),
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.barHeight, 0),
            fillAnchor,
            bg,
            player,
            fillColor,
            1,
            mod.UIBgFill.Solid
        );
    }

    private _ensureObjectiveHud(playerId: number, player: mod.Player, parent: mod.UIWidget): void {
        const rootName = this._name(playerId, 'ObjectiveRoot');
        if (this._findWidget(rootName)) return;

        const root = this._addContainerWithFill(
            rootName,
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.objectiveX, KOTH_TOP_HUD_LAYOUT.objectiveCompactY, 0),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveCompactSize,
                KOTH_TOP_HUD_LAYOUT.objectiveCompactSize,
                0
            ),
            mod.UIAnchor.Center,
            parent,
            player,
            KOTH_UI_COLORS.neutral,
            0.5,
            mod.UIBgFill.Solid
        );
        if (!root) return;

        this._addTextWithStyle(
            this._name(playerId, 'ObjectiveLetter'),
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.objectiveTextWidth, KOTH_TOP_HUD_LAYOUT.objectiveTextHeight, 0),
            mod.UIAnchor.Center,
            root,
            player,
            mod.Message(mod.stringkeys.Objective_Letter),
            KOTH_TOP_HUD_LAYOUT.objectiveTextSize,
            KOTH_UI_COLORS.text,
            0.6,
            mod.UIAnchor.Center
        );

        this._addObjectiveOutline(playerId, player, root, 'ObjectiveContestedOutline', KOTH_TOP_HUD_LAYOUT.contestedOutlineSizes[0]);
        this._addObjectiveOutline(playerId, player, root, 'ObjectiveContestedThickOutline', KOTH_TOP_HUD_LAYOUT.contestedOutlineSizes[1]);
        this._addObjectiveOutline(playerId, player, root, 'ObjectiveContestedThickOutlineWide', KOTH_TOP_HUD_LAYOUT.contestedOutlineSizes[2]);
        this._addObjectiveExpandedDetails(playerId, player, root);
        this._setObjectiveOutlineVisibleForPlayer(playerId, 0);
        this._setObjectiveExpandedDetailsVisibleForPlayer(playerId, false);
    }

    private _addObjectiveOutline(
        playerId: number,
        player: mod.Player,
        parent: mod.UIWidget,
        suffix: string,
        size: number
    ): void {
        this._addContainerWithFill(
            this._name(playerId, suffix),
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(size, size, 0),
            mod.UIAnchor.Center,
            parent,
            player,
            KOTH_UI_COLORS.contested,
            1,
            mod.UIBgFill.OutlineThin
        );
    }

    private _addObjectiveExpandedDetails(playerId: number, player: mod.Player, parent: mod.UIWidget): void {
        this._addTextWithStyle(
            this._name(playerId, 'ObjectiveContestedLabel'),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveDetailLabelY, 0),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveDetailLabelWidth,
                KOTH_TOP_HUD_LAYOUT.objectiveDetailLabelHeight,
                0
            ),
            mod.UIAnchor.Center,
            parent,
            player,
            mod.Message(mod.stringkeys.KothObjectiveContestedShort),
            KOTH_TOP_HUD_LAYOUT.objectiveDetailLabelSize,
            KOTH_UI_COLORS.contested,
            1,
            mod.UIAnchor.Center
        );

        this._addTextWithStyle(
            this._name(playerId, 'ObjectiveFriendlyCount'),
            mod.CreateVector(-KOTH_TOP_HUD_LAYOUT.objectiveDetailCountX, KOTH_TOP_HUD_LAYOUT.objectiveDetailCountY, 0),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveDetailCountWidth,
                KOTH_TOP_HUD_LAYOUT.objectiveDetailCountHeight,
                0
            ),
            mod.UIAnchor.Center,
            parent,
            player,
            mod.Message(mod.stringkeys.CounterText, 0),
            KOTH_TOP_HUD_LAYOUT.objectiveDetailCountTextSize,
            KOTH_UI_COLORS.team1,
            1,
            mod.UIAnchor.Center
        );

        this._addTextWithStyle(
            this._name(playerId, 'ObjectiveEnemyCount'),
            mod.CreateVector(KOTH_TOP_HUD_LAYOUT.objectiveDetailCountX, KOTH_TOP_HUD_LAYOUT.objectiveDetailCountY, 0),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveDetailCountWidth,
                KOTH_TOP_HUD_LAYOUT.objectiveDetailCountHeight,
                0
            ),
            mod.UIAnchor.Center,
            parent,
            player,
            mod.Message(mod.stringkeys.CounterText, 0),
            KOTH_TOP_HUD_LAYOUT.objectiveDetailCountTextSize,
            KOTH_UI_COLORS.team2,
            1,
            mod.UIAnchor.Center
        );

        this._addContainerWithFill(
            this._name(playerId, 'ObjectiveFriendlyBar'),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarY, 0),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarHeight, 0),
            mod.UIAnchor.Center,
            parent,
            player,
            KOTH_UI_COLORS.team1,
            1,
            mod.UIBgFill.Solid
        );

        this._addContainerWithFill(
            this._name(playerId, 'ObjectiveEnemyBar'),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarY, 0),
            mod.CreateVector(0, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarHeight, 0),
            mod.UIAnchor.Center,
            parent,
            player,
            KOTH_UI_COLORS.team2,
            1,
            mod.UIBgFill.Solid
        );
    }

    private _updateObjectiveHud(playerId: number, teamId: 0 | 1 | 2): void {
        const runtime = this._context.runtime;
        const playerState = runtime.playersById.get(playerId);
        const rootName = this._name(playerId, 'ObjectiveRoot');
        const root = this._findWidget(rootName);
        if (!root || !playerState) return;

        const isExpanded = runtime.isMatchActive && playerState.isInsideActiveHill;
        const objectiveSize = isExpanded
            ? KOTH_TOP_HUD_LAYOUT.objectiveExpandedSize
            : KOTH_TOP_HUD_LAYOUT.objectiveCompactSize;
        const objectiveY = isExpanded
            ? KOTH_TOP_HUD_LAYOUT.objectiveExpandedY
            : KOTH_TOP_HUD_LAYOUT.objectiveCompactY;
        const isContested = runtime.hill.currentControlState === 'contested';
        const showContestedDetails = isExpanded && isContested && this._isActiveHillContested();

        this._safeSetVisible(root, runtime.isMatchActive);
        this._safeSetPosition(rootName, mod.CreateVector(KOTH_TOP_HUD_LAYOUT.objectiveX, objectiveY, 0));
        this._safeSetSize(rootName, mod.CreateVector(objectiveSize, objectiveSize, 0));
        this._safeSetTextColor(this._name(playerId, 'ObjectiveLetter'), KOTH_UI_COLORS.text);
        this._safeSetTextSize(
            this._name(playerId, 'ObjectiveLetter'),
            isExpanded ? KOTH_TOP_HUD_LAYOUT.objectiveExpandedTextSize : KOTH_TOP_HUD_LAYOUT.objectiveTextSize
        );
        this._setObjectiveOutlineSizesForPlayer(playerId, objectiveSize);
        this._safeSetBgColor(root, this._getObjectiveFlagColor(runtime.hill.currentControlState, teamId));
        this._safeSetBgFill(root, this._getObjectiveFlagFill(runtime.hill.currentControlState));
        this._setObjectiveExpandedDetailsVisibleForPlayer(playerId, showContestedDetails);
        if (showContestedDetails) this._updateObjectiveExpandedDetails(playerId, teamId);

        if (isContested) {
            this._setObjectiveOutlineColorForPlayer(playerId, KOTH_UI_COLORS.contested);
            return;
        }

        this._setObjectiveOutlineColorForPlayer(
            playerId,
            this._getObjectiveStaticOutlineColor(runtime.hill.currentControlState, teamId)
        );
        this._setObjectiveOutlineVisibleForPlayer(playerId, 1);
    }

    private _isActiveHillContested(): boolean {
        return (
            this._context.runtime.hill.activeHillTeam1Players.size > 0 &&
            this._context.runtime.hill.activeHillTeam2Players.size > 0
        );
    }

    private _updateObjectiveExpandedDetails(playerId: number, teamId: 0 | 1 | 2): void {
        const counts = this._getViewerRelativeActiveHillCounts(teamId);
        const totalPlayers = counts.friendly + counts.enemy;
        const friendlyRatio = totalPlayers > 0 ? counts.friendly / totalPlayers : 0;
        const enemyRatio = totalPlayers > 0 ? counts.enemy / totalPlayers : 0;
        const friendlyWidth = KOTH_TOP_HUD_LAYOUT.objectiveDetailBarMaxWidth * friendlyRatio;
        const enemyWidth = KOTH_TOP_HUD_LAYOUT.objectiveDetailBarMaxWidth * enemyRatio;

        this._safeSetText(this._name(playerId, 'ObjectiveContestedLabel'), mod.Message(mod.stringkeys.KothObjectiveContestedShort));
        this._safeSetTextColor(this._name(playerId, 'ObjectiveContestedLabel'), KOTH_UI_COLORS.contested);
        this._safeSetText(this._name(playerId, 'ObjectiveFriendlyCount'), mod.Message(mod.stringkeys.CounterText, counts.friendly));
        this._safeSetText(this._name(playerId, 'ObjectiveEnemyCount'), mod.Message(mod.stringkeys.CounterText, counts.enemy));
        this._safeSetTextColor(this._name(playerId, 'ObjectiveFriendlyCount'), KOTH_UI_COLORS.team1);
        this._safeSetTextColor(this._name(playerId, 'ObjectiveEnemyCount'), KOTH_UI_COLORS.team2);
        this._safeSetSize(
            this._name(playerId, 'ObjectiveFriendlyBar'),
            mod.CreateVector(friendlyWidth, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarHeight, 0)
        );
        this._safeSetSize(
            this._name(playerId, 'ObjectiveEnemyBar'),
            mod.CreateVector(enemyWidth, KOTH_TOP_HUD_LAYOUT.objectiveDetailBarHeight, 0)
        );
        this._safeSetPosition(
            this._name(playerId, 'ObjectiveFriendlyBar'),
            mod.CreateVector(
                -KOTH_TOP_HUD_LAYOUT.objectiveDetailBarGap - friendlyWidth / 2,
                KOTH_TOP_HUD_LAYOUT.objectiveDetailBarY,
                0
            )
        );
        this._safeSetPosition(
            this._name(playerId, 'ObjectiveEnemyBar'),
            mod.CreateVector(
                KOTH_TOP_HUD_LAYOUT.objectiveDetailBarGap + enemyWidth / 2,
                KOTH_TOP_HUD_LAYOUT.objectiveDetailBarY,
                0
            )
        );
    }

    private _getViewerRelativeActiveHillCounts(teamId: 0 | 1 | 2): { friendly: number; enemy: number } {
        const team1Count = this._context.runtime.hill.activeHillTeam1Players.size;
        const team2Count = this._context.runtime.hill.activeHillTeam2Players.size;

        if (teamId === 2) {
            return { friendly: team2Count, enemy: team1Count };
        }
        return { friendly: team1Count, enemy: team2Count };
    }

    private _setObjectiveExpandedDetailsVisibleForPlayer(playerId: number, visible: boolean): void {
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveContestedLabel'), visible);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveFriendlyCount'), visible);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveEnemyCount'), visible);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveFriendlyBar'), visible);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveEnemyBar'), visible);
    }

    private _syncContestedBlinkTimer(): void {
        if (this._context.runtime.isMatchActive && this._context.runtime.hill.currentControlState === 'contested') {
            this._ensureContestedBlinkTimer();
            this._applyContestedBlinkFrame();
            return;
        }

        this._clearContestedBlinkTimer();
    }

    private _ensureContestedBlinkTimer(): void {
        if (this._contestedBlinkIntervalHandle !== undefined) return;
        this._contestedBlinkStep = 0;
        this._contestedBlinkIntervalHandle = Timers.setInterval(() => {
            this._contestedBlinkStep =
                (this._contestedBlinkStep + 1) % KOTH_TOP_HUD_LAYOUT.contestedBlinkFrameCount;
            this._applyContestedBlinkFrame();
        }, KOTH_TOP_HUD_LAYOUT.contestedBlinkMs);
    }

    private _clearContestedBlinkTimer(): void {
        if (this._contestedBlinkIntervalHandle !== undefined) {
            Timers.clearInterval(this._contestedBlinkIntervalHandle);
            this._contestedBlinkIntervalHandle = undefined;
        }
        this._contestedBlinkStep = 0;
    }

    private _stopContestedBlinkTimer(): void {
        this._clearContestedBlinkTimer();
        this._context.runtime.playersById.forEach((playerState) => {
            this._setObjectiveOutlineVisibleForPlayer(playerState.id, 0);
        });
    }

    private _applyContestedBlinkFrame(): void {
        const visibleCount =
            this._contestedBlinkStep === KOTH_TOP_HUD_LAYOUT.contestedBlinkFrameCount - 1
                ? 0
                : this._contestedBlinkStep + 1;
        this._context.runtime.playersById.forEach((playerState) => {
            this._setObjectiveOutlineVisibleForPlayer(playerState.id, visibleCount);
        });
    }

    private _setObjectiveOutlineVisibleForPlayer(playerId: number, visibleCount: number): void {
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveContestedOutline'), visibleCount >= 1);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveContestedThickOutline'), visibleCount >= 2);
        this._safeSetVisibleByName(this._name(playerId, 'ObjectiveContestedThickOutlineWide'), visibleCount >= 3);
    }

    private _setObjectiveOutlineColorForPlayer(playerId: number, color: mod.Vector): void {
        this._safeSetBgColorByName(this._name(playerId, 'ObjectiveContestedOutline'), color);
        this._safeSetBgColorByName(this._name(playerId, 'ObjectiveContestedThickOutline'), color);
        this._safeSetBgColorByName(this._name(playerId, 'ObjectiveContestedThickOutlineWide'), color);
    }

    private _setObjectiveOutlineSizesForPlayer(playerId: number, objectiveSize: number): void {
        this._safeSetSize(this._name(playerId, 'ObjectiveContestedOutline'), mod.CreateVector(objectiveSize, objectiveSize, 0));
        this._safeSetSize(
            this._name(playerId, 'ObjectiveContestedThickOutline'),
            mod.CreateVector(
                objectiveSize + KOTH_TOP_HUD_LAYOUT.contestedOutlineClosePadding,
                objectiveSize + KOTH_TOP_HUD_LAYOUT.contestedOutlineClosePadding,
                0
            )
        );
        this._safeSetSize(
            this._name(playerId, 'ObjectiveContestedThickOutlineWide'),
            mod.CreateVector(
                objectiveSize + KOTH_TOP_HUD_LAYOUT.contestedOutlineWidePadding,
                objectiveSize + KOTH_TOP_HUD_LAYOUT.contestedOutlineWidePadding,
                0
            )
        );
    }

    private _hidePlayerHudForPlayer(playerId: number): void {
        const root = this._findWidget(this._name(playerId, 'Root'));
        if (root) this._safeSetVisible(root, false);

        const objectiveRoot = this._findWidget(this._name(playerId, 'ObjectiveRoot'));
        if (objectiveRoot) this._safeSetVisible(objectiveRoot, false);
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
        return this._addTextWithStyle(
            name,
            position,
            size,
            mod.UIAnchor.TopCenter,
            parent,
            receiver,
            mod.Message(mod.stringkeys.EmptyText),
            textSize,
            KOTH_UI_COLORS.text,
            1,
            mod.UIAnchor.Center
        );
    }

    private _addTextWithStyle(
        name: string,
        position: mod.Vector,
        size: mod.Vector,
        anchor: mod.UIAnchor,
        parent: mod.UIWidget,
        receiver: mod.Player | mod.Team,
        textLabel: mod.Message,
        textSize: number,
        textColor: mod.Vector,
        textAlpha: number,
        textAnchor: mod.UIAnchor
    ): mod.UIWidget | undefined {
        try {
            mod.AddUIText(
                name,
                position,
                size,
                anchor,
                parent,
                true,
                0,
                mod.CreateVector(0, 0, 0),
                0,
                mod.UIBgFill.Solid,
                textLabel,
                textSize,
                textColor,
                textAlpha,
                textAnchor,
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
                mod.UIAnchor.Center,
                parent,
                true,
                0,
                mod.CreateVector(0, 0, 0),
                0,
                mod.UIBgFill.Solid,
                mod.UIImageType.CrownSolid,
                KOTH_UI_COLORS.text,
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

    private _safeSetTextSize(name: string, textSize: number): void {
        const widget = this._findWidget(name);
        if (!widget) return;
        try {
            mod.SetUITextSize(widget, textSize);
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

    private _safeSetBgColorByName(name: string, color: mod.Vector): void {
        const widget = this._findWidget(name);
        if (widget) this._safeSetBgColor(widget, color);
    }

    private _safeSetBgFill(widget: mod.UIWidget, fill: mod.UIBgFill): void {
        try {
            mod.SetUIWidgetBgFill(widget, fill);
        } catch (_err) {
            return;
        }
    }

    private _getObjectiveFlagColor(controlState: KothHillControlState, viewerTeamId: 0 | 1 | 2): mod.Vector {
        if (controlState === 'team1') {
            return viewerTeamId === 1 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        }
        if (controlState === 'team2') {
            return viewerTeamId === 2 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        }
        return KOTH_UI_COLORS.neutral;
    }

    private _getObjectiveFlagFill(controlState: KothHillControlState): mod.UIBgFill {
        if (controlState === 'team1' || controlState === 'team2') return mod.UIBgFill.Blur;
        return mod.UIBgFill.Solid;
    }

    private _getObjectiveStaticOutlineColor(controlState: KothHillControlState, viewerTeamId: 0 | 1 | 2): mod.Vector {
        if (controlState === 'team1') return viewerTeamId === 1 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        if (controlState === 'team2') return viewerTeamId === 2 ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        return KOTH_UI_COLORS.text;
    }

    private _scoreRatio(score: number): number {
        const ratio = score / this._context.rules.scoreToWin;
        if (ratio < 0) return 0;
        if (ratio > 1) return 1;
        return ratio;
    }

    private _getPostmatchResultColor(receiver: mod.Team, won: boolean): mod.Vector {
        if (won) return mod.Equals(receiver, KOTH_TEAM_1) ? KOTH_UI_COLORS.team1 : KOTH_UI_COLORS.team2;
        return mod.Equals(receiver, KOTH_TEAM_1) ? KOTH_UI_COLORS.team2 : KOTH_UI_COLORS.team1;
    }
}
