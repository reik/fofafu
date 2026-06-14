import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { db, closeDb } from '../src/db.js';

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

function avatarUrlFor(name: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
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
  const d = new Date(Date.now() - minutes * 60_000);
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

async function main() {
  const password = await bcrypt.hash(DUMMY_PASSWORD, 10);

  const insertUser = db().prepare(
    'INSERT INTO users (id, email, password, name, city, state, verified) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );
  const insertFamily = db().prepare(
    'INSERT INTO families (id, user_id, name, bio, kid_count, avatar_url) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertAnnouncement = db().prepare(
    'INSERT INTO announcements (id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  );

  const created: { familyId: string; name: string; email: string; posts: number }[] = [];

  const tx = db().transaction(() => {
    families.forEach((fam, famIdx) => {
      const existing = db().prepare('SELECT id FROM users WHERE email = ?').get(fam.email) as { id: string } | undefined;
      if (existing) {
        console.log(`skip: ${fam.email} already exists`);
        return;
      }
      const userId = randomUUID();
      const familyId = randomUUID();
      insertUser.run(userId, fam.email, password, fam.name, fam.city, fam.state);
      insertFamily.run(familyId, userId, fam.name, fam.bio, fam.kidCount, avatarUrlFor(fam.name));

      for (let i = 0; i < fam.postCount; i++) {
        insertAnnouncement.run(
          randomUUID(),
          userId,
          pickPost(famIdx * 7 + i),
          isoMinusMinutes(i * 47 + famIdx * 11),
          isoMinusMinutes(i * 47 + famIdx * 11),
        );
      }

      created.push({ familyId, name: fam.name, email: fam.email, posts: fam.postCount });
    });
  });

  tx();

  if (created.length === 0) {
    console.log('\nAll dummy families already present. Nothing to do.');
  } else {
    console.log(`\nCreated ${created.length} dummy families (password: ${DUMMY_PASSWORD}):\n`);
    for (const c of created) {
      console.log(`  ${c.name.padEnd(22)}  ${c.email.padEnd(24)}  posts=${String(c.posts).padStart(2)}  /family/${c.familyId}`);
    }
  }

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
