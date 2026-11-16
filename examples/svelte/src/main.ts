import { mount } from 'svelte';
import { startMotion } from './emaki-source';
import App from './App.svelte';

startMotion();
mount(App, { target: document.getElementById('app')! });
