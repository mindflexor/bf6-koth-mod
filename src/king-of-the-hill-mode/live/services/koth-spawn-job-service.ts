import type { KothLiveModeContext } from '../state/koth-mode-context.ts';
import type { KothSpawnJob } from '../state/koth-spawn-state.ts';

export class KothSpawnJobService {
    public constructor(private readonly _context: KothLiveModeContext) {}

    public enqueue(job: KothSpawnJob): void {
        this._context.runtime.spawn.pendingJobs.push(job);
    }

    public enqueueFront(job: KothSpawnJob): void {
        this._context.runtime.spawn.pendingJobs.unshift(job);
    }

    public clearAll(): void {
        this._context.runtime.spawn.pendingJobs = [];
    }

    public clearPlayerJobs(playerId: number): void {
        this._context.runtime.spawn.pendingJobs = this._context.runtime.spawn.pendingJobs.filter(
            (job) => job.playerId !== playerId
        );
    }

    public tick(processor: (job: KothSpawnJob) => void): void {
        const maxJobs = this._context.spawns.rules.spawnJobsPerTick;

        for (let i = 0; i < maxJobs; i++) {
            const job = this._context.runtime.spawn.pendingJobs.shift();
            if (!job) return;

            processor(job);
        }
    }
}
