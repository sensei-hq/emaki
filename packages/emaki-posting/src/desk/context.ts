// What every desk handler works with: the options it was created with, plus the lookups they share.
import type { DeskOptions, Piece } from '../api.js';
import type { Channel, RequestRow } from '../rules.js';
import type { MediaStore, PostingStore } from '../store.js';

export interface DeskContext {
  o: DeskOptions;
  store: PostingStore;
  media: MediaStore;
  /** The channels a piece is expected to go out on. */
  expected: (p: Piece) => Channel[];
  /** The slugs of the pieces in the built site. */
  slugs: () => Promise<Set<string>>;
}

/** The top-level requests that pass `keep`, each with its replies as `thread`. */
export const threaded = (requests: RequestRow[], keep: (r: RequestRow) => boolean) =>
  requests.filter((r) => !r.parent && keep(r)).map((r) => ({ ...r, thread: requests.filter((x) => x.parent === r.id) }));
