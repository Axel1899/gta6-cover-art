import { copyFileSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, type DossierCaps } from './vendor/makefun-app.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIRECTORY = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const HANDED_IN_TREES = ['app', 'screenshots'] as const;

const DOSSIER_CAPS: DossierCaps = {
  text_max_bytes: 1024 * 1024,
  screenshots: {
    max: 4,
    max_bytes: 4 * 1024 * 1024,
  },
  app_path_max_bytes: 1000,
};

function beforeInCodeUnitOrder(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function copyTree(source: string, destination: string): void {
  const entries = readdirSync(source, { withFileTypes: true })
    .sort((a, b) => beforeInCodeUnitOrder(a.name, b.name));

  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    const facts = lstatSync(from);

    if (facts.isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyTree(from, to);
    } else if (facts.isFile()) {
      copyFileSync(from, to);
    } else {
      throw new Error(`Cannot hand in a symbolic link or special file: ${from}`);
    }
  }
}

function replaceTree(source: string, destination: string): void {
  const facts = lstatSync(source);
  if (!facts.isDirectory()) {
    throw new Error(`Expected a directory to copy: ${source}`);
  }

  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  copyTree(source, destination);
}

function main(): void {
  if (OUTPUT_DIRECTORY === REPO_ROOT) {
    throw new Error('MAKEFUN_OUTPUT_DIR must name a directory outside the repository root.');
  }

  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

  for (const treeName of HANDED_IN_TREES) {
    replaceTree(join(REPO_ROOT, treeName), join(OUTPUT_DIRECTORY, treeName));
  }

  const dossier = buildDossier(OUTPUT_DIRECTORY, DOSSIER_CAPS);
  writeFileSync(join(OUTPUT_DIRECTORY, 'dossier.json'), dossier);
}

main();
