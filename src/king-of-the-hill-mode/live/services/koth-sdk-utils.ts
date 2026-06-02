export const KOTH_TEAM_NEUTRAL = mod.GetTeam(0);
export const KOTH_TEAM_1 = mod.GetTeam(1);
export const KOTH_TEAM_2 = mod.GetTeam(2);

export function getKothPlayerId(player: mod.Player): number {
    return mod.GetObjId(player);
}

export function getKothTeamId(team: mod.Team): 0 | 1 | 2 {
    if (mod.Equals(team, KOTH_TEAM_1)) return 1;
    if (mod.Equals(team, KOTH_TEAM_2)) return 2;
    return 0;
}

export function isParticipantTeam(team: mod.Team): boolean {
    return mod.Equals(team, KOTH_TEAM_1) || mod.Equals(team, KOTH_TEAM_2);
}

export function isKothPlayerAlive(player: mod.Player): boolean {
    try {
        return mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive);
    } catch (_err) {
        return false;
    }
}

export function isKothAiSoldier(player: mod.Player): boolean {
    try {
        return mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
    } catch (_err) {
        return false;
    }
}

export function createOffsetVector(position: mod.Vector, yOffset: number): mod.Vector {
    return mod.CreateVector(
        mod.XComponentOf(position),
        mod.YComponentOf(position) + yOffset,
        mod.ZComponentOf(position)
    );
}

export function formatClockText(seconds: number): string {
    const clamped = seconds < 0 ? 0 : seconds;
    const minutes = mod.Floor(clamped / 60);
    const totalSeconds = mod.Floor(clamped % 60);
    const ones = totalSeconds % 10;
    const tens = mod.Floor(totalSeconds / 10);

    return `${minutes}:${tens}${ones}`;
}

export function formatClock(seconds: number): mod.Message {
    return formatClockMessage(seconds);
}

export function formatClockMessage(seconds: number): mod.Message {
    const clamped = seconds < 0 ? 0 : seconds;
    const minutes = mod.Floor(clamped / 60);
    const totalSeconds = mod.Floor(clamped % 60);
    const ones = totalSeconds % 10;
    const tens = mod.Floor(totalSeconds / 10);

    if (minutes < 10) {
        return mod.Message(mod.stringkeys.RemainingTimeSingleDigitMinute, minutes, tens, ones);
    }

    return mod.Message(mod.stringkeys.RemainingTimeDoubleDigitMinute, minutes, tens, ones);
}

export function formatScore3Message(score: number): mod.Message {
    const clamped = score < 0 ? 0 : score > 999 ? 999 : mod.Floor(score);
    const hundreds = mod.Floor(clamped / 100);
    const tens = mod.Floor((clamped % 100) / 10);
    const ones = clamped % 10;

    return mod.Message(mod.stringkeys.Score_ThreeDigits, hundreds, tens, ones);
}

export function getHillLetterMessage(letter: string): mod.Message {
    if (letter === 'A') return mod.Message(mod.stringkeys.FLAGA);
    if (letter === 'B') return mod.Message(mod.stringkeys.FLAGB);
    if (letter === 'C') return mod.Message(mod.stringkeys.FLAGC);
    if (letter === 'D') return mod.Message(mod.stringkeys.FLAGD);
    if (letter === 'E') return mod.Message(mod.stringkeys.FLAGE);
    return mod.Message(mod.stringkeys.EmptyText);
}

export function getKothControlStateMessage(controlState: string): mod.Message {
    if (controlState === 'team1') return mod.Message(mod.stringkeys.KothTeam1Holds);
    if (controlState === 'team2') return mod.Message(mod.stringkeys.KothTeam2Holds);
    if (controlState === 'contested') return mod.Message(mod.stringkeys.KothObjectiveContestedShort);
    return mod.Message(mod.stringkeys.KothObjectiveNeutralShort);
}

export function displayWorldLog(message: mod.Message, target?: mod.Player | mod.Team): void {
    if (target) {
        if (mod.IsType(target, mod.Types.Team)) {
            mod.DisplayHighlightedWorldLogMessage(message, target as mod.Team);
        } else {
            mod.DisplayHighlightedWorldLogMessage(message, target as mod.Player);
        }
        return;
    }

    mod.DisplayHighlightedWorldLogMessage(message);
}

export function warnOnce(flags: Record<number, boolean>, key: number, message: mod.Message): void {
    if (flags[key]) return;
    flags[key] = true;
    displayWorldLog(message);
}

