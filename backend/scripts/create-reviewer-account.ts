import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Creates (or resets) a single, pre-verified login for an outside reviewer —
// e.g. a hiring team trying the live app. Uses the Admin API so the email is
// confirmed up front (no inbox needed); the on_auth_user_created trigger
// creates the families row, then we fill in a presentable profile.
//
// Idempotent: if the account already exists, its password is rotated and the
// profile re-applied, so re-running is also how you revoke an old password.
// The account is an ordinary member — is_admin() is pinned to one other email.
//
//   npm run account:reviewer                                  # reviewer@fofafu.app, random password
//   REVIEWER_EMAIL=acme-review@fofafu.app npm run account:reviewer
//   REVIEWER_PASSWORD='...' npm run account:reviewer          # choose the password yourself
const EMAIL = (process.env.REVIEWER_EMAIL ?? 'reviewer@fofafu.app').toLowerCase();
const PASSWORD = process.env.REVIEWER_PASSWORD ?? randomBytes(12).toString('base64url');

const PROFILE = {
  name: 'The Reviewer Family',
  city: 'Portland',
  state: 'OR',
  bio: 'Demo account for trying out fofafu. Feel free to post, comment, react, and send messages.',
  kid_count: 2,
};

const MIN_PASSWORD_LENGTH = 8;

function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (backend/.env).');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function findUserId(supabase: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
}

async function upsertUser(supabase: SupabaseClient): Promise<{ id: string; created: boolean }> {
  const metadata = { name: PROFILE.name, city: PROFILE.city, state: PROFILE.state };
  const existingId = await findUserId(supabase, EMAIL);
  if (existingId) {
    const { error } = await supabase.auth.admin.updateUserById(existingId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    return { id: existingId, created: false };
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw error ?? new Error(`createUser returned no user for ${EMAIL}`);
  return { id: data.user.id, created: true };
}

async function main() {
  if (PASSWORD.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`REVIEWER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const supabase = supabaseAdmin();
  const { id, created } = await upsertUser(supabase);

  const { error: familyError } = await supabase
    .from('families')
    .update({
      ...PROFILE,
      avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(PROFILE.name)}`,
    })
    .eq('user_id', id);
  if (familyError) throw familyError;

  console.log(created ? 'Created reviewer account.' : 'Reviewer account existed — password rotated.');
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log('Share these privately; re-run this script to rotate the password when the review ends.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
