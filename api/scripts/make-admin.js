// Promote an existing user to admin in the LOCAL D1 state:  npm run make-admin -- someone@example.com
// Production equivalent (user must have signed up first):
//   npx wrangler d1 execute penged --remote --command "UPDATE \"user\" SET role='admin' WHERE email='someone@example.com'"
import { getPlatformProxy } from 'wrangler';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('usage: npm run make-admin -- <email>');
  process.exit(1);
}
const proxy = await getPlatformProxy({ persist: { path: '.wrangler/state/v3' } });
try {
  const r = await proxy.env.DB.prepare(`UPDATE "user" SET role = 'admin' WHERE lower(email) = ?`).bind(email).run();
  if (!r.meta.changes) {
    console.error(`No user with email ${email}. They must sign up first.`);
    process.exitCode = 1;
  } else {
    console.log(`${email} is now an admin.`);
  }
} finally {
  await proxy.dispose();
}
