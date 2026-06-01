import { registerKothEvents } from './events/register-koth-events.ts';
import './services/koth-runtime.ts';

export function registerKingOfTheHillMode(): void {
    registerKothEvents();
}
