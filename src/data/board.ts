export interface BoardMember { name: string; role: string; photo?: string; }
// Locked 2026-05-27 per spec §8. Updates require a spec amendment.
// 9-member Board of Directors + 2 Appointed officers + General Manager.
export const BOARD: BoardMember[] = [
  { name: 'Samuel G. Arsulo', role: 'Chairperson' },
  { name: 'Karlo S. Sira', role: 'Vice Chairperson' },
  { name: 'Ana V. Ancheta', role: 'Member' },
  { name: 'Novelita J. Belmes', role: 'Member' },
  { name: 'Jogie E. Cubar', role: 'Member' },
  { name: 'Adelfa S. Fontonalgo', role: 'Member' },
  { name: 'Pacifico N. Senador', role: 'Member' },
  { name: 'Luis M. Sorolla Jr.', role: 'Member' },
  { name: 'Noel S. Quidato', role: 'Member' },
  { name: 'Cherry Pink D. Barredo', role: 'Board Secretary' },
  { name: 'Rachelle P. Suria', role: 'Treasurer' },
  { name: 'Joyce T. Epetito', role: 'General Manager' },
];
