// Built-in list of places in India (name, state, latitude, longitude,
// approximate elevation in metres) so the Location setting can fill in
// coordinates without a network connection. Coordinates are city-centre
// values, good to ~0.01 degree; fine-tune in the fields if needed.
(function (global) {
  "use strict";
  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  // [name, state/UT, lat, lon, elevation]
  const RAW = [
    ["Port Blair", "Andaman & Nicobar", 11.6234, 92.7265, 16],
    ["Visakhapatnam", "Andhra Pradesh", 17.6868, 83.2185, 3],
    ["Vijayawada", "Andhra Pradesh", 16.5062, 80.6480, 11],
    ["Tirupati", "Andhra Pradesh", 13.6288, 79.4192, 161],
    ["Guntur", "Andhra Pradesh", 16.3067, 80.4365, 33],
    ["Itanagar", "Arunachal Pradesh", 27.0844, 93.6053, 320],
    ["Guwahati", "Assam", 26.1445, 91.7362, 55],
    ["Patna", "Bihar", 25.5941, 85.1376, 53],
    ["Gaya", "Bihar", 24.7914, 85.0002, 111],
    ["Chandigarh", "Chandigarh", 30.7333, 76.7794, 321],
    ["Raipur", "Chhattisgarh", 21.2514, 81.6296, 298],
    ["Delhi", "Delhi", 28.6139, 77.2090, 216],
    ["Panaji", "Goa", 15.4909, 73.8278, 7],
    ["Ahmedabad", "Gujarat", 23.0225, 72.5714, 53],
    ["Surat", "Gujarat", 21.1702, 72.8311, 13],
    ["Vadodara", "Gujarat", 22.3072, 73.1812, 39],
    ["Rajkot", "Gujarat", 22.3039, 70.8022, 134],
    ["Dwarka", "Gujarat", 22.2394, 68.9678, 5],
    ["Somnath", "Gujarat", 20.8880, 70.4012, 5],
    ["Gurugram", "Haryana", 28.4595, 77.0266, 217],
    ["Kurukshetra", "Haryana", 29.9695, 76.8783, 250],
    ["Shimla", "Himachal Pradesh", 31.1048, 77.1734, 2276],
    ["Srinagar", "Jammu & Kashmir", 34.0837, 74.7973, 1585],
    ["Jammu", "Jammu & Kashmir", 32.7266, 74.8570, 327],
    ["Ranchi", "Jharkhand", 23.3441, 85.3096, 651],
    ["Bengaluru", "Karnataka", 12.9716, 77.5946, 920],
    ["Mysuru", "Karnataka", 12.2958, 76.6394, 770],
    ["Śṛṅgeri", "Karnataka", 13.4180, 75.2570, 670],
    ["Udupi", "Karnataka", 13.3409, 74.7421, 10],
    ["Mangaluru", "Karnataka", 12.9141, 74.8560, 22],
    ["Hubballi", "Karnataka", 15.3647, 75.1240, 640],
    ["Belagavi", "Karnataka", 15.8497, 74.4977, 751],
    ["Melukote", "Karnataka", 12.6600, 76.6500, 920],
    ["Thiruvananthapuram", "Kerala", 8.5241, 76.9366, 10],
    ["Kochi", "Kerala", 9.9312, 76.2673, 3],
    ["Kozhikode", "Kerala", 11.2588, 75.7804, 1],
    ["Thrissur", "Kerala", 10.5276, 76.2144, 2],
    ["Guruvayur", "Kerala", 10.5944, 76.0411, 5],
    ["Leh", "Ladakh", 34.1526, 77.5771, 3500],
    ["Kavaratti", "Lakshadweep", 10.5626, 72.6369, 2],
    ["Bhopal", "Madhya Pradesh", 23.2599, 77.4126, 527],
    ["Indore", "Madhya Pradesh", 22.7196, 75.8577, 553],
    ["Ujjain", "Madhya Pradesh", 23.1765, 75.7885, 491],
    ["Gwalior", "Madhya Pradesh", 26.2183, 78.1828, 211],
    ["Jabalpur", "Madhya Pradesh", 23.1815, 79.9864, 412],
    ["Mumbai", "Maharashtra", 19.0760, 72.8777, 14],
    ["Pune", "Maharashtra", 18.5204, 73.8567, 560],
    ["Nagpur", "Maharashtra", 21.1458, 79.0882, 310],
    ["Nashik", "Maharashtra", 19.9975, 73.7898, 565],
    ["Kolhapur", "Maharashtra", 16.7050, 74.2433, 570],
    ["Pandharpur", "Maharashtra", 17.6792, 75.3319, 440],
    ["Imphal", "Manipur", 24.8170, 93.9368, 786],
    ["Shillong", "Meghalaya", 25.5788, 91.8933, 1496],
    ["Aizawl", "Mizoram", 23.7271, 92.7176, 1132],
    ["Kohima", "Nagaland", 25.6751, 94.1086, 1444],
    ["Bhubaneswar", "Odisha", 20.2961, 85.8245, 45],
    ["Puri", "Odisha", 19.8135, 85.8312, 3],
    ["Cuttack", "Odisha", 20.4625, 85.8830, 36],
    ["Puducherry", "Puducherry", 11.9416, 79.8083, 3],
    ["Amritsar", "Punjab", 31.6340, 74.8723, 234],
    ["Ludhiana", "Punjab", 30.9010, 75.8573, 244],
    ["Jaipur", "Rajasthan", 26.9124, 75.7873, 431],
    ["Jodhpur", "Rajasthan", 26.2389, 73.0243, 231],
    ["Udaipur", "Rajasthan", 24.5854, 73.7125, 598],
    ["Pushkar", "Rajasthan", 26.4900, 74.5513, 510],
    ["Gangtok", "Sikkim", 27.3389, 88.6065, 1650],
    ["Chennai", "Tamil Nadu", 13.0827, 80.2707, 6],
    ["Madurai", "Tamil Nadu", 9.9252, 78.1198, 134],
    ["Coimbatore", "Tamil Nadu", 11.0168, 76.9558, 411],
    ["Tiruchirappalli", "Tamil Nadu", 10.7905, 78.7047, 88],
    ["Thanjavur", "Tamil Nadu", 10.7870, 79.1378, 59],
    ["Kumbakonam", "Tamil Nadu", 10.9617, 79.3881, 24],
    ["Rameswaram", "Tamil Nadu", 9.2876, 79.3129, 5],
    ["Kanchipuram", "Tamil Nadu", 12.8342, 79.7036, 83],
    ["Kanyakumari", "Tamil Nadu", 8.0883, 77.5385, 5],
    ["Salem", "Tamil Nadu", 11.6643, 78.1460, 278],
    ["Hyderabad", "Telangana", 17.3850, 78.4867, 542],
    ["Warangal", "Telangana", 17.9689, 79.5941, 266],
    ["Agartala", "Tripura", 23.8315, 91.2868, 13],
    ["Lucknow", "Uttar Pradesh", 26.8467, 80.9462, 123],
    ["Varanasi", "Uttar Pradesh", 25.3176, 82.9739, 80],
    ["Ayodhya", "Uttar Pradesh", 26.7922, 82.1998, 93],
    ["Prayagraj", "Uttar Pradesh", 25.4358, 81.8463, 98],
    ["Mathura", "Uttar Pradesh", 27.4924, 77.6737, 174],
    ["Kanpur", "Uttar Pradesh", 26.4499, 80.3319, 126],
    ["Agra", "Uttar Pradesh", 27.1767, 78.0081, 169],
    ["Dehradun", "Uttarakhand", 30.3165, 78.0322, 640],
    ["Haridwar", "Uttarakhand", 29.9457, 78.1642, 249],
    ["Rishikesh", "Uttarakhand", 30.0869, 78.2676, 372],
    ["Kolkata", "West Bengal", 22.5726, 88.3639, 9],
    ["Siliguri", "West Bengal", 26.7271, 88.3953, 122],
  ];

  const PLACES = RAW.map(function (r) {
    return { name: r[0], state: r[1], latitude: r[2], longitude: r[3], elevation: r[4], label: r[0] + ", " + r[1] };
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
