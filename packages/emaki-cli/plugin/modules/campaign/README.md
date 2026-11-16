# Daily campaign (optional module)

A run of short pieces (one a day for N weeks) around a theme. Each day has one story (usually a Short: 5–6 scenes,
30–60 s, 9:16 first) and the copy for every channel, in one **day script** the producer and the poster both read.

## Files

| File | Purpose |
|---|---|
| `calendar.csv` | One row per day: date, slug, product/topic, title, the hook line, status. The plan at a glance. |
| `days/day-NN-<slug>.md` | The day script, from `day-script.template.md`: the voiceover table (one line per scene), the YouTube title and description, the Instagram carousel (6–7 slides) and caption, the X post and thread, and the posting step. |
| `carousels/<slug>/*.png` | Carousel slides, rendered from the film's scenes (`emaki sheet` frames, or a dedicated carousel layout). |

## Flow

1. Plan the calendar with the owner (topics, order, cadence, which days are Shorts vs. articles only).
2. Write the day scripts in batches of 5–7; the owner approves the batch.
3. For each day: build the story (the orchestrator's per-item loop), voice, render the 9:16 (and 16:9), build.
4. Stage it to the posting desk; the owner approves; the scheduled poster publishes on the day.
5. Weekly: read the numbers back into the calendar (views, saves, clicks to the article) and adjust the next batch.

Translations: one day script per locale (`days/<locale>/...`) or a column per locale in the voiceover table; the
story's strings and voice files carry the language, the day script carries the channel copy.
