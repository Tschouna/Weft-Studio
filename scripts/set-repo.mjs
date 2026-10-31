// Points releases and automatic updates at a GitHub repository: npm run set-repo -- owner/repo
import { readFileSync, writeFileSync } from 'node:fs';
const repo = process.argv[2];
if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) { console.error('usage: npm run set-repo -- owner/repo'); process.exit(1); }
const [owner, name] = repo.split('/');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.repository = `github:${repo}`;
pkg.weft = { ...pkg.weft, updateRepo: repo };
pkg.build.publish = [{ provider: 'github', owner, repo: name, releaseType: 'release' }];
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`releases and updates now use github.com/${repo}`);
