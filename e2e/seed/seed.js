// Fixture loader for the e2e stack.
//
// Replaces `src/prisma/scripts/seed-runner.ts` in giga-meter-backend, which
// only lives on the `develop` line (added by the health-entity work on
// 2026-07-27) and therefore does not exist on `staging`. Living here, in the
// app repo and mounted into the container, keeps the e2e suite independent of
// which branch the sibling backend has checked out.
//
// Runs with the `node` and `pg` from the backend image (/APP), in the compose
// entrypoint, between `prisma migrate deploy` and `start:prod`.
//
// Usage: node seed.js <file.sql> [...]  (absolute paths, or relative to this dir)
const { readFileSync, existsSync } = require('fs');
const { resolve, isAbsolute, basename } = require('path');
const { Client } = require('pg');

/** Hides the password when printing the connection target. */
function maskDbUrl(url) {
  return url.replace(/(:\/\/[^:/@]+:)[^@]*@/, '$1****@');
}

function resolveSqlPath(nameOrPath) {
  const candidate = isAbsolute(nameOrPath)
    ? nameOrPath
    : resolve(__dirname, nameOrPath);
  if (!existsSync(candidate)) {
    throw new Error(`SQL file not found: ${nameOrPath} (looked in ${candidate})`);
  }
  return candidate;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

  const files = process.argv.slice(2).map(resolveSqlPath);
  if (!files.length) throw new Error('No .sql file was passed.');

  console.log(`→ DB    : ${maskDbUrl(databaseUrl)}`);
  console.log(`→ Seeds : ${files.map((f) => basename(f)).join(', ')}`);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  // The seed's RAISE NOTICEs (which sections are skipped because the table does
  // not exist) tell whether it ran in develop or staging mode: they must show.
  client.on('notice', (n) => console.log(`   · ${n.message}`));

  try {
    for (const file of files) {
      console.log(`\n── Applying ${basename(file)} ──────────────────────`);
      // node-postgres sends the whole string as a simple query, so it supports
      // several statements and DO $$ blocks in a single query().
      await client.query(readFileSync(file, 'utf8'));
      console.log(`   OK`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
