import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] || '.');
const required = [
  'index.html',
  'v19/v19-preload.js',
  'v19/v19-enhancements.js',
  'v19/v19.css',
  'CHANGELOG-v19.md',
  'VERSION-v19.txt',
  'manifest.webmanifest',
  'version.json'
];

const failures = [];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing ${relative}`);
}

if (!failures.length) {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const enhancements = fs.readFileSync(path.join(root, 'v19/v19-enhancements.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'v19/v19.css'), 'utf8');
  const checks = [
    ['v18 JavaScript asset reference', index.includes('./assets/index-B58euost.js')],
    ['v18 CSS asset reference', index.includes('./assets/index-e2xDAz5w.css')],
    ['preload before production bundle', index.indexOf('v19-preload.js') < index.indexOf('index-B58euost.js')],
    ['Teaching Insights route', enhancements.includes("path: 'insights'")],
    ['CLA route', enhancements.includes("path: 'cla'")],
    ['System Health route', enhancements.includes("path: 'system-health'")],
    ['Level Learning classifier', enhancements.includes('level\\s*learning')],
    ['STAMP classifier', enhancements.includes('/stamp/')],
    ['Bump implementation', enhancements.includes('executeV19Bump')],
    ['27-event acceptance', enhancements.includes('27-event acceptance set is complete')],
    ['parent/child block styles', css.includes('.schedule-editor-children')],
    ['icon-only history toolbar', css.includes('.v19-history-toolbar')]
  ];
  for (const [name, ok] of checks) if (!ok) failures.push(`Failed check: ${name}`);
}

if (failures.length) {
  console.error('Classroom v19 verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Classroom v19 static verification passed.');
