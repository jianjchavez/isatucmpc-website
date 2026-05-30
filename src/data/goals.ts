// The nine aims from our Articles of Cooperation, Article III, shown on the
// About page. Each carries a lucide icon name for its card.
export interface Goal { icon: string; text: string; }
export const GOALS: Goal[] = [
  { icon: 'trending-up', text: 'Attain increased income, savings, productivity, and purchasing power through economies of scale and equitable distribution of net surplus.' },
  { icon: 'heart-handshake', text: 'Provide optimum social and economic benefits to our members.' },
  { icon: 'graduation-cap', text: 'Teach members efficient ways of doing things in a cooperative manner.' },
  { icon: 'lightbulb', text: 'Propagate cooperative practices and new ideas in business and management.' },
  { icon: 'scale', text: 'Allow lower-income and less-privileged groups to increase their ownership in the wealth of the nation.' },
  { icon: 'landmark', text: 'Actively support government and people-oriented organizations in promoting cooperatives as a path to sustainable socio-economic development.' },
  { icon: 'piggy-bank', text: 'Institutionalize savings mobilization and capital build-up to sustain our developmental activities.' },
  { icon: 'shield-check', text: 'Implement transparent policies that ensure equitable access to resources and services.' },
  { icon: 'users', text: 'Adopt other plans that foster the welfare of our members, their families, and the community.' },
];
