<script lang="ts">
  // One page that shows what the packages do: the story as an article (text + looping figures), the story player,
  // and, at /show/<film>?capture=1, the capture page `emaki sheet` / `emaki render` drive.
  import { MotionScene, MotionShow, ShowPage } from '@senseihq/emaki-svelte';
  import type { Mode } from '@senseihq/emaki';
  import { listStories, loadStory, type Story } from '@senseihq/emaki';
  import { contentSource, site } from './emaki-source';

  const q = new URLSearchParams(location.search);
  const show = location.pathname.match(/^\/show\/([^/]+)/)?.[1];
  let locale = $state(q.get('locale') ?? site?.defaultLocale ?? 'en');
  // ?mode=light|dark pins the scenes; without it they follow the page (auto).
  const mode = (['light', 'dark'].includes(q.get('mode') ?? '') ? q.get('mode') : 'auto') as Mode;
  let story = $state<Story | null>(null);

  $effect(() => {
    const l = locale;
    listStories(contentSource, l, { drafts: true }).then(async (all) => { story = all[0] ? await loadStory(contentSource, all[0].slug, l) : null; });
  });
</script>

{#if show}
  <ShowPage film={show} capture={q.get('capture') === '1'} layout={q.get('o') === 'portrait' ? 'portrait' : 'landscape'} locale={q.get('locale') ?? 'en'} src={(['json', 'js'].includes(q.get('src') ?? '') ? q.get('src') : undefined) as 'json' | 'js' | undefined} mode={mode === 'dark' ? 'dark' : undefined} />
{:else if story}
  <main>
    <nav>
      {#each site?.locales ?? ['en'] as l}
        <button aria-pressed={l === locale} onclick={() => (locale = l)}>{l}</button>
      {/each}
    </nav>
    <header>
      <h1>{story.title}</h1>
      <p class="dek">{story.dek}</p>
    </header>
    {#if story.film}
      <div class="player" data-testid="player"><MotionShow film={story.film} {locale} {mode} poster title={story.title} fullscreenHref="/show/{story.film}" /></div>
    {/if}
    {#each story.sections as s (s.id)}
      <section>
        {#if s.eyebrow}<p class="eyebrow">{s.eyebrow}</p>{/if}
        <h2>{s.title}</h2>
        {#each s.body as p}<p>{p}</p>{/each}
        {#if s.motion}
          <figure data-testid="figure-{s.id}"><MotionScene film={s.motion.film} scene={s.motion.scene} {locale} {mode} label={s.title} /></figure>
        {/if}
      </section>
    {/each}
    {#if story.takeaway}
      <aside class="takeaway"><p>{story.takeaway}</p>{#if story.takeawaySub}<p class="sub">{story.takeawaySub}</p>{/if}</aside>
    {/if}
  </main>
{/if}

<style>
  :global(body) { margin: 0; font: 17px/1.6 system-ui, sans-serif; background: #f6f3ec; color: #1d1b17; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 80px; }
  nav { display: flex; gap: 6px; justify-content: flex-end; }
  nav button { border: 1px solid #1d1b17; background: none; border-radius: 14px; padding: 2px 10px; cursor: pointer; }
  nav button[aria-pressed='true'] { background: #1d1b17; color: #f6f3ec; }
  h1 { font-size: 40px; line-height: 1.1; margin: 24px 0 8px; }
  .dek { font-size: 20px; color: #5b564c; }
  .player { aspect-ratio: 16 / 10; margin: 24px 0 40px; background: #fff; border-radius: 12px; overflow: hidden; }
  .eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 12px; color: #c25237; margin: 32px 0 0; }
  h2 { margin: 4px 0 8px; }
  figure { margin: 20px 0; border-radius: 12px; overflow: hidden; background: #fff; }
  .takeaway { margin-top: 48px; padding: 28px; border-radius: 12px; background: #1d1b17; color: #f6f3ec; font-size: 24px; }
  .takeaway p { margin: 0; } .takeaway .sub { margin-top: 12px; font-size: 17px; opacity: .75; }
</style>
