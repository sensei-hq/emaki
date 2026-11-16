// declarations only (red): implemented in the next commit
import type { createShow } from './show.js';
type Show = Awaited<ReturnType<typeof createShow>>;
export function sceneSound(_film: string, _scene: string, _locale = 'en'): { available: Promise<boolean>; on: boolean; toggle(): Promise<void>; cue(): void; stop(): void; destroy(): void } { throw new Error('not implemented'); }
export function showKey(_show: Show, _e: KeyboardEvent, _fullscreen?: Element): boolean { throw new Error('not implemented'); }
export function ticks(_show: Show): { id: string; name: string; dur: number; fill: number }[] { throw new Error('not implemented'); }
