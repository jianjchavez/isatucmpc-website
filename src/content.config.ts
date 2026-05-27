import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    category: z.enum(['announcement', 'event', 'member-story', 'coop-news']),
    excerpt: z.string().max(180),
    coverImage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { news };
