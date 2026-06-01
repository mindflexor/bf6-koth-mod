export type KothRgbColor = readonly [number, number, number];

export const KOTH_KERNEL_UI_COLOR_RGB = {
    neutral: [0.65, 0.65, 0.65] as KothRgbColor,
    friendly: [0.1, 0.55, 1] as KothRgbColor,
    enemy: [1, 72 / 255, 58 / 255] as KothRgbColor,
} as const;

export const KOTH_KERNEL_UI_COLORS = {
    neutral: mod.CreateVector(...KOTH_KERNEL_UI_COLOR_RGB.neutral),
    friendly: mod.CreateVector(...KOTH_KERNEL_UI_COLOR_RGB.friendly),
    enemy: mod.CreateVector(...KOTH_KERNEL_UI_COLOR_RGB.enemy),
} as const;
