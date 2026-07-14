import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';

const DUMMY_PASSWORD = 'password123';

interface DummyFamily {
  email: string;
  name: string;
  city: string;
  state: string;
  bio: string;
  kidCount: number;
  postCount: number;
}

const families: DummyFamily[] = [
  {
    email: 'anderson@dummy.test',
    name: 'The Anderson Family',
    city: 'Portland',
    state: 'OR',
    bio: 'Three years fostering. Two bio kids + revolving placements. We love hikes, slow mornings, and loud kitchens.',
    kidCount: 5,
    postCount: 0,
  },
  {
    email: 'brooks@dummy.test',
    name: 'The Brooks Family',
    city: 'Austin',
    state: 'TX',
    bio: 'First-time foster parents (six months in). Mostly here to learn from the rest of you.',
    kidCount: 2,
    postCount: 3,
  },
  {
    email: 'chen@dummy.test',
    name: 'The Chen Family',
    city: 'Seattle',
    state: 'WA',
    bio: 'Bilingual home (Mandarin + English). Five years fostering teens specifically.',
    kidCount: 4,
    postCount: 8,
  },
  {
    email: 'davis@dummy.test',
    name: 'The Davis Family',
    city: 'Atlanta',
    state: 'GA',
    bio: 'Multi-generational household. Grandma watches the littles while we do school runs.',
    kidCount: 6,
    postCount: 25,
  },
];

const postTemplates = [
  'First day of school done. They walked in on their own. I sat in the car and cried for ten minutes.',
  'Anyone have a pediatrician they love in the metro area? Ours just retired and we are starting over.',
  'Court date moved again. Third time this year. Hard to keep things normal when nothing is.',
  'Tiny win: she asked for a hug today. Took six months. I will take it.',
  'Casserole drop went well — thank you to whoever started that thread. Three families fed tonight.',
  'School called about behavior again. Trauma-informed teacher this year would be amazing. Recommendations?',
  'New placement landing tomorrow morning. 4yo boy. Bracing the older kids gently. Wish us luck.',
  'Reminder that the support group meets Thursday at 7. Childcare provided this week.',
  'Bio mom showed up to visitation. First time in two months. Whole car ride home was quiet.',
  'IEP meeting tomorrow. If anyone has done one of these before for a kiddo with sensory stuff — DM me.',
  'Made it to year three. Three years ago today our first placement walked through the door. He calls now.',
  'Group home folks: anyone navigating siblings split across two placements? Looking for advice.',
  'Slow morning. Pancakes. Nobody crying. Logging this so future-me remembers it happens.',
  'CPS visit went fine. The whole house is exhausted from cleaning for three days. Worth it.',
  'Teenager update: he made varsity. He had not played a sport in his life until September.',
  'Lice. That is all. Lice. Send help.',
  'Found out today that the kids will move on next month. Knew it was coming. Still rough.',
  'Calendar reminder: respite weekend signup closes Friday. We have three slots left.',
  'Newborn placement coming home from the hospital Friday. Inventory check on bottles — anyone donating?',
  'Got into the foster parent training cohort starting in February. About time.',
  'Sibling visit went really well. The little one fell asleep in big sister lap for the first time in a year.',
  'Pediatric dentist recommendation needed. Trauma-aware. Will travel.',
  'School play tonight. He has two lines. I am taking the whole front row.',
  'New caseworker assigned. Third one this calendar year. Starting fresh on the relationship.',
  'Adoption finalization is on the calendar. April 12. Court at 10am. The judge already knows our family by name.',
];

function pickPost(seedIndex: number): string {
  return postTemplates[seedIndex % postTemplates.length] ?? postTemplates[0]!;
}

function isoMinusMinutes(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = supabaseAdmin();
  // Admin API has no get-by-email; page through until found (dummy dataset is tiny).
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  const admin = supabaseAdmin();
  const created: { name: string; email: string; posts: number }[] = [];

  for (const [famIdx, fam] of families.entries()) {
    const existingId = await findUserIdByEmail(fam.email);
    if (existingId) {
      console.log(`skip: ${fam.email} already exists`);
      continue;
    }

    const { data: userData, error: createErr } = await admin.auth.admin.createUser({
      email: fam.email,
      password: DUMMY_PASSWORD,
      email_confirm: true,
      user_metadata: { name: fam.name, city: fam.city, state: fam.state },
    });
    if (createErr || !userData.user) {
      throw createErr ?? new Error(`createUser returned no user for ${fam.email}`);
    }
    const userId = userData.user.id;

    // handle_new_user trigger already created the families row (name/city/state
    // from user_metadata, bio=''); backfill bio/kid_count which aren't part of it.
    const { error: familyErr } = await admin
      .from('families')
      .update({ bio: fam.bio, kid_count: fam.kidCount })
      .eq('user_id', userId);
    if (familyErr) throw familyErr;

    if (fam.postCount > 0) {
      const rows = Array.from({ length: fam.postCount }, (_, i) => ({
        user_id: userId,
        content: pickPost(famIdx * 7 + i),
        created_at: isoMinusMinutes(i * 47 + famIdx * 11),
        updated_at: isoMinusMinutes(i * 47 + famIdx * 11),
      }));
      const { error: postErr } = await admin.from('announcements').insert(rows);
      if (postErr) throw postErr;
    }

    created.push({ name: fam.name, email: fam.email, posts: fam.postCount });
  }

  if (created.length === 0) {
    console.log('\nAll dummy families already present. Nothing to do.');
  } else {
    console.log(`\nCreated ${created.length} dummy families (password: ${DUMMY_PASSWORD}):\n`);
    for (const c of created) {
      console.log(`  ${c.name.padEnd(22)}  ${c.email.padEnd(24)}  posts=${String(c.posts).padStart(2)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
