/**
 * KOLKATA (east bank of the Hooghly) — the primary playable city. Each seed is the centre of a
 * real neighbourhood; the city outline is tessellated around them, so zones are contiguous and
 * sized by how dense the neighbourhoods are. Outlines are approximate game boundaries, not wards.
 *
 * The outline's west edge follows the river's east bank; its east edge is shared, vertex for
 * vertex, with Salt Lake and New Town (saltLake.ts / newTown.ts), so the regions tile cleanly.
 */
import type { RegionSpec } from '../../types.ts';
import { COLLEGE_STREET_TERRITORIES } from './collegeStreet.ts';
import { DHAKURIA_TERRITORIES, JADAVPUR_TERRITORIES } from './dhakuria.ts';
import { SALT_LAKE_CORNERS as S } from './saltLake.ts';

export const KOLKATA: RegionSpec = {
  id: 'kolkata',
  name: 'Kolkata',
  district: 'KOLKATA',
  accuracy: 'approximate',
  outline: [
    // North, along the Hooghly's east bank (Dakshineswar → Bagbazar → Howrah Bridge → Princep Ghat)
    [22.6650, 88.3600], [22.6550, 88.3580], [22.6300, 88.3610], [22.6000, 88.3580], [22.5860, 88.3510],
    [22.5720, 88.3440], [22.5600, 88.3360], [22.5500, 88.3270], [22.5450, 88.3150], [22.5420, 88.3000],
    [22.5380, 88.2850], [22.5300, 88.2700],
    // South-west and south (Behala, Joka, Garia)
    [22.4950, 88.2850], [22.4600, 88.2900], [22.4350, 88.3000], [22.4350, 88.3600], [22.4550, 88.4100],
    // East, up the Bypass to Salt Lake
    [22.4900, 88.4150], [22.5150, 88.4120], [22.5400, 88.4080], S.H, S.I, S.A, S.B, S.C,
    // Baguiati and the airport, along New Town's west edge
    [22.6050, 88.4300], [22.6230, 88.4440], [22.6650, 88.4520], [22.6700, 88.4000],
  ],
  seeds: [
    { id: 'dakshineswar', name: 'Dakshineswar', at: [22.6520, 88.3640], tags: ['heritage', 'water'], blurb: 'The temple ghats at the city’s northern gate.' },
    { id: 'baranagar', name: 'Baranagar', at: [22.6380, 88.3720], tags: ['campus'], blurb: 'Home of the Indian Statistical Institute.' },
    { id: 'airport-gate', name: 'Airport Gate', at: [22.6500, 88.4350], tags: ['transit'], blurb: 'Netaji Subhas Chandra Bose International, and everyone leaving or coming home.' },
    { id: 'dum-dum', name: 'Dum Dum', at: [22.6250, 88.4100], tags: ['transit'], blurb: 'Metro, rail and the north’s busiest junction.' },
    { id: 'baguiati', name: 'Baguiati', at: [22.6150, 88.4300], tags: ['market'], blurb: 'The busy gateway between the city and New Town.' },
    { id: 'lake-town', name: 'Lake Town', at: [22.6060, 88.4030], tags: ['water', 'park'], blurb: 'Lakes, pandals and a loop that never closes.' },
    { id: 'cossipore', name: 'Cossipore', at: [22.6180, 88.3750], tags: ['heritage'], blurb: 'Gun & Shell factory walls and riverside lanes.' },
    { id: 'shyambazar', name: 'Shyambazar', at: [22.6000, 88.3720], tags: ['transit', 'market'], blurb: 'Five-point crossing — the heart of North Calcutta.' },
    { id: 'sovabazar', name: 'Sovabazar', at: [22.5930, 88.3610], tags: ['heritage'], blurb: 'Rajbari courtyards and the old city’s ghats.' },
    { id: 'ultadanga', name: 'Ultadanga', at: [22.5920, 88.3880], tags: ['transit'], blurb: 'Where the Bypass meets the north.' },
    { id: 'maniktala', name: 'Maniktala', at: [22.5880, 88.3800], tags: ['market'], blurb: 'Fish market mornings and canal-side runs.' },
    { id: 'rajabazar', name: 'Rajabazar', at: [22.5840, 88.3730], tags: ['campus', 'student'], blurb: 'CU’s Rajabazar Science College — labs till late.' },
    { id: 'burrabazar', name: 'Burrabazar', at: [22.5800, 88.3520], tags: ['market'], blurb: 'Asia’s busiest wholesale maze, by Howrah Bridge.' },
    { id: 'college-street', name: 'College Street', at: [22.5750, 88.3635], tags: ['student', 'campus', 'hotspot', 'heritage'], blurb: 'Boi Para, Presidency and Coffee House — the student capital of Kolkata.', children: COLLEGE_STREET_TERRITORIES },
    { id: 'bbd-bag', name: 'BBD Bag', at: [22.5720, 88.3480], tags: ['heritage'], blurb: 'Dalhousie Square and the Writers’ Building.' },
    { id: 'sealdah', name: 'Sealdah', at: [22.5670, 88.3720], tags: ['transit', 'student'], blurb: 'The station half of the city’s students arrive through.' },
    { id: 'phoolbagan', name: 'Phoolbagan', at: [22.5770, 88.3900], tags: ['sports'], blurb: 'Kankurgachi lanes and Mohun Bagan territory talk.' },
    { id: 'beleghata', name: 'Beleghata', at: [22.5640, 88.3930], tags: ['water', 'park'], blurb: 'Subhas Sarobar — a lake loop away from the traffic.' },
    { id: 'esplanade', name: 'Esplanade', at: [22.5640, 88.3520], tags: ['transit', 'hotspot'], blurb: 'Dharmatala. Every rally, every tram, every crowd.' },
    { id: 'entally', name: 'Entally', at: [22.5550, 88.3780], tags: ['market'], blurb: 'Padmapukur and the old tram depot.' },
    { id: 'park-street', name: 'Park Street', at: [22.5520, 88.3560], tags: ['hotspot', 'student'], blurb: 'Cafés, music and St. Xavier’s at the corner.' },
    { id: 'maidan', name: 'Maidan', at: [22.5520, 88.3420], tags: ['park', 'sports', 'heritage'], blurb: 'Victoria Memorial, Eden Gardens and the city’s great green lung.' },
    { id: 'tangra', name: 'Tangra', at: [22.5520, 88.3920], tags: ['market'], blurb: 'Chinatown kitchens and leather lanes.' },
    { id: 'park-circus', name: 'Park Circus', at: [22.5400, 88.3700], tags: ['campus', 'student'], blurb: 'Aliah University’s Park Circus campus and the seven-point crossing.' },
    { id: 'science-city', name: 'Science City', at: [22.5390, 88.3960], tags: ['student'], blurb: 'The space-odyssey dome on the Bypass.' },
    { id: 'bhowanipore', name: 'Bhowanipore', at: [22.5330, 88.3460], tags: ['market', 'heritage'], blurb: 'Jadubabu’s Bazaar and old-Calcutta mansions.' },
    { id: 'kidderpore', name: 'Kidderpore', at: [22.5380, 88.3200], tags: ['transit', 'water'], blurb: 'The docks and the river’s great bend.' },
    { id: 'alipore', name: 'Alipore', at: [22.5270, 88.3300], tags: ['park'], blurb: 'The zoo, the National Library and wide quiet roads.' },
    { id: 'garden-reach', name: 'Garden Reach', at: [22.5320, 88.2920], tags: ['water'], blurb: 'Shipyards on the Hooghly.' },
    { id: 'ballygunge', name: 'Ballygunge', at: [22.5280, 88.3630], tags: ['campus', 'student'], blurb: 'CU’s Ballygunge Science College and Gariahat Road.' },
    { id: 'kalighat', name: 'Kalighat', at: [22.5200, 88.3450], tags: ['heritage'], blurb: 'The temple, the patachitra painters and Tolly’s Nullah.' },
    { id: 'gariahat', name: 'Gariahat', at: [22.5170, 88.3720], tags: ['market', 'hotspot', 'student'], blurb: 'The crossing that never sleeps. Golpark is round the corner.' },
    { id: 'kasba', name: 'Kasba', at: [22.5160, 88.3880], tags: ['market'], blurb: 'Malls and new towers along the Bypass.' },
    { id: 'ruby', name: 'Ruby', at: [22.5130, 88.4030], tags: ['transit'], blurb: 'Ruby crossing on the EM Bypass.' },
    { id: 'dhakuria', name: 'Dhakuria', at: [22.5070, 88.3660], tags: ['student', 'water', 'park'], blurb: 'The lakes, the bridge and the south side’s favourite loops.', children: DHAKURIA_TERRITORIES },
    { id: 'jadavpur', name: 'Jadavpur', at: [22.4960, 88.3730], tags: ['student', 'campus', 'hotspot'], blurb: 'Jadavpur University and the 8B universe around it.', children: JADAVPUR_TERRITORIES },
    { id: 'new-alipore', name: 'New Alipore', at: [22.5080, 88.3330], tags: ['park'], blurb: 'Leafy blocks between Tolly and Behala.' },
    { id: 'tollygunge', name: 'Tollygunge', at: [22.4970, 88.3470], tags: ['hotspot'], blurb: 'Tollywood studios and the Tollygunge Club greens.' },
    { id: 'mukundapur', name: 'Mukundapur', at: [22.4950, 88.4000], tags: ['market'], blurb: 'Hospitals, new housing and the southern Bypass.' },
    { id: 'behala', name: 'Behala', at: [22.4980, 88.3100], tags: ['market'], blurb: 'The long road south-west — Diamond Harbour Road.' },
    { id: 'regent-park', name: 'Regent Park', at: [22.4800, 88.3550], tags: ['park'], blurb: 'Bansdroni and the metro’s southern stretch.' },
    { id: 'santoshpur', name: 'Santoshpur', at: [22.4820, 88.3850], tags: ['water'], blurb: 'Ponds, parks and the Santoshpur lake.' },
    { id: 'thakurpukur', name: 'Thakurpukur', at: [22.4660, 88.3050], tags: ['market'], blurb: 'The far south-west edge of the city.' },
    { id: 'joka', name: 'Joka', at: [22.4520, 88.3050], tags: ['campus'], blurb: 'IIM Calcutta’s lakes and the metro’s last stop.' },
    { id: 'garia', name: 'Garia', at: [22.4630, 88.3870], tags: ['transit', 'student'], blurb: 'Kavi Nazrul metro and the colleges along the south.' },
  ],
};
