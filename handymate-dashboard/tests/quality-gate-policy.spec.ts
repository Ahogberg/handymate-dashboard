import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');

test('AGENTS gör cross-review och outcome proven obligatoriskt', () => {
  const agents = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  expect(agents).toContain('DEVELOPMENT_QUALITY_GATE.md');
  expect(agents).toContain('OUTCOME PROVEN');
  expect(agents).toContain('enda granskare');
});

test('PR-mallen kräver proof contract, mutation och cross-review', () => {
  const template = fs.readFileSync(path.join(repoRoot, '.github', 'pull_request_template.md'), 'utf8');
  expect(template).toContain('## Proof contract');
  expect(template).toContain('**Mutation proof**');
  expect(template).toContain('## Cross-review');
  expect(template).toContain('QUALITY GATE: PASS');
});

test('quality gate är bunden till aktuell head-SHA och oberoende reviewer', () => {
  const checker = fs.readFileSync(path.join(appRoot, 'scripts', 'quality-gate-check.mjs'), 'utf8');
  expect(checker).toContain('headSha');
  expect(checker).toContain('QUALITY GATE');
  expect(checker).toContain('reviewer !== author');
  expect(checker).toContain('Ny commit kräver ny review');
});
