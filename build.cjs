// Give each asset a content-based URL so deployments cannot reuse stale files.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const output = path.join(__dirname, '_site');
fs.mkdirSync(output, { recursive: true });
let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
for (const filename of ['styles.css', 'app.js', 'tournament.js']) {
  const content = fs.readFileSync(path.join(__dirname, filename));
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
  const versioned = filename.replace(/(\.[^.]+)$/, `.${hash}$1`);
  fs.writeFileSync(path.join(output, versioned), content);
  html = html.replaceAll(`"${filename}"`, `"${versioned}"`);
}
fs.writeFileSync(path.join(output, 'index.html'), html);
fs.writeFileSync(path.join(output, '.nojekyll'), '');
