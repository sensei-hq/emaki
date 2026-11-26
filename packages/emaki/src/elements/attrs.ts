// Attribute readers shared by the motion elements.
import type { Mode } from '../types.js';

/** The mode attribute: light, dark, or auto (the default: follow the page's data-mode, else the OS). */
export const modeOf = (el: Element): Mode => (['light', 'dark'].includes(el.getAttribute('mode') ?? '') ? el.getAttribute('mode') as Mode : 'auto');
