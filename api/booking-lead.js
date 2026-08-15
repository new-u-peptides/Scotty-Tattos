'use strict';

// Step 1 of the booking flow — POST { name, email, marketingConsent }.
// Sends the client the automated "process" email and gives the studio a
// lightweight heads-up. There is no CRM/list provider wired in yet (see
// README → Booking flow), so this is the only record of a Step-1 lead
// until a real ESP (AWeber or similar) is connected.

const { sendEmail } = require('./_lib/email');
const { isValidEmail, cleanText, escapeHtml } = require('./_lib/util');

const SITE_URL = 'https://scottymassa.com';
const APPLICATION_URL = `${SITE_URL}/booking-application.html`;
const NOTIFY_EMAIL = process.env.BOOKING_NOTIFY_EMAIL || 'studio@scottymassa.com';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  const body = req.body || {};

  // Honeypot — real visitors never see or fill this field in.
  if (cleanText(body.company, 200)) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = cleanText(body.name, 120);
  const email = cleanText(body.email, 254);
  const marketingConsent = body.marketingConsent === true || body.marketingConsent === 'true';

  if (!name) {
    res.status(400).json({ ok: false, error: 'Please enter your name.' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    return;
  }

  try {
    await sendEmail({
      to: email,
      subject: 'Your booking enquiry with Scotty Massa — what happens next',
      html: processEmailHtml(name),
    });
  } catch (err) {
    console.error('[booking-lead] failed to send process email', err);
    res.status(502).json({ ok: false, error: "We couldn't send that just now — please try again in a moment." });
    return;
  }

  // The client already has their process email — don't fail their request
  // over the internal copy, just log it so it can be investigated.
  try {
    await sendEmail({
      to: NOTIFY_EMAIL,
      subject: `New booking enquiry: ${name}`,
      html: notifyEmailHtml({ name, email, marketingConsent }),
    });
  } catch (err) {
    console.error('[booking-lead] failed to notify studio inbox', err);
  }

  res.status(200).json({ ok: true });
};

function processEmailHtml(name) {
  const firstName = escapeHtml((name || '').trim().split(/\s+/)[0] || 'there');
  return `
  <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;">
    <p style="font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #C8102E; margin: 0 0 18px;">Massa Tattoo Social Club</p>
    <h1 style="font-size: 22px; margin: 0 0 20px; font-family: Georgia, serif;">Thanks for reaching out, ${firstName}.</h1>
    <p>Scotty specialises in large-scale, custom geometric and ornamental work — sleeves, backs, full legs and bodysuits, built one-to-one from concept through to completion.</p>
    <p>Here's exactly how booking with him works, so you know what to expect before you commit any time to it.</p>

    <h3 style="margin: 28px 0 8px; font-size: 16px;">1. The full application</h3>
    <p style="margin: 0 0 16px;">When you're ready, fill out the booking application. It covers your idea, placement, size, reference images and a couple of photos of the area you want tattooed — the more detail, the faster and more accurate Scotty's answer.</p>

    <h3 style="margin: 24px 0 8px; font-size: 16px;">2. Pricing &amp; deposit</h3>
    <p style="margin: 0 0 16px;">Projects are priced hourly or flat-rate depending on size and style, and are quoted properly once Scotty has seen your idea. A 30% deposit secures your date once a project is confirmed — non-refundable, but transferable once with 14+ days' notice.</p>

    <h3 style="margin: 24px 0 8px; font-size: 16px;">3. Review</h3>
    <p style="margin: 0 0 16px;">Scotty personally reviews every application — usually within 48 working hours — to check the piece is a genuine fit for his style and the scale works. If it is, he'll reply directly with a link to book a consultation, online or in person at the studio.</p>

    <h3 style="margin: 24px 0 8px; font-size: 16px;">4. Consultation &amp; booking</h3>
    <p style="margin: 0 0 16px;">The consultation is where you nail down the design, placement and timeline together, and — if you're both happy to go ahead — book the session and take the deposit.</p>

    <p style="margin: 32px 0;">
      <a href="${APPLICATION_URL}" style="display:inline-block; background:#C8102E; color:#F5F2EC; padding: 14px 28px; text-decoration:none; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; font-family: Arial, sans-serif;">Start your booking application</a>
    </p>

    <p style="margin: 32px 0 4px; font-size: 14px; color: #444;">
      Massa Tattoo Social Club<br>
      11 Triq Il-Knisja Il-Qadima, Birkirkara, Malta<br>
      <a href="mailto:studio@scottymassa.com" style="color:#C8102E;">studio@scottymassa.com</a> · +356 9968 5949
    </p>
    <p style="font-size: 12px; color: #888; margin-top: 24px;">
      You're receiving this because you enquired at ${SITE_URL}/booking.html. If this wasn't you, you can safely ignore this email.
    </p>
  </div>`;
}

function notifyEmailHtml({ name, email, marketingConsent }) {
  return `
  <div style="font-family: Georgia, serif; max-width: 560px; color: #1a1a1a;">
    <p style="font-size:12px; letter-spacing:0.2em; text-transform:uppercase; color:#C8102E; margin: 0 0 12px;">New Step 1 enquiry</p>
    <p>Someone just entered the booking funnel — this is a lead, not yet a full application. No action needed unless you want to follow up personally.</p>
    <table style="border-collapse:collapse; margin: 16px 0;">
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Name</td><td>${escapeHtml(name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Email</td><td>${escapeHtml(email)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Marketing opt-in</td><td>${marketingConsent ? 'Yes' : 'No'}</td></tr>
    </table>
    <p style="color:#888; font-size:12px;">They've been sent the process email automatically. You'll hear again if/when they submit the full application.</p>
  </div>`;
}
