// A built-in pattern repeated as itself showed its grid: Starlight's big stars stood in rows
// across the whole screen (reported from Moonfin, 2026-11-16; the web drew the same tile).
// And twinkle dimmed one fixed set of stars while a shifted copy brightened, so the same
// stars twinkled every time and the rest never did.
//
// Runs the real themeCss and reads the SVG it writes:
//   - every built-in pattern but waves is laid out 3 by 3, its copies turned so no two
//     neighbors (wrapping round) are alike, and the repeat size is three images;
//   - hearts are never upside down; waves and uploads are as they were;
//   - every picture in a laid-out file sits inside its tile, which is what lets turned copies
//     join up (a picture over the edge would be cut where two cells differ);
//   - a drift keeps its speed: three images take three times as long;
//   - Starlight twinkles as two halves of its pictures, every picture in exactly one half,
//     half a loop apart.
//
//   node tests/js/patternlayout.js [path/to/profiles.js]

'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./_lib');

let pass = 0;
const fails = [];
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fails.push(name); console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const src = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : L.readProfiles();
const gen = L.themeGenerator(src);
const patterns = L.themesPayload().patterns || {};
const theme = id => JSON.parse(fs.readFileSync(path.join(L.themesDir(), id + '.json'), 'utf8'));
const svgOf = uri => decodeURIComponent(uri.slice(uri.indexOf(',') + 1));

/** A theme with one pattern of `image` at `size`, and the CSS it writes. */
function sheet(image, size, extra) {
    const t = theme('nightfall');
    t.id = 'pl-' + image.replace(/[^a-z0-9]/g, '');
    t.decorations = [Object.assign({ name: 'pattern', image: image, size: size }, extra || {})];
    return gen.themeCss(t, patterns);
}
const decoUrl = css => (/--jpf-deco: url\("([^"]*)"\)/.exec(css) || [])[1] || null;
const decoSize = css => (/--jpf-deco-size: ([^;]*);/.exec(css) || [])[1] || null;

/** The cell kinds a laid-out file uses, by cell, from its <use> transforms. */
function cellsOf(svg, w) {
    const out = [];
    const re = /<use xlink:href='#jpf-cell' transform='translate\(([\d.]+) ([\d.]+)\) matrix\(([-\d. ]+) 0 0\)/g;
    let m;
    while ((m = re.exec(svg))) {
        const col = Math.floor(+m[1] / w), row = Math.floor(+m[2] / w);
        out[row * 3 + col] = m[3].trim();
    }
    return out;
}

const FREE = ['blossoms', 'bubbles', 'confetti', 'embers', 'leaves', 'moons', 'snow', 'stars'];

FREE.concat(['hearts']).forEach(name => {
    const raw = svgOf(patterns[name]);
    const w = +/width='([\d.]+)'/.exec(raw)[1];
    const css = sheet(name, 300);
    const url = decoUrl(css);
    const svg = url ? svgOf(url) : '';
    ok(name + ': the repeat is three images', decoSize(css) === '900px', decoSize(css));
    ok(name + ': the file is a 3 by 3 tile', new RegExp("width='" + (w * 3) + "' height='" + (w * 3) + "'").test(svg));
    const cells = cellsOf(svg, w);
    ok(name + ': nine cells', cells.filter(Boolean).length === 9, cells.length);
    if (name === 'hearts') {
        ok('hearts: only drawn or mirrored, never upside down',
            cells.length === 9 && cells.every(c => c === '1 0 0 1' || c === '-1 0 0 1'), cells.join(' | '));
    } else {
        let alike = 0;
        for (let i = 0; i < 9; i++) {
            const right = (i - (i % 3)) + ((i % 3) + 1) % 3, down = (i + 3) % 9;
            if (cells[i] === cells[right] || cells[i] === cells[down]) alike++;
        }
        ok(name + ': no cell matches the one beside or below it, wrapping round', cells.length === 9 && alike === 0, alike + ' alike');
    }
});

// Pictures inside their tile. A sprite's reach is the largest coordinate in its own path
// times the largest scale applied; a circle's is its radius.
FREE.concat(['hearts']).forEach(name => {
    const raw = svgOf(patterns[name]);
    const w = +/width='([\d.]+)'/.exec(raw)[1];
    // Each sprite in <defs>, from its id to the next id: the farthest any of its shapes reaches
    // from its origin (path coordinates; a circle's or ellipse's center plus its radius; a
    // rect's far corner), plus 1 for a stroke.
    const reach = {};
    const defs = (/<defs\b[^>]*>([\s\S]*?)<\/defs>/.exec(raw) || [])[1] || '';
    const ids = [];
    defs.replace(/\bid='([^']+)'/g, (m, id, at) => { ids.push({ id: id, at: at }); return m; });
    const attr = (tag, a) => { const m = new RegExp('\\s' + a + "='([-\\d.]+)'").exec(tag); return m ? Math.abs(+m[1]) : 0; };
    ids.forEach((d, k) => {
        const part = defs.slice(d.at, k + 1 < ids.length ? ids[k + 1].at : defs.length);
        let r = 0;
        (part.match(/\sd='[^']*'/g) || []).forEach(p => (p.match(/-?\d*\.?\d+/g) || []).forEach(n => { r = Math.max(r, Math.abs(+n)); }));
        (part.match(/<(circle|ellipse)\b[^>]*>/g) || []).forEach(c => {
            r = Math.max(r, Math.max(attr(c, 'cx'), attr(c, 'cy')) + Math.max(attr(c, 'r'), attr(c, 'rx'), attr(c, 'ry')));
        });
        (part.match(/<rect\b[^>]*>/g) || []).forEach(c => {
            r = Math.max(r, Math.hypot(attr(c, 'x') + attr(c, 'width'), attr(c, 'y') + attr(c, 'height')));
        });
        reach[d.id] = r + 1;
    });
    const out = [];
    raw.replace(/<defs\b[\s\S]*?<\/defs>/, '').replace(/<circle\b[^>]*>/g, c => {
        const x = attr(c, 'cx'), y = attr(c, 'cy'), r = attr(c, 'r');
        if (x - r < 0 || y - r < 0 || x + r > w || y + r > w) out.push('circle ' + x + ',' + y);
        return c;
    });
    raw.replace(/<use\b[^>]*>/g, u => {
        const id = (/href='#([^']+)'/.exec(u) || [])[1];
        const t = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(u);
        let x = t ? +t[1] : 0, y = t ? +t[2] : 0;
        const ax = /\sx='([-\d.]+)'/.exec(u), ay = /\sy='([-\d.]+)'/.exec(u);
        if (ax) x += +ax[1];
        if (ay) y += +ay[1];
        const sc = /scale\(([\d.]+)/.exec(u);
        const r = (reach[id] || 0) * (sc ? +sc[1] : 1);
        if (x - r < 0 || y - r < 0 || x + r > w || y + r > w) out.push('#' + id + ' at ' + x + ',' + y + ' reach ' + r.toFixed(1));
        return u;
    });
    ok(name + ': every picture inside its tile', out.length === 0, out.join('; '));
});

// As they were.
{
    const css = sheet('waves', 240);
    ok('waves: drawn as served, one image a repeat', decoUrl(css) === patterns.waves && decoSize(css) === '240px', decoSize(css));
    const up = sheet('0123456789abcdef0123456789abcdef.png', 200);
    ok('an upload: one image a repeat', decoSize(up) === '200px' && !/jpf-cell/.test(decodeURIComponent(decoUrl(up) || '')), decoSize(up));
}

// Drift keeps its speed: Snowfall is 32 seconds an image.
{
    const css = gen.themeCss(theme('snowfall'), patterns);
    const run = /animation: (jpf-drift-[^\s]+) ([\d.]+)s linear infinite/.exec(css);
    const to = run ? new RegExp('@keyframes ' + run[1] + ' \\{[^}]*\\}\\s*to \\{ transform: translateY\\(([\\d.]+)px\\)').exec(css) : null;
    ok('snowfall: travels one whole repeat (three images)', !!to && +to[1] === 720, to && to[1]);
    ok('snowfall: at 32 seconds an image', !!run && +run[2] === 96, run && run[2]);
}

// Starlight twinkles in two halves.
{
    const css = gen.themeCss(theme('starlight'), patterns);
    const raw = svgOf(patterns.stars);
    const body = raw.replace(/<defs\b[\s\S]*?<\/defs>/, '');
    const all = (body.match(/<(circle|use)\b[^>]*\/>/g) || []);
    const before = /::before \{\s*background-image: url\("([^"]*)"\);[^}]*animation: (jpf-twinkle-s[^\s]*) ([\d.]+)s/.exec(css);
    const after = /::after \{[^}]*background-image: url\("([^"]*)"\);[^}]*animation: (jpf-twinkle-s[^\s]*) ([\d.]+)s[^}]*animation-delay: -([\d.]+)s/.exec(css);
    ok('starlight: both layers twinkle on their own picture', !!before && !!after && before[1] !== after[1]);
    if (before && after) {
        const cellOf = s => (/<g id='jpf-cell'>([\s\S]*?)<\/g><\/defs>/.exec(s) || [])[1] || '';
        const a = cellOf(svgOf(before[1])), b = cellOf(svgOf(after[1]));
        const inA = all.filter(x => a.indexOf(x) >= 0), inB = all.filter(x => b.indexOf(x) >= 0);
        ok('starlight: every picture is in exactly one half',
            all.length > 0 && all.every(x => (a.indexOf(x) >= 0) !== (b.indexOf(x) >= 0)), inA.length + ' + ' + inB.length + ' of ' + all.length);
        ok('starlight: the halves are half a loop apart', +after[4] * 2 === +after[3] && before[2] === after[2], after[4] + ' of ' + after[3]);
        ok('starlight: no shifted copy on top', !/background-position: calc\(var\(--jpf-deco-size\) \/ 2\)/.test(css));
    }
}

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
process.exit(fails.length ? 1 : 0);
