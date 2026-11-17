// Lookups into a scene spec that its tracks need: the component a track targets, and how many words it animates.
import type { ComponentSpec, HeadSpec, SceneSpec } from './scene-schema.js';

/** A component by id, searching groups and boxes. */
export function findComponent(cs: ComponentSpec[], id: string): ComponentSpec | undefined {
  for (const c of cs) {
    if (c.id === id) return c;
    const kids = c.type === 'group' || c.type === 'box' ? (c.children as ComponentSpec[]) : [];
    const hit = findComponent(kids, id);
    if (hit) return hit;
  }
  return undefined;
}

/** The component id a `.id` selector names. */
export const idOf = (target: string) => target.replace(/^\./, '');

/** The head component a showHead track targets (top level only), if it is one. */
export const headOf = (spec: SceneSpec, target: string) =>
  spec.components.find((c): c is HeadSpec => c.id === idOf(target) && c.type === 'head');

/** Words in a text, as a split text component renders them. */
export const wordCount = (text: string) => text.trim().split(/\s+/).length;
