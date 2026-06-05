export interface BoardMember { name: string; role: string; photo?: string; }
// Locked 2026-05-27 per spec §8. Updates require a spec amendment.
// 9-member Board of Directors + 2 Appointed officers + General Manager.
export const BOARD: BoardMember[] = [
  { name: 'Samuel G. Arsulo', role: 'Chairperson', photo: '/board/arsulo.jpg' },
  { name: 'Karlo S. Sira', role: 'Vice Chairperson', photo: '/board/sira.jpg' },
  { name: 'Ana V. Ancheta', role: 'Member', photo: '/board/ancheta.jpg' },
  { name: 'Novelita J. Belmes', role: 'Member', photo: '/board/belmes.jpg' },
  { name: 'Jogie E. Cubar', role: 'Member', photo: '/board/cubar.jpg' },
  { name: 'Adelfa S. Fontonalgo', role: 'Member', photo: '/board/fontonalgo.jpg' },
  { name: 'Pacifico N. Senador', role: 'Member', photo: '/board/senador.jpg' },
  { name: 'Luis M. Sorolla Jr.', role: 'Member', photo: '/board/sorolla.jpg' },
  { name: 'Noel S. Quidato', role: 'Member', photo: '/board/quidato.jpg' },
  { name: 'Cherry Pink D. Barredo', role: 'Board Secretary', photo: '/board/barredo.jpg' },
  { name: 'Rachelle P. Suria', role: 'Treasurer', photo: '/board/suria.jpg' },
  { name: 'Joyce T. Epetito', role: 'General Manager', photo: '/board/epetito.jpg' },
];
