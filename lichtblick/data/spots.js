// Curated landscape spots. Photos are from Wikimedia Commons (see each photo's author and licence);
// lat/lon is where the photographer stood when the camera recorded it, otherwise the classic viewpoint.
// tags drive the opportunity detectors (see scoring.js); months = [from, to] when the place is normally reachable;
// species = wildlife to look for there (see species.js and wildlife.js).
export const SPOTS = [
 {
  "id": "seealpsee",
  "name": "Seealpsee",
  "region": "Appenzell Alps (AI)",
  "lat": 47.2689,
  "lon": 9.4,
  "photos": [
   {
    "file": "Picswiss AI-08-03.jpg",
    "author": "Roland Zumbühl",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.497
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "mist",
   "beech",
   "snow"
  ],
  "months": null,
  "blurb": "Small lake below the Alpstein cliffs. Still mornings give a full mirror; autumn mist hangs over the water.",
  "access": "About 1 h on foot from Wasserauen (train). Winter path usually open, check conditions.",
  "elev": 1142
 },
 {
  "id": "oeschinensee",
  "name": "Oeschinensee",
  "region": "Kandersteg (BE)",
  "lat": 46.5044,
  "lon": 7.7208,
  "heading": 135,
  "photos": [
   {
    "file": "20190725 Oeschinensee-Panorama, Kandersteg (06540-42 stitch).jpg",
    "author": "Günter Seggebäing, Coesfeld",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.868
   },
   {
    "file": "036 Milky Way during Perseids seen from Oeschinensee with water reflections Photo by Giles Laurent.jpg",
    "author": "Giles Laurent",
    "license": "CC BY-SA 4.0",
    "night": true,
    "ratio": 0.547
   }
  ],
  "tags": [
   "lake",
   "peaks",
   "reflection",
   "darksky",
   "frozen",
   "snow",
   "larch"
  ],
  "months": null,
  "blurb": "Turquoise lake under the Blüemlisalp walls. The view from the Heuberg trail above the lake is the classic; at night the Milky Way rises over the water.",
  "access": "Gondola from Kandersteg, then 20 min. In midwinter the lake freezes and is used for skating.",
  "elev": 1940
 },
 {
  "id": "bachalpsee",
  "name": "Bachalpsee",
  "region": "Grindelwald First (BE)",
  "lat": 46.668,
  "lon": 8.0225,
  "photos": [
   {
    "file": "Grindelwald Bachalpsee.jpg",
    "author": "Roland Zumbühl",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.502
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "sunrise",
   "darksky",
   "snow",
   "frozen"
  ],
  "months": null,
  "blurb": "Mirror lake facing the Schreckhorn and Finsteraarhorn. Best at dawn when the wind is still asleep.",
  "access": "About 50 min walk from the First gondola top station. Winter hiking trail in the cold season.",
  "elev": 2268
 },
 {
  "id": "riffelsee",
  "name": "Riffelsee",
  "region": "Zermatt (VS)",
  "lat": 45.98325,
  "lon": 7.76291,
  "heading": 270,
  "photos": [
   {
    "file": "Riffelsee.JPG",
    "author": "H. Zell",
    "license": "CC BY 3.0",
    "night": false,
    "ratio": 1.333
   },
   {
    "file": "Matterhorn and the milky way galaxy at night reflected in the Riffelsee.jpg",
    "author": "Deralpinbergsteiger",
    "license": "CC BY-SA 4.0",
    "night": true,
    "ratio": 0.667
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "sunrise",
   "darksky",
   "alpenglow"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "The Matterhorn upside down. Sunrise turns the peak pink while the lake is usually still calm.",
  "access": "Gornergrat railway to Rotenboden, then 5 min down. First train is too late for sunrise in summer: stay at Riffelhaus or hike up.",
  "elev": 2759
 },
 {
  "id": "stellisee",
  "name": "Stellisee",
  "region": "Zermatt (VS)",
  "lat": 46.01376,
  "lon": 7.80165,
  "photos": [
   {
    "file": "Stellisee.jpg",
    "author": "Mumpitz312",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.333
   },
   {
    "file": "008 Milky way aligned with the Matterhorn reflecting in Stellisee Photo by Giles Laurent.jpg",
    "author": "Giles Laurent",
    "license": "CC BY-SA 4.0",
    "night": true,
    "ratio": 0.511
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "sunrise",
   "darksky",
   "alpenglow"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Wide mirror with the Matterhorn on the horizon; one of the darkest easy-to-reach skies near Zermatt.",
  "access": "Sunnegga-Blauherd lifts, then 15 min walk. Out of lift hours: about 2.5 h from Zermatt.",
  "elev": 2538
 },
 {
  "id": "lauterbrunnen",
  "name": "Lauterbrunnen & Staubbach Falls",
  "region": "Bernese Oberland (BE)",
  "lat": 46.5945,
  "lon": 7.9075,
  "photos": [
   {
    "file": "Lauterbrunnen Staubbach.jpg",
    "author": "Adrian Michael",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 0.784
   }
  ],
  "tags": [
   "waterfall",
   "valley",
   "peaks",
   "darksky",
   "mist",
   "snow"
  ],
  "months": null,
  "blurb": "A 300 m waterfall falling off a sheer wall. Strongest after rain and in early summer snow-melt; valley fog in autumn.",
  "access": "Train to Lauterbrunnen, the falls are a few minutes from the station.",
  "elev": 811
 },
 {
  "id": "iseltwald",
  "name": "Iseltwald jetty",
  "region": "Lake Brienz (BE)",
  "lat": 46.7125,
  "lon": 7.9629,
  "heading": 146,
  "photos": [
   {
    "file": "5506 - Iseltwald - Brienzersee.JPG",
    "author": "Andrew Bossi",
    "license": "CC BY-SA 2.5",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "mist",
   "beech",
   "lowland"
  ],
  "months": null,
  "blurb": "Turquoise Lake Brienz with a little jetty. Calm, misty autumn mornings are the magic moment.",
  "access": "Bus from Interlaken Ost. The jetty can charge a small entrance fee.",
  "elev": 564
 },
 {
  "id": "merligen",
  "name": "Niesen from Merligen",
  "region": "Lake Thun (BE)",
  "lat": 46.69644,
  "lon": 7.73741,
  "photos": [
   {
    "file": "Mountain Niesen - View from Merligen Thunersee.jpg",
    "author": "Marco Ghinolfi",
    "license": "CC0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "sunrise",
   "lightning",
   "mist",
   "lowland"
  ],
  "months": null,
  "blurb": "The perfect pyramid of the Niesen across Lake Thun. Still water doubles it; summer storms over the lake are spectacular from here.",
  "access": "Bus from Thun to Merligen, shore path.",
  "elev": 562
 },
 {
  "id": "lavaux",
  "name": "Lavaux vineyards",
  "region": "Lake Geneva (VD)",
  "lat": 46.4772,
  "lon": 6.7768,
  "photos": [
   {
    "file": "Lavaux Switzerland.jpg",
    "author": "Lorenz Poffet",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.778
   }
  ],
  "tags": [
   "vineyard",
   "lake",
   "sunset",
   "lightning",
   "mist",
   "lowland"
  ],
  "months": null,
  "blurb": "Terraced vineyards over Lake Geneva (UNESCO). The vines turn gold in late October; sunsets over the lake all year.",
  "access": "Train to Chexbres or Epesses, walk the vineyard paths.",
  "elev": 460
 },
 {
  "id": "chillon",
  "name": "Château de Chillon",
  "region": "Montreux (VD)",
  "lat": 46.4178,
  "lon": 6.9275,
  "heading": 180,
  "photos": [
   {
    "file": "Castle of Chillon N.jpg",
    "author": "Zacharie Grossen",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.335
   }
  ],
  "tags": [
   "lake",
   "castle",
   "reflection",
   "sunset",
   "bluehour",
   "peaks",
   "lowland"
  ],
  "months": null,
  "blurb": "Lake castle with the snowy Dents du Midi behind. Lit up at blue hour; flat water gives a reflection.",
  "access": "Bus or 45 min walk along the shore from Montreux.",
  "elev": 373
 },
 {
  "id": "creuxduvan",
  "name": "Creux du Van",
  "region": "Jura (NE)",
  "lat": 46.9333,
  "lon": 6.737,
  "photos": [
   {
    "file": "Creux du Van.jpg",
    "author": "Dake",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.502
   }
  ],
  "tags": [
   "fogsea",
   "cliff",
   "sunrise",
   "sunset",
   "beech",
   "hoarfrost",
   "snow",
   "darksky"
  ],
  "months": null,
  "blurb": "A 160 m rock amphitheatre. Its rim often sits just above the sea of fog over the lakes; ibex graze on the edge.",
  "access": "Hike about 1.5 h from Noiraigue or 30 min from the Ferme du Soliat car park (road closed in winter).",
  "elev": 1401,
  "species": [
   "ibex",
   "chamois"
  ]
 },
 {
  "id": "silsersee",
  "name": "Lake Sils",
  "region": "Upper Engadin (GR)",
  "lat": 46.43,
  "lon": 9.748,
  "photos": [
   {
    "file": "Silsersee.jpg",
    "author": "Julo",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.502
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "larch",
   "frozen",
   "snow",
   "darksky",
   "peaks"
  ],
  "months": null,
  "blurb": "Large high lake framed by larches. Golden in the second half of October; frozen and snow-covered in winter.",
  "access": "Bus to Sils Maria; shore paths and the Chastè peninsula.",
  "elev": 1796
 },
 {
  "id": "palpuogna",
  "name": "Lai da Palpuogna",
  "region": "Albula Pass (GR)",
  "lat": 46.58139,
  "lon": 9.78556,
  "photos": [
   {
    "file": "Palpuognasee rb1.jpg",
    "author": "Reto Barblan",
    "license": "CC BY-SA 2.5",
    "night": false,
    "ratio": 1.584
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "larch",
   "snow",
   "peaks"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Small lake ringed by larches, often voted the prettiest place in Switzerland. Peak gold mid to late October.",
  "access": "Albula pass road above Preda (closed in winter), or 30 min walk from Preda station.",
  "elev": 1918
 },
 {
  "id": "saoseo",
  "name": "Lagh da Saoseo",
  "region": "Val da Camp, Poschiavo (GR)",
  "lat": 46.3985,
  "lon": 10.1265,
  "photos": [
   {
    "file": "Saoseo.jpg",
    "author": "Poschi",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.399
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "larch",
   "peaks"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Deep blue lake with pine islands. Calm mornings for the reflection, larches in October.",
  "access": "Bus to Sfazù, then about 1.5 h on foot (summer minibus to Alp Camp).",
  "elev": 2029
 },
 {
  "id": "aletsch",
  "name": "Aletsch Glacier (Moosfluh)",
  "region": "Riederalp (VS)",
  "lat": 46.42,
  "lon": 8.045,
  "photos": [
   {
    "file": "Glacier d'Aletsch - 2021.jpg",
    "author": "Christian David",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "glacier",
   "larch",
   "peaks",
   "darksky",
   "snow"
  ],
  "months": null,
  "blurb": "The longest glacier in the Alps curving below you. The Aletsch forest larches glow in October.",
  "access": "Riederalp or Bettmeralp, then gondola to Moosfluh.",
  "elev": 2297,
  "species": [
   "chamois",
   "nutcracker"
  ]
 },
 {
  "id": "lavertezzo",
  "name": "Ponte dei Salti",
  "region": "Verzasca Valley (TI)",
  "lat": 46.25794,
  "lon": 8.83941,
  "photos": [
   {
    "file": "Ponte dei Salti, Lavertezzo.jpg",
    "author": "Peter Sieling",
    "license": "CC BY 2.0",
    "night": false,
    "ratio": 1.358
   }
  ],
  "tags": [
   "river",
   "bridge",
   "chestnut",
   "mist"
  ],
  "months": null,
  "blurb": "Double-arched stone bridge over emerald water. Soft light early, chestnut colours in November.",
  "access": "Bus from Tenero/Locarno to Lavertezzo. Busy midday in summer.",
  "elev": 529
 },
 {
  "id": "caumasee",
  "name": "Caumasee",
  "region": "Flims (GR)",
  "lat": 46.821,
  "lon": 9.2925,
  "photos": [
   {
    "file": "Caumasee Sommer08.jpg",
    "author": "Adrian Michael",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "lake",
   "larch",
   "beech",
   "snow"
  ],
  "months": null,
  "blurb": "Turquoise forest lake, brightest under a high midday sun; autumn colours around it in October.",
  "access": "20 min walk from Flims Waldhaus (or the lake lift in summer).",
  "elev": 1004
 },
 {
  "id": "gelmersee",
  "name": "Gelmersee",
  "region": "Grimsel (BE)",
  "lat": 46.6135,
  "lon": 8.329,
  "photos": [
   {
    "file": "Gelmersee1.jpg",
    "author": "Silsbas",
    "license": "Public domain",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "darksky"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Wild granite reservoir reached by one of the steepest funiculars in Europe.",
  "access": "Gelmerbahn from Handegg (summer), or a steep hike.",
  "elev": 1859
 },
 {
  "id": "grimsel",
  "name": "Grimsel Pass (Totensee)",
  "region": "Grimsel (BE/VS)",
  "lat": 46.5612,
  "lon": 8.3383,
  "photos": [
   {
    "file": "VS-65-06.jpg",
    "author": "Wikimedia Commons contributor",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.511
   }
  ],
  "tags": [
   "lake",
   "darksky",
   "peaks",
   "snow",
   "reflection"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "High pass with dark skies and lakes, a favourite for the Milky Way over granite.",
  "access": "Pass road, open roughly June to October. Bus in summer.",
  "elev": 2160
 },
 {
  "id": "landwasser",
  "name": "Landwasser Viaduct",
  "region": "Filisur (GR)",
  "lat": 46.6815,
  "lon": 9.674,
  "photos": [
   {
    "file": "G 4-5 107 Albula Landwasser normal.jpg",
    "author": "SchmalspurDVZO",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.505
   }
  ],
  "tags": [
   "bridge",
   "railway",
   "larch",
   "snow",
   "mist"
  ],
  "months": null,
  "blurb": "The curved Rhaetian Railway viaduct running straight into a tunnel. Larches in autumn, snow in winter.",
  "access": "Viewing platform on the signposted trail from Filisur station (about 25 min).",
  "elev": 1097
 },
 {
  "id": "rheinfall",
  "name": "Rhine Falls",
  "region": "Neuhausen (SH)",
  "lat": 47.678,
  "lon": 8.613,
  "photos": [
   {
    "file": "Chutes du Rhin - Octobre 2021.jpg",
    "author": "Christian David",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.778
   }
  ],
  "tags": [
   "waterfall",
   "beech",
   "bluehour",
   "lowland",
   "mist"
  ],
  "months": null,
  "blurb": "Europe's most powerful waterfall. Highest flow in early summer and after heavy rain.",
  "access": "Train to Neuhausen Rheinfall or Schloss Laufen am Rheinfall.",
  "elev": 359
 },
 {
  "id": "blausee",
  "name": "Blausee",
  "region": "Kandertal (BE)",
  "lat": 46.5325,
  "lon": 7.6647,
  "photos": [
   {
    "file": "Blausee.jpg",
    "author": "Roland Zumbühl",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 0.678
   }
  ],
  "tags": [
   "lake",
   "beech",
   "snow",
   "mist",
   "reflection"
  ],
  "months": null,
  "blurb": "Tiny crystal-clear blue lake in a forest of boulders. Snowy mornings and autumn leaves are the best moments.",
  "access": "Bus stop Blausee. Entrance fee to the nature park.",
  "elev": 887
 },
 {
  "id": "arnisee",
  "name": "Arnisee",
  "region": "Uri (UR)",
  "lat": 46.77278,
  "lon": 8.64139,
  "heading": 112,
  "photos": [
   {
    "file": "Arnisee Lake.JPG",
    "author": "Simon Koopmann",
    "license": "CC BY-SA 2.5",
    "night": false,
    "ratio": 1.399
   }
  ],
  "tags": [
   "lake",
   "peaks",
   "larch",
   "beech",
   "fogsea",
   "reflection"
  ],
  "months": null,
  "blurb": "Lake on a balcony above the Reuss valley, facing the Uri Alps. Valley fog below, colours in October.",
  "access": "Cable car from Amsteg or Intschi.",
  "elev": 1393
 },
 {
  "id": "luzern",
  "name": "Chapel Bridge, Lucerne",
  "region": "Lucerne (LU)",
  "lat": 47.05192,
  "lon": 8.30894,
  "photos": [
   {
    "file": "Luzern asv2022-10 Kapellbrücke img3.jpg",
    "author": "A.Savin",
    "license": "Free Art License",
    "night": false,
    "ratio": 1.778
   }
  ],
  "tags": [
   "city",
   "bridge",
   "bluehour",
   "mist",
   "lightning",
   "lowland"
  ],
  "months": null,
  "blurb": "The wooden bridge and water tower. Blue hour with the lights on, foggy mornings, storms over the lake.",
  "access": "5 min from Lucerne station.",
  "elev": 434
 },
 {
  "id": "faelensee",
  "name": "Fälensee",
  "region": "Alpstein (AI)",
  "lat": 47.252,
  "lon": 9.415,
  "photos": [
   {
    "file": "Fälensee, Alpstein, Schweiz - 20070519.jpg",
    "author": "Wiechert",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Fjord-like lake squeezed between limestone walls. Still mornings give a perfect reflection.",
  "access": "About 2.5 h hike from Brülisau/Hoher Kasten.",
  "elev": 1503
 },
 {
  "id": "moiry",
  "name": "Lac de Moiry",
  "region": "Val d'Anniviers (VS)",
  "lat": 46.14299,
  "lon": 7.56054,
  "heading": 157,
  "photos": [
   {
    "file": "Barrage de Moiry.jpg",
    "author": "Christian David",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "lake",
   "glacier",
   "peaks",
   "darksky"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Milky-turquoise reservoir with the Moiry glacier at the end. Very dark skies.",
  "access": "Road from Grimentz (summer), bus to the dam.",
  "elev": 2610
 },
 {
  "id": "lacbleu",
  "name": "Lac Bleu (Arolla)",
  "region": "Val d'Hérens (VS)",
  "lat": 46.0507,
  "lon": 7.4794,
  "heading": 105,
  "photos": [
   {
    "file": "LacBleu.jpg",
    "author": "Oscar",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 0.75
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "larch",
   "darksky"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Small clear lake among larches and stone pines with a waterfall behind.",
  "access": "About 45 min from La Gouille (bus from Sion).",
  "elev": 2106
 },
 {
  "id": "truebsee",
  "name": "Trübsee",
  "region": "Engelberg (OW)",
  "lat": 46.79133,
  "lon": 8.3933,
  "photos": [
   {
    "file": "Trübsee - with reflections (1030459406).jpg",
    "author": "Angrod",
    "license": "CC BY 2.0",
    "night": false,
    "ratio": 1.493
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "snow",
   "darksky"
  ],
  "months": null,
  "blurb": "Lake under the Titlis. Mirror in summer, snowfield in winter; reachable by gondola all year.",
  "access": "Gondola from Engelberg to Trübsee.",
  "elev": 1764
 },
 {
  "id": "susten",
  "name": "Susten Pass (Steinsee)",
  "region": "Susten (BE)",
  "lat": 46.72365,
  "lon": 8.43346,
  "photos": [
   {
    "file": "Am Sustenpass.jpg",
    "author": "Uwelino",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "lake",
   "glacier",
   "peaks",
   "darksky",
   "reflection"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Glacier lake with the Stein glacier; very dark and quiet at night.",
  "access": "Susten pass road, open roughly June to October.",
  "elev": 1932
 },
 {
  "id": "sihlsee",
  "name": "Sihlsee",
  "region": "Einsiedeln (SZ)",
  "lat": 47.13,
  "lon": 8.77,
  "photos": [
   {
    "file": "Sihlsee Fluebrig.jpg",
    "author": "Markus Bernet",
    "license": "CC BY-SA 2.5",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "lake",
   "mist",
   "frozen",
   "hoarfrost",
   "reflection",
   "snow",
   "lowland"
  ],
  "months": null,
  "blurb": "Wide, shallow lake at 890 m: frost, hoarfrost and fog in winter, and it freezes in cold spells.",
  "access": "Train to Einsiedeln, then bus to Willerzell or Euthal.",
  "elev": 892,
  "species": [
   "waterbirds",
   "heron"
  ]
 },
 {
  "id": "cavloc",
  "name": "Lägh da Cavloc",
  "region": "Maloja (GR)",
  "lat": 46.38,
  "lon": 9.705,
  "photos": [
   {
    "file": "Cavloc.jpg",
    "author": "Earth explorer",
    "license": "Public domain",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "larch",
   "peaks"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Quiet lake with Piz Forno behind, framed by larches.",
  "access": "About 1 h walk from Maloja.",
  "elev": 1907
 },
 {
  "id": "engstlensee",
  "name": "Engstlensee",
  "region": "Engstlenalp (BE)",
  "lat": 46.7735,
  "lon": 8.355,
  "photos": [
   {
    "file": "Engstlensee.jpg",
    "author": "Roland Zumbuehl",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "beech"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Alpine lake mirroring the Wendenstöcke; calm mornings and autumn colour.",
  "access": "Road from Innertkirchen (summer), or gondola via Melchsee-Frutt and a hike.",
  "elev": 1850
 },
 {
  "id": "salanfe",
  "name": "Lac de Salanfe",
  "region": "Dents du Midi (VS)",
  "lat": 46.145,
  "lon": 6.96,
  "photos": [
   {
    "file": "Lac de Salanfe.jpg",
    "author": "Atamari",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.493
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "darksky"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "High reservoir under the Dents du Midi and Tour Sallière. Dark skies, hut nearby.",
  "access": "About 2 h hike from Van d'en Haut.",
  "elev": 1908
 },
 {
  "id": "diavolezza",
  "name": "Diavolezza",
  "region": "Bernina (GR)",
  "lat": 46.4106,
  "lon": 9.9671,
  "photos": [
   {
    "file": "Morteratschgletscher 2007.jpg",
    "author": "Andreas Handschin",
    "license": "CC BY-SA 2.0",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "glacier",
   "peaks",
   "darksky",
   "sunrise",
   "alpenglow",
   "snow"
  ],
  "months": null,
  "blurb": "At almost 3000 m, facing Piz Palü and Bernina. Alpenglow at sunrise and a superb dark sky.",
  "access": "Cable car from Bernina Diavolezza station (all year). Stay at the Berghaus for night shots.",
  "elev": 2959
 },
 {
  "id": "golzernsee",
  "name": "Golzernsee",
  "region": "Maderanertal (UR)",
  "lat": 46.776,
  "lon": 8.74,
  "photos": [
   {
    "file": "Golzern.jpg",
    "author": "BraunW",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "peaks",
   "beech",
   "larch"
  ],
  "months": [
   5,
   10
  ],
  "blurb": "Green-blue lake in a hanging valley under the Bristen.",
  "access": "Cable car Bristen-Golzern, then 20 min.",
  "elev": 1411
 },
 {
  "id": "fuorcla",
  "name": "Fuorcla Surlej",
  "region": "Upper Engadin (GR)",
  "lat": 46.4291,
  "lon": 9.8398,
  "photos": [
   {
    "file": "Piz en Vadret Roseg vanaf Fuorcla Surlej.jpg",
    "author": "Tinelot Wittermans",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "peaks",
   "glacier",
   "alpenglow",
   "darksky",
   "lake"
  ],
  "months": [
   7,
   9
  ],
  "blurb": "Pass facing Piz Roseg and Piz Bernina head-on: alpenglow and a small reflecting lake.",
  "access": "Corvatsch cable car to Murtèl, then about 45 min.",
  "elev": 2755
 },
 {
  "id": "maerjelensee",
  "name": "Märjelensee",
  "region": "Aletsch (VS)",
  "lat": 46.4408,
  "lon": 8.092,
  "photos": [
   {
    "file": "Aletschgletscher Märjelensee.jpg",
    "author": "Saperaud",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.502
   }
  ],
  "tags": [
   "lake",
   "glacier",
   "darksky",
   "peaks"
  ],
  "months": [
   7,
   9
  ],
  "blurb": "Glacier lake at the edge of the Aletsch, far from any lights.",
  "access": "About 1.5 h from Fiescheralp through the Tälli tunnel.",
  "elev": 2301
 },
 {
  "id": "lauenensee",
  "name": "Lauenensee",
  "region": "Gstaad (BE)",
  "lat": 46.3943,
  "lon": 7.3323,
  "photos": [
   {
    "file": "Lauenensee-2008-06-21-a.jpg",
    "author": "Zumbo",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.311
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "mist",
   "beech",
   "peaks"
  ],
  "months": [
   5,
   11
  ],
  "blurb": "Moor lake with reeds and the Spitzhorn behind; misty mornings and autumn colour.",
  "access": "Bus from Gstaad to Lauenensee (summer).",
  "elev": 1380
 },
 {
  "id": "rigi",
  "name": "Rigi Kulm",
  "region": "Central Switzerland (SZ)",
  "lat": 47.0567,
  "lon": 8.4853,
  "photos": [
   {
    "file": "Rigi Kulm Feb 2012 Nebelmeer.jpg",
    "author": "Gestumblindi",
    "license": "CC BY 3.0",
    "night": false,
    "ratio": 1.5
   },
   {
    "file": "Nebelmeer und Pilatus.jpg",
    "author": "JoachimKohler-HB",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "fogsea",
   "sunrise",
   "sunset",
   "alpenglow",
   "peaks",
   "hoarfrost",
   "snow"
  ],
  "months": null,
  "blurb": "The \"queen of the mountains\" between three lakes. When the lowlands are under fog, you stand on an island in a white sea.",
  "access": "Cogwheel railway from Vitznau or Arth-Goldau, or cable car from Weggis.",
  "elev": 1797
 },
 {
  "id": "uetliberg",
  "name": "Uetliberg",
  "region": "Zürich (ZH)",
  "lat": 47.3494,
  "lon": 8.4914,
  "photos": [
   {
    "file": "Nebelmeer-Uetliberg.jpg",
    "author": "trigaranus",
    "license": "Public domain",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "fogsea",
   "sunset",
   "city",
   "lightning",
   "hoarfrost"
  ],
  "months": null,
  "blurb": "Zürich's hill. When the fog top is below about 850 m, the tower sticks out above a sea of fog.",
  "access": "S10 train from Zürich HB to Uetliberg, 10 min walk.",
  "elev": 864
 },
 {
  "id": "weissenstein",
  "name": "Weissenstein",
  "region": "Jura (SO)",
  "lat": 47.252,
  "lon": 7.50961,
  "photos": [
   {
    "file": "Weissenstein, Schweiz, Nebelmeer - panoramio.jpg",
    "author": "bttwil",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 0.75
   }
  ],
  "tags": [
   "fogsea",
   "sunrise",
   "sunset",
   "peaks",
   "hoarfrost",
   "snow"
  ],
  "months": null,
  "blurb": "Jura ridge with the whole Alpine chain across the fog-filled Mittelland.",
  "access": "Gondola from Oberdorf (SO).",
  "elev": 1284
 },
 {
  "id": "gornergrat",
  "name": "Gornergrat",
  "region": "Zermatt (VS)",
  "lat": 45.98244,
  "lon": 7.77889,
  "photos": [
   {
    "file": "Matterhorn and Riffelhorn as seen from Gornergrat, Wallis, Switzerland, 2012 August.jpg",
    "author": "Ximonic (Simo Räsänen)",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.144
   }
  ],
  "tags": [
   "peaks",
   "glacier",
   "darksky",
   "sunrise",
   "alpenglow",
   "snow"
  ],
  "months": null,
  "blurb": "3089 m balcony with the Matterhorn and 29 four-thousanders. Kulmhotel guests can shoot the night sky.",
  "access": "Gornergrat railway from Zermatt, all year.",
  "elev": 3024,
  "species": [
   "ibex",
   "chough"
  ]
 },
 {
  "id": "montebre",
  "name": "Monte Brè",
  "region": "Lugano (TI)",
  "lat": 46.009,
  "lon": 8.9875,
  "photos": [
   {
    "file": "Lugano from Monte Bre.jpg",
    "author": "Mchernyavska",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.778
   }
  ],
  "tags": [
   "lake",
   "city",
   "lightning",
   "sunset",
   "bluehour"
  ],
  "months": null,
  "blurb": "High above Lake Lugano. In summer, thunderstorms roll over the lake at night: a front-row seat for lightning.",
  "access": "Funicular from Lugano-Cassarate.",
  "elev": 928
 },
 {
  "id": "lagobianco",
  "name": "Lago Bianco (Bernina)",
  "region": "Bernina Pass (GR)",
  "lat": 46.411,
  "lon": 10.023,
  "photos": [
   {
    "file": "Lago Bianco - Bernina.jpg",
    "author": "Lorenzoclerici84",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "lake",
   "frozen",
   "snow",
   "darksky",
   "peaks"
  ],
  "months": null,
  "blurb": "Pass lake at 2234 m, frozen and snow-covered from about December to May. Bernina express trains run along it.",
  "access": "Train to Ospizio Bernina, all year.",
  "elev": 2304
 },
 {
  "id": "bluemlisalp",
  "name": "Blüemlisalp hut",
  "region": "Kandersteg (BE)",
  "lat": 46.5099,
  "lon": 7.7718,
  "photos": [
   {
    "file": "Blümlisalphütte and the Milky Way.jpg",
    "author": "Deralpinbergsteiger",
    "license": "CC BY-SA 4.0",
    "night": true,
    "ratio": 1.5
   }
  ],
  "tags": [
   "darksky",
   "peaks",
   "glacier"
  ],
  "months": [
   7,
   9
  ],
  "blurb": "Mountain hut at 2840 m above Oeschinensee: glaciers, no lights, Milky Way overhead.",
  "access": "About 4 h from Oeschinensee over the Hohtürli. Book the hut.",
  "elev": 2842
 },
 {
  "id": "lejdastaz",
  "name": "Lej da Staz",
  "region": "St. Moritz (GR)",
  "lat": 46.49687,
  "lon": 9.87139,
  "photos": [
   {
    "file": "Lej da Staz 2021.jpg",
    "author": "Tiia Monto",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 2.394
   }
  ],
  "tags": [
   "lake",
   "reflection",
   "larch",
   "frozen",
   "snow",
   "darksky"
  ],
  "months": null,
  "blurb": "Moor lake in a larch and pine forest between St. Moritz and Pontresina.",
  "access": "30 min walk from St. Moritz Bad or Pontresina.",
  "elev": 1814
 },
 {
  "id": "gurnigel",
  "name": "Gurnigel (Gantrisch)",
  "region": "Gantrisch Nature Park (BE)",
  "lat": 46.7334,
  "lon": 7.4528,
  "photos": [
   {
    "file": "Gurnigel001.jpg",
    "author": "Fred",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "darksky",
   "fogsea",
   "beech",
   "snow",
   "hoarfrost"
  ],
  "months": null,
  "blurb": "The Gantrisch park works to keep its night dark; close to Bern yet one of the darkest skies on the north side of the Alps. Often above the fog.",
  "access": "Bus from Thurnen/Schwarzenburg to Gurnigel Berghaus.",
  "elev": 1594
 },
 {
  "id": "augstmatthorn",
  "name": "Augstmatthorn",
  "region": "Harder ridge, Lake Brienz (BE)",
  "lat": 46.74225,
  "lon": 7.92861,
  "photos": [
   {
    "file": "Steinbock auf dem Augstmatthorn.jpg",
    "author": "Kathrin Eggä",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.5
   },
   {
    "file": "Augstmatthorn ibex.jpg",
    "author": "Ostaehli",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 0.668
   }
  ],
  "tags": [
   "wildlife",
   "peaks",
   "fogsea",
   "sunrise",
   "alpenglow"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Grassy ridge between Lake Brienz and the Hohgant with a large ibex colony that grazes right beside the trail. Sunrise over the Bernese Alps and the lakes as a bonus.",
  "access": "From Harder Kulm (funicular from Interlaken) about 3 h along the exposed ridge, or about 1.5 h from Lombachalp above Habkern. Only for sure-footed hikers.",
  "species": [
   "ibex",
   "chamois",
   "goldeneagle",
   "chough"
  ],
  "elev": 2136
 },
 {
  "id": "niederhorn",
  "name": "Niederhorn",
  "region": "Beatenberg, Lake Thun (BE)",
  "lat": 46.71026,
  "lon": 7.77426,
  "photos": [
   {
    "file": "Steinbock Niederhorn.jpg",
    "author": "Ostaehli",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.498
   }
  ],
  "tags": [
   "wildlife",
   "peaks",
   "fogsea",
   "sunset",
   "lake"
  ],
  "months": null,
  "blurb": "Ibex graze a few minutes from the gondola top station, especially early and late in the day, with Lake Thun and the Alps behind them.",
  "access": "Gondola from Beatenberg. Stay on the paths along the ridge.",
  "species": [
   "ibex",
   "chamois",
   "chough",
   "goldeneagle"
  ],
  "elev": 1934
 },
 {
  "id": "pilatus",
  "name": "Pilatus",
  "region": "Lucerne (LU/OW/NW)",
  "lat": 46.97948,
  "lon": 8.25562,
  "photos": [
   {
    "file": "Steinbock am Pilatus.jpg",
    "author": "House2022",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 0.75
   }
  ],
  "tags": [
   "wildlife",
   "peaks",
   "fogsea",
   "sunset",
   "sunrise"
  ],
  "months": null,
  "blurb": "Ibex on the grassy slopes towards the Tomlishorn and flocks of alpine choughs around the summit terraces; often above the sea of fog.",
  "access": "Cable car from Kriens all year, cogwheel railway from Alpnachstad in summer. Hotel on top for sunrise.",
  "species": [
   "ibex",
   "chamois",
   "chough"
  ],
  "elev": 2065
 },
 {
  "id": "pontresina",
  "name": "Pontresina & Alp Languard",
  "region": "Upper Engadin (GR)",
  "lat": 46.4878,
  "lon": 9.92308,
  "photos": [
   {
    "file": "Alp Languard 2021.jpg",
    "author": "Tiia Monto",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.69
   }
  ],
  "tags": [
   "wildlife",
   "peaks",
   "larch",
   "darksky"
  ],
  "months": null,
  "blurb": "Home of the large Piz Albris ibex colony. In April and May the ibex come down to the green slopes just above the village; in summer marmots and ibex around Alp Languard.",
  "access": "Train to Pontresina; chair lift or about 1 h on foot to Alp Languard.",
  "species": [
   "ibex",
   "chamois",
   "marmot",
   "beardedvulture",
   "goldeneagle",
   "nutcracker"
  ],
  "elev": 2339
 },
 {
  "id": "trupchun",
  "name": "Val Trupchun",
  "region": "Swiss National Park (GR)",
  "lat": 46.59543,
  "lon": 10.07732,
  "photos": [
   {
    "file": "Bergtocht van Prasüras, door het Val Trupchun naar Alp Purcher 18-09-2019. (actm.) 07.jpg",
    "author": "Agnes Monkelbaan",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.566
   },
   {
    "file": "Deer Swiss National Park.jpg",
    "author": "MadGeographer",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.439
   }
  ],
  "tags": [
   "wildlife",
   "peaks",
   "larch",
   "darksky"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "The classic valley of the National Park: red deer, chamois and ibex on the slopes, marmots by the path. In late September the red deer rut echoes through the valley.",
  "access": "From the Prasüras car park above S-chanf about 2 to 2.5 h on foot to Alp Purcher and Alp Trupchun. National Park rules: stay on the path, no dogs.",
  "species": [
   "reddeer",
   "ibex",
   "chamois",
   "marmot",
   "beardedvulture",
   "goldeneagle"
  ],
  "elev": 2036
 },
 {
  "id": "margunet",
  "name": "Margunet",
  "region": "Swiss National Park, Ofen Pass (GR)",
  "lat": 46.67637,
  "lon": 10.24234,
  "photos": [
   {
    "file": "Schweizer Nationalpark Margunet 2328m.jpg",
    "author": "Freelecture",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "wildlife",
   "peaks",
   "darksky"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Viewpoint in the heart of the National Park over the Val dal Fuorn: red deer at dawn and dusk, bearded vultures gliding along the slopes.",
  "access": "About 1 h up from the Stabelchod car park on the Ofen Pass road (bus stop). Stay on the path.",
  "species": [
   "reddeer",
   "chamois",
   "beardedvulture",
   "goldeneagle",
   "marmot"
  ],
  "elev": 2324
 },
 {
  "id": "spielboden",
  "name": "Spielboden marmots",
  "region": "Saas-Fee (VS)",
  "lat": 46.09097,
  "lon": 7.89845,
  "photos": [
   {
    "file": "Alpine Marmot Family.jpg",
    "author": "EpsilonEridani",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.561
   }
  ],
  "tags": [
   "wildlife",
   "peaks",
   "glacier"
  ],
  "months": [
   6,
   10
  ],
  "blurb": "Marmots used to people live around the Spielboden, between the Fee glacier and the village, so you can photograph them close up.",
  "access": "Gondola from Saas-Fee to Spielboden (summer), or a 1.5 h hike. Please do not feed them.",
  "species": [
   "marmot",
   "chough",
   "ibex"
  ],
  "elev": 2515
 },
 {
  "id": "fanel",
  "name": "Fanel",
  "region": "Lake Neuchâtel (BE/NE)",
  "lat": 47.0014,
  "lon": 7.03971,
  "photos": [
   {
    "file": "Fanel-vogelinseln.jpg",
    "author": "Johannesvandergeest",
    "license": "Public domain",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "wildlife",
   "lake",
   "lowland",
   "mist",
   "sunset"
  ],
  "months": null,
  "blurb": "Bird reserve at the north-east end of Lake Neuchâtel with man-made islands for breeding gulls and terns, an observation tower and wintering waterbirds.",
  "access": "From Gampelen (train) about 30 min on foot to the shore and the tower.",
  "species": [
   "waterbirds",
   "waders",
   "heron",
   "kingfisher"
  ],
  "elev": 432
 },
 {
  "id": "klingnau",
  "name": "Klingnauer Stausee",
  "region": "Aare, Klingnau (AG)",
  "lat": 47.58423,
  "lon": 8.23603,
  "photos": [
   {
    "file": "Klingnauer Stausee 2008 10 17 000.JPG",
    "author": "MichaelFrey und Sundance Raphael",
    "license": "CC BY-SA 3.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "wildlife",
   "lake",
   "lowland",
   "mist",
   "reflection"
  ],
  "months": null,
  "blurb": "Reservoir on the Aare and one of the best places in Switzerland for waterbirds in winter and waders on migration, with a path all round and an observation tower.",
  "access": "Train to Döttingen or Klingnau, then walk the dam path.",
  "species": [
   "waterbirds",
   "waders",
   "heron",
   "kingfisher"
  ],
  "elev": 319
 },
 {
  "id": "bolle",
  "name": "Bolle di Magadino",
  "region": "Lake Maggiore (TI)",
  "lat": 46.1625,
  "lon": 8.853,
  "photos": [
   {
    "file": "Bolle di Magadino 02.jpg",
    "author": "Paebi",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "wildlife",
   "lake",
   "lowland",
   "mist"
  ],
  "months": null,
  "blurb": "Wild river delta of the Ticino into Lake Maggiore: alluvial forest, reeds and lagoons, and a major stop for migrating birds in spring.",
  "access": "From Magadino or Tenero; paths and observation points along the delta.",
  "species": [
   "waders",
   "waterbirds",
   "heron",
   "kingfisher",
   "songbirds"
  ],
  "elev": 193
 },
 {
  "id": "ermatingen",
  "name": "Ermatinger Becken",
  "region": "Untersee, Lake Constance (TG)",
  "lat": 47.66603,
  "lon": 9.11037,
  "photos": [
   {
    "file": "Rostgänse im Ermatinger Becken.jpg",
    "author": "JoachimKohler-HB",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.6
   }
  ],
  "tags": [
   "wildlife",
   "lake",
   "lowland",
   "mist",
   "hoarfrost"
  ],
  "months": null,
  "blurb": "Shallow bay of the Untersee where tens of thousands of ducks, grebes and geese spend the winter, against the reeds and the low winter sun.",
  "access": "Train to Triboltingen or Ermatingen, then the shore path.",
  "species": [
   "waterbirds",
   "waders",
   "heron"
  ],
  "elev": 396
 },
 {
  "id": "neeracherried",
  "name": "Neeracherried",
  "region": "Zürich Unterland (ZH)",
  "lat": 47.50227,
  "lon": 8.47818,
  "photos": [
   {
    "file": "Neeracherried 19 10 47 545000.jpeg",
    "author": "Albinfo",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.778
   }
  ],
  "tags": [
   "wildlife",
   "lowland",
   "mist"
  ],
  "months": null,
  "blurb": "One of the largest fens of the Swiss lowlands, with a BirdLife nature centre and hides over the ponds. Best in spring.",
  "access": "Bus to Neerach; the BirdLife centre and its hides are usually open from March to October.",
  "species": [
   "waders",
   "heron",
   "songbirds",
   "waterbirds"
  ],
  "elev": 412
 },
 {
  "id": "altreu",
  "name": "Altreu storks",
  "region": "Aare, Selzach (SO)",
  "lat": 47.19356,
  "lon": 7.44832,
  "photos": [
   {
    "file": "Stork in Altreu Switzerland 01.jpg",
    "author": "Matutinho",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 1.5
   }
  ],
  "tags": [
   "wildlife",
   "river",
   "lowland",
   "mist"
  ],
  "months": null,
  "blurb": "The village where the white stork was brought back to Switzerland: dozens of nests on roofs and trees by the Aare.",
  "access": "Bus to Altreu, or a boat on the Aare between Solothurn and Biel in summer.",
  "species": [
   "stork",
   "heron",
   "waterbirds",
   "beaver"
  ],
  "elev": 430
 },
 {
  "id": "goldau",
  "name": "Tierpark Goldau",
  "region": "Arth-Goldau (SZ)",
  "lat": 47.04991,
  "lon": 8.55706,
  "photos": [
   {
    "file": "Chamois in Tierpark Goldau 02.jpg",
    "author": "EconAmbiente",
    "license": "CC BY-SA 4.0",
    "night": false,
    "ratio": 2.167
   }
  ],
  "tags": [
   "wildlife",
   "park"
  ],
  "months": null,
  "blurb": "Wildlife park in the 1806 landslide boulders: deer and mouflons roam freely among visitors; bears, wolves, lynx and chamois in large enclosures.",
  "access": "A few minutes from Arth-Goldau station. Entrance fee.",
  "species": [
   "park"
  ],
  "elev": 546
 },
 {
  "id": "langenberg",
  "name": "Wildnispark Langenberg",
  "region": "Langnau am Albis (ZH)",
  "lat": 47.289,
  "lon": 8.534,
  "photos": [
   {
    "file": "Lynx lynx carpathicus in Wildpark Langenberg.jpg",
    "author": "kuhnmi",
    "license": "CC BY 2.0",
    "night": false,
    "ratio": 1.333
   }
  ],
  "tags": [
   "wildlife",
   "park"
  ],
  "months": null,
  "blurb": "Large forest enclosures with native animals: lynx, wolves, bears, red deer, ibex and wild boar. Good for practising before going after the wild ones.",
  "access": "S4 to Langnau-Gattikon, then about 15 min on foot. Free entry.",
  "species": [
   "park"
  ],
  "elev": 546
 }
];
