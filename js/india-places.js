// Built-in list of places in India: every district, a few well-known towns that
// are not district names (a town named like its district is left out - the
// district entry is that place), and two towns in each very wide district. Lets
// the Location setting fill in coordinates without a network connection.
// Coordinates are good to ~0.01 degree; fine-tune in the fields if needed.
(function (global) {
  "use strict";
  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  // [name, state/UT, lat, lon, elevation]
  const RAW = [
    ["Port Blair", "Andaman & Nicobar", 11.6234, 92.7265, 16],
    ["Vijayawada", "Andhra Pradesh", 16.5062, 80.6480, 11],
    ["Itanagar", "Arunachal Pradesh", 27.0844, 93.6053, 320],
    ["Guwahati", "Assam", 26.1445, 91.7362, 55],
    ["Panaji", "Goa", 15.4909, 73.8278, 7],
    ["Dwarka", "Gujarat", 22.2394, 68.9678, 5],
    ["Somnath", "Gujarat", 20.8880, 70.4012, 5],
    ["Śṛṅgeri", "Karnataka", 13.4180, 75.2570, 670],
    ["Mangaluru", "Karnataka", 12.9141, 74.8560, 22],
    ["Hubballi", "Karnataka", 15.3647, 75.1240, 640],
    ["Melukote", "Karnataka", 12.6600, 76.6500, 920],
    ["Kochi", "Kerala", 9.9312, 76.2673, 3],
    ["Guruvayur", "Kerala", 10.5944, 76.0411, 5],
    ["Kavaratti", "Lakshadweep", 10.5626, 72.6369, 2],
    ["Pandharpur", "Maharashtra", 17.6792, 75.3319, 440],
    ["Shillong", "Meghalaya", 25.5788, 91.8933, 1496],
    ["Bhubaneswar", "Odisha", 20.2961, 85.8245, 45],
    ["Pushkar", "Rajasthan", 26.4900, 74.5513, 510],
    ["Gangtok", "Sikkim", 27.3389, 88.6065, 1650],
    ["Kumbakonam", "Tamil Nadu", 10.9617, 79.3881, 24],
    ["Rameswaram", "Tamil Nadu", 9.2876, 79.3129, 5],
    ["Kanchipuram", "Tamil Nadu", 12.8342, 79.7036, 83],
    ["Agartala", "Tripura", 23.8315, 91.2868, 13],
    ["Rishikesh", "Uttarakhand", 30.0869, 78.2676, 372],
    ["Siliguri", "West Bengal", 26.7271, 88.3953, 122],
  ];

  // Towns inside the districts so wide (1.5 degrees of longitude or more, i.e. sunrise
  // 6+ minutes apart across the district) that one point cannot stand for all of it: a
  // western and an eastern town each, [name, district, state, lat, lon] (elevation unknown).
  const WIDE_DISTRICT_TOWNS = [
    ["Khalatse", "Leh", "Ladakh", 34.32, 76.88],
    ["Hanle", "Leh", "Ladakh", 32.78, 78.96],
    ["Naliya", "Kutch", "Gujarat", 23.26, 68.83],
    ["Rapar", "Kutch", "Gujarat", 23.57, 70.65],
    ["Tanot", "Jaisalmer", "Rajasthan", 27.73, 70.27],
    ["Pokaran", "Jaisalmer", "Rajasthan", 26.92, 71.92],
    ["Dhorimanna", "Barmer", "Rajasthan", 25.2, 71.44],
    ["Samdari", "Barmer", "Rajasthan", 25.81, 72.58],
    ["Kolayat", "Bikaner", "Rajasthan", 27.84, 72.96],
    ["Sri Dungargarh", "Bikaner", "Rajasthan", 28.1, 74.01],
    ["Rampachodavaram", "Alluri Sitharama Raju", "Andhra Pradesh", 17.44, 81.78],
    ["Paderu", "Alluri Sitharama Raju", "Andhra Pradesh", 18.08, 82.67],
    ["Kyelang", "Lahaul and Spiti", "Himachal Pradesh", 32.57, 77.02],
    ["Kaza", "Lahaul and Spiti", "Himachal Pradesh", 32.23, 78.07],
    ["Gotan", "Nagaur", "Rajasthan", 26.66, 73.74],
    ["Kuchaman", "Nagaur", "Rajasthan", 27.15, 74.86],
    ["Drass", "Kargil", "Ladakh", 34.43, 75.76],
    ["Padum", "Kargil", "Ladakh", 33.47, 76.88],
    ["Phalodi", "Jodhpur", "Rajasthan", 27.13, 72.37],
    ["Bilara", "Jodhpur", "Rajasthan", 26.18, 73.71],
    ["Islampur", "Sangli", "Maharashtra", 17.05, 74.27],
    ["Jath", "Sangli", "Maharashtra", 17.05, 75.22],
    ["Sangamner", "Ahmednagar", "Maharashtra", 19.57, 74.21],
    ["Jamkhed", "Ahmednagar", "Maharashtra", 18.74, 75.31],
    ["Ashti", "Beed", "Maharashtra", 18.81, 75.18],
    ["Parli Vaijnath", "Beed", "Maharashtra", 18.85, 76.53],
    ["Sanchor", "Jalore", "Rajasthan", 24.75, 71.77],
    ["Sankhwali", "Jalore", "Rajasthan", 25.47, 72.88],
    ["Pusad", "Yavatmal", "Maharashtra", 19.91, 77.58],
    ["Wani", "Yavatmal", "Maharashtra", 20.06, 78.95],
    ["Lonavla", "Pune", "Maharashtra", 18.75, 73.41],
    ["Indapur", "Pune", "Maharashtra", 18.12, 75.03],
    ["Rourkela", "Sundargarh", "Odisha", 22.22, 84.86],
    ["Koira", "Sundargarh", "Odisha", 21.9, 85.24],
    ["Dharni", "Amravati", "Maharashtra", 21.55, 76.89],
    ["Warud", "Amravati", "Maharashtra", 21.47, 78.27],
    ["Akluj", "Solapur", "Maharashtra", 17.89, 75.02],
    ["Akalkot", "Solapur", "Maharashtra", 17.53, 76.21],
    ["Sujangarh", "Churu", "Rajasthan", 27.7, 74.47],
    ["Rajgarh", "Churu", "Rajasthan", 28.64, 75.39],
    ["Kapasan", "Chittorgarh", "Rajasthan", 24.89, 74.32],
    ["Rawatbhata", "Chittorgarh", "Rajasthan", 24.93, 75.59],
    ["Pilibangan", "Hanumangarh", "Rajasthan", 29.45, 74.1],
    ["Bhadra", "Hanumangarh", "Rajasthan", 29.1, 75.17],
    ["Trimbak", "Nashik", "Maharashtra", 19.93, 73.53],
    ["Malegaon", "Nashik", "Maharashtra", 20.55, 74.53],
    ["Anupgarh", "Ganganagar", "Rajasthan", 29.19, 73.21],
    ["Sadulshahar", "Ganganagar", "Rajasthan", 29.91, 74.18],
    ["Chalisgaon", "Jalgaon", "Maharashtra", 20.46, 75.02],
    ["Raver", "Jalgaon", "Maharashtra", 21.25, 76.04],
    ["Afzalpur", "Kalaburagi", "Karnataka", 17.2, 76.36],
    ["Chincholi", "Kalaburagi", "Karnataka", 17.47, 77.42],
    ["Sumerpur", "Pali", "Rajasthan", 25.15, 73.08],
    ["Raipur", "Pali", "Rajasthan", 26.04, 74.02],
    ["Ashta", "Sehore", "Madhya Pradesh", 23.02, 76.72],
    ["Budhni", "Sehore", "Madhya Pradesh", 22.79, 77.68],
    ["Barkot", "Uttarkashi", "Uttarakhand", 30.81, 78.21],
    ["Gangotri", "Uttarkashi", "Uttarakhand", 30.99, 78.94],
    ["Kuppam", "Chittoor", "Andhra Pradesh", 12.75, 78.34],
    ["Nagari", "Chittoor", "Andhra Pradesh", 13.32, 79.59],
    ["Hindupur", "Sri Sathya Sai", "Andhra Pradesh", 13.83, 77.49],
    ["Kadiri", "Sri Sathya Sai", "Andhra Pradesh", 14.11, 78.16],
    ["Bhainsdehi", "Betul", "Madhya Pradesh", 21.64, 77.63],
    ["Multai", "Betul", "Madhya Pradesh", 21.77, 78.26],
    ["Andrott", "Lakshadweep", "Lakshadweep", 10.81, 73.67],
    ["Giddalur", "Prakasam", "Andhra Pradesh", 15.37, 78.93],
    ["Ongole", "Prakasam", "Andhra Pradesh", 15.5, 80.04],
    ["Tirodi", "Balaghat", "Madhya Pradesh", 21.69, 79.72],
    ["Malajkhand", "Balaghat", "Madhya Pradesh", 22.05, 80.72],
    ["Taipi Duidam", "Changlang", "Arunachal Pradesh", 27.29, 96.04],
    ["Miao", "Changlang", "Arunachal Pradesh", 27.49, 96.18],
    ["Karanjia", "Mayurbhanj", "Odisha", 21.76, 85.97],
    ["Baripada", "Mayurbhanj", "Odisha", 21.93, 86.73],
    ["Paranda", "Osmanabad", "Maharashtra", 18.26, 75.46],
    ["Umarga", "Osmanabad", "Maharashtra", 17.84, 76.62],
    ["Hadagalli", "Ballari", "Karnataka", 15.02, 75.93],
    ["Siruguppa", "Ballari", "Karnataka", 15.63, 76.89],
  ];

  const PLACES = RAW.map(function (r) {
    return { name: r[0], state: r[1], latitude: r[2], longitude: r[3], elevation: r[4], label: r[0] + ", " + r[1] };
  });
  WIDE_DISTRICT_TOWNS.forEach(function (r) {
    PLACES.push({ name: r[0], state: r[2], latitude: r[3], longitude: r[4], elevation: null, label: r[0] + ", " + r[1] + " district, " + r[2] });
  });

  // Every district (js/india-districts.js, loaded first): the middle of the
  // district, with no elevation (null) - the form keeps its current one.
  (VedicEngine.IndiaDistricts || []).forEach(function (st) {
    st[1].forEach(function (d) {
      PLACES.push({ name: d[0], state: st[0], latitude: d[1], longitude: d[2], elevation: null, label: d[0] + " (district), " + st[0] });
    });
  });

  function norm(s) {
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  // Finds a place by its "Name, State" label or, failing that, by name alone
  // (accent- and case-insensitive: "sringeri" finds "Śṛṅgeri").
  function find(text) {
    const t = norm(text);
    if (!t) return null;
    return PLACES.filter(function (p) { return norm(p.label) === t; })[0] ||
      PLACES.filter(function (p) { return norm(p.name) === t; })[0] || null;
  }

  VedicEngine.IndiaPlaces = { PLACES, find };
})(typeof window !== "undefined" ? window : globalThis);
