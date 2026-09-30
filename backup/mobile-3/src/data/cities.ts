/**
 * Cities are data, not code. Pune is the demo default; every city-scoped list
 * (crews, events, map places, "Nearby" feed) is derived from the active city.
 * To add a city, add an entry here — no screen changes needed.
 */
export type City = {
  id: string;
  name: string;
  country: string;
  /** The demo user's campus: the Campus Leaderboard ranks students here. */
  campus: string;
  /** Neighbourhoods used for post locations and event venues. */
  areas: string[];
  venues: {
    runs: string[]; // lakes, parks, promenades
    parks: string[];
    cafes: string[];
    studios: string[];
  };
};

export const cities: City[] = [
  {
    id: 'pune',
    name: 'Pune',
    country: 'India',
    campus: 'Ganeshkhind Campus',
    areas: ['Koregaon Park', 'Baner', 'Viman Nagar', 'Kothrud', 'Hinjewadi', 'Aundh', 'Kalyani Nagar'],
    venues: {
      runs: ['Pashan Lake', 'Vetal Tekdi', 'Mula-Mutha Riverfront', 'Empress Garden Loop'],
      parks: ['Osho Teerth Park', 'Kamala Nehru Park', 'Sambhaji Park'],
      cafes: ['Green Bowl, Viman Nagar', 'Sprout Café, KP', 'Fuel Kitchen, Baner'],
      studios: ['Squirrel Studio, KP', 'Pulse HIIT, Kothrud'],
    },
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    country: 'India',
    campus: 'Powai Campus',
    areas: ['Bandra', 'Juhu', 'Colaba', 'Powai', 'Lower Parel', 'Andheri West'],
    venues: {
      runs: ['Marine Drive', 'Carter Road Promenade', 'Powai Lake Loop', 'Juhu Beach'],
      parks: ['Joggers Park, Bandra', 'Priyadarshini Park', 'Shivaji Park'],
      cafes: ['Kitchen Garden, Bandra', 'Sequel, Kala Ghoda', 'Bowl Co., Juhu'],
      studios: ['Squirrel Studio, Bandra', 'Pulse HIIT, Powai'],
    },
  },
  {
    id: 'bangalore',
    name: 'Bangalore',
    country: 'India',
    campus: 'Malleshwaram Campus',
    areas: ['Indiranagar', 'Koramangala', 'HSR Layout', 'Whitefield', 'Jayanagar'],
    venues: {
      runs: ['Cubbon Park Loop', 'Ulsoor Lake', 'Sankey Tank', 'Lalbagh Circuit'],
      parks: ['Cubbon Park', 'Lalbagh Botanical Garden', 'Agara Lake Park'],
      cafes: ['Green Theory, Residency Rd', 'Third Wave, Koramangala', 'Sprout Bowl, HSR'],
      studios: ['Squirrel Studio, Indiranagar', 'Pulse HIIT, Whitefield'],
    },
  },
  {
    id: 'delhi',
    name: 'Delhi',
    country: 'India',
    campus: 'North Campus',
    areas: ['Hauz Khas', 'Saket', 'Connaught Place', 'Vasant Kunj', 'Greater Kailash'],
    venues: {
      runs: ['Lodhi Garden Loop', 'Nehru Park Track', 'India Gate Lawns', 'Sanjay Van Trail'],
      parks: ['Lodhi Garden', 'Deer Park, Hauz Khas', 'Sunder Nursery'],
      cafes: ['Greenr Café, Hauz Khas', 'Sprout Bowl, CP', 'Fuel Kitchen, Saket'],
      studios: ['Squirrel Studio, Hauz Khas', 'Pulse HIIT, GK'],
    },
  },
  {
    id: 'hyderabad',
    name: 'Hyderabad',
    country: 'India',
    campus: 'Gachibowli Campus',
    areas: ['Jubilee Hills', 'Banjara Hills', 'Gachibowli', 'Madhapur', 'Kondapur'],
    venues: {
      runs: ['Necklace Road', 'KBR Park Trail', 'Durgam Cheruvu Loop', 'Gachibowli Stadium'],
      parks: ['KBR National Park', 'Sanjeevaiah Park', 'Botanical Garden'],
      cafes: ['Roastery, Banjara Hills', 'Green Bowl, Gachibowli', 'Sprout Café, Jubilee Hills'],
      studios: ['Squirrel Studio, Jubilee Hills', 'Pulse HIIT, Gachibowli'],
    },
  },
  {
    id: 'london',
    name: 'London',
    country: 'UK',
    campus: 'Bloomsbury Campus',
    areas: ['Shoreditch', 'Clapham', 'Camden', 'Greenwich', 'Notting Hill'],
    venues: {
      runs: ['Regent’s Canal Towpath', 'Hyde Park Loop', 'Thames Path', 'Victoria Park'],
      parks: ['Hyde Park', 'Clapham Common', 'Greenwich Park'],
      cafes: ['Farm Girl, Notting Hill', 'Grain Bowl, Shoreditch', 'Sprout, Clapham'],
      studios: ['Squirrel Studio, Shoreditch', 'Pulse HIIT, Camden'],
    },
  },
  {
    id: 'nyc',
    name: 'New York',
    country: 'USA',
    campus: 'Morningside Campus',
    areas: ['Williamsburg', 'Chelsea', 'SoHo', 'Harlem', 'DUMBO'],
    venues: {
      runs: ['Hudson River Greenway', 'Central Park Loop', 'Brooklyn Bridge', 'East River Track'],
      parks: ['Central Park', 'Prospect Park', 'Domino Park'],
      cafes: ['Dig Inn, SoHo', 'Sweetgreen, Chelsea', 'Bowl Society, DUMBO'],
      studios: ['Squirrel Studio, Williamsburg', 'Pulse HIIT, Harlem'],
    },
  },
];

export const DEFAULT_CITY_ID = 'pune';

export const cityById = (id: string) => cities.find((c) => c.id === id) ?? cities[0];
