// The film's sound: action tones only (no bed). T.<scene> is each scene's running start; time a note to the
// moment it marks (a card landing, a tick, a reveal). Instruments: vibes, marimba, pluck, ep, bass. Effects via
// S.fx(name, t): click, tick, thud, pop, whoosh, ding, chime, sparkle, roll.
kit.score(function (S, T) {
  S.tempo(70, { t0: 0 });
  S.program('bell', 'vibes', { rev: 0.6, gain: -5 });
  S.program('wood', 'marimba', { rev: 0.4, gain: -7, pan: 0.15 });
  S.program('pl', 'pluck', { rev: 0.5, gain: -9, pan: -0.15 });
  const P = (track, n, t, vel, dur) => S.note(track, n, { t, dur: dur || 0.8, vel });
  Object.keys(T).forEach((id, i) => P('wood', ['D4', 'E4', 'F#4', 'A4', 'B4', 'D5'][i % 6], T[id] + 0.8, 20, 0.4));
  if (T.close !== undefined) S.chord('bell', ['D5', 'F#5', 'A5'], { t: T.close + 0.3, dur: 3.2, vel: 30 });
});
