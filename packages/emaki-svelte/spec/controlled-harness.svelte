// A film plus its figures driven by one app state: the show/figure under test with its
// sound prop held in here, flippable from the test through the button below.
<script lang="ts">
  import { MotionShow } from '../src/lib/index.js';

  let { film }: { film: string } = $props();
  let sound: boolean | undefined = $state(false);
  let calls: boolean[] = $state([]);
  const extra = $derived({ sound, onsoundchange: (v: boolean) => { calls.push(v); } });
</script>

<MotionShow {film} {...(extra as object)} />
<button onclick={() => (sound = true)}>flip sound on</button>
<p data-calls>{calls.join(',')}</p>
