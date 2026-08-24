#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(cmd, opts = {}) {
	execSync(cmd, { stdio: 'inherit', ...opts });
}

function runCapture(cmd, opts = {}) {
	return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts }).trim();
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function parseSemver(version) {
	const match = /^\s*(\d+)\.(\d+)\.(\d+)\s*$/.exec(version);
	if (!match) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3])
	};
}

function bump(current, kind) {
	const parsed = parseSemver(current);
	if (!parsed) fail(`Invalid current version in package.json: ${current}`);

	if (kind === 'patch') return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
	if (kind === 'minor') return `${parsed.major}.${parsed.minor + 1}.0`;
	if (kind === 'major') return `${parsed.major + 1}.0.0`;

	fail(`Unknown bump type: ${kind}`);
}

// Releases the *server*. The scanner app has its own version and its own
// script — see scripts/release-app.mjs. They ship on separate schedules to
// separate places, and a fix to one must not drag the other's version along.
const arg = process.argv[2];
if (!arg) {
	fail('Usage: pnpm release <patch|minor|major|x.y.z|vx.y.z>');
}

const repoRoot = process.cwd();
const pkgPath = path.join(repoRoot, 'package.json');

if (!fs.existsSync(pkgPath)) {
	fail('package.json not found in current directory');
}

const status = runCapture('git status --porcelain');
if (status.length > 0) {
	fail('Working tree is not clean. Commit/stash changes before releasing.');
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;
if (typeof currentVersion !== 'string') {
	fail('package.json version is missing or not a string');
}

let nextVersion;
if (arg === 'patch' || arg === 'minor' || arg === 'major') {
	nextVersion = bump(currentVersion, arg);
} else {
	nextVersion = arg.startsWith('v') ? arg.slice(1) : arg;
	if (!parseSemver(nextVersion)) {
		fail(`Invalid version: ${arg}. Expected patch|minor|major or x.y.z`);
	}
}

const tag = `v${nextVersion}`;

console.log(`Releasing ${tag} (from ${currentVersion})`);

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n');

// Keep pnpm-lock.yaml in sync with the new version metadata
run('pnpm install --lockfile-only');
run('npm run format');

run('git add package.json pnpm-lock.yaml');
run(`git commit -m "chore(release): ${tag}"`);
run(`git tag ${tag}`);
run('git push origin HEAD');
run(`git push origin ${tag}`);
