/**
 * Static lookup table of Indian city coordinates.
 * Each entry maps a lowercase city name to [longitude, latitude].
 * Common aliases (e.g. Bengaluru/Bangalore) are included as separate keys
 * pointing to the same coordinates.
 */

const CITY_COORDINATES: Record<string, [number, number]> = {
  // ── Metros ────────────────────────────────────────────────
  mumbai:               [72.8777, 19.0760],
  bombay:               [72.8777, 19.0760],
  delhi:                [77.1025, 28.7041],
  'new delhi':          [77.2090, 28.6139],
  bengaluru:            [77.5946, 12.9716],
  bangalore:            [77.5946, 12.9716],
  hyderabad:            [78.4867, 17.3850],
  chennai:              [80.2707, 13.0827],
  madras:               [80.2707, 13.0827],
  kolkata:              [88.3639, 22.5726],
  calcutta:             [88.3639, 22.5726],
  ahmedabad:            [72.5714, 23.0225],
  pune:                 [73.8567, 18.5204],

  // ── Tier-1 / Major ───────────────────────────────────────
  jaipur:               [75.7873, 26.9124],
  lucknow:              [80.9462, 26.8467],
  kanpur:               [80.3319, 26.4499],
  nagpur:               [79.0882, 21.1458],
  indore:               [75.8577, 22.7196],
  bhopal:               [77.4126, 23.2599],
  visakhapatnam:        [83.2185, 17.6868],
  vizag:                [83.2185, 17.6868],
  patna:                [85.1376, 25.6093],
  vadodara:             [73.1812, 22.3072],
  baroda:               [73.1812, 22.3072],
  surat:                [72.8311, 21.1702],
  coimbatore:           [76.9558, 11.0168],
  kochi:                [76.2673, 9.9312],
  cochin:               [76.2673, 9.9312],
  thiruvananthapuram:   [76.9366, 8.5241],
  trivandrum:           [76.9366, 8.5241],
  guwahati:             [91.7362, 26.1445],
  chandigarh:           [76.7794, 30.7333],
  bhubaneswar:          [85.8245, 20.2961],
  dehradun:             [78.0322, 30.3165],
  ranchi:               [85.3096, 23.3441],
  raipur:               [81.6296, 21.2514],
  amritsar:             [74.8723, 31.6340],
  jodhpur:              [73.0243, 26.2389],
  udaipur:              [73.7125, 24.5854],
  ludhiana:             [75.8573, 30.9010],

  // ── NCR / Satellite ──────────────────────────────────────
  gurgaon:              [77.0266, 28.4595],
  gurugram:             [77.0266, 28.4595],
  noida:                [77.3910, 28.5355],
  'greater noida':      [77.4538, 28.4744],
  faridabad:            [77.3178, 28.4089],
  ghaziabad:            [77.4538, 28.6692],

  // ── West ─────────────────────────────────────────────────
  thane:                [72.9781, 19.2183],
  'navi mumbai':        [73.0169, 19.0330],
  nashik:               [73.7898, 19.9975],
  aurangabad:           [75.3433, 19.8762],
  rajkot:               [70.8022, 22.3039],
  goa:                  [74.1240, 15.2993],
  panaji:               [73.8278, 15.4909],
  margao:               [73.9535, 15.2832],
  kolhapur:             [74.2433, 16.7050],
  solapur:              [75.9064, 17.6599],

  // ── South ────────────────────────────────────────────────
  mysuru:               [76.6394, 12.2958],
  mysore:               [76.6394, 12.2958],
  mangaluru:            [74.8560, 12.9141],
  mangalore:            [74.8560, 12.9141],
  madurai:              [78.1198, 9.9252],
  tiruchirappalli:      [78.6569, 10.7905],
  trichy:               [78.6569, 10.7905],
  salem:                [78.1460, 11.6643],
  tiruppur:             [77.3410, 11.1085],
  vijayawada:           [80.6480, 16.5062],
  guntur:               [80.4365, 16.3067],
  warangal:             [79.5941, 17.9784],
  nellore:              [79.9865, 14.4426],
  kozhikode:            [75.7804, 11.2588],
  calicut:              [75.7804, 11.2588],
  thrissur:             [76.2144, 10.5276],
  hubli:                [75.1240, 15.3647],
  dharwad:              [75.0080, 15.4589],
  'hubli-dharwad':      [75.1240, 15.3647],
  belgaum:              [74.4977, 15.8497],
  belagavi:             [74.4977, 15.8497],
  tirupati:             [79.4192, 13.6288],

  // ── North ────────────────────────────────────────────────
  prayagraj:            [81.8463, 25.4358],
  allahabad:            [81.8463, 25.4358],
  varanasi:             [83.0007, 25.3176],
  agra:                 [78.0081, 27.1767],
  meerut:               [77.7064, 28.9845],
  bareilly:             [79.4304, 28.3670],
  aligarh:              [78.0880, 27.8974],
  gorakhpur:            [83.3732, 26.7606],
  mathura:              [77.6737, 27.4924],

  // ── East ─────────────────────────────────────────────────
  jamshedpur:           [86.1850, 22.8046],
  dhanbad:              [86.4304, 23.7957],
  cuttack:              [85.8830, 20.4625],
  siliguri:             [88.4275, 26.7271],
  durgapur:             [87.3119, 23.5204],

  // ── Central ──────────────────────────────────────────────
  jabalpur:             [79.9864, 23.1815],
  gwalior:              [78.1828, 26.2183],
  ujjain:               [75.7885, 23.1765],

  // ── Northeast ────────────────────────────────────────────
  shillong:             [91.8933, 25.5788],
  imphal:               [93.9368, 24.8170],
  agartala:             [91.2868, 23.8315],
  aizawl:               [92.7176, 23.7271],
  itanagar:             [93.6166, 27.0844],
  kohima:               [94.1086, 25.6751],
  gangtok:              [88.6138, 27.3389],
  dibrugarh:            [94.9120, 27.4728],
  dimapur:              [93.7266, 25.9042],

  // ── J&K / Ladakh ────────────────────────────────────────
  srinagar:             [74.7973, 34.0837],
  jammu:                [74.8570, 32.7266],
  leh:                  [77.5771, 34.1526],

  // ── Other notable ────────────────────────────────────────
  shimla:               [77.1734, 31.1048],
  manali:               [77.1887, 32.2396],
  rishikesh:            [78.2676, 30.0869],
  haridwar:             [78.1642, 29.9457],
  bikaner:              [73.3119, 28.0229],
  ajmer:                [74.6399, 26.4499],
  kota:                 [75.8648, 25.2138],
  jalandhar:            [75.5762, 31.3260],
  patiala:              [76.3869, 30.3398],
  bathinda:             [74.9455, 30.2110],
  panipat:              [76.9635, 29.3909],
  karnal:               [76.9905, 29.6857],
  rohtak:               [76.6066, 28.8955],
  sonipat:              [77.0151, 28.9931],
  hisar:                [75.7217, 29.1492],
  ambala:               [76.7767, 30.3782],
  kurukshetra:          [76.8606, 29.9695],
  mohali:               [76.7179, 30.7046],
  panchkula:            [76.8606, 30.6942],
};

/**
 * Case-insensitive, trim-aware coordinate lookup.
 * @returns [longitude, latitude] or null if the city is unknown.
 */
function getCityCoordinates(city: string): [number, number] | null {
  const key = city.trim().toLowerCase();
  return CITY_COORDINATES[key] ?? null;
}

export { CITY_COORDINATES, getCityCoordinates };
