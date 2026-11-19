/*
 * Shared plumbing for tests/js/logforge.js: finds every Log*( call in a C# file and splits its
 * arguments. Not a C# parser. It blanks comments and string contents first, so a word inside a
 * message or a comment is never mistaken for an argument, then matches brackets to find where a
 * call ends and splits on the commas at its top level.
 */
'use strict';

// Same length as the input, with comment bodies and string/char contents replaced by spaces
// (newlines kept), so an offset in the result is an offset in the source.
function mask(src) {
    const out = src.split('');
    const n = src.length;
    const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
    let i = 0;
    while (i < n) {
        const c = src[i];
        const d = src[i + 1];
        if (c === '/' && d === '/') {
            let j = i; while (j < n && src[j] !== '\n') j++;
            blank(i, j); i = j;
        } else if (c === '/' && d === '*') {
            let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
            blank(i, j); i = j;
        } else if (c === '"' || ((c === '$' || c === '@') && (d === '"' || ((d === '$' || d === '@') && src[i + 2] === '"')))) {
            // [$@]*"..."; verbatim strings end at a lone quote, the others at an unescaped one.
            let j = i; while (src[j] !== '"') j++;
            const verbatim = src.slice(i, j).includes('@');
            const start = j; j++;
            for (; j < n; j++) {
                if (verbatim) { if (src[j] === '"') { if (src[j + 1] === '"') { j++; continue; } break; } }
                else if (src[j] === '\\') { j++; }
                else if (src[j] === '"') break;
            }
            blank(start + 1, j); i = j + 1;
        } else if (c === "'") {
            let j = i + 1;
            for (; j < n && src[j] !== "'"; j++) if (src[j] === '\\') j++;
            blank(i + 1, j); i = j + 1;
        } else i++;
    }
    return out.join('');
}

// LogWarning(...) and friends, and the bare logger.Log(level, ...) form PublicUserInjector uses.
const CALL = /\bLog(?:Trace|Debug|Information|Warning|Error|Critical)\s*\(|\b_?logger\??\.Log\s*\(/g;

// [{ at, line, args: [{ text, masked }] }] for every logging call in the source.
function calls(src) {
    const m = mask(src);
    const found = [];
    let hit;
    CALL.lastIndex = 0;
    while ((hit = CALL.exec(m))) {
        const open = hit.index + hit[0].length - 1;
        let depth = 0, j = open, start = open + 1;
        const args = [];
        for (; j < m.length; j++) {
            const c = m[j];
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') {
                depth--;
                if (depth === 0) { args.push([start, j]); break; }
            } else if (c === ',' && depth === 1) { args.push([start, j]); start = j + 1; }
        }
        // logger.Log(level, message, args...): the first argument is the level, not text.
        if (/Log\s*\($/.test(hit[0]) && !/Log[A-Z]\w*\s*\($/.test(hit[0])) args.shift();
        found.push({
            at: hit.index,
            line: src.slice(0, hit.index).split('\n').length,
            args: args.map(([a, b]) => ({ from: a, to: b, text: src.slice(a, b).trim(), masked: m.slice(a, b).trim() })),
        });
    }
    return found;
}

// What can carry request text. A device id is a header value, so any identifier ending in
// DeviceId; the app and device names are headers too, and so are the request path, the name
// typed on a sign-in screen and the header of an uploaded data URL. The two gates name the
// request path `path`, which is too common a word to flag anywhere else.
const TAINT = new RegExp([
    '\\w*[dD]eviceId\\b', 'RequestDevice\\.', '\\bsession\\.(?:Device|DeviceName|Client)\\b',
    'Request\\.Path', '\\bqcDevice\\b', '\\bqcClient\\b', '\\blibraryAvatarId\\b',
    '\\bGetAuthorizationParameter\\b', '\\btyped\\b', '\\bsent\\b', '\\busername\\b', '\\bheader\\b',
].join('|'));
const GATE_PATH = /\bpath\b/;

function carriesRequestText(file, maskedArg) {
    if (/^(?:Maintenance|Viewing)Gate\.cs$/.test(file) && GATE_PATH.test(maskedArg)) return true;
    return TAINT.test(maskedArg);
}

module.exports = { mask, calls, carriesRequestText };
