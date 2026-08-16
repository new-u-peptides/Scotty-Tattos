'use strict';

// A small, stateless "how promising is this application" score computed at
// submission time. Shown ONLY in the studio's internal notification email —
// never to the client, and never used to auto-decline anything. It exists
// purely to help Scotty triage his inbox when several applications land at
// once; the artistic call is always his. See README → Booking flow.
//
// Weights lean toward what scottymassa.com already advertises as the focus
// (large-scale geometric/ornamental work — see llms.txt) and toward signals
// that the applicant is genuinely ready to commit.

const STYLE_FIT = new Set(['Geometric', 'Sacred geometry', 'Mandala', 'Dotwork', 'Ornamental']);
const LARGE_SCALE = new Set(['Large (20cm+)', 'Sleeve / half-sleeve', 'Back or full leg', 'Bodysuit / long-term build']);
const CONCEPT_DETAIL_THRESHOLD = 200;

function scoreApplication(data, counts) {
  let score = 50; // neutral baseline

  if (STYLE_FIT.has(data.style)) score += 15;

  if (LARGE_SCALE.has(data.scale)) score += 20;
  else if (data.scale === 'Medium (10–20cm)') score += 5;
  else if (data.scale === 'Small (under 10cm)') score -= 15;

  if (data.workType === 'Cover-up') score -= 10;

  if (data.travel === 'Already in Malta') score += 5;
  else if (data.travel === 'Willing to travel to Malta' || data.travel === 'Already planning a trip to Malta') score += 10;

  if (counts.referenceCount > 0) score += 10;
  if (counts.bodyPhotoCount > 1) score += 5;

  if (data.timing === 'Just planning ahead') score -= 5;

  if (data.concept && data.concept.length > CONCEPT_DETAIL_THRESHOLD) score += 10;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let label;
  if (score >= 70) label = 'High-fit enquiry';
  else if (score >= 40) label = 'Worth a look';
  else label = 'Lower priority';

  return { score, label };
}

module.exports = { scoreApplication };
