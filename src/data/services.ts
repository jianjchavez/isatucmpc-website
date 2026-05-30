export type ServiceStatus = 'active' | 'coming-soon' | 'by-appointment';

export interface Service {
  slug: string;
  name: string;
  icon: string;             // lucide icon name
  description: string;      // 1-paragraph plain-language
  whoCanUse: string;        // 1–2 sentences
  howToAccess: string[];    // numbered list items
  status: ServiceStatus;    // operator-set
}

export const SERVICES: Service[] = [
  {
    slug: 'credit',
    name: 'Credit',
    icon: 'hand-coins',
    description:
      'Access fair, member-rate loans to fund your education, livelihood, emergencies, or family needs. Patronage refunds give back a share of net surplus at year-end.',
    whoCanUse: 'Regular and associate members in good standing, after the minimum patronage period.',
    howToAccess: [
      'Be a member in good standing (paid-up minimum share capital, no delinquent accounts).',
      'Apply at the cooperative office or via the MemberFolio portal.',
      'Submit required documents; BOD/Credit Committee reviews.',
      'Loan released according to approved terms.',
    ],
    status: 'active',
  },
  {
    slug: 'sm-credit',
    name: 'SM Credit',
    icon: 'credit-card',
    description:
      'A member purchase-credit facility for buying goods, appliances, and other big-ticket needs — payable in convenient installments at member-friendly terms.',
    whoCanUse: 'Members in good standing.',
    howToAccess: [
      'Be a member in good standing.',
      'Apply at the cooperative office.',
      'Purchase approved on credit and settled per agreed installment terms.',
    ],
    status: 'active',
  },
  {
    slug: 'in-store-credit',
    name: 'In-store Credit',
    icon: 'store',
    description:
      'Buy now, pay later at the cooperative store — members in good standing can charge everyday essentials to their account, conveniently settled through payroll or over-the-counter payment.',
    whoCanUse: 'Members in good standing.',
    howToAccess: [
      'Be a member in good standing.',
      'Present membership at the cooperative store.',
      'Charge eligible purchases to your account, settled per agreed terms.',
    ],
    status: 'active',
  },
  {
    slug: 'savings',
    name: 'Savings & Time Deposits',
    icon: 'piggy-bank',
    description:
      'Save with confidence. Regular savings earn interest; time deposits offer higher rates with locked terms. Capital build-up of at least 0.5% of monthly income is part of every member\'s commitment.',
    whoCanUse: 'All members.',
    howToAccess: [
      'Open a savings account at the office or through the MemberFolio portal.',
      'Choose between regular savings and time deposit options.',
      'Deposit on-site or via authorized channels.',
    ],
    status: 'active',
  },
  {
    slug: 'convenience-store',
    name: 'Convenience Store',
    icon: 'shopping-bag',
    description:
      'Member-priced essentials at the cooperative store — household goods, school supplies, and daily needs. Patronage at the store contributes to the net surplus members share in annually.',
    whoCanUse: 'Open to members; non-members may purchase at standard rates.',
    howToAccess: ['Visit the cooperative store at the Burgos St. office.'],
    status: 'active',
  },
  {
    slug: 'laundry',
    name: 'Laundry',
    icon: 'shirt',
    description:
      'A cooperative-run laundromat offering members and the community affordable, reliable laundry care.',
    whoCanUse: 'Members and walk-in customers.',
    howToAccess: ['Visit the laundromat during office hours.'],
    status: 'active',
  },
  {
    slug: 'boarding-house',
    name: 'Boarding House',
    icon: 'home',
    description:
      'Cooperative-managed boarding accommodations near ISAT U, with on-site dorm matrons.',
    whoCanUse: 'Students, workers, and members seeking affordable accommodation.',
    howToAccess: ['Inquire at the office for availability and rates.'],
    status: 'active',
  },
  {
    slug: 'copy-center',
    name: 'Copy Center / Prints & Ads',
    icon: 'printer',
    description:
      'Photocopying, printing, and document services for members, students, and the campus community at fair rates.',
    whoCanUse: 'Members, students, and the public.',
    howToAccess: ['Walk in during office hours.'],
    status: 'active',
  },
  {
    slug: 'food-park',
    name: 'Food Park',
    icon: 'utensils',
    description:
      'A cooperative-operated food park serving members, students, and the campus community with affordable meals.',
    whoCanUse: 'Members, students, and the public.',
    howToAccess: ['Visit on campus during operating hours.'],
    status: 'active',
  },
  {
    slug: 'ucafe',
    name: 'UCafe',
    icon: 'coffee',
    description:
      'The cooperative campus cafe — coffee, snacks, and a study-friendly space for the ISAT U community.',
    whoCanUse: 'Members, students, and the public.',
    howToAccess: ['Visit on campus during operating hours.'],
    status: 'active',
  },
];
