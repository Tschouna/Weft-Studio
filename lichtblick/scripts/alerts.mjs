// Which chances are worth an alert, and which were already sent. Shared by the alerts job
// (scripts/digest.mjs) and its checks.
import { topOpportunities } from '../js/scoring.js';
import { dayKey } from '../js/astro.js';

const H = 3600e3;
export const alertKey = (o) => `${o.spotId}:${o.type}:${dayKey(o.peak)}`;

// ops: every chance found; prefs: { min, types, favsOnly, favs } from the app's alert settings;
// state: { sent: { key: { at, score } } } kept between runs. Returns the new alerts (best first, one
// per spot) and the state to store.
export function pickAlerts(ops, { prefs = {}, mine = new Set(), state = null, now = Date.now(), ahead = 36, limit = 6 } = {}) {
  const min = Number.isFinite(+prefs.min) && +prefs.min > 0 ? +prefs.min : 75;
  const types = Array.isArray(prefs.types) ? new Set(prefs.types) : null, favs = new Set(prefs.favs || []);
  const sent = { ...((state && state.sent) || {}) };
  for (const [k, v] of Object.entries(sent)) if (now - v.at > 4 * 24 * H) delete sent[k]; // forget old ones
  const seen = new Set();
  const fresh = topOpportunities(ops, { min, perSpotDay: 1 })
    .filter((o) => !o.outlook && o.peak.getTime() > now - H && o.peak.getTime() <= now + ahead * H)
    .filter((o) => !types || types.has(o.type))
    .filter((o) => !prefs.favsOnly || favs.has(o.spotId) || mine.has(o.spotId))
    .filter((o) => (seen.has(o.spotId) ? false : seen.add(o.spotId)))
    // not again, unless it has become clearly better since
    .filter((o) => { const was = sent[alertKey(o)]; return !was || o.score >= was.score + 12; })
    .slice(0, limit);
  for (const o of fresh) sent[alertKey(o)] = { at: now, score: o.score };
  return { fresh, state: { sent } };
}
