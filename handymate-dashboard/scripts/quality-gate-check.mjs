import fs from 'node:fs';

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath || !fs.existsSync(eventPath)) {
  console.error('quality-gate-check: GITHUB_EVENT_PATH saknas.');
  process.exit(1);
}
const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
const pr = event.pull_request;
if (!pr) {
  console.error('quality-gate-check: pull_request-data saknas.');
  process.exit(1);
}
const body = pr.body || '';
const headSha = pr.head?.sha || '';
const author = pr.user?.login || '';
const comments = Array.isArray(event.__quality_gate_comments) ? event.__quality_gate_comments : [];

const headings = ['# Kundutfall','## Proof contract','## Bevis','## Cross-review','## Medvetet lämnat ogjort','## Ship status'];
const missing = headings.filter((h) => !body.includes(h));
if (missing.length) {
  console.error('PR saknar Quality Gate-sektioner: ' + missing.join(', '));
  process.exit(1);
}
if (body.includes('[verklig trigger]') || body.includes('[verkligt utfall]') || body.includes('[manuellt arbete som tas bort]')) {
  console.error('Kundutfallet är inte ifyllt i PR-mallen.');
  process.exit(1);
}
const escapedSha = headSha.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const passPattern = new RegExp('QUALITY GATE:\\s*PASS\\s*[—-]\\s*' + escapedSha, 'i');
const pass = comments.find((comment) => {
  const reviewer = comment.user?.login || '';
  return reviewer && reviewer !== author && passPattern.test(comment.body || '');
});
if (!pass) {
  console.error('Ingen oberoende QUALITY GATE: PASS hittades för aktuell head-SHA ' + headSha + '. Ny commit kräver ny review.');
  process.exit(1);
}
console.log('Quality Gate PASS för ' + headSha + ' av oberoende reviewer ' + pass.user.login + '.');
