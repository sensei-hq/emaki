// @senseihq/emaki-posting: the posting desk. Pieces are staged by the machine that renders them, approved by a person
// for exactly the content staged, and posted by a CI job when their date comes. Framework-free core; adapters in
// ./cloudflare (D1 + R2) and ./sveltekit (hook + routes).
export * from './rules.js';
export * from './access.js';
export * from './store.js';
export { createDesk, HttpError, type DeskOptions, type Piece } from './api.js';
