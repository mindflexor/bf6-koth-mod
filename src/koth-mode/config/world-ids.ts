export interface WorldIdsConfig {
    hq: {
        team1Initial: number;
        team2Initial: number;
        team1Readyup: number;
        team2Readyup: number;
        team1Live: number;
        team2Live: number;
        team1RouteByKey: Record<'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'NO', number>;
        team2RouteByKey: Record<'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'NO', number>;
    };
    capturePoints: {
        a: number;
        b: number;
        c: number;
        d: number;
        e: number;
        f: number;
    };
    interactPoints: {
        team1Switch: number;
        team1Ready: number;
        team2Switch: number;
        team2Ready: number;
        spectator: number;
        objectiveByCapturePoint: Record<number, number>;
    };
    areaTriggers: {
        objectiveByCapturePoint: Record<number, number>;
        damage: number;
        restricted: number;
        team1HqProtection: number;
        team2HqProtection: number;
        prematchHealth: number;
        prematchTeam1Kill: number;
        prematchTeam2Kill: number;
        bombPickup: number;
    };
    worldIcons: {
        team1Switch: number;
        team1Ready: number;
        team2Switch: number;
        team2Ready: number;
    };
    fireVfxIds: number[];
    dynamicSpawnersByRoute: {
        team1: Record<'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'NO', number[]>;
        team2: Record<'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'NO', number[]>;
    };
    spectator: {
        fixedCamera: number;
        spawnPoint: number;
    };
}

const WORLD_CP_A_ID = 201;
const WORLD_CP_B_ID = 202;
const WORLD_CP_C_ID = 203;
const WORLD_CP_D_ID = 301;
const WORLD_CP_E_ID = 302;
const WORLD_CP_F_ID = 303;

export const WORLD_IDS: WorldIdsConfig = {
    hq: {
        team1Initial: 1,
        team2Initial: 2,
        team1Readyup: 8888,
        team2Readyup: 8889,
        team1Live: 3,
        team2Live: 4,
        team1RouteByKey: {
            A: 5,
            B: 6,
            C: 7,
            AB: 11,
            AC: 12,
            BC: 13,
            ABC: 17,
            NO: 19,
        },
        team2RouteByKey: {
            A: 8,
            B: 9,
            C: 10,
            AB: 14,
            AC: 15,
            BC: 16,
            ABC: 18,
            NO: 20,
        },
    },
    capturePoints: {
        a: WORLD_CP_A_ID,
        b: WORLD_CP_B_ID,
        c: WORLD_CP_C_ID,
        d: WORLD_CP_D_ID,
        e: WORLD_CP_E_ID,
        f: WORLD_CP_F_ID,
    },
    interactPoints: {
        team1Switch: 2001,
        team1Ready: 2002,
        team2Switch: 2003,
        team2Ready: 2004,
        spectator: 6001,
        objectiveByCapturePoint: {
            [WORLD_CP_A_ID]: 2101,
            [WORLD_CP_B_ID]: 2102,
            [WORLD_CP_C_ID]: 2103,
            [WORLD_CP_D_ID]: 2104,
            [WORLD_CP_E_ID]: 2105,
            [WORLD_CP_F_ID]: 2106,
        },
    },
    areaTriggers: {
        objectiveByCapturePoint: {
            [WORLD_CP_A_ID]: 401,
            [WORLD_CP_B_ID]: 402,
            [WORLD_CP_C_ID]: 403,
            [WORLD_CP_D_ID]: 501,
            [WORLD_CP_E_ID]: 502,
            [WORLD_CP_F_ID]: 503,
        },
        damage: 7001,
        restricted: 7002,
        team1HqProtection: 7101,
        team2HqProtection: 7102,
        prematchHealth: 889,
        prematchTeam1Kill: 679,
        prematchTeam2Kill: 680,
        bombPickup: 3111,
    },
    worldIcons: {
        team1Switch: 5001,
        team1Ready: 5002,
        team2Switch: 5003,
        team2Ready: 5004,
    },
    fireVfxIds: [
        331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349,
    ],
    dynamicSpawnersByRoute: {
        team1: {
            A: [9101],
            B: [9102],
            C: [9103],
            AB: [9104],
            AC: [9105],
            BC: [9106],
            ABC: [9107],
            NO: [9108],
        },
        team2: {
            A: [9201],
            B: [9202],
            C: [9203],
            AB: [9204],
            AC: [9205],
            BC: [9206],
            ABC: [9207],
            NO: [9208],
        },
    },
    spectator: {
        fixedCamera: 9301,
        spawnPoint: 9302,
    },
};
