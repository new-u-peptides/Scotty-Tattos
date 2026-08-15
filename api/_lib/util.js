'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim());
}

// Single-line fields (names, phone numbers, select values) — strips
// newlines/control characters so nothing can smuggle extra lines into an
// email subject or a rendered table row.
function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\r\n\t\x00-\x1F\x7F]+/g, ' ').trim();
  return maxLength ? stripped.slice(0, maxLength) : stripped;
}

// Multi-line fields (textareas) — keeps real newlines but strips other
// control characters.
function cleanMultiline(value, maxLength) {
  if (typeof value !== 'string') return '';
  const stripped = value
    .replace(/\r\n/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]+/g, '')
    .trim();
  return maxLength ? stripped.slice(0, maxLength) : stripped;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape + preserve line breaks, for dropping multiline fields into HTML email.
function escapeMultiline(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

module.exports = { isValidEmail, cleanText, cleanMultiline, escapeHtml, escapeMultiline };
