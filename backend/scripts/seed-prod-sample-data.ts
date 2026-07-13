import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { db, closeDb } from '../src/db.js';

// Production-safe sample-data generator for fofafu_vault/features/seed-prod-sample-data.md.
//
// Differs from scripts/seed-dummy.ts (which is test-only) in three ways:
//   - rows are flagged `is_sample = 1` on `users` and `families` so they can be
//     identified and pruned later without guessing by email domain
//   - each user gets a unique random password (never printed, never shared) —
//     sample accounts exist to populate the UI, not to be logged into
//   - idempotent by checking for existing is_sample rows, not fixed emails,
//     so re-running never duplicates data; pass --force to wipe and regenerate
const FAMILY_COUNT = 20;
const MIN_POSTS = 1;
const MAX_POSTS = 50;
const MIN_MEMBERS = 1;
const MAX_MEMBERS = 5;
const PHOTO_CHANCE = 0.35;

const FORCE = process.argv.includes('--force');

const FIRST_NAMES = [
  'Anderson', 'Brooks', 'Chen', 'Davis', 'Ellis', 'Foster', 'Grant', 'Huang',
  'Ibrahim', 'Jackson', 'Kim', 'Lopez', 'Martinez', 'Nguyen', 'Okafor', 'Patel',
  'Quinn', 'Rivera', 'Sanders', 'Torres', 'Ueda', 'Vasquez', 'Walker', 'Xu',
  'Young', 'Zimmerman',
];

const CITIES: { city: string; state: string }[] = [
  { city: 'Portland', state: 'OR' },
  { city: 'Austin', state: 'TX' },
  { city: 'Seattle', state: 'WA' },
  { city: 'Atlanta', state: 'GA' },
  { city: 'Denver', state: 'CO' },
  { city: 'Minneapolis', state: 'MN' },
  { city: 'Raleigh', state: 'NC' },
  { city: 'Phoenix', state: 'AZ' },
  { city: 'Columbus', state: 'OH' },
  { city: 'Sacramento', state: 'CA' },
  { city: 'Nashville', state: 'TN' },
  { city: 'Providence', state: 'RI' },
];

const BIO_TEMPLATES = [
  'Fostering for {years} years. {kids} kids in the house right now. We love hikes, slow mornings, and loud kitchens.',
  'First-time foster parents ({years} year{plural} in). Mostly here to learn from the rest of you.',
  'Bilingual home. {years} years fostering, mostly teens.',
  'Multi-generational household — grandparents help with school runs while we handle everything else.',
  'Respite family. We take short placements so full-time foster parents can breathe.',
  '{years} years in. Still learning something new every placement.',
];

const POST_TEMPLATES = [
  'First day of school done. They walked in on their own. I sat in the car and cried for ten minutes.',
  'Anyone have a pediatrician they love in the metro area? Ours just retired and we are starting over.',
  'Court date moved again. Third time this year. Hard to keep things normal when nothing is.',
  'Tiny win: she asked for a hug today. Took six months. I will take it.',
  'Casserole drop went well — thank you to whoever started that thread. Three families fed tonight.',
  'School called about behavior again. Trauma-informed teacher this year would be amazing. Recommendations?',
  'New placement landing tomorrow morning. Bracing the older kids gently. Wish us luck.',
  'Reminder that the support group meets Thursday at 7. Childcare provided this week.',
  'Bio mom showed up to visitation. First time in two months. Whole car ride home was quiet.',
  'IEP meeting tomorrow. If anyone has done one of these before for a kiddo with sensory stuff — DM me.',
  'Made it to year three. Three years ago today our first placement walked through the door. He calls now.',
  'Group home folks: anyone navigating siblings split across two placements? Looking for advice.',
  'Slow morning. Pancakes. Nobody crying. Logging this so future-me remembers it happens.',
  'CPS visit went fine. The whole house is exhausted from cleaning for three days. Worth it.',
  'Teenager update: he made varsity. He had not played a sport in his life until September.',
  'Found out today that the kids will move on next month. Knew it was coming. Still rough.',
  'Calendar reminder: respite weekend signup closes Friday. We have three slots left.',
  'Newborn placement coming home from the hospital Friday. Inventory check on bottles — anyone donating?',
  'Got into the foster parent training cohort starting in February. About time.',
  'Sibling visit went really well. The little one fell asleep in big sister lap for the first time in a year.',
  'Pediatric dentist recommendation needed. Trauma-aware. Will travel.',
  'School play tonight. He has two lines. I am taking the whole front row.',
  'New caseworker assigned. Third one this calendar year. Starting fresh on the relationship.',
  'Adoption finalization is on the calendar. Court at 10am. The judge already knows our family by name.',
  'Weekend was quiet for once. Taking the win.',
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[randInt(0, items.length - 1)]!;
}

function isoMinusDays(days: number, minutes: number): string {
  const d = new Date(Date.now() - days * 86_400_000 - minutes * 60_000);
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

function familyAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

function postPhotoUrl(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`;
}

function buildBio(): string {
  const years = randInt(1, 8);
  const kids = randInt(MIN_MEMBERS, MAX_MEMBERS);
  return pick(BIO_TEMPLATES)
    .replace('{years}', String(years))
    .replace('{plural}', years === 1 ? '' : 's')
    .replace('{kids}', String(kids));
}

async function main() {
  const existing = db().prepare('SELECT COUNT(*) AS n FROM families WHERE is_sample = 1').get() as { n: number };

  if (existing.n > 0 && !FORCE) {
    console.log(`${existing.n} sample families already present — skipping. Re-run with --force to wipe and regenerate.`);
    closeDb();
    return;
  }

  if (existing.n > 0 && FORCE) {
    const sampleUserIds = db().prepare('SELECT id FROM users WHERE is_sample = 1').all() as { id: string }[];
    const deleteUser = db().prepare('DELETE FROM users WHERE id = ?'); // cascades to families/announcements/comments/reactions
    db().transaction(() => {
      for (const { id } of sampleUserIds) deleteUser.run(id);
    })();
    console.log(`--force: removed ${sampleUserIds.length} existing sample users and their cascaded data.`);
  }

  const insertUser = db().prepare(
    'INSERT INTO users (id, email, password, name, city, state, verified, is_sample) VALUES (?, ?, ?, ?, ?, ?, 1, 1)'
  );
  const insertFamily = db().prepare(
    'INSERT INTO families (id, user_id, name, bio, kid_count, avatar_url, is_sample) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );
  const insertAnnouncement = db().prepare(
    'INSERT INTO announcements (id, user_id, content, media_url, media_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const usedSurnames = new Set<string>();
  const summary: { name: string; city: string; members: number; posts: number; photos: number }[] = [];

  const tx = db().transaction(() => {
    for (let i = 0; i < FAMILY_COUNT; i++) {
      let surname = pick(FIRST_NAMES);
      while (usedSurnames.has(surname) && usedSurnames.size < FIRST_NAMES.length) {
        surname = pick(FIRST_NAMES);
      }
      usedSurnames.add(surname);

      const { city, state } = pick(CITIES);
      const name = `The ${surname} Family`;
      const email = `${surname.toLowerCase()}.sample.${i}@sample.fofafu.app`;
      const memberCount = randInt(MIN_MEMBERS, MAX_MEMBERS);
      const postCount = randInt(MIN_POSTS, MAX_POSTS);

      const userId = randomUUID();
      const familyId = randomUUID();
      const password = randomBytes(24).toString('hex');
      const hashed = bcrypt.hashSync(password, 12);

      insertUser.run(userId, email, hashed, name, city, state);
      insertFamily.run(familyId, userId, name, buildBio(), memberCount, familyAvatarUrl(name));

      let photoCount = 0;
      for (let p = 0; p < postCount; p++) {
        const hasPhoto = p === 0 || Math.random() < PHOTO_CHANCE;
        const postId = randomUUID();
        const mediaUrl = hasPhoto ? postPhotoUrl(postId) : null;
        const mediaType = hasPhoto ? 'image' : null;
        if (hasPhoto) photoCount++;

        const createdAt = isoMinusDays(randInt(0, 89), randInt(0, 1439));
        insertAnnouncement.run(postId, userId, pick(POST_TEMPLATES), mediaUrl, mediaType, createdAt, createdAt);
      }

      summary.push({ name, city: `${city}, ${state}`, members: memberCount, posts: postCount, photos: photoCount });
    }
  });

  tx();

  const totalPosts = summary.reduce((sum, f) => sum + f.posts, 0);
  const totalPhotos = summary.reduce((sum, f) => sum + f.photos, 0);

  console.log(`Created ${summary.length} sample families (${totalPosts} posts, ${totalPhotos} with photos):\n`);
  for (const f of summary) {
    console.log(`  ${f.name.padEnd(24)} ${f.city.padEnd(18)} members=${f.members}  posts=${String(f.posts).padStart(2)}  photos=${f.photos}`);
  }

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
