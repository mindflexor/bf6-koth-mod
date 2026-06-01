export type KothHillLetter = 'A' | 'B' | 'C' | 'D' | 'E';

export interface KothHillConfig {
    letter: KothHillLetter;
    areaTriggerId: number;
    neutralSectorId: number;
    neutralCapturePointId: number;
    team1SectorId: number;
    team1CapturePointId: number;
    team2SectorId: number;
    team2CapturePointId: number;
}

export const KOTH_HILLS = [
    {
        letter: 'A',
        areaTriggerId: 501,
        neutralSectorId: 400,
        neutralCapturePointId: 401,
        team1SectorId: 200,
        team1CapturePointId: 201,
        team2SectorId: 300,
        team2CapturePointId: 301,
    },
    {
        letter: 'B',
        areaTriggerId: 502,
        neutralSectorId: 400,
        neutralCapturePointId: 402,
        team1SectorId: 200,
        team1CapturePointId: 202,
        team2SectorId: 300,
        team2CapturePointId: 302,
    },
    {
        letter: 'C',
        areaTriggerId: 503,
        neutralSectorId: 400,
        neutralCapturePointId: 403,
        team1SectorId: 200,
        team1CapturePointId: 203,
        team2SectorId: 300,
        team2CapturePointId: 303,
    },
    {
        letter: 'D',
        areaTriggerId: 504,
        neutralSectorId: 400,
        neutralCapturePointId: 404,
        team1SectorId: 200,
        team1CapturePointId: 204,
        team2SectorId: 300,
        team2CapturePointId: 304,
    },
    {
        letter: 'E',
        areaTriggerId: 505,
        neutralSectorId: 400,
        neutralCapturePointId: 405,
        team1SectorId: 200,
        team1CapturePointId: 205,
        team2SectorId: 300,
        team2CapturePointId: 305,
    },
] as const satisfies readonly KothHillConfig[];

export const KOTH_HILL_AREA_TRIGGER_IDS: readonly number[] = KOTH_HILLS.map((hill) => hill.areaTriggerId);
export const KOTH_HILL_CAPTURE_POINT_IDS: readonly number[] = KOTH_HILLS.flatMap((hill) => [
    hill.neutralCapturePointId,
    hill.team1CapturePointId,
    hill.team2CapturePointId,
]);
export const KOTH_HILL_SECTOR_IDS = [200, 300, 400] as const;
