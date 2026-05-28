(() => {
  const WORKER_URL = 'https://isatucmpc-forms.jianjchavez.workers.dev/api/submit';

  function attach(formId, resultId) {
    const form = document.getElementById(formId);
    const result = document.getElementById(resultId);
    if (!form || !result) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data['cf-turnstile-response'] = data['cf-turnstile-response'] || (form.querySelector('[name="cf-turnstile-response"]')?.value ?? '');
      const submitBtn = form.querySelector('button[type=submit]');
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      result.classList.add('hidden');
      try {
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          result.style.background = '#23CD63'; result.style.color = 'white';
          result.textContent = "Salamat! We've received your message and will respond within 2 business days.";
          form.reset();
        } else {
          throw new Error(json.error || 'submit-failed');
        }
      } catch (err) {
        result.style.background = '#FF3F00'; result.style.color = 'white';
        result.textContent = "We couldn't send your message. Please try again or email isatucmpc1964@gmail.com.";
      } finally {
        result.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    attach('membership-form', 'mf-result');
    attach('contact-form', 'cf-result');
  });
})();
