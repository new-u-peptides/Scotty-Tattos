'use strict';

const RESEND_API_URL = 'https://api.resend.com/emails';

// Thin wrapper around the Resend REST API — kept dependency-free (plain
// fetch) so the serverless bundle stays small. Swapping providers later
// means editing this one file.
async function sendEmail({ to, subject, html, replyTo, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error('Email is not configured: set RESEND_API_KEY and RESEND_FROM_EMAIL.');
  }

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (replyTo) payload.reply_to = replyTo;
  if (attachments && attachments.length) payload.attachments = attachments;

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  return res.json();
}

module.exports = { sendEmail };
