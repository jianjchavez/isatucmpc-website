export const PORTAL_URL = 'https://app.isatucmpc.coop';
export const HOWTO_SRC = '/memberfolio-howto.html';

/** True when an href points at the MemberFolio portal (tolerates a trailing slash). */
export function isPortalHref(href: string | null | undefined): boolean {
  if (!href) return false;
  return href.replace(/\/+$/, '') === PORTAL_URL;
}

/** Portal "Member Login" links that should open the modal — excludes links inside the dialog. */
export function selectTriggers(doc: Document, dialogId = 'mfDialog'): HTMLAnchorElement[] {
  const all = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  return all.filter(a => isPortalHref(a.getAttribute('href')) && !a.closest(`#${dialogId}`));
}

export interface AccessModalEls {
  dialog: HTMLDialogElement;
  gateway: HTMLElement;
  howto: HTMLElement;
  iframe: HTMLIFrameElement;
}

export interface AccessModalController {
  open(trigger?: HTMLElement | null): void;
  close(): void;
  showGateway(): void;
  showHowto(): void;
  handleClose(): void;
  lastTrigger: HTMLElement | null;
}

export function createAccessModal(els: AccessModalEls, howtoSrc = HOWTO_SRC): AccessModalController {
  let lastTrigger: HTMLElement | null = null;

  function showGateway(): void {
    els.gateway.classList.remove('is-hidden');
    els.howto.classList.remove('is-active');
  }
  function showHowto(): void {
    if (!els.iframe.getAttribute('src')) els.iframe.setAttribute('src', howtoSrc);
    els.gateway.classList.add('is-hidden');
    els.howto.classList.add('is-active');
  }
  function open(trigger: HTMLElement | null = null): void {
    lastTrigger = trigger;
    showGateway();
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
  }
  function close(): void {
    if (typeof els.dialog.close === 'function') els.dialog.close();
  }
  function handleClose(): void {
    showGateway();
    if (lastTrigger) lastTrigger.focus();
    lastTrigger = null;
  }

  return {
    open, close, showGateway, showHowto, handleClose,
    get lastTrigger() { return lastTrigger; },
  };
}
