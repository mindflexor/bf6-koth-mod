export const KOTH_UI_COLOR_RGB = {
    team1: [0.1, 0.55, 1] as const,
    team2: [1, 72 / 255, 58 / 255] as const,
    neutral: [0.65, 0.65, 0.65] as const,
    contested: [1, 0.82, 0.15] as const,
    crown: [0.62, 0.62, 0.62] as const,
    border: [0.3294, 0.3686, 0.3882] as const,
    text: [1, 1, 1] as const,
    background: [0, 0, 0] as const,
} as const;

export const KOTH_UI_COLORS = {
    team1: mod.CreateVector(...KOTH_UI_COLOR_RGB.team1),
    team2: mod.CreateVector(...KOTH_UI_COLOR_RGB.team2),
    neutral: mod.CreateVector(...KOTH_UI_COLOR_RGB.neutral),
    contested: mod.CreateVector(...KOTH_UI_COLOR_RGB.contested),
    crown: mod.CreateVector(...KOTH_UI_COLOR_RGB.crown),
    border: mod.CreateVector(...KOTH_UI_COLOR_RGB.border),
    text: mod.CreateVector(...KOTH_UI_COLOR_RGB.text),
    background: mod.CreateVector(...KOTH_UI_COLOR_RGB.background),
} as const;

export const KOTH_UI = {
    rootNamePrefix: 'KOTH_HUD_ROOT_',
    scoreBarWidth: 240,
    scoreBarHeight: 8,
    objectiveBarWidth: 88,
    objectiveBarHeight: 4,
    objectiveFlagSize: 80,
} as const;
