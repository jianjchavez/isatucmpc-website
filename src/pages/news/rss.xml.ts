import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context: { site?: URL }) {
  const posts = await getCollection('news', ({ data }) => !data.draft);
  return rss({
    title: 'ISATUCMPC News',
    description: 'Announcements, events, and member stories from ISATUCMPC.',
    site: context.site!,
    items: posts.map(p => ({
      title: p.data.title,
      pubDate: p.data.date,
      description: p.data.excerpt,
      link: `/news/${p.id}/`,
    })),
  });
}
