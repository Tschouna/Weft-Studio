// Swiss wildlife for photographers: when each species is worth looking for (season, from January to
// December, 0-1), its daily rhythm, the special moments of its year, and how to photograph it without
// disturbing it. inat = iNaturalist taxon id (for "seen nearby").
//
// rhythm: crepuscular (dawn and dusk), ibex (mornings and evenings in summer, sunny middays in winter),
// detect = how likely you are to find it at a good spot when conditions are right (0-1).
// marmot (sun-warmed mornings and late afternoons, hibernating in winter), raptor (thermals from late
// morning), lek (before sunrise), waterbird, wader, songbird, beaver (dusk), daytime, park (opening hours).

export const SPECIES = {
  ibex: {
    name: 'Alpine ibex', local: 'Steinbock', icon: '🐐', group: 'hoofed', inat: 42357, rhythm: 'ibex', detect: 0.95, heat: true,
    season: [0.85, 0.5, 0.55, 0.85, 1, 0.95, 0.75, 0.7, 0.65, 0.65, 0.75, 1],
    events: [
      { from: '12-01', to: '01-15', title: 'Ibex rut', text: 'The rut: big males clash their horns, herds gather on sunny slopes.' },
      { from: '04-01', to: '05-31', title: 'Ibex on the spring grass', text: 'Spring: ibex come down to the first green slopes, often close to paths and villages.' },
      { from: '06-01', to: '07-15', title: 'Ibex with kids', text: 'Kids born in late May and June follow their mothers.' },
    ],
    tips: 'Calm and often close: stay on the path and let them come. 200-500 mm. On hot days they graze early and late and doze on cool ridges at midday.',
  },
  chamois: {
    name: 'Chamois', local: 'Gämse', icon: '🐐', group: 'hoofed', inat: 42347, rhythm: 'crepuscular', detect: 0.8, heat: true,
    season: [0.6, 0.55, 0.55, 0.6, 0.8, 0.9, 0.75, 0.75, 0.75, 0.85, 1, 0.95],
    events: [
      { from: '11-01', to: '12-15', title: 'Chamois rut', text: 'The rut: bucks in dark winter coats chase each other across the slopes.' },
      { from: '05-15', to: '06-30', title: 'Chamois kids', text: 'Young chamois with their mothers.' },
    ],
    tips: 'Shyer than ibex: approach slowly, keep a ridge between you, and use 400 mm or more.',
  },
  reddeer: {
    name: 'Red deer', local: 'Rothirsch', icon: '🦌', group: 'hoofed', inat: 204113, rhythm: 'crepuscular', detect: 0.75,
    season: [0.5, 0.5, 0.45, 0.45, 0.5, 0.55, 0.55, 0.6, 1, 0.95, 0.5, 0.5],
    events: [
      { from: '09-10', to: '10-15', title: 'Red deer rut', text: 'The rut: stags roar at dawn and dusk and gather their hinds. Unforgettable to hear.' },
      { from: '02-15', to: '04-15', title: 'Stags shed their antlers', text: 'Stags drop their antlers and grow new ones in velvet.' },
    ],
    tips: 'Mostly at dawn and dusk on the edges of forest and meadow. During the rut, listen first: the roaring tells you where to look.',
  },
  roedeer: {
    name: 'Roe deer', local: 'Reh', icon: '🦌', group: 'hoofed', inat: 42184, rhythm: 'crepuscular', detect: 0.75,
    season: [0.6, 0.6, 0.65, 0.7, 0.8, 0.7, 1, 0.9, 0.6, 0.6, 0.6, 0.6],
    events: [
      { from: '07-15', to: '08-15', title: 'Roe deer rut', text: 'The rut: bucks chase does in circles through the meadows.' },
      { from: '05-01', to: '06-30', title: 'Roe deer fawns', text: 'Fawns lie hidden in tall grass: never touch one, the mother is close.' },
    ],
    tips: 'Field edges at first light. Winter groups in open fields are easy to find.',
  },
  marmot: {
    name: 'Alpine marmot', local: 'Murmeltier', icon: '🐾', group: 'small', inat: 46082, rhythm: 'marmot', detect: 0.95, heat: true, cold: true,
    season: [0, 0, 0, 0.3, 0.85, 0.95, 1, 0.95, 0.75, 0.25, 0, 0],
    events: [
      { from: '04-15', to: '05-20', title: 'Marmots wake up', text: 'Out of hibernation: thin marmots on the last snow.' },
      { from: '06-20', to: '08-15', title: 'Young marmots', text: 'The young leave the burrow and play in front of it.' },
      { from: '10-15', to: '04-14', title: 'Marmots hibernate', text: 'Hibernating until spring.' },
    ],
    tips: 'Out when the sun warms the burrows, back in when it gets hot or wet. Sit still near a burrow: they come back within minutes. Do not feed them.',
  },
  fox: {
    name: 'Red fox', local: 'Fuchs', icon: '🦊', group: 'small', inat: 42069, rhythm: 'crepuscular', detect: 0.55,
    season: [0.95, 0.85, 0.6, 0.7, 0.85, 0.85, 0.6, 0.55, 0.6, 0.7, 0.85, 0.95],
    events: [
      { from: '12-15', to: '02-28', title: 'Foxes in winter coat', text: 'Thick winter fur, mating season: foxes hunt mice in the snow, even by day.' },
      { from: '05-01', to: '06-30', title: 'Fox cubs', text: 'Cubs play outside the den: keep well away from it.' },
    ],
    tips: 'Snowy fields and meadow edges; watch for the high mouse-pounce.',
  },
  hare: {
    name: 'Mountain hare', local: 'Schneehase', icon: '🐇', group: 'small', inat: 55908, rhythm: 'crepuscular', detect: 0.35,
    season: [0.8, 0.8, 0.7, 0.5, 0.4, 0.4, 0.4, 0.4, 0.4, 0.5, 0.6, 0.8],
    events: [{ from: '11-15', to: '04-15', title: 'Mountain hares in white', text: 'White winter coat.' }],
    tips: 'Mostly at night; at dawn on snowy slopes near the tree line. Tracks first, hare second.',
  },
  beaver: {
    name: 'Beaver', local: 'Biber', icon: '🦫', group: 'small', inat: 43793, rhythm: 'beaver', detect: 0.45,
    season: [0.8, 0.8, 0.7, 0.6, 0.6, 0.6, 0.6, 0.6, 0.7, 0.8, 0.8, 0.8],
    events: [],
    tips: 'Rivers and ponds at dusk; sit downwind on the bank and wait. Easiest in winter, without leaves.',
  },
  squirrel: {
    name: 'Red squirrel', local: 'Eichhörnchen', icon: '🐿️', group: 'small', inat: 46001, rhythm: 'daytime', detect: 0.7,
    season: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.7, 1, 1, 0.9, 0.7],
    events: [{ from: '09-01', to: '11-15', title: 'Squirrels storing food', text: 'Busy hiding nuts and cones for the winter.' }],
    tips: 'Mornings in stone-pine and larch woods; ear tufts in winter.',
  },
  goldeneagle: {
    name: 'Golden eagle', local: 'Steinadler', icon: '🦅', group: 'bird', inat: 5074, rhythm: 'raptor', detect: 0.6,
    season: [0.7, 0.85, 0.9, 0.75, 0.7, 0.7, 0.7, 0.7, 0.75, 0.75, 0.7, 0.7],
    events: [{ from: '02-01', to: '03-31', title: 'Eagles display', text: 'Display flights: pairs dive and climb over their territory.' }],
    tips: 'Soars on thermals from late morning on sunny days; scan ridges with binoculars.',
  },
  beardedvulture: {
    name: 'Bearded vulture', local: 'Bartgeier', icon: '🦅', group: 'bird', inat: 5379, rhythm: 'raptor', detect: 0.5,
    season: [0.7, 0.7, 0.7, 0.75, 0.8, 0.85, 0.9, 0.9, 0.85, 0.8, 0.75, 0.7],
    events: [{ from: '07-01', to: '08-15', title: 'Young bearded vultures fly', text: 'Young birds leave the nest and practise flying.' }],
    tips: 'Huge, glides low along the slopes; Engadin, National Park and Valais.',
  },
  chough: {
    name: 'Alpine chough', local: 'Alpendohle', icon: '🐦', group: 'bird', inat: 8350, rhythm: 'daytime', detect: 0.9,
    season: [0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85],
    events: [],
    tips: 'Acrobatic flocks around summit stations, all year; great for birds in flight against the sky.',
  },
  blackgrouse: {
    name: 'Black grouse', local: 'Birkhuhn', icon: '🐦', group: 'bird', inat: 1289697, rhythm: 'lek', detect: 0.6,
    season: [0.15, 0.15, 0.4, 1, 0.95, 0.3, 0.2, 0.2, 0.2, 0.2, 0.15, 0.15],
    events: [{ from: '04-01', to: '05-31', title: 'Black grouse lek', text: 'At dawn the cocks display and bubble on open slopes near the tree line.' }],
    tips: 'Be in place before first light and stay put; never walk onto a lek. In winter they shelter in snow: never disturb them.',
  },
  ptarmigan: {
    name: 'Rock ptarmigan', local: 'Alpenschneehuhn', icon: '🐦', group: 'bird', inat: 949, rhythm: 'daytime', detect: 0.4,
    season: [0.7, 0.7, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.7, 0.7],
    events: [{ from: '11-01', to: '04-30', title: 'Ptarmigan in white', text: 'Snow-white winter plumage.' }],
    tips: 'High, rocky terrain; almost invisible until it moves. Calm days.',
  },
  nutcracker: {
    name: 'Nutcracker', local: 'Tannenhäher', icon: '🐦', group: 'bird', inat: 204552, rhythm: 'daytime', detect: 0.7,
    season: [0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.7, 0.9, 1, 0.9, 0.6, 0.5],
    events: [{ from: '08-15', to: '10-15', title: 'Nutcrackers harvesting', text: 'Harvesting and hiding stone-pine seeds: busy and easy to see.' }],
    tips: 'Stone-pine forests (Arve) near the tree line.',
  },
  waterbirds: {
    name: 'Waterbirds', local: 'Wasservögel', icon: '🦆', group: 'water', inat: 6912, rhythm: 'waterbird', detect: 0.92,
    season: [1, 1, 0.85, 0.6, 0.5, 0.45, 0.45, 0.5, 0.6, 0.75, 0.9, 1],
    events: [
      { from: '11-01', to: '03-15', title: 'Wintering waterbirds', text: 'Tens of thousands of ducks, grebes and geese from the north spend the winter on Swiss lakes.' },
      { from: '03-01', to: '04-30', title: 'Grebes courting', text: 'Great crested grebes perform their head-shaking courtship dance.' },
    ],
    tips: 'Low angle from the shore, soft morning light; a hide or the car works well.',
  },
  waders: {
    name: 'Waders on migration', local: 'Watvögel', icon: '🐦', group: 'water', inat: 3835, rhythm: 'wader', detect: 0.7,
    season: [0.2, 0.2, 0.4, 0.9, 1, 0.5, 0.6, 0.95, 0.9, 0.6, 0.3, 0.2],
    events: [
      { from: '04-01', to: '05-31', title: 'Spring migration', text: 'Waders and other migrants stop over on mudflats and wet meadows.' },
      { from: '08-01', to: '09-30', title: 'Autumn migration', text: 'Waders stop over on their way south, especially when water levels are low.' },
    ],
    tips: 'Mud and shallow water; mornings, from the observation hides.',
  },
  heron: {
    name: 'Grey heron', local: 'Graureiher', icon: '🐦', group: 'water', inat: 4954, rhythm: 'waterbird', detect: 0.85,
    season: [0.75, 0.75, 0.8, 0.8, 0.75, 0.7, 0.7, 0.7, 0.7, 0.7, 0.75, 0.75],
    events: [],
    tips: 'Patient hunter at the water\'s edge: wait for the strike.',
  },
  kingfisher: {
    name: 'Kingfisher', local: 'Eisvogel', icon: '🐦', group: 'water', inat: 2599, rhythm: 'waterbird', detect: 0.5,
    season: [0.85, 0.85, 0.75, 0.6, 0.6, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.85],
    events: [],
    tips: 'Slow rivers and quiet shores; find its favourite perch and wait. Easier to see in winter.',
  },
  stork: {
    name: 'White stork', local: 'Weissstorch', icon: '🐦', group: 'bird', inat: 4733, rhythm: 'daytime', detect: 0.95,
    season: [0, 0.3, 0.8, 0.95, 1, 1, 0.9, 0.6, 0.1, 0, 0, 0],
    events: [
      { from: '02-15', to: '03-31', title: 'Storks return', text: 'Storks come back from Africa and repair their nests, bill-clattering.' },
      { from: '05-15', to: '07-31', title: 'Stork chicks', text: 'Chicks in the nests, fed by both parents.' },
    ],
    tips: 'Nests on roofs and poles; morning and evening feeding flights to the fields.',
  },
  songbirds: {
    name: 'Songbirds', local: 'Singvögel', icon: '🐦', group: 'bird', inat: 7251, rhythm: 'songbird', detect: 0.75,
    season: [0.3, 0.3, 0.6, 0.95, 1, 0.9, 0.6, 0.5, 0.5, 0.4, 0.3, 0.3],
    events: [{ from: '04-01', to: '06-15', title: 'Dawn chorus', text: 'Breeding season: birds sing from exposed perches at first light.' }],
    tips: 'The first two hours after sunrise; reed beds and hedges.',
  },
  park: {
    name: 'Animals in the park', local: 'Tierpark', icon: '🦌', group: 'park', inat: null, rhythm: 'park', detect: 0.95,
    season: [0.8, 0.8, 0.8, 0.85, 0.9, 0.9, 0.85, 0.85, 0.9, 0.95, 0.85, 0.8],
    events: [],
    tips: 'Sure sightings in large natural enclosures: practise focus, eyes and fur detail. Say so when you share the pictures.',
  },
};

// The quiet rules (Swiss law and good practice)
export const ETHICS = [
  'Wildlife rest zones (Wildruhezonen) are closed or restricted in winter: animals that flee through deep snow can starve. Check the map layer.',
  'In federal game reserves and the Swiss National Park, stay on marked paths; no dogs.',
  'Never use calls, bait or drones near wildlife; do not follow animals that move away.',
  'Fawns and young birds are not abandoned: keep away and leave quickly.',
  'Black grouse and ptarmigan in winter: do not ski or walk through their resting areas.',
];

const md = (s) => s.split('-').map(Number);
// the special moments of a species on a given date ({ m, d })
export function eventsOn(species, m, d) {
  const v = m * 100 + d;
  return (SPECIES[species]?.events || []).filter((e) => {
    const [fm, fd] = md(e.from), [tm, td] = md(e.to), a = fm * 100 + fd, b = tm * 100 + td;
    return a <= b ? v >= a && v <= b : v >= a || v <= b;
  });
}
