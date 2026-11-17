// Runs before each browser test file. Components render without +layout.svelte, so load the generated utilities and
// app.css here; otherwise computed-style assertions see browser defaults.
import 'virtual:uno.css';
import './src/app.css';
