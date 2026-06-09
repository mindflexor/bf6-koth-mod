import type { KothHillLetter } from './koth-hills.ts';

export type KothTeamId = 1 | 2;

export type KothPresenceZone = 'northWest' | 'northEast' | 'southWest' | 'southEast';

export interface KothPresenceZoneConfig {
    zone: KothPresenceZone;
    areaTriggerId: number;
}

export type KothCardinalSide = 'north' | 'south' | 'west' | 'east';
export type KothSpawnAxis = 'horizontal' | 'vertical';

export interface KothSpawnRegionConfig {
    regionId: string;
    objectiveLetter?: KothHillLetter;
    axis: KothSpawnAxis;
    opposingSides: readonly [KothCardinalSide, KothCardinalSide];
    defaultTeamSideByTeamId: Readonly<Record<KothTeamId, KothCardinalSide>>;
    defaultVariantSideByTeamId?: Readonly<Record<KothTeamId, KothCardinalSide>>;
    sectors: readonly KothSpawnSectorConfig[];
}

export interface KothSpawnSectorConfig {
    regionId: string;
    objectiveLetter?: KothHillLetter;
    teamSide: KothCardinalSide;
    variantSide: KothCardinalSide;
    pressureZones: readonly KothPresenceZone[];
    idealDistanceMeters?: number;
    minDistanceMeters?: number;
    maxDistanceMeters?: number;
    anchorObjectIds: readonly number[];
}

export type KothSpawnSectorKey = `${string}:${KothCardinalSide}:${KothCardinalSide}`;

export interface KothSpawnDistanceConfig {
    idealObjectiveDistanceMeters: number;
    minObjectiveDistanceMeters: number;
    maxObjectiveDistanceMeters: number;
    hardMaxObjectiveDistanceMeters: number;
    distancePenaltyPerMeter: number;
}

export interface KothSpawnPressureConfig {
    enemyHeavyThreshold: number;
    enemyPressurePenalty: number;
    friendlyPresenceBonus: number;
}

export interface KothSpawnSafetyConfig {
    enemySafetyRadiusMeters: number;
    unsafeAnchorPenalty: number;
}

export interface KothAnchorDistanceScore {
    anchorObjectId: number;
    distanceToObjectiveMeters: number;
    distanceErrorMeters: number;
    isWithinPreferredRange: boolean;
    isWithinHardRange: boolean;
    distancePenalty: number;
}

export interface KothSpawnSectorPressure {
    friendlyCount: number;
    enemyCount: number;
    score: number;
    isEnemyHeavy: boolean;
}

export interface KothSpawnCandidateScore {
    sector: KothSpawnSectorConfig;
    anchorObjectId: number;
    score: number;
    sectorPressure: KothSpawnSectorPressure;
    distanceToObjectiveMeters: number;
    distancePenalty: number;
    enemySafetyPenalty: number;
    isPreferredDistance: boolean;
    isEmergencyFallback: boolean;
}

export const KOTH_PRESENCE_ZONES: readonly KothPresenceZoneConfig[] = [
    { zone: 'northWest', areaTriggerId: 901 },
    { zone: 'northEast', areaTriggerId: 902 },
    { zone: 'southWest', areaTriggerId: 903 },
    { zone: 'southEast', areaTriggerId: 904 },
] as const;

export const KOTH_PRESENCE_ZONE_AREA_TRIGGER_IDS: readonly number[] = KOTH_PRESENCE_ZONES.map(
    (zone) => zone.areaTriggerId
);

export const KOTH_SPAWN_DISTANCE: KothSpawnDistanceConfig = {
    idealObjectiveDistanceMeters: 60,
    minObjectiveDistanceMeters: 45,
    maxObjectiveDistanceMeters: 80,
    hardMaxObjectiveDistanceMeters: 120,
    distancePenaltyPerMeter: 1,
};

export const KOTH_SPAWN_PRESSURE: KothSpawnPressureConfig = {
    enemyHeavyThreshold: 2,
    enemyPressurePenalty: 200,
    friendlyPresenceBonus: 20,
};

export const KOTH_SPAWN_SAFETY: KothSpawnSafetyConfig = {
    enemySafetyRadiusMeters: 25,
    unsafeAnchorPenalty: 1000,
};

export function getOppositeCardinalSide(side: KothCardinalSide): KothCardinalSide {
    switch (side) {
        case 'north':
            return 'south';
        case 'south':
            return 'north';
        case 'west':
            return 'east';
        case 'east':
            return 'west';
    }
}

export function getVariantSidesForAxis(axis: KothSpawnAxis): readonly KothCardinalSide[] {
    return axis === 'horizontal' ? (['north', 'south'] as const) : (['west', 'east'] as const);
}

export function getTeamSidesForAxis(axis: KothSpawnAxis): readonly KothCardinalSide[] {
    return axis === 'horizontal' ? (['west', 'east'] as const) : (['north', 'south'] as const);
}

export function getPresenceZonesForSector(
    teamSide: KothCardinalSide,
    variantSide: KothCardinalSide
): readonly KothPresenceZone[] {
    if (teamSide === 'west' && variantSide === 'north') return ['northWest'];
    if (teamSide === 'west' && variantSide === 'south') return ['southWest'];
    if (teamSide === 'east' && variantSide === 'north') return ['northEast'];
    if (teamSide === 'east' && variantSide === 'south') return ['southEast'];
    if (teamSide === 'north' && variantSide === 'west') return ['northWest'];
    if (teamSide === 'north' && variantSide === 'east') return ['northEast'];
    if (teamSide === 'south' && variantSide === 'west') return ['southWest'];
    if (teamSide === 'south' && variantSide === 'east') return ['southEast'];

    return [];
}

export function getSectorKey(
    regionId: string,
    teamSide: KothCardinalSide,
    variantSide: KothCardinalSide
): KothSpawnSectorKey {
    return `${regionId}:${teamSide}:${variantSide}`;
}

function createSector(
    regionId: string,
    teamSide: KothCardinalSide,
    variantSide: KothCardinalSide,
    anchorObjectIds: readonly number[],
    objectiveLetter?: KothHillLetter
): KothSpawnSectorConfig {
    return {
        regionId,
        objectiveLetter,
        teamSide,
        variantSide,
        pressureZones: getPresenceZonesForSector(teamSide, variantSide),
        anchorObjectIds,
    };
}

export const KOTH_SPAWN_REGIONS: readonly KothSpawnRegionConfig[] = [
    {
        regionId: 'A',
        objectiveLetter: 'A',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'north' },
        sectors: [
            createSector('A', 'west', 'north', [1311, 1312, 1313, 1314, 1315], 'A'),
            createSector('A', 'west', 'south', [1321, 1322, 1323, 1324, 1325], 'A'),
            createSector('A', 'east', 'north', [1411, 1412, 1413, 1414, 1415], 'A'),
            createSector('A', 'east', 'south', [1421, 1422, 1423, 1424, 1425], 'A'),
        ],
    },
    {
        regionId: 'B',
        objectiveLetter: 'B',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'north' },
        sectors: [
            createSector('B', 'west', 'north', [2311, 2312, 2313, 2314, 2315], 'B'),
            createSector('B', 'west', 'south', [2321, 2322, 2323, 2324, 2325], 'B'),
            createSector('B', 'east', 'north', [2411, 2412, 2413, 2414, 2415], 'B'),
            createSector('B', 'east', 'south', [2421, 2422, 2423, 2424, 2425], 'B'),
        ],
    },
    {
        regionId: 'C',
        objectiveLetter: 'C',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'north' },
        sectors: [
            createSector('C', 'west', 'north', [3311, 3312, 3313, 3314, 3315], 'C'),
            createSector('C', 'west', 'south', [3321, 3322, 3323, 3324, 3325], 'C'),
            createSector('C', 'east', 'north', [3411, 3412, 3413, 3414, 3415], 'C'),
            createSector('C', 'east', 'south', [3421, 3422, 3423, 3424, 3425], 'C'),
        ],
    },
    {
        regionId: 'D',
        objectiveLetter: 'D',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'north' },
        sectors: [
            createSector('D', 'west', 'north', [4311, 4312, 4313, 4314, 4315], 'D'),
            createSector('D', 'west', 'south', [4321, 4322, 4323, 4324, 4325], 'D'),
            createSector('D', 'east', 'north', [4411, 4412, 4413, 4414, 4415], 'D'),
            createSector('D', 'east', 'south', [4421, 4422, 4423, 4424, 4425], 'D'),
        ],
    },
    {
        regionId: 'E',
        objectiveLetter: 'E',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'north' },
        sectors: [
            createSector('E', 'west', 'north', [5311, 5312, 5313, 5314, 5315], 'E'),
            createSector('E', 'west', 'south', [5321, 5322, 5323, 5324, 5325], 'E'),
            createSector('E', 'east', 'north', [5411, 5412, 5413, 5414, 5415], 'E'),
            createSector('E', 'east', 'south', [5421, 5422, 5423, 5424, 5425], 'E'),
        ],
    },
    {
        regionId: 'WestField',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'north' },
        sectors: [
            createSector('WestField', 'west', 'north', [6311, 6312, 6313, 6314, 6315]),
            createSector('WestField', 'west', 'south', [6321, 6322, 6323, 6324, 6325]),
            createSector('WestField', 'east', 'north', [6411, 6412, 6413, 6414, 6415]),
            createSector('WestField', 'east', 'south', [6421, 6422, 6423, 6424, 6425]),
        ],
    },
    {
        regionId: 'EastField',
        axis: 'horizontal',
        opposingSides: ['west', 'east'],
        defaultTeamSideByTeamId: { 1: 'west', 2: 'east' },
        defaultVariantSideByTeamId: { 1: 'north', 2: 'north' },
        sectors: [
            createSector('EastField', 'west', 'north', [7311, 7312, 7313, 7314, 7315]),
            createSector('EastField', 'west', 'south', [7321, 7322, 7323, 7324, 7325]),
            createSector('EastField', 'east', 'north', [7411, 7412, 7413, 7414, 7415]),
            createSector('EastField', 'east', 'south', [7421, 7422, 7423, 7424, 7425]),
        ],
    },
    {
        regionId: 'NorthField',
        axis: 'vertical',
        opposingSides: ['north', 'south'],
        defaultTeamSideByTeamId: { 1: 'south', 2: 'north' },
        defaultVariantSideByTeamId: { 1: 'west', 2: 'east' },
        sectors: [
            createSector('NorthField', 'north', 'west', [8131, 8132, 8133, 8134, 8135]),
            createSector('NorthField', 'north', 'east', [8141, 8142, 8143, 8144, 8145]),
            createSector('NorthField', 'south', 'west', [8231, 8232, 8233, 8234, 8235]),
            createSector('NorthField', 'south', 'east', [8241, 8242, 8243, 8244, 8245]),
        ],
    },
    {
        regionId: 'SouthField',
        axis: 'vertical',
        opposingSides: ['north', 'south'],
        defaultTeamSideByTeamId: { 1: 'south', 2: 'north' },
        defaultVariantSideByTeamId: { 1: 'west', 2: 'east' },
        sectors: [
            createSector('SouthField', 'north', 'west', [9131, 9132, 9133, 9134, 9135]),
            createSector('SouthField', 'north', 'east', [9141, 9142, 9143, 9144, 9145]),
            createSector('SouthField', 'south', 'west', [9231, 9232, 9233, 9234, 9235]),
            createSector('SouthField', 'south', 'east', [9241, 9242, 9243, 9244, 9245]),
        ],
    },
] as const satisfies readonly KothSpawnRegionConfig[];

export const KOTH_SPAWNS = {
    hqSpawners: {
        team1: 1,
        team2: 2,
    },
    disabledLegacyHqIds: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 8888, 8889] as const,
    rules: {
        spawnJobsPerTick: 4,
        spawnJobTickMs: 50,
        spawnRetryWindowMs: 750,
    },
    presenceZones: KOTH_PRESENCE_ZONES,
    distance: KOTH_SPAWN_DISTANCE,
    pressure: KOTH_SPAWN_PRESSURE,
    safety: KOTH_SPAWN_SAFETY,
    regions: KOTH_SPAWN_REGIONS,
} as const;

export function getRegionForActiveObjective(objectiveLetter: KothHillLetter): KothSpawnRegionConfig | undefined {
    for (const region of KOTH_SPAWN_REGIONS) {
        if (region.objectiveLetter === objectiveLetter) return region;
    }

    return undefined;
}

export function getPresenceZoneForAreaTriggerId(areaTriggerId: number): KothPresenceZone | undefined {
    for (const zone of KOTH_PRESENCE_ZONES) {
        if (zone.areaTriggerId === areaTriggerId) return zone.zone;
    }

    return undefined;
}
