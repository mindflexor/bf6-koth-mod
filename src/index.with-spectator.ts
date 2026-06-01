import { KOTH_RULES } from './koth-mode/live/config/koth-rules.ts';
import { KOTH_SPAWNS } from './koth-mode/live/config/koth-spawns.ts';
import {
    canEnterKothSpectatorMode,
    registerKothMode,
    resolveKothSpectatorSpawnPoint,
} from './koth-mode/index.ts';
import { registerSpectatorMode } from './spectator-mode/index.ts';

const kothSpectatorController = KOTH_RULES.spectator.enabled
    ? registerSpectatorMode({
          canEnter: canEnterKothSpectatorMode,
          resolveSpawnPoint: resolveKothSpectatorSpawnPoint,
          entryTeamId: KOTH_RULES.spectator.entryTeamId,
          fixedCamera: {
              preferredIndex: KOTH_SPAWNS.spectator.fixedCamera,
              fallbackIndex: KOTH_RULES.spectator.fixedCamera.fallbackIndex,
          },
          cameraOffsets: KOTH_RULES.spectator.cameraOffsets,
          freeCam: KOTH_RULES.spectator.freeCam,
          cameraFollow: KOTH_RULES.spectator.cameraFollow,
          trigger: KOTH_RULES.spectator.trigger,
          ui: KOTH_RULES.spectator.ui,
      })
    : undefined;

registerKothMode({
    spectatorController: kothSpectatorController,
});
