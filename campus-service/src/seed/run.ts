/**
 * npm run seed — idempotent development seed: hostels, ~16 IISER Kolkata zones (placeholder geometry),
 * territory rows, and (outside production) a handful of dev users + one dev crew.
 *
 * Zones only (hostels + zones + territory rows; never users or crews):
 *   npm run seed:zones · node dist/seed/run.js --zones-only · SEED_ZONES_ON_START=1 node dist/index.js
 * Geometry is only ever overwritten while a zone's geometry_source is still 'dev_placeholder'.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { closePool, getPool, query } from '../db/pool.js';
import { HOSTELS, ZONES, polygonWkt, lineWkt } from './zones.js';

export async function seedZones() {
  for (const h of HOSTELS) await query(`INSERT INTO hostels (id, name, short_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name`, [h.id, h.name, h.short]);
  for (const z of ZONES) {
    await query(
      `INSERT INTO zones (id, name, short_name, description, kind, zone_type, geometry, centroid, required_route, qualify_threshold, hostel_id, geometry_source)
       VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromText($7, 4326), ST_Centroid(ST_GeomFromText($7, 4326)), $8, $9, $10, 'dev_placeholder')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name, description = EXCLUDED.description, kind = EXCLUDED.kind, zone_type = EXCLUDED.zone_type,
         geometry = CASE WHEN zones.geometry_source = 'dev_placeholder' THEN EXCLUDED.geometry ELSE zones.geometry END,
         centroid = CASE WHEN zones.geometry_source = 'dev_placeholder' THEN EXCLUDED.centroid ELSE zones.centroid END,
         required_route = CASE WHEN zones.geometry_source = 'dev_placeholder' THEN EXCLUDED.required_route ELSE zones.required_route END,
         qualify_threshold = EXCLUDED.qualify_threshold, hostel_id = EXCLUDED.hostel_id, updated_at = now()`,
      [z.id, z.name, z.short, z.description, z.kind, z.zoneType, polygonWkt(z.xy), z.routeXy ? `SRID=4326;${lineWkt(z.routeXy)}` : null, z.threshold ?? null, z.hostel],
    );
    await query(`INSERT INTO territories (zone_id) VALUES ($1) ON CONFLICT DO NOTHING`, [z.id]);
  }
}

export const DEV_USERS = [
  { id: 'u_aanya', name: 'Aanya Moves', email: 'aanya@iiserkol.ac.in', hostel: 'narmada' },
  { id: 'u_rhea', name: 'Rhea Runs', email: 'rhea@iiserkol.ac.in', hostel: 'tapti' },
  { id: 'u_kabir', name: 'Kabir Cycles', email: 'kabir@iiserkol.ac.in', hostel: 'godavari' },
  { id: 'u_dev', name: 'Dev Squirrel', email: 'dev@iiserkol.ac.in', hostel: 'narmada' },
];

export async function seedDevUsers() {
  for (const u of DEV_USERS) {
    await query(
      `INSERT INTO users (id, display_name, email, email_domain, hostel_id, onboarding_completed, founding_member)
       VALUES ($1, $2, $3, $4, $5, true, true) ON CONFLICT (id) DO UPDATE SET hostel_id = EXCLUDED.hostel_id`,
      [u.id, u.name, u.email, u.email.split('@')[1], u.hostel]);
  }
  await query(`INSERT INTO crews (name, description, color, owner_id) VALUES ('Narmada Night Runners', 'Late-night loops.', '#D7FF1F', 'u_aanya') ON CONFLICT (name) DO NOTHING`);
  await query(`INSERT INTO crew_members (crew_id, user_id, role) SELECT id, 'u_aanya', 'owner' FROM crews WHERE name = 'Narmada Night Runners' ON CONFLICT DO NOTHING`);
  await query(`INSERT INTO crew_members (crew_id, user_id, role) SELECT id, 'u_dev', 'member' FROM crews WHERE name = 'Narmada Night Runners' ON CONFLICT DO NOTHING`);
}

export async function seed(opts: { zonesOnly?: boolean } = {}) {
  await seedZones();
  const withUsers = !opts.zonesOnly && !config.isProd;
  if (withUsers) await seedDevUsers();
  console.log(`seeded ${HOSTELS.length} hostels, ${ZONES.length} zones${withUsers ? `, ${DEV_USERS.length} dev users` : ''} (new zones: geometry_source = dev_placeholder)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed({ zonesOnly: process.argv.includes('--zones-only') }).then(() => closePool()).catch((e) => { console.error(e); process.exit(1); });
}
void getPool;
