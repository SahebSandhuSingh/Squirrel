/*
 * Squirrel Social — demo city dataset
 * -----------------------------------
 * Every place name, map shape and location-based piece of sample content on the
 * landing page comes from this file. The UI in main.js never names a place itself.
 *
 * This is a FICTIONAL city used for demonstration. To show a different city,
 * replace this object with another one of the same shape — no UI changes needed.
 *
 * Map geometry uses abstract map units on a `map.width × map.height` canvas
 * (not latitude/longitude), so the drawing is a stylised city, not a real one.
 */
window.SquirrelCity = {
  id: "demo-city",
  name: "Demo City",
  isDemo: true,

  map: {
    width: 800,
    height: 600,
    river: [[-10, 250], [120, 230], [170, 300], [280, 290], [430, 200], [520, 230], [690, 330], [810, 300]],
    roads: {
      major: [
        [[0, 120], [800, 150]],
        [[0, 420], [800, 380]],
        [[160, 0], [200, 600]],
        [[420, 0], [380, 600]],
        [[640, 0], [690, 600]],
        [[0, 520], [300, 300], [800, 60]],
      ],
      minor: [
        [[0, 200], [800, 210]],
        [[0, 330], [800, 470]],
        [[290, 0], [300, 600]],
        [[540, 0], [520, 600]],
        [[740, 0], [760, 600]],
      ],
    },
  },

  // The crew the visitor is shown as part of, and the rival crew on the map.
  crews: {
    you: { name: "Your crew" },
    rival: { name: "West End Wolves" },
  },

  /*
   * Districts. `territory.status` drives colour and copy:
   *   "yours" | "rival" | "contested" | "neutral"
   * `featured` marks the district the product sections talk about
   * (challenge cards, pillars, etc.).
   */
  districts: [
    {
      id: "riverside",
      name: "Riverside",
      featured: true,
      polygon: [[420, 250], [560, 240], [600, 330], [560, 420], [430, 410], [400, 330]],
      label: [488, 318],
      territory: { status: "yours", control: 0.82, xpToClaim: 2340, defenders: 14 },
    },
    {
      id: "west-end",
      name: "West End",
      polygon: [[30, 110], [180, 100], [190, 230], [150, 300], [40, 290]],
      label: [104, 180],
      territory: { status: "rival", control: 0.67, owner: "rival", xpToFlip: 4100 },
    },
    {
      id: "old-town",
      name: "Old Town",
      polygon: [[620, 160], [770, 150], [780, 330], [700, 360], [630, 320]],
      label: [696, 252],
      territory: { status: "contested", control: 0.48, crews: 3 },
    },
    {
      id: "north-district",
      name: "North District",
      polygon: [[210, 60], [380, 70], [370, 190], [220, 180]],
      label: [296, 126],
      territory: { status: "neutral" },
    },
    {
      id: "lake-district",
      name: "Lake District",
      polygon: [[40, 450], [200, 430], [210, 570], [50, 580]],
      label: [128, 504],
      territory: { status: "neutral" },
    },
    { id: "central", name: "Central District", label: [270, 372], territory: { status: "neutral" } },
    { id: "southside", name: "Southside", label: [672, 470], territory: { status: "neutral" } },
  ],

  // Named spots inside districts (meetups and activities can point at these).
  landmarks: [
    { id: "greenway", name: "Greenway Park", type: "park", district: "central", at: [384, 498] },
    { id: "riverside-track", name: "Riverside Track", type: "street", district: "riverside", at: [610, 440] },
    { id: "old-town-steps", name: "Old Town Steps", type: "rooftop", district: "old-town", at: [712, 392] },
    { id: "north-campus", name: "North Campus", type: "campus", district: "north-district", at: [300, 90] },
  ],

  routes: [
    { id: "your-run", owner: "you", points: [[300, 520], [330, 450], [400, 420], [440, 360], [470, 300], [540, 280], [580, 330], [560, 400], [480, 430]] },
  ],

  // Where people appear on the map. `you: true` is the visitor.
  players: [
    { person: "Aarav", at: [440, 276] },
    { person: "Meera", at: [672, 198] },
    { person: "Rohan", at: [136, 132] },
    { you: true, at: [480, 426] },
  ],

  // Home district for each demo crew member (shown on the profile cards).
  members: {
    Aarav: "riverside",
    Meera: "north-district",
    Rohan: "old-town",
    Diya: "lake-district",
    Kabir: "southside",
  },

  meetups: [
    { id: "sunday-long-run", title: "Sunday long run", time: "7:00 AM", landmark: "greenway", going: ["Aarav", "Meera", "Diya"] },
  ],

  /*
   * Demo activity used by the hero ticker and the map pings.
   * `district` / `landmark` are optional; `at` places a ping on the map.
   * reward.tone: "xp" | "pink" | "yellow" | "orange" | "purple"
   */
  activities: [
    { person: "Aarav", action: "Completed a 5K", district: "riverside", at: [470, 366], reward: { label: "+420 XP", tone: "xp" } },
    { person: "Meera", action: "Started a head-to-head", reward: { label: "vs Rohan", tone: "pink" } },
    { person: "Diya", action: "Finished today's challenge", district: "lake-district", at: [110, 470], reward: { label: "7 day streak", tone: "orange" } },
    { person: "Rohan", action: "Claimed a block", district: "old-town", at: [736, 300], reward: { label: "Territory", tone: "yellow" } },
    { person: "Kabir", action: "Joined Sunday long run", landmark: "greenway", reward: { label: "Crew", tone: "purple" } },
    { person: "Meera", action: "Levelled up", reward: { label: "Level 10", tone: "xp" } },
    { person: "Aarav", action: "Beat Kabir by 312 steps", reward: { label: "+500 XP", tone: "xp" } },
    { person: "Rohan", action: "Raided West End", district: "west-end", at: [72, 264], reward: { label: "Territory", tone: "pink" } },
  ],
};
