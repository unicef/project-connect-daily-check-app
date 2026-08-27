// Cargador de fixtures para el stack e2e.
//
// Sustituye a `src/prisma/scripts/seed-runner.ts` de giga-meter-backend, que
// vive solo en la línea de `develop` (lo añadió el trabajo health-entity el
// 2026-07-27) y por tanto no existe en `staging`. Al vivir aquí, en el repo del
// app y montado en el contenedor, la suite e2e deja de depender de qué rama
// tenga el backend hermano.
//
// Se ejecuta con el `node` y el `pg` de la imagen del backend (/APP), en el
// entrypoint del compose, entre `prisma migrate deploy` y `start:prod`.
//
// Uso: node seed.js <archivo.sql> [...]  (rutas absolutas o relativas a este dir)
const { readFileSync, existsSync } = require('fs');
const { resolve, isAbsolute, basename } = require('path');
const { Client } = require('pg');

/** Oculta la contraseña al mostrar el destino de la conexión. */
function maskDbUrl(url) {
  return url.replace(/(:\/\/[^:/@]+:)[^@]*@/, '$1****@');
}

function resolveSqlPath(nameOrPath) {
  const candidate = isAbsolute(nameOrPath)
    ? nameOrPath
    : resolve(__dirname, nameOrPath);
  if (!existsSync(candidate)) {
    throw new Error(`SQL no encontrado: ${nameOrPath} (buscado en ${candidate})`);
  }
  return candidate;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL no está definida.');

  const files = process.argv.slice(2).map(resolveSqlPath);
  if (!files.length) throw new Error('No se pasó ningún archivo .sql.');

  console.log(`→ DB    : ${maskDbUrl(databaseUrl)}`);
  console.log(`→ Seeds : ${files.map((f) => basename(f)).join(', ')}`);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  // Los RAISE NOTICE del seed (qué secciones se saltan por no existir la tabla)
  // son la señal de si corrió en modo develop o staging: hay que verlos.
  client.on('notice', (n) => console.log(`   · ${n.message}`));

  try {
    for (const file of files) {
      console.log(`\n── Aplicando ${basename(file)} ──────────────────────`);
      // node-postgres manda el string completo por simple query, así que
      // soporta varias sentencias y bloques DO $$ en un solo query().
      await client.query(readFileSync(file, 'utf8'));
      console.log(`   OK`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\nSeed falló: ${err.message}`);
  process.exit(1);
});
