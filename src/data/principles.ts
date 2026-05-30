// The seven cooperative principles as set out by the International Cooperative
// Alliance (ICA). These are universal guidelines by which cooperatives put
// their values into practice — not ISATUCMPC-specific copy.
export interface Principle { number: number; title: string; body: string; }
export const PRINCIPLES: Principle[] = [
  {
    number: 1,
    title: 'Voluntary & Open Membership',
    body: 'Cooperatives are open to all who can use their services and accept the responsibilities of membership — without gender, social, racial, political, or religious discrimination.',
  },
  {
    number: 2,
    title: 'Democratic Member Control',
    body: 'Members actively set policy and make decisions. Each member has one equal vote, regardless of how much capital they hold.',
  },
  {
    number: 3,
    title: "Members' Economic Participation",
    body: 'Members contribute equitably to, and democratically control, the capital of the cooperative and share in its surplus.',
  },
  {
    number: 4,
    title: 'Autonomy & Independence',
    body: 'Cooperatives are self-help organisations controlled by their members, retaining their independence even when partnering with others or raising outside capital.',
  },
  {
    number: 5,
    title: 'Education, Training & Information',
    body: 'Cooperatives educate their members, officers, and staff, and inform the wider public about the nature and benefits of cooperation.',
  },
  {
    number: 6,
    title: 'Cooperation among Cooperatives',
    body: 'Cooperatives serve their members best and strengthen the movement by working together through local, national, and international structures.',
  },
  {
    number: 7,
    title: 'Concern for Community',
    body: 'While focusing on member needs, cooperatives work for the sustainable development of their communities through member-approved policies.',
  },
];
