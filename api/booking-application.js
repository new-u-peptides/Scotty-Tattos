'use strict';

// Step 6 of the booking flow — the full application (multipart/form-data,
// includes reference images + body photos). Forwards everything to the
// studio inbox as attachments and confirms receipt to the client.
//
// No object storage is wired up yet, so uploads are held in memory just
// long enough to attach them to the outgoing email — see the size limits
// below and the README's "Booking flow" section for the Vercel Blob
// upgrade path if these limits turn out to be too tight in practice.

const busboy = require('busboy');
const { sendEmail } = require('./_lib/email');
const { isValidEmail, cleanText, cleanMultiline, escapeHtml, escapeMultiline } = require('./_lib/util');

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file
const MAX_FILES_PER_FIELD = 3;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // combined ceiling — stays under Vercel's request body limit
const FILE_FIELDS = ['referenceImages', 'bodyPhotos'];
const NOTIFY_EMAIL = process.env.BOOKING_NOTIFY_EMAIL || 'studio@scottymassa.com';

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_FIELD * FILE_FIELDS.length + 1 },
      });
    } catch (err) {
      reject(httpError('Invalid form submission.', 400));
      return;
    }

    const fields = {};
    const files = { referenceImages: [], bodyPhotos: [] };
    let totalBytes = 0;
    let settled = false;

    function fail(message, statusCode) {
      if (settled) return;
      settled = true;
      reject(httpError(message, statusCode || 400));
      req.unpipe(bb);
      bb.removeAllListeners();
    }

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (name, stream, info) => {
      if (FILE_FIELDS.indexOf(name) === -1) {
        stream.resume();
        return;
      }
      const chunks = [];
      let size = 0;
      let truncated = false;

      stream.on('limit', () => {
        truncated = true;
        fail(`"${info.filename}" is larger than 2MB — please compress it or choose a smaller photo.`, 413);
      });

      stream.on('data', (chunk) => {
        if (settled) return;
        size += chunk.length;
        totalBytes += chunk.length;
        if (totalBytes > MAX_TOTAL_BYTES) {
          fail('Your files add up to more than 4MB total — please remove one or compress your photos.', 413);
          return;
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        if (truncated || settled || !info.filename) return;
        if (files[name].length >= MAX_FILES_PER_FIELD) return;
        files[name].push({
          filename: cleanText(info.filename, 200) || 'upload',
          buffer: Buffer.concat(chunks, size),
        });
      });
    });

    bb.on('error', (err) => fail(err && err.message ? err.message : 'Could not read that upload.', 400));
    bb.on('close', () => {
      if (settled) return;
      settled = true;
      resolve({ fields, files });
    });

    req.pipe(bb);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  let fields, files;
  try {
    ({ fields, files } = await parseMultipart(req));
  } catch (err) {
    res.status(err.statusCode || 400).json({ ok: false, error: err.message || 'Could not read that submission.' });
    return;
  }

  // Honeypot
  if (cleanText(fields.company, 200)) {
    res.status(200).json({ ok: true });
    return;
  }

  const data = {
    name: cleanText(fields.name, 120),
    email: cleanText(fields.email, 254),
    phone: cleanText(fields.phone, 60),
    origin: cleanText(fields.origin, 60),
    projectType: cleanText(fields.projectType, 60),
    placement: cleanText(fields.placement, 120),
    scale: cleanText(fields.scale, 60),
    workType: cleanText(fields.workType, 60),
    concept: cleanMultiline(fields.concept, 4000),
    timing: cleanText(fields.timing, 60),
    travel: cleanText(fields.travel, 60),
    notes: cleanMultiline(fields.notes, 2000),
  };

  const ageConfirm = fields.ageConfirm === 'true';
  const idConfirm = fields.idConfirm === 'true';
  const pricingAck = fields.pricingAck === 'true';

  const missing = [];
  if (!data.name) missing.push('your name');
  if (!isValidEmail(data.email)) missing.push('a valid email address');
  if (!data.phone) missing.push('a phone number');
  if (!data.concept) missing.push('a description of the piece');
  if (!ageConfirm) missing.push('confirmation that you are 18 or over');
  if (!idConfirm) missing.push('confirmation that you understand the photo ID requirement');
  if (!pricingAck) missing.push('confirmation that you understand how pricing works');
  if (!files.bodyPhotos.length) missing.push('at least one photo of the area you want tattooed');

  if (missing.length) {
    res.status(400).json({ ok: false, error: `Please add: ${missing.join(', ')}.` });
    return;
  }

  const attachments = files.referenceImages.concat(files.bodyPhotos).map((f) => ({
    filename: f.filename,
    content: f.buffer.toString('base64'),
  }));

  try {
    await sendEmail({
      to: NOTIFY_EMAIL,
      replyTo: data.email,
      subject: `Booking application: ${data.name}${data.projectType ? ' — ' + data.projectType : ''}`,
      html: applicationEmailHtml(data, {
        referenceCount: files.referenceImages.length,
        bodyPhotoCount: files.bodyPhotos.length,
      }),
      attachments,
    });
  } catch (err) {
    console.error('[booking-application] failed to send application to studio inbox', err);
    res.status(502).json({
      ok: false,
      error: "We couldn't send that just now — please try again in a moment, or email studio@scottymassa.com directly.",
    });
    return;
  }

  try {
    await sendEmail({
      to: data.email,
      subject: 'Got it — your booking application is with Scotty',
      html: confirmationEmailHtml(data.name),
    });
  } catch (err) {
    console.error('[booking-application] failed to send client confirmation', err);
  }

  res.status(200).json({ ok: true });
};

function row(label, value) {
  if (!value) return '';
  return `<tr><td style="padding:6px 16px 6px 0; color:#666; vertical-align:top; white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`;
}

function applicationEmailHtml(data, counts) {
  return `
  <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 640px; color: #1a1a1a; line-height: 1.6;">
    <p style="font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #C8102E; margin: 0 0 12px;">Booking application</p>
    <h1 style="font-size: 20px; margin: 0 0 20px;">${escapeHtml(data.name)}</h1>

    <table style="border-collapse:collapse; width:100%;">
      ${row('Email', data.email)}
      ${row('Phone', data.phone)}
      ${row('Travelling from', data.origin)}
      ${row('Project', data.projectType)}
      ${row('Placement', data.placement)}
      ${row('Scale', data.scale)}
      ${row('Work type', data.workType)}
      ${row('Timing', data.timing)}
      ${row('Travel to Malta', data.travel)}
      ${row('Reference images attached', String(counts.referenceCount))}
      ${row('Body photos attached', String(counts.bodyPhotoCount))}
    </table>

    <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 6px;">Concept</h3>
    <p style="margin: 0 0 16px;">${escapeMultiline(data.concept)}</p>

    ${data.notes ? `<h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 6px;">Notes</h3><p style="margin: 0 0 16px;">${escapeMultiline(data.notes)}</p>` : ''}

    <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 6px;">Confirmed</h3>
    <p style="margin: 0;">18+: yes &nbsp;·&nbsp; Understands photo ID requirement: yes &nbsp;·&nbsp; Understands pricing: yes</p>

    <p style="color:#888; font-size:12px; margin-top: 28px;">Reply to this email to reach ${escapeHtml(data.name)} directly — replies go to ${escapeHtml(data.email)}.</p>
  </div>`;
}

function confirmationEmailHtml(name) {
  const firstName = escapeHtml((name || '').trim().split(/\s+/)[0] || 'there');
  return `
  <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;">
    <p style="font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #C8102E; margin: 0 0 18px;">Massa Tattoo Social Club</p>
    <h1 style="font-size: 22px; margin: 0 0 20px;">Got it, ${firstName}.</h1>
    <p>Your booking application has landed with Scotty. He personally reviews every one — usually within 48 working hours — to check the piece is a genuine fit for his style and that the scale and reference material give him enough to work with.</p>
    <p>If it's a fit, you'll hear back directly from him with a link to book a consultation, online or in person at the studio in Birkirkara. If he needs anything else from you first, he'll ask.</p>
    <p style="margin: 32px 0 4px; font-size: 14px; color: #444;">
      Massa Tattoo Social Club<br>
      11 Triq Il-Knisja Il-Qadima, Birkirkara, Malta<br>
      <a href="mailto:studio@scottymassa.com" style="color:#C8102E;">studio@scottymassa.com</a> · +356 9968 5949
    </p>
  </div>`;
}
