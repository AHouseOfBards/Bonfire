/*
 * A log line must not be writable by whoever sends the request.
 *
 * The header parser URL-decodes, so Device="x%0A[INF] fake line" arrives holding a real
 * newline, and Jellyfin writes log arguments raw. Any log call that passes a device id, an app
 * or device name, a request path, a name typed on a sign-in screen or an uploaded header must
 * pass it through LogText.Clean. tests/cs/logforge proves the helper works on the sign-in path;
 * this fails the call that was missed, by file and line, so the next one cannot be added quietly.
 *
 * Each logging call in the shipped .cs files is found and its arguments are checked one by one
 * (tests/js/_logcalls.js). Not a count: a count stays green when one call is fixed and another
 * is added.
 *
 *   node tests/js/logforge.js [repo root]     (the argument points it at an older checkout)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./_lib');
const { calls, carriesRequestText } = require('./_logcalls');

const root = process.argv[2] || L.ROOT;

let pass = 0;
const fails = [];
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else {
        fails.push(name + (detail ? '  — ' + detail : ''));
        console.log('  FAIL  ' + name + (detail ? '  — ' + detail : ''));
    }
}

function csFiles(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (!/^(bin|obj|tests|node_modules|\.git|\.claude|\.scratch|docs|Web|release-notes)$/.test(e.name)) csFiles(full, out);
        } else if (e.name.endsWith('.cs')) out.push(full);
    }
    return out;
}

const files = csFiles(root, []);
ok('the shipped C# files were found', files.length > 20, files.length + ' files under ' + root);

// The scanner has to see a call before it can miss one, so it is shown the shapes first.
{
    const probe = [
        'logger.LogInformation("a {X}", deviceId);',
        'logger.LogWarning(ex, "a {X}" + "b", cond ? "none" : session.Device);',
        '// logger.LogError("skipped", deviceId);',
        'logger.LogError("a deviceId in a message", LogText.Clean(deviceId));',
    ].join('\n');
    const seen = calls(probe).map(c => c.args.filter(a => carriesRequestText('X.cs', a.masked) && !/LogText\.Clean/.test(a.masked)).length);
    ok('the detector flags a bare device id', seen[0] === 1);
    ok('and one inside a conditional, after an exception argument', seen[1] === 1);
    ok('and ignores a commented-out call', calls(probe).length === 3);
    ok('and a call that already cleans it, and a word that only appears in the message', seen[2] === 0);
}

const offenders = [];
let total = 0;
for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const src = fs.readFileSync(file, 'utf8');
    for (const call of calls(src)) {
        total++;
        for (const arg of call.args) {
            if (carriesRequestText(path.basename(file), arg.masked) && !/\bLogText\.Clean\b/.test(arg.masked)) {
                offenders.push(rel + ':' + call.line + '  ' + arg.text.replace(/\s+/g, ' '));
            }
        }
    }
}
ok('log calls were found', total > 100, total + ' calls');

if (offenders.length) {
    for (const o of offenders) console.log('        ' + o);
}
ok('every log argument that can carry request text goes through LogText.Clean', offenders.length === 0,
   offenders.length + ' not cleaned');

console.log();
if (fails.length) {
    console.log('  Failures:');
    for (const f of fails) console.log('   - ' + f);
    console.log(pass + ' passed, ' + fails.length + ' failed');
    process.exit(1);
}
console.log(pass + ' passed, 0 failed');
