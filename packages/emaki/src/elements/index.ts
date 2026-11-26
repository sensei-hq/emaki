// Web components over the core, so every framework (or none) renders stories the same way:
//   <motion-scene film="phishing-101" scene="spot" layout="figure" locale="es"></motion-scene>   an article figure (loops)
//   <motion-show film="phishing-101" locale="es" layout="landscape"></motion-show>                 the story player
// A figure whose scene has a voice line gains a CC toggle and caption overlay; voice="off" cuts its narration
// (the score plays on). Both take mode="light|dark|auto" (default auto: follow the page's data-mode, else prefers-color-scheme).
// Call defineMotionElements() once, after useSource(...). Both elements fit their box; give them a width (and the
// show an aspect ratio). Sound is always off until the reader turns it on.
// The show renders the standard player chrome (toolbar plus captions) by default; chrome="off" keeps the bare
// stage for custom chrome, driven through the controller. `icons` and `renderTick` arrive as JS properties,
// the pop-out link as a playerhref attribute.
import { MotionScene } from './motion-scene.js';
import { MotionShow } from './motion-show.js';

export function defineMotionElements() {
  if (!customElements.get('motion-scene')) customElements.define('motion-scene', MotionScene);
  if (!customElements.get('motion-show')) customElements.define('motion-show', MotionShow);
}
