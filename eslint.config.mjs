import astroPlugin from "eslint-plugin-astro";

export default [
  // Astro recommended flat config (includes astro-eslint-parser for *.astro files)
  ...astroPlugin.configs.recommended,
];
