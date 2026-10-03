// Downloads the Mustang CLI (https://www.mustangproject.org) into .mustang/,
// for `pnpm test:einvoice`: it validates the ZUGFeRD invoices the tests render
// against the EN 16931 schematron and veraPDF's PDF/A-3 rules — the same
// checks a recipient's software applies. A Java jar, so it needs `java` (11+)
// on the PATH; nothing in the app itself uses it.
//
// Pinned to one version from Maven Central and checked against its SHA-256,
// so every machine validates with the same rules. Idempotent: a jar already
// on disk with the right hash is kept.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '2.26.0';
const SHA256 = '42d7868cb68264874a7b8cab4c3587b03b23ccc7cd72373da917f66758bb9736';
const URL = `https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/${VERSION}/Mustang-CLI-${VERSION}.jar`;

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, '.mustang', `Mustang-CLI-${VERSION}.jar`);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

if (existsSync(file) && sha256(await readFile(file)) === SHA256) process.exit(0);

console.log(`[mustang] fetching Mustang-CLI ${VERSION}`);
const res = await fetch(URL);
if (!res.ok) throw new Error(`${URL}: HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
if (sha256(buf) !== SHA256) throw new Error(`Mustang-CLI ${VERSION}: hash mismatch`);
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, buf);
