// Issue #49: in Jellyfin Media Player, a film showed its picture full screen and never played
// once a profile had been picked.
//
// The app's video player is a script it loads from file:// (jmpInfo.scriptPath). The page may
// only do that while it is in the process the app opened from its own file:// start page,
// find-webclient.html. A reload, or any navigation the server's page makes itself, starts a
// process without that right: the player script fails, jellyfin-web falls back to its HTML
// player, and that cannot play what the server offers the app. Every profile switch reloads.
//
// Measured on JMP 1.11.1 over devtools before this was written: a fresh start loads the
// player, location.reload() breaks it, and navigating to find-webclient.html loads it again.
// This models that app — window.NativeShell and window.jmpInfo, which its native shell sets
// on every page — and asserts every reload Bonfire makes goes through the start page there,
// and nowhere else.
//
//     node tests/js/jmpreload.js /path/to/old/profiles.js   # must fail

const fs = require('fs');
const vm = require('vm');
const L = require('./_lib');

let pass = 0;
const fails = [];
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fails.push(name); console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
}

const SRC_PATH = process.argv[2] || L.profilesPath();
const raw = fs.readFileSync(SRC_PATH, 'utf8');
const INIT = 'ProfilesPlugin.init();';
if (raw.split(INIT).length - 1 !== 1) {
    console.error('could not find the single init() call to swap for an export');
    process.exit(1);
}
const src = raw.replace(INIT, 'globalThis.__PROFILES = ProfilesPlugin;');

const SCRIPT_PATH = 'file:///C:/Program Files/Jellyfin/Jellyfin Media Player/web-client/extension/';
const START_PAGE = SCRIPT_PATH + 'find-webclient.html';

/// A page whose navigations are recorded and go nowhere, with a timer queue driven by hand.
function makePage(opts) {
    opts = opts || {};
    const navigations = [];
    const timers = [];
    const location = {
        pathname: '/web/',
        search: '',
        hash: opts.hash === undefined ? '#/details?id=1' : opts.hash,
        reload() { navigations.push({ kind: 'reload' }); },
        replace(url) { navigations.push({ kind: 'replace', url }); }
    };
    let hrefValue = 'http://192.168.1.9:8096/web/' + location.hash;
    Object.defineProperty(location, 'href', {
        get() { return hrefValue; },
        set(v) { navigations.push({ kind: 'href', url: v }); hrefValue = v; }
    });
    const store = () => {
        const d = {};
        return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } };
    };
    const el = () => ({
        style: {}, classList: { add() {}, remove() {}, contains: () => false },
        appendChild() {}, addEventListener() {}, setAttribute() {}, remove() {},
        querySelector() { return null; }, querySelectorAll() { return []; }
    });
    const sandbox = {
        console: { log() {}, warn() {}, error() {}, debug() {} },
        localStorage: store(),
        sessionStorage: store(),
        navigator: { userAgent: 'JellyfinMediaPlayer 1.11.1 (Windows-i386 10) QtWebEngine/5.15.2' },
        addEventListener() {}, removeEventListener() {},
        ApiClient: {
            serverId: () => 'A1B2C3D4E5F6478899AABBCCDDEEFF00',
            serverAddress: () => 'http://192.168.1.9:8096',
            getCurrentUserId: () => 'u',
            getUrl: p => 'http://192.168.1.9:8096/' + p,
            logout: () => Promise.resolve(),
            clearUser() {}
        },
        setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
        clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
        requestAnimationFrame(fn) { fn(); },
        fetch() { return Promise.resolve({ ok: false, json: () => Promise.resolve({}), text: () => Promise.resolve('') }); },
        document: {
            addEventListener() {}, removeEventListener() {},
            querySelector() { return null; }, querySelectorAll() { return []; },
            getElementById() { return null; },
            createElement: el,
            head: el(), body: el(),
            documentElement: Object.assign(el(), { style: { cssText: '', removeProperty() {} } })
        },
        JSON, Date, Math, Object, Array, String, Number, Boolean, RegExp, Error, Promise
    };
    if (opts.app) {
        sandbox.NativeShell = { getPlugins: () => ['mpvVideoPlayer'] };
        sandbox.jmpInfo = {
            scriptPath: opts.scriptPath === undefined ? SCRIPT_PATH : opts.scriptPath,
            settings: { main: { userWebClient: opts.saved === undefined ? 'http://192.168.1.9:8096' : opts.saved } }
        };
    }
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.location = location;
    vm.createContext(sandbox);
    new vm.Script(src, { filename: 'profiles.js' }).runInContext(sandbox);
    const tick = () => { const t = timers.shift(); if (t) t.fn(); return !!t; };
    return { plugin: sandbox.__PROFILES, navigations, tick, sandbox };
}

const kinds = navs => navs.map(n => n.kind + (n.url ? ' ' + n.url : '')).join(' | ') || '(none)';
const onlyStartPage = navs => navs.length === 1 && navs[0].kind === 'href' && navs[0].url === START_PAGE;

console.log();
console.log('── A profile switch in Jellyfin Media Player ──────────────────');
{
    const p = makePage({ app: true });
    p.plugin.reloadAtHome();
    ok('from another page, the switch goes through the app\'s start page', onlyStartPage(p.navigations), kinds(p.navigations));
}
{
    const p = makePage({ app: true, hash: '' });
    p.plugin.reloadAtHome();
    ok('from home, too', onlyStartPage(p.navigations), kinds(p.navigations));
}
{
    // The ladder still exists for a navigation that does nothing. Its later rungs are the
    // ordinary ones: a working player matters less than showing the right profile.
    const p = makePage({ app: true });
    p.plugin.reloadAtHome();
    p.tick();
    ok('a start page that did not open still escalates', p.navigations.length > 1, kinds(p.navigations));
}

console.log();
console.log('── Every other reload ─────────────────────────────────────────');
{
    const p = makePage({ app: true });
    p.plugin.handleSessionExpired();
    ok('a session that ended goes through the start page', onlyStartPage(p.navigations), kinds(p.navigations));
}
{
    // Each `location.reload()` in the file, named by line, must sit inside the two methods
    // that choose between it and the start page. A new one anywhere else is this bug again.
    const lines = raw.split('\n');
    const owners = [];
    let owner = null;
    lines.forEach((line, i) => {
        const m = line.match(/^\s{8}([A-Za-z_$][\w$]*): function\b/);
        if (m) owner = m[1];
        if (/location\.reload\(\)/.test(line) && !/^\s*\/\//.test(line)) owners.push({ line: i + 1, owner });
    });
    const stray = owners.filter(o => o.owner !== 'reloadDocument' && o.owner !== '_reloadWithFallback');
    ok('every location.reload() is in reloadDocument or the switch ladder', stray.length === 0,
        stray.map(o => 'line ' + o.line + ' in ' + o.owner).join(', '));
    ok('and the scan found them', owners.length >= 2, owners.length + ' found');
}

console.log();
console.log('── Anywhere else, nothing changes ─────────────────────────────');
{
    const p = makePage({});
    p.plugin.reloadAtHome();
    ok('a browser gets the replace/reload pair', p.navigations.length === 2
        && p.navigations[0].kind === 'replace' && p.navigations[1].kind === 'reload', kinds(p.navigations));
}
{
    const p = makePage({});
    p.plugin.handleSessionExpired();
    ok('and a plain reload when a session ends', p.navigations.length === 1 && p.navigations[0].kind === 'reload', kinds(p.navigations));
}
{
    // With no saved server the start page shows its connect form instead of signing back in.
    const p = makePage({ app: true, saved: '' });
    p.plugin.reloadAtHome();
    ok('the app with no saved server reloads as before', p.navigations[0] && p.navigations[0].kind !== 'href', kinds(p.navigations));
}
{
    const p = makePage({ app: true, scriptPath: 'http://192.168.1.9:8096/web/' });
    p.plugin.reloadAtHome();
    ok('a native shell whose scripts are not on file:// reloads as before', p.navigations[0] && p.navigations[0].kind !== 'href', kinds(p.navigations));
}
{
    const p = makePage({ app: true, scriptPath: SCRIPT_PATH.replace(/\/$/, '') });
    p.plugin.reloadAtHome();
    ok('a script path without its trailing slash still names the start page', onlyStartPage(p.navigations), kinds(p.navigations));
}

console.log();
if (fails.length) {
    console.log('  Failures:');
    fails.forEach(f => console.log('   - ' + f));
    console.log(pass + ' passed, ' + fails.length + ' failed');
    process.exit(1);
}
console.log(pass + ' passed, 0 failed');
