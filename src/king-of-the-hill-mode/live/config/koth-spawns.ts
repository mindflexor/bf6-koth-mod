import type { KothHillLetter } from './koth-hills.ts';

export type KothTeamId = 1 | 2;
export type KothSpawnClusterSlot = '01' | '02';

export interface KothSpawnClusterConfig {
    objectiveLetter: KothHillLetter;
    slot: KothSpawnClusterSlot;
    areaTriggerId: number;
    defaultTeam: KothTeamId;
    anchorObjectIds: readonly number[];
}

export const KOTH_SPAWNS = {
    hqSpawners: {
        team1: 1,
        team2: 2,
    },
    disabledLegacyHqIds: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 8888, 8889] as const,
    rules: {
        enemySafetyRadiusMeters: 8,
        clusterFlipMinEnemyPlayers: 3,
        forwardReinforcementMaxBeforeFlip: 2,
        spawnJobsPerTick: 4,
        spawnJobTickMs: 50,
        spawnRetryWindowMs: 750,
    },
    clusters: [
        {
            objectiveLetter: 'A',
            slot: '01',
            areaTriggerId: 901,
            defaultTeam: 1,
            anchorObjectIds: [601, 602, 603, 604, 605],
        },
        {
            objectiveLetter: 'A',
            slot: '02',
            areaTriggerId: 921,
            defaultTeam: 2,
            anchorObjectIds: [701, 702, 703, 704, 705],
        },
        {
            objectiveLetter: 'B',
            slot: '01',
            areaTriggerId: 902,
            defaultTeam: 1,
            anchorObjectIds: [606, 607, 608, 609, 610],
        },
        {
            objectiveLetter: 'B',
            slot: '02',
            areaTriggerId: 922,
            defaultTeam: 2,
            anchorObjectIds: [706, 707, 708, 709, 710],
        },
        {
            objectiveLetter: 'C',
            slot: '01',
            areaTriggerId: 903,
            defaultTeam: 1,
            anchorObjectIds: [611, 612, 613, 614, 615],
        },
        {
            objectiveLetter: 'C',
            slot: '02',
            areaTriggerId: 923,
            defaultTeam: 2,
            anchorObjectIds: [711, 712, 713, 714, 715],
        },
        {
            objectiveLetter: 'D',
            slot: '01',
            areaTriggerId: 904,
            defaultTeam: 1,
            anchorObjectIds: [616, 617, 618, 619, 620],
        },
        {
            objectiveLetter: 'D',
            slot: '02',
            areaTriggerId: 924,
            defaultTeam: 2,
            anchorObjectIds: [716, 717, 718, 719, 720],
        },
        {
            objectiveLetter: 'E',
            slot: '01',
            areaTriggerId: 905,
            defaultTeam: 1,
            anchorObjectIds: [621, 622, 623, 624, 625],
        },
        {
            objectiveLetter: 'E',
            slot: '02',
            areaTriggerId: 925,
            defaultTeam: 2,
            anchorObjectIds: [721, 722, 723, 724, 725],
        },
    ] as const satisfies readonly KothSpawnClusterConfig[],
} as const;

export const KOTH_SPAWN_CLUSTER_AREA_TRIGGER_IDS: readonly number[] = KOTH_SPAWNS.clusters.map(
    (cluster) => cluster.areaTriggerId
);
