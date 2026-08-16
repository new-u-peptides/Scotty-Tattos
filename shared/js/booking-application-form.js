/* =========================================================
   Step 2 booking application form (booking-application.html).
   Client-side file-size guardrails (matched server-side in
   api/booking-application.js) before posting multipart/form-data
   to /api/booking-application.
   ========================================================= */
(function () {
  'use strict';

  var MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
  var MAX_FILES_PER_FIELD = 3;

  function validateFiles(input, label, errors) {
    if (!input || !input.files) return;
    if (input.files.length > MAX_FILES_PER_FIELD) {
      errors.push(label + ': choose up to ' + MAX_FILES_PER_FIELD + ' files.');
      return;
    }
    for (var i = 0; i < input.files.length; i++) {
      if (input.files[i].size > MAX_FILE_BYTES) {
        errors.push(label + ': "' + input.files[i].name + '" is over 2MB — please compress or resize it.');
      }
    }
  }

  function init() {
    var form = document.querySelector('[data-booking-application-form]');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    var statusEl = form.querySelector('[data-form-status]');
    var submitBtn = form.querySelector('button[type="submit"]');

    function setLoading(isLoading) {
      if (!submitBtn) return;
      submitBtn.disabled = isLoading;
      submitBtn.textContent = isLoading ? 'Sending…' : 'Submit Application';
    }

    function setStatus(message, isError) {
      if (!statusEl) return;
      statusEl.textContent = message || '';
      statusEl.className = 'form__status' + (isError ? ' form__status--error' : '');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      setStatus('');

      if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;

      var errors = [];
      validateFiles(form.referenceImages, 'Reference images', errors);
      validateFiles(form.bodyPhotos, 'Body photos', errors);
      if (form.bodyPhotos && form.bodyPhotos.files.length === 0) {
        errors.push('Please attach at least one photo of the area you want tattooed.');
      }

      if (errors.length) {
        setStatus(errors.join(' '), true);
        return;
      }

      setLoading(true);

      fetch('/api/booking-application', { method: 'POST', body: new FormData(form) })
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
          window.location.href = 'booking-application-received.html';
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
