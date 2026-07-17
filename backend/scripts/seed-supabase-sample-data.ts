import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Supabase port of scripts/seed-prod-sample-data.ts. That script inserts
// directly into the old local sqlite db (backend/src/db.ts) and predates the
// move to Supabase Auth — it no longer touches the live project at all.
// This one creates real auth.users via the Admin API (which fires the
// on_auth_user_created trigger to create each families row), then updates
// bio/kid_count/avatar_url and inserts announcements through the
// service-role client. Sample accounts are identified by an
// @sample.fofafu.app email suffix (never printed/shared — each gets a random
// password) so they can be found and pruned with --force without guessing.
const SAMPLE_EMAIL_DOMAIN = 'sample.fofafu.app';

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
  return new Date(Date.now() - days * 86_400_000 - minutes * 60_000).toISOString();
}

function familyAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

function postPhotoUrl(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`;
}

function buildBio(): { bio: string; kidCount: number } {
  const years = randInt(1, 8);
  const kidCount = randInt(MIN_MEMBERS, MAX_MEMBERS);
  const bio = pick(BIO_TEMPLATES)
    .replace('{years}', String(years))
    .replace('{plural}', years === 1 ? '' : 's')
    .replace('{kids}', String(kidCount));
  return { bio, kidCount };
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed the Supabase project.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function listSampleUsers(supabase: ReturnType<typeof supabaseAdmin>) {
  const sample: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(`@${SAMPLE_EMAIL_DOMAIN}`)) sample.push({ id: u.id, email: u.email });
    }
    if (data.users.length < 200) break;
  }
  return sample;
}

async function main() {
  const supabase = supabaseAdmin();

  const existing = await listSampleUsers(supabase);

  if (existing.length > 0 && !FORCE) {
    console.log(`${existing.length} sample users already present — skipping. Re-run with --force to wipe and regenerate.`);
    return;
  }

  if (existing.length > 0 && FORCE) {
    for (const u of existing) {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) throw error;
    }
    console.log(`--force: removed ${existing.length} existing sample users (families/announcements cascaded).`);
  }

  const usedSurnames = new Set<string>();
  const summary: { name: string; city: string; members: number; posts: number; photos: number }[] = [];

  for (let i = 0; i < FAMILY_COUNT; i++) {
    let surname = pick(FIRST_NAMES);
    while (usedSurnames.has(surname) && usedSurnames.size < FIRST_NAMES.length) {
      surname = pick(FIRST_NAMES);
    }
    usedSurnames.add(surname);

    const { city, state } = pick(CITIES);
    const name = `The ${surname} Family`;
    const email = `${surname.toLowerCase()}.sample.${i}@${SAMPLE_EMAIL_DOMAIN}`;
    const postCount = randInt(MIN_POSTS, MAX_POSTS);
    const { bio, kidCount } = buildBio();
    const password = randomBytes(24).toString('hex');

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, city, state },
    });
    if (createError || !created.user) throw createError ?? new Error(`createUser returned no user for ${email}`);
    const userId = created.user.id;

    // The on_auth_user_created trigger already inserted a families row (name/city/state
    // from user_metadata, bio=''); fill in the fields the trigger doesn't set.
    const { error: familyError } = await supabase
      .from('families')
      .update({ bio, kid_count: kidCount, avatar_url: familyAvatarUrl(name) })
      .eq('user_id', userId);
    if (familyError) throw familyError;

    const posts = [];
    let photoCount = 0;
    for (let p = 0; p < postCount; p++) {
      const hasPhoto = p === 0 || Math.random() < PHOTO_CHANCE;
      const createdAt = isoMinusDays(randInt(0, 89), randInt(0, 1439));
      if (hasPhoto) photoCount++;
      posts.push({
        user_id: userId,
        content: pick(POST_TEMPLATES),
        media_url: hasPhoto ? postPhotoUrl(`${userId}-${p}`) : null,
        media_type: hasPhoto ? 'image' : null,
        created_at: createdAt,
        updated_at: createdAt,
      });
    }
    if (posts.length > 0) {
      const { error: postsError } = await supabase.from('announcements').insert(posts);
      if (postsError) throw postsError;
    }

    summary.push({ name, city: `${city}, ${state}`, members: kidCount, posts: postCount, photos: photoCount });
  }

  const totalPosts = summary.reduce((sum, f) => sum + f.posts, 0);
  const totalPhotos = summary.reduce((sum, f) => sum + f.photos, 0);

  console.log(`Created ${summary.length} sample families (${totalPosts} posts, ${totalPhotos} with photos):\n`);
  for (const f of summary) {
    console.log(`  ${f.name.padEnd(24)} ${f.city.padEnd(18)} members=${f.members}  posts=${String(f.posts).padStart(2)}  photos=${f.photos}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
