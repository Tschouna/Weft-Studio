// What people have actually seen and photographed near a spot: research-grade mammal and bird
// observations from iNaturalist (open API, allows requests from any page). Only photos with a
// Creative Commons licence are shown, with their attribution.
import { cached } from '../store.js';

const API = 'https://api.inaturalist.org/v1';
const where = (spot, radius) => `lat=${spot.lat.toFixed(4)}&lng=${spot.lon.toFixed(4)}&radius=${radius}`;
const licensed = (p) => p && p.license_code;
const size = (url, s) => (url || '').replace(/\/(square|small|medium|thumb)\./, `/${s}.`);

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`iNaturalist answered ${r.status}`);
  return r.json();
}

// species seen within `radius` km, most often first; month = 1-12 for one month of the year only
export async function speciesNearby(spot, { radius = 10, month = null } = {}) {
  const key = `inat:sc:${spot.lat.toFixed(3)},${spot.lon.toFixed(3)},${radius},${month || 'all'}`;
  const res = await cached(key, 7 * 864e5, async () => {
    const j = await get(`${API}/observations/species_counts?${where(spot, radius)}&iconic_taxa=Mammalia,Aves&quality_grade=research&locale=en&per_page=40${month ? `&month=${month}` : ''}`);
    return { total: j.total_results, list: (j.results || []).map((r) => ({
      count: r.count, id: r.taxon.id, name: r.taxon.preferred_common_name || r.taxon.name, sci: r.taxon.name, group: r.taxon.iconic_taxon_name,
      photo: licensed(r.taxon.default_photo) ? size(r.taxon.default_photo.square_url || r.taxon.default_photo.url, 'square') : null,
      attribution: licensed(r.taxon.default_photo) ? r.taxon.default_photo.attribution : null,
    })) };
  });
  return res.data;
}

// the latest research-grade observations with a licensed photo
export async function recentNearby(spot, { radius = 10, taxon = null } = {}) {
  const key = `inat:obs:${spot.lat.toFixed(3)},${spot.lon.toFixed(3)},${radius},${taxon || 'all'}`;
  const res = await cached(key, 12 * 3600e3, async () => {
    const j = await get(`${API}/observations?${where(spot, radius)}&${taxon ? `taxon_id=${taxon}` : 'iconic_taxa=Mammalia,Aves'}&quality_grade=research&photo_licensed=true&order_by=observed_on&order=desc&per_page=12&locale=en`);
    return (j.results || []).filter((o) => o.photos && o.photos.length && licensed(o.photos[0])).map((o) => ({
      id: o.id, date: o.observed_on, name: o.taxon ? (o.taxon.preferred_common_name || o.taxon.name) : 'Unknown',
      photo: size(o.photos[0].url, 'small'), attribution: o.photos[0].attribution, uri: o.uri || `https://www.inaturalist.org/observations/${o.id}`,
    }));
  });
  return res.data;
}

export const exploreUrl = (spot, radius = 10) => `https://www.inaturalist.org/observations?${where(spot, radius)}&iconic_taxa=Mammalia,Aves&quality_grade=research`;
