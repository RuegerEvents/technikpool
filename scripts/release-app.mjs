#!/usr/bin/env node

// Releases the *scanner app*, which versions independently of the server.
// A bug fixed in one is not a reason to move the other's version, and the two
// ship to entirely different places — a container registry and two app stores.
//
// Tags are prefixed `scanner-v…` so they can't be mistaken for the server's
// bare `v…` tags in `git tag` or in a release listing.

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

function bump(current, kind) {
	const [major, minor, patch] = current.split('.').map(Number);
	if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
	if (kind === 'minor') return `${major}.${minor + 1}.0`;
	if (kind === 'major') return `${major + 1}.0.0`;
	fail(`Unknown bump type: ${kind}`);
}

const arg = process.argv[2];
if (!arg) {
	fail('Usage: pnpm release:app <patch|minor|major|build|x.y.z|vx.y.z>');
}

const repoRoot = process.cwd();
const pubspecPath = path.join(repoRoot, 'apps', 'scanner', 'pubspec.yaml');
if (!fs.existsSync(pubspecPath)) fail(`pubspec.yaml not found at ${pubspecPath}`);

const status = runCapture('git status --porcelain');
if (status.length > 0) {
	fail('Working tree is not clean. Commit/stash changes before releasing.');
}

const pubspec = fs.readFileSync(pubspecPath, 'utf8');
const match = /^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$/m.exec(pubspec);
if (!match) fail('Could not find a "version: x.y.z+n" line in pubspec.yaml');

const currentVersion = match[1];
const currentBuild = Number(match[2]);

// `version` is what a person sees in the store; `+build` is what the stores key
// on. The build number only ever goes up — both reject one they have already
// seen, even for a version that was never released — so a rejected or replaced
// binary is re-cut with `build`, keeping the same version.
let nextVersion;
if (arg === 'build') {
	nextVersion = currentVersion;
} else if (arg === 'patch' || arg === 'minor' || arg === 'major') {
	nextVersion = bump(currentVersion, arg);
} else {
	nextVersion = arg.startsWith('v') ? arg.slice(1) : arg;
	if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
		fail(`Invalid version: ${arg}. Expected patch|minor|major|build or x.y.z`);
	}
}

// The changelog is the single source for both "What's new" in the app and the
// store's own release notes, so it is checked before anything is written. The
// newest entry is also the version the app shows under Settings, which is why
// it has to be the *first* one rather than merely present.
const changelogPath = path.join(repoRoot, 'apps', 'scanner', 'assets', 'changelog.json');
const changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));
const latest = changelog[0];
if (latest?.version !== nextVersion) {
	fail(
		`apps/scanner/assets/changelog.json starts with ${latest?.version ?? 'nothing'}, not ${nextVersion}.\n` +
			`Add an entry for ${nextVersion} at the top, in English and German, then release again.`
	);
}

// deliver uploads whatever it finds in metadata/<locale>/release_notes.txt, and
// those used to be written by hand — two places saying what changed, drifting
// the moment one of them was forgotten. They are generated from the changelog
// now, so the App Store and the app cannot disagree. Rendered here but written
// further down: every check runs before the first file is touched, so a refusal
// leaves the tree as clean as it found it.
const STORE_LOCALES = { 'en-US': 'en', 'de-DE': 'de' };
const releaseNotes = Object.entries(STORE_LOCALES).map(([storeLocale, language]) => {
	const notes = latest[language];
	if (!Array.isArray(notes) || notes.length === 0) {
		fail(`Changelog entry ${nextVersion} has no "${language}" notes.`);
	}
	const text = notes.map((note) => `• ${note}`).join('\n') + '\n';
	// App Store Connect caps What's New at 4000 characters and rejects the
	// submission rather than truncating.
	if (text.length > 4000) {
		fail(`Release notes for ${storeLocale} are ${text.length} characters; the limit is 4000.`);
	}
	const file = path.join(
		repoRoot,
		'apps',
		'scanner',
		'ios',
		'fastlane',
		'metadata',
		storeLocale,
		'release_notes.txt'
	);
	if (!fs.existsSync(path.dirname(file))) {
		fail(`No metadata directory for ${storeLocale} at ${path.relative(repoRoot, file)}`);
	}
	return { file, text };
});

const nextBuild = currentBuild + 1;
const tag = `scanner-v${nextVersion}`;

if (arg !== 'build' && runCapture(`git tag --list ${tag}`).length > 0) {
	fail(`Tag ${tag} already exists. Use "build" to re-cut the same version.`);
}

console.log(`Releasing ${tag} (${currentVersion}+${currentBuild} → ${nextVersion}+${nextBuild})`);

fs.writeFileSync(pubspecPath, pubspec.replace(match[0], `version: ${nextVersion}+${nextBuild}`));
for (const { file, text } of releaseNotes) fs.writeFileSync(file, text);

run('git add apps/scanner/pubspec.yaml apps/scanner/ios/fastlane/metadata');
run(`git commit -m "chore(release): ${tag} (build ${nextBuild})"`);
// A re-cut of the same version would collide with the existing tag, so move it.
run(arg === 'build' ? `git tag -f ${tag}` : `git tag ${tag}`);
run('git push origin HEAD');
run(`git push origin ${tag} ${arg === 'build' ? '--force' : ''}`.trim());

console.log(`\nNow upload it:`);
console.log(`  cd apps/scanner/android && fastlane internal`);
console.log(`  cd apps/scanner/ios && fastlane beta`);
