/**
 * Points of interest: universities and colleges, landmarks, parks and lakes, sports grounds,
 * student hotspots and Salt Lake's named crossings. Each says how sure its position is and the
 * zoom it appears at, so the city reveals itself gradually instead of all at once.
 *
 * Correcting a place: change `at` and set `accuracy: 'surveyed'` once checked on the ground.
 */
import type { Place } from '../types.ts';

const U = 9.6; // universities: from the metro view
const C = 12.4; // colleges
const L = 11.6; // landmarks
const H = 12.8; // hotspots
const J = 13.6; // crossings

export const PLACES: Place[] = [
  // --- Universities & institutes
  { id: 'p-jadavpur-university', name: 'Jadavpur University', kind: 'university', at: [22.4988, 88.3715], accuracy: 'surveyed', minZoom: U, aliases: ['JU', 'Jadavpur Univ'] },
  { id: 'p-presidency-university', name: 'Presidency University', kind: 'university', at: [22.5767, 88.3624], accuracy: 'surveyed', minZoom: U, aliases: ['Presidency', 'Presi'] },
  { id: 'p-calcutta-university', name: 'University of Calcutta', kind: 'university', at: [22.5742, 88.3627], accuracy: 'surveyed', minZoom: U, aliases: ['CU', 'Calcutta University', 'Asutosh Building'] },
  { id: 'p-cu-rajabazar', name: 'CU Rajabazar Science College', kind: 'university', at: [22.5848, 88.3722], accuracy: 'approximate', minZoom: C, aliases: ['Rajabazar Science College', 'University College of Science'] },
  { id: 'p-cu-ballygunge', name: 'CU Ballygunge Science College', kind: 'university', at: [22.5268, 88.3652], accuracy: 'approximate', minZoom: C, aliases: ['Ballygunge Science College'] },
  { id: 'p-iiest', name: 'IIEST Shibpur', kind: 'university', at: [22.5553, 88.3057], accuracy: 'surveyed', minZoom: U, aliases: ['BESU', 'Bengal Engineering', 'Shibpur'] },
  { id: 'p-iiser', name: 'IISER Kolkata', kind: 'university', at: [22.9632, 88.5245], accuracy: 'surveyed', minZoom: 8.5, aliases: ['IISER', 'Mohanpur'] },
  { id: 'p-kalyani-university', name: 'University of Kalyani', kind: 'university', at: [22.9890, 88.4450], accuracy: 'approximate', minZoom: 8.5, aliases: ['Kalyani University', 'KU'] },
  { id: 'p-aiims-kalyani', name: 'AIIMS Kalyani', kind: 'university', at: [22.9560, 88.4900], accuracy: 'approximate', minZoom: 8.5, aliases: ['AIIMS'] },
  { id: 'p-bckv', name: 'BCKV (Bidhan Chandra Krishi Viswavidyalaya)', kind: 'university', at: [22.9440, 88.5300], accuracy: 'approximate', minZoom: 9.5, aliases: ['BCKV', 'Krishi Viswavidyalaya'] },
  { id: 'p-iit-kharagpur', name: 'IIT Kharagpur', kind: 'university', at: [22.3149, 87.3105], accuracy: 'surveyed', minZoom: 6, aliases: ['IIT KGP', 'KGP'] },
  { id: 'p-visva-bharati', name: 'Visva-Bharati', kind: 'university', at: [23.6790, 87.6850], accuracy: 'approximate', minZoom: 6, aliases: ['Santiniketan', 'Shantiniketan'] },
  { id: 'p-nit-durgapur', name: 'NIT Durgapur', kind: 'university', at: [23.5480, 87.2920], accuracy: 'approximate', minZoom: 6.5, aliases: ['NITD'] },
  { id: 'p-burdwan-university', name: 'University of Burdwan', kind: 'university', at: [23.2530, 87.8470], accuracy: 'approximate', minZoom: 6.5, aliases: ['BU', 'Burdwan University'] },
  { id: 'p-nbu', name: 'University of North Bengal', kind: 'university', at: [26.7090, 88.3540], accuracy: 'approximate', minZoom: 6, aliases: ['NBU', 'North Bengal University'] },
  { id: 'p-st-xaviers-college', name: 'St. Xavier’s College', kind: 'university', at: [22.5464, 88.3534], accuracy: 'surveyed', minZoom: U, aliases: ['Xaviers', 'SXC', 'St Xaviers', 'Saint Xaviers College'] },
  { id: 'p-st-xaviers-university', name: 'St. Xavier’s University', kind: 'university', at: [22.6140, 88.4960], accuracy: 'approximate', minZoom: U, aliases: ['SXUK', 'Xaviers New Town', 'St Xaviers University', 'Saint Xaviers University'] },
  { id: 'p-aliah-park-circus', name: 'Aliah University · Park Circus', kind: 'university', at: [22.5395, 88.3698], accuracy: 'approximate', minZoom: U, aliases: ['Aliah', 'Aliah University'] },
  { id: 'p-aliah-new-town', name: 'Aliah University · New Town', kind: 'university', at: [22.5835, 88.4815], accuracy: 'approximate', minZoom: U, aliases: ['Aliah', 'Aliah University'] },
  { id: 'p-techno-india', name: 'Techno India University', kind: 'university', at: [22.5760, 88.4300], accuracy: 'approximate', minZoom: U, aliases: ['Techno', 'TIU', 'Techno Main'] },
  { id: 'p-rbu', name: 'Rabindra Bharati University', kind: 'university', at: [22.5862, 88.3588], accuracy: 'approximate', minZoom: C, aliases: ['RBU', 'Jorasanko'] },
  { id: 'p-isi', name: 'Indian Statistical Institute', kind: 'university', at: [22.6480, 88.3770], accuracy: 'approximate', minZoom: U, aliases: ['ISI', 'ISI Kolkata'] },
  { id: 'p-iim-calcutta', name: 'IIM Calcutta', kind: 'university', at: [22.4460, 88.3010], accuracy: 'approximate', minZoom: U, aliases: ['IIMC', 'Joka'] },
  { id: 'p-sn-bose', name: 'S. N. Bose Centre', kind: 'university', at: [22.5705, 88.4125], accuracy: 'approximate', minZoom: C, aliases: ['SNBNCBS', 'Bose Centre'] },
  // --- Colleges
  { id: 'p-medical-college', name: 'Medical College Kolkata', kind: 'college', at: [22.5733, 88.3606], accuracy: 'approximate', minZoom: C, aliases: ['MCK', 'Calcutta Medical College'] },
  { id: 'p-scottish-church', name: 'Scottish Church College', kind: 'college', at: [22.5888, 88.3698], accuracy: 'approximate', minZoom: C, aliases: ['Scottish'] },
  { id: 'p-bethune', name: 'Bethune College', kind: 'college', at: [22.5905, 88.3688], accuracy: 'approximate', minZoom: C },
  { id: 'p-asutosh', name: 'Asutosh College', kind: 'college', at: [22.5235, 88.3478], accuracy: 'approximate', minZoom: C },
  { id: 'p-lady-brabourne', name: 'Lady Brabourne College', kind: 'college', at: [22.5418, 88.3640], accuracy: 'approximate', minZoom: C },
  { id: 'p-loreto', name: 'Loreto College', kind: 'college', at: [22.5478, 88.3528], accuracy: 'approximate', minZoom: C },
  { id: 'p-heritage', name: 'Heritage Institute of Technology', kind: 'college', at: [22.5165, 88.4180], accuracy: 'approximate', minZoom: C, aliases: ['Heritage', 'HITK'] },
  { id: 'p-iem', name: 'IEM Kolkata', kind: 'college', at: [22.5752, 88.4342], accuracy: 'approximate', minZoom: C, aliases: ['Institute of Engineering & Management', 'UEM'] },
  // --- Landmarks
  { id: 'p-victoria-memorial', name: 'Victoria Memorial', kind: 'landmark', at: [22.5448, 88.3426], accuracy: 'surveyed', minZoom: 10.6, aliases: ['Victoria'] },
  { id: 'p-howrah-bridge', name: 'Howrah Bridge', kind: 'landmark', at: [22.5851, 88.3468], accuracy: 'surveyed', minZoom: 10.6, aliases: ['Rabindra Setu'] },
  { id: 'p-eden-gardens', name: 'Eden Gardens', kind: 'sports', at: [22.5646, 88.3433], accuracy: 'surveyed', minZoom: L, aliases: ['Eden'] },
  { id: 'p-indian-museum', name: 'Indian Museum', kind: 'landmark', at: [22.5580, 88.3512], accuracy: 'surveyed', minZoom: L },
  { id: 'p-science-city', name: 'Science City', kind: 'landmark', at: [22.5398, 88.3960], accuracy: 'surveyed', minZoom: L },
  { id: 'p-kalighat-temple', name: 'Kalighat Temple', kind: 'landmark', at: [22.5205, 88.3421], accuracy: 'surveyed', minZoom: L },
  { id: 'p-dakshineswar', name: 'Dakshineswar Temple', kind: 'landmark', at: [22.6550, 88.3575], accuracy: 'surveyed', minZoom: L },
  { id: 'p-belur-math', name: 'Belur Math', kind: 'landmark', at: [22.6320, 88.3560], accuracy: 'approximate', minZoom: L },
  { id: 'p-princep-ghat', name: 'Princep Ghat', kind: 'landmark', at: [22.5550, 88.3305], accuracy: 'surveyed', minZoom: L },
  { id: 'p-howrah-station', name: 'Howrah Station', kind: 'transit', at: [22.5833, 88.3424], accuracy: 'surveyed', minZoom: L },
  { id: 'p-sealdah-station', name: 'Sealdah Station', kind: 'transit', at: [22.5675, 88.3700], accuracy: 'surveyed', minZoom: L },
  { id: 'p-airport', name: 'Kolkata Airport', kind: 'transit', at: [22.6547, 88.4467], accuracy: 'surveyed', minZoom: 10, aliases: ['CCU', 'Netaji Subhas Chandra Bose International Airport', 'Dum Dum Airport'] },
  { id: 'p-biswa-bangla-gate', name: 'Biswa Bangla Gate', kind: 'landmark', at: [22.5868, 88.4703], accuracy: 'approximate', minZoom: L },
  { id: 'p-city-centre', name: 'City Centre Salt Lake', kind: 'landmark', at: [22.5882, 88.4085], accuracy: 'approximate', minZoom: L, aliases: ['CC1', 'City Centre 1'] },
  { id: 'p-city-centre-2', name: 'City Centre 2', kind: 'landmark', at: [22.6215, 88.4505], accuracy: 'approximate', minZoom: L, aliases: ['CC2'] },
  // --- Parks, lakes, sports
  { id: 'p-maidan', name: 'The Maidan', kind: 'park', at: [22.5530, 88.3460], accuracy: 'surveyed', minZoom: L, aliases: ['Brigade Parade Ground'] },
  { id: 'p-rabindra-sarobar', name: 'Rabindra Sarobar', kind: 'lake', at: [22.5115, 88.3625], accuracy: 'surveyed', minZoom: L, aliases: ['Dhakuria Lake', 'Dhakuria Lakes', 'Lake Kalibari'] },
  { id: 'p-subhas-sarobar', name: 'Subhas Sarobar', kind: 'lake', at: [22.5660, 88.3990], accuracy: 'approximate', minZoom: L, aliases: ['Beleghata Lake'] },
  { id: 'p-central-park', name: 'Central Park', kind: 'park', at: [22.5832, 88.4170], accuracy: 'approximate', minZoom: L, aliases: ['Salt Lake Central Park', 'Banabitan'] },
  { id: 'p-central-park-lake', name: 'Central Park Lake', kind: 'lake', at: [22.5822, 88.4180], accuracy: 'approximate', minZoom: 13.5 },
  { id: 'p-nalban', name: 'Nalban Lake', kind: 'lake', at: [22.5560, 88.4275], accuracy: 'approximate', minZoom: 12.5, aliases: ['Nalban Boating'] },
  { id: 'p-jheel-meel', name: 'Jheel Meel', kind: 'lake', at: [22.5700, 88.4232], accuracy: 'approximate', minZoom: 13.5 },
  { id: 'p-eco-park', name: 'Eco Park', kind: 'park', at: [22.6010, 88.4680], accuracy: 'approximate', minZoom: L, aliases: ['Prakriti Tirtha'] },
  { id: 'p-eco-park-lake', name: 'Eco Park Lake', kind: 'lake', at: [22.6030, 88.4700], accuracy: 'approximate', minZoom: 13 },
  { id: 'p-salt-lake-stadium', name: 'Salt Lake Stadium', kind: 'sports', at: [22.5690, 88.4090], accuracy: 'approximate', minZoom: L, aliases: ['Yuva Bharati Krirangan', 'VYBK'] },
  { id: 'p-college-square', name: 'College Square', kind: 'lake', at: [22.5752, 88.3650], accuracy: 'approximate', minZoom: 13.5, aliases: ['Goldighi'] },
  { id: 'p-botanical-garden', name: 'Botanical Garden', kind: 'park', at: [22.5590, 88.2880], accuracy: 'surveyed', minZoom: L, aliases: ['Great Banyan', 'Shibpur Botanical Garden'] },
  { id: 'p-santragachi-jheel', name: 'Santragachi Jheel', kind: 'lake', at: [22.5830, 88.2960], accuracy: 'approximate', minZoom: 12.5 },
  { id: 'p-alipore-zoo', name: 'Alipore Zoo', kind: 'park', at: [22.5368, 88.3313], accuracy: 'surveyed', minZoom: L },
  // --- Student hotspots
  { id: 'p-coffee-house', name: 'Indian Coffee House', kind: 'hotspot', at: [22.5762, 88.3637], accuracy: 'approximate', minZoom: H, aliases: ['Coffee House', 'Albert Hall'] },
  { id: 'p-boi-para', name: 'Boi Para (Book Market)', kind: 'hotspot', at: [22.5755, 88.3632], accuracy: 'approximate', minZoom: H, aliases: ['Boi Para', 'Book Market', 'College Street Book Market'] },
  { id: 'p-8b', name: '8B Bus Stand', kind: 'hotspot', at: [22.4960, 88.3690], accuracy: 'approximate', minZoom: H, aliases: ['8B'] },
  { id: 'p-park-street-cafes', name: 'Park Street cafés', kind: 'hotspot', at: [22.5528, 88.3540], accuracy: 'approximate', minZoom: H, aliases: ['Park Street'] },
  { id: 'p-gariahat-market', name: 'Gariahat Market', kind: 'hotspot', at: [22.5180, 88.3700], accuracy: 'approximate', minZoom: H },
  { id: 'p-golpark', name: 'Golpark', kind: 'hotspot', at: [22.5155, 88.3675], accuracy: 'approximate', minZoom: H },
  { id: 'p-dakshinapan', name: 'Dakshinapan', kind: 'hotspot', at: [22.5040, 88.3650], accuracy: 'approximate', minZoom: H },
  { id: 'p-sector-v-food-street', name: 'Sector V food street', kind: 'hotspot', at: [22.5700, 88.4330], accuracy: 'approximate', minZoom: H, aliases: ['Webel More food'] },
  { id: 'p-new-market', name: 'New Market', kind: 'hotspot', at: [22.5600, 88.3520], accuracy: 'surveyed', minZoom: H, aliases: ['Hogg Market'] },
  // --- Salt Lake crossings
  { id: 'p-karunamoyee', name: 'Karunamoyee', kind: 'junction', at: [22.5850, 88.4225], accuracy: 'approximate', minZoom: J },
  { id: 'p-college-more', name: 'College More', kind: 'junction', at: [22.5745, 88.4330], accuracy: 'approximate', minZoom: J },
  { id: 'p-wipro-more', name: 'Wipro More', kind: 'junction', at: [22.5795, 88.4375], accuracy: 'approximate', minZoom: J },
  { id: 'p-webel-more', name: 'Webel More', kind: 'junction', at: [22.5690, 88.4335], accuracy: 'approximate', minZoom: J },
  { id: 'p-ultadanga-crossing', name: 'Ultadanga crossing', kind: 'junction', at: [22.5935, 88.3925], accuracy: 'approximate', minZoom: J },
  { id: 'p-chingrighata', name: 'Chingrighata', kind: 'junction', at: [22.5630, 88.4055], accuracy: 'approximate', minZoom: J },
];
