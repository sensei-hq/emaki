import { describe, expect, it } from 'vitest';
import { ScenePlayerState } from '../src/player.js';

// The player state behind SceneRenderer.svelte: what is loaded, where the playhead is,
// whether it plays. Plain data + named transitions, no DOM, so these run in node.
describe('scene player state', () => {
  it('loads a scene idle at t=0 with a remount key', () => {
    const st = new ScenePlayerState();
    expect(st.status).toBe('idle');
    st.load({ film: 'measure-right-work', scene: 'hook', layout: 'landscape' });
    expect(st.key).toBe('measure-right-work:hook:landscape:');
    expect(st.t).toBe(0);
    expect(st.status).toBe('idle');
    st.markReady(6.5);
    expect(st.status).toBe('ready');
    expect(st.dur).toBe(6.5);
  });

  it('keys remounts on film, scene, layout and source', () => {
    const st = new ScenePlayerState();
    st.load({ film: 'a', scene: 'b', layout: 'landscape' });
    const k = st.key;
    st.load({ film: 'a', scene: 'b', layout: 'portrait' });
    expect(st.key).not.toBe(k);
    st.load({ film: 'a', scene: 'b', layout: 'portrait', src: 'js' });
    expect(st.key).toContain(':js');
  });

  it('seeks clamped to the duration', () => {
    const st = new ScenePlayerState();
    st.load({ film: 'a', scene: 'b', layout: 'landscape' });
    st.markReady(10);
    st.seek(4);
    expect(st.t).toBe(4);
    st.seek(99);
    expect(st.t).toBe(10);
    st.seek(-3);
    expect(st.t).toBe(0);
  });

  it('ticks forward, stopping at the end or looping', () => {
    const st = new ScenePlayerState();
    st.load({ film: 'a', scene: 'b', layout: 'landscape' });
    st.markReady(10);
    st.tick(1);
    expect(st.t).toBe(0); // paused: no motion
    st.play();
    st.tick(4);
    expect(st.t).toBe(4);
    st.loop = false;
    st.tick(99);
    expect(st.t).toBe(10);
    expect(st.playing).toBe(false);
    st.loop = true;
    st.play();
    expect(st.t).toBe(0); // restarts from the end
    expect(st.playing).toBe(true);
  });

  it('reports load failures', () => {
    const st = new ScenePlayerState();
    st.load({ film: 'nope', scene: 'nope', layout: 'landscape' });
    st.fail('motion: nope has no scene "nope"');
    expect(st.status).toBe('error');
    expect(st.error).toBe('motion: nope has no scene "nope"');
    expect(st.playing).toBe(false);
  });
});
