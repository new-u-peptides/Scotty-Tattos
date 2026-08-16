/* =========================================================
   Step 1 booking lead form (booking.html).
   Posts { name, email, marketingConsent } to /api/booking-lead,
   then hands off to booking-thank-you.html.
   ========================================================= */
(function () {
  'use strict';

  function init() {
    var form = document.querySelector('[data-booking-lead-form]');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    var statusEl = form.querySelector('[data-form-status]');
    var submitBtn = form.querySelector('button[type="submit"]');

    function setLoading(isLoading) {
      if (!submitBtn) return;
      submitBtn.disabled = isLoading;
      submitBtn.textContent = isLoading ? 'Sending…' : 'Continue';
    }

    function setStatus(message, isError) {
      if (!statusEl) return;
      statusEl.textContent = message || '';
      statusEl.className = 'form__status' + (isError ? ' form__status--error' : '');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      setStatus('');

      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var consent = !!(form.marketingConsent && form.marketingConsent.checked);
      var company = form.company ? form.company.value : '';

      if (!name || !email) {
        setStatus('Please fill in your name and email.', true);
        return;
      }

      setLoading(true);

      fetch('/api/booking-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, marketingConsent: consent, company: company }),
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) {
              if (!res.ok || !data.ok) {
                throw new Error((data && data.error) || 'Something went wrong — please try again.');
              }
              return data;
            });
        })
        .then(function () {
          try {
            sessionStorage.setItem('sm-booking-name', name);
          } catch (err) { /* sessionStorage unavailable — not essential */ }
          window.location.href = 'booking-thank-you.html';
        })
        .catch(function (err) {
          setLoading(false);
          setStatus(err.message || 'Something went wrong — please try again, or email studio@scottymassa.com directly.', true);
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
