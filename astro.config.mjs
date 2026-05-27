import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://isatucmpc.coop',
  integrations: [mdx(), sitemap({ filter: page => !page.includes('/404') })],
  build: { inlineStylesheets: 'auto' },
  vite: {
    plugins: [tailwindcss()],
    resolve: { alias: { '~': new URL('./src', import.meta.url).pathname },
    },
  },
});
