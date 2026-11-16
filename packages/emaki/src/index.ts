// emaki core: one set of scene files renders the reader's article figures, the story player (slides) and
// the capture used for video, in any language. Framework-free; see ../elements and ../adapters for UI bindings.
export * from './types.js';
export * from './kit.js';
export * from './scene-schema.js';
export { evaluateScene, validateScene, localizeScene, sceneKeys, registerLogo, mountJsonScene, renderComponent, layoutComponents } from './renderer.js';
export * from './registry.js';
export * from './mount.js';
export * from './sound.js';
export { collectScore, play as playScore, type Score } from './score.js';
export * from './show.js';
export * from './i18n.js';
export * from './content.js';
export { ScenePlayerState } from './player.js';
export { attachScene, figurePlayer, type AttachOptions, type AttachedScene } from './controller.js';
export { setupMotion, type MotionSetup } from './setup.js';
export type { SceneRef, SceneSource, PlayerStatus } from './player.js';
