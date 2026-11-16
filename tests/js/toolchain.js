// docs/toolchain.md lists what Bonfire builds and tests with. A list like that goes stale
// the first time someone bumps a version and forgets the doc, so every Bonfire row is read
// back from the file it names. (The Moonfin rows are another repository's files and are
// checked by hand.)
//
//   node tests/js/toolchain.js [path/to/toolchain.md]

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const doc = fs.readFileSync(process.argv[2] || path.join(ROOT, 'docs', 'toolchain.md'), 'utf8');

let pass = 0;
const fails = [];
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fails.push(name); console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
/** The doc's table row whose first cell is `label`, as its cells. */
function row(label) {
    const line = doc.split('\n').find(l => l.startsWith('| ' + label + ' |'));
    return line ? line.split('|').slice(1, -1).map(c => c.trim()) : null;
}

const csproj = read('Jellyfin.Profiles.csproj');
const ci = read('.github/workflows/ci.yml');

// Target frameworks.
{
    const tf = (/<TargetFrameworks>([^<]*)<\/TargetFrameworks>/.exec(csproj) || [])[1] || '';
    const r = row('Target frameworks');
    const named = r ? (r[1].match(/`net[\d.]+`/g) || []).map(s => s.slice(1, -1)) : [];
    ok('target frameworks match the csproj', !!r && named.slice(0, 2).sort().join(';') === tf.split(';').sort().join(';'), tf + ' vs ' + named);
}

// SDKs in CI.
{
    const sdks = [];
    ci.replace(/dotnet-version: \|\n((?:\s+[\d.x]+\n)+)/g, (m, list) => { list.trim().split(/\s+/).forEach(v => sdks.push(v)); return m; });
    const r = row('.NET SDKs');
    const named = r ? r[1].match(/\d+\.\d+\.x/g) || [] : [];
    const want = Array.from(new Set(sdks)).sort();
    ok('.NET SDKs match CI', want.length > 0 && named.slice().sort().join(',') === want.join(','), want + ' vs ' + named);
}

// Jellyfin packages: every one named, one version.
{
    const refs = [];
    csproj.replace(/<PackageReference Include="(Jellyfin\.[^"]+)" Version="([^"]+)"/g, (m, n, v) => { refs.push({ n: n, v: v }); return m; });
    const r = row('Jellyfin packages');
    const versions = Array.from(new Set(refs.map(x => x.v)));
    ok('one Jellyfin package version, and the doc has it', !!r && versions.length === 1 && r[1].indexOf(versions[0]) >= 0, versions + ' vs ' + (r && r[1]));
    const missing = refs.filter(x => !r || r[1].indexOf(x.n === 'Jellyfin.Controller' ? 'Jellyfin.Controller' : x.n.replace('Jellyfin', '')) < 0);
    ok('every Jellyfin package is named', refs.length > 0 && missing.length === 0, missing.map(x => x.n).join(','));
}

// targetAbi: the newest entry in the stable manifest.
{
    const m = JSON.parse(read('manifest.json'));
    const versions = (m[0] && m[0].versions) || [];
    const abi = versions.length ? versions[0].targetAbi : null;
    const r = row('Plugin `targetAbi`');
    ok('targetAbi matches the newest manifest entry', !!r && !!abi && r[1] === abi, abi + ' vs ' + (r && r[1]));
}

// Campground shared code.
{
    const v = JSON.parse(read('Campground.Shared/campground-shared.json')).version;
    const r = row('Campground shared code');
    ok('Campground shared version matches', !!r && r[1].indexOf(v + ',') === 0, v + ' vs ' + (r && r[1]));
}

// Servers tested in CI.
{
    const names = [];
    ci.replace(/- name: (Docker|Windows) ([\d.]+)\n/g, (m, kind, v) => { names.push(kind + ' ' + v); return m; });
    [['Jellyfin 10.11', /^10\.11\./], ['Jellyfin 12', /^12\./]].forEach(([label, re]) => {
        const r = row(label);
        const tested = names.filter(n => re.test(n.split(' ')[1]));
        const versions = Array.from(new Set(tested.map(n => n.split(' ')[1])));
        const kinds = Array.from(new Set(tested.map(n => n.split(' ')[0])));
        ok(label + ': the doc names every version and kind CI tests', !!r && versions.length > 0
            && versions.every(v => r[1].indexOf(v) >= 0) && kinds.every(k => r[1].indexOf(k) >= 0), tested.join(', ') + ' vs ' + (r && r[1]));
    });
}

// Node in CI.
{
    const nodes = Array.from(new Set((ci.match(/node-version: '(\d+)'/g) || []).map(s => /'(\d+)'/.exec(s)[1])));
    const r = row('Node.js');
    ok('Node.js matches CI, one version', !!r && nodes.length === 1 && r[1].indexOf(nodes[0] + ' in CI') === 0, nodes + ' vs ' + (r && r[1]));
}

// Playwright.
{
    const v = JSON.parse(read('tests/webkit/package.json')).devDependencies['playwright-core'];
    const r = row('Playwright');
    ok('Playwright matches tests/webkit', !!r && r[1].indexOf('`playwright-core` ' + v) === 0, v + ' vs ' + (r && r[1]));
}

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
process.exit(fails.length ? 1 : 0);
