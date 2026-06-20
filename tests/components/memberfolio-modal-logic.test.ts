import { describe, it, expect, beforeEach } from 'vitest';
import {
  PORTAL_URL, HOWTO_SRC, isPortalHref, selectTriggers, createAccessModal,
} from '~/components/memberfolio-modal-logic';

describe('isPortalHref', () => {
  it('matches the exact portal URL', () => {
    expect(isPortalHref(PORTAL_URL)).toBe(true);
  });
  it('matches the portal URL with a trailing slash', () => {
    expect(isPortalHref(PORTAL_URL + '/')).toBe(true);
  });
  it('rejects other hrefs and empty values', () => {
    expect(isPortalHref('/membership')).toBe(false);
    expect(isPortalHref('https://example.com')).toBe(false);
    expect(isPortalHref(null)).toBe(false);
    expect(isPortalHref(undefined)).toBe(false);
  });
});

describe('selectTriggers', () => {
  it('returns portal links outside the dialog and excludes those inside it', () => {
    document.body.innerHTML = `
      <a id="hdr" href="${PORTAL_URL}">Member Login</a>
      <a id="ftr" href="${PORTAL_URL}">Member Login</a>
      <a id="other" href="/membership">Join</a>
      <dialog id="mfDialog">
        <a id="signin" href="${PORTAL_URL}">Sign in</a>
      </dialog>`;
    const ids = selectTriggers(document).map(a => a.id).sort();
    expect(ids).toEqual(['ftr', 'hdr']);
  });
});

describe('createAccessModal', () => {
  function build() {
    document.body.innerHTML = `
      <a id="trigger" href="${PORTAL_URL}">Member Login</a>
      <dialog id="mfDialog">
        <div id="gateway"></div>
        <div id="howto"><iframe id="frame" title="t"></iframe></div>
      </dialog>`;
    const dialog = document.getElementById('mfDialog') as HTMLDialogElement;
    return {
      ctrl: createAccessModal({
        dialog,
        gateway: document.getElementById('gateway') as HTMLElement,
        howto: document.getElementById('howto') as HTMLElement,
        iframe: document.getElementById('frame') as HTMLIFrameElement,
      }),
      dialog,
      iframe: document.getElementById('frame') as HTMLIFrameElement,
      trigger: document.getElementById('trigger') as HTMLAnchorElement,
    };
  }

  it('lazy-loads the iframe src only when the how-to view is shown', () => {
    const { ctrl, iframe } = build();
    expect(iframe.getAttribute('src')).toBe(null);
    ctrl.showHowto();
    expect(iframe.getAttribute('src')).toBe(HOWTO_SRC);
  });

  it('toggles view state classes between gateway and how-to', () => {
    const { ctrl } = build();
    ctrl.showHowto();
    expect(document.getElementById('gateway')!.classList.contains('is-hidden')).toBe(true);
    expect(document.getElementById('howto')!.classList.contains('is-active')).toBe(true);
    ctrl.showGateway();
    expect(document.getElementById('gateway')!.classList.contains('is-hidden')).toBe(false);
    expect(document.getElementById('howto')!.classList.contains('is-active')).toBe(false);
  });

  it('returns focus to the trigger and resets to gateway on close', () => {
    const { ctrl, trigger } = build();
    ctrl.open(trigger);
    ctrl.showHowto();
    ctrl.handleClose();
    expect(document.activeElement).toBe(trigger);
    expect(document.getElementById('howto')!.classList.contains('is-active')).toBe(false);
    expect(ctrl.lastTrigger).toBe(null);
  });
});
