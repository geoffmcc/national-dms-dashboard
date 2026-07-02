#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const excludedDirectories = new Set(['.git', 'node_modules', 'debug', 'coverage', 'dist', 'build']);
const excludedFiles = new Set([path.basename(__filename)]);
const textExtensions = new Set([
  '.js', '.json', '.md', '.html', '.css', '.txt', '.yml', '.yaml', '.env', '.example', '.sh', '.bat'
]);

const checks = [
  { name: 'Cloudflare clearance cookie', regex: /cf_clearance\s*[=:]\s*[^\s;"']{20,}/gi },
  { name: 'PHP session cookie', regex: /PHPSESSID\s*[=:]\s*[^\s;"']{12,}/gi },
  { name: 'NITTEC session cookie', regex: /MYNITTECSESSID\s*[=:]\s*[^\s;"']{12,}/gi },
  { name: 'Bearer token', regex: /Authorization\s*[=:]\s*["']?Bearer\s+[A-Za-z0-9._~+\/-]{20,}/gi },
  { name: 'Private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Likely hardcoded secret', regex: /(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token)\s*[=:]\s*["'][^"'\n]{16,}["']/gi }
];

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, output);
    } else {
      output.push(fullPath);
    }
  }
  return output;
}

const findings = [];
for (const file of walk(root)) {
  if (excludedFiles.has(path.basename(file))) continue;
  const relative = path.relative(root, file);
  const extension = path.extname(file).toLowerCase();
  const basename = path.basename(file);
  if (!textExtensions.has(extension) && !basename.startsWith('.env')) continue;
  if (basename === '.env') {
    findings.push({ file: relative, check: 'Local .env file must not be committed' });
    continue;
  }

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const check of checks) {
    check.regex.lastIndex = 0;
    if (check.regex.test(content)) findings.push({ file: relative, check: check.name });
  }
}

if (findings.length > 0) {
  console.error('Potential secrets or session data found:');
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.check}`);
  process.exit(1);
}

console.log('Secret scan passed: no known credentials, session cookies, or private keys found.');
