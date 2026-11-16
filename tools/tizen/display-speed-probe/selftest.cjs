"use strict";
// Host contract for the account-free display/speed probe. The mocks here prove the probe's
// bookkeeping: it reads constants from the installed runtime, refuses values it cannot name,
// refuses to call speed methods with no stream, and records every firmware answer. Nothing in
// this file is evidence about a Samsung model - see docs/vemm/09-display-and-speed-probe.md.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "probe.js"), "utf8");

function fixture(options = {}) {
    const calls = [];
    const state = options.state || "PLAYING";
    const player = {
        AVPLAY_DISPLAY_WIN_TRIM: 0,
        AVPLAY_DISPLAY_WIN_FIT: options.fitValue === undefined ? 1 : options.fitValue,
        AVPLAY_DISPLAY_CROP: 3,
        AVPLAY_SPEED_NORMAL_PLAYBACK: 0,
        AVPLAY_SPEED_FAST_FORWARD_2X: options.ff2Value === undefined ? 1 : options.ff2Value,
        AVPLAY_SPEED_REWIND_2X: 101
    };
    let displayMethod = "AVPLAY_DISPLAY_WIN_FIT";
    let speed = 0;
    let area = null;
    const methods = {
        setDisplayMethod: value => { displayMethod = value; calls.push(["setDisplayMethod", value]); },
        getDisplayMethod: () => displayMethod,
        setDisplayArea: rect => { area = rect; calls.push(["setDisplayArea", rect]); },
        setSpeed: value => { speed = value; calls.push(["setSpeed", value]); },
        getSpeed: () => speed,
        open: url => { calls.push(["open", url]); },
        prepareAsync: () => { calls.push(["prepareAsync"]); },
        play: () => { calls.push(["play"]); },
        pause: () => { calls.push(["pause"]); },
        stop: () => { calls.push(["stop"]); },
        getState: () => state,
        getVersion: () => "5.000"
    };
    (options.missing || []).forEach(name => { delete methods[name]; });
    (options.throwing || []).forEach(name => {
        methods[name] = () => { const error = new Error("injected firmware failure"); error.code = 501; throw error; };
    });
    Object.keys(methods).forEach(name => { player[name] = methods[name]; });
    const window = { webapis: options.noAvplay ? {} : { avplay: player,
        productinfo: { getModel: () => "MODEL-FIXTURE", getFirmware: () => "FIRMWARE-FIXTURE" } } };
    new vm.Script(source).runInNewContext({ window, navigator: { userAgent: "host fixture" },
        Date, Object, Math, isFinite, String });
    return { api: window.displaySpeedProbe, calls,
        read: () => ({ displayMethod, speed, area }) };
}

let checks = 0;
function check(action) { action(); checks += 1; }

check(() => {
    const f = fixture({ fitValue: 7, ff2Value: 11 });
    const caps = f.api.capabilities();
    assert.equal(caps.hasAvplay, true);
    assert.equal(JSON.stringify(caps.displayMethods),
        JSON.stringify(["AVPLAY_DISPLAY_CROP", "AVPLAY_DISPLAY_WIN_FIT", "AVPLAY_DISPLAY_WIN_TRIM"]));
    // The values come from the installed runtime, not from a table baked into the probe.
    assert.equal(JSON.stringify(caps.speeds.map(entry => `${entry.name}=${entry.value}`)),
        JSON.stringify(["AVPLAY_SPEED_NORMAL_PLAYBACK=0", "AVPLAY_SPEED_FAST_FORWARD_2X=11",
            "AVPLAY_SPEED_REWIND_2X=101"]));
    assert(caps.present.includes("setDisplayMethod"));
    assert(caps.missing.includes("setSpeedV2"));
    assert.equal(caps.state, "PLAYING");
    assert.equal(f.api.identity().model, "MODEL-FIXTURE");
    assert.equal(f.api.identity().avplayVersion, "5.000");
});

check(() => {
    const f = fixture({ fitValue: 7 });
    const entry = f.api.setDisplayMethod("AVPLAY_DISPLAY_WIN_FIT");
    assert.equal(entry.outcome, "accepted");
    assert.equal(entry.value, 7, "the runtime's own constant value is what gets sent");
    assert.equal(entry.before, "AVPLAY_DISPLAY_WIN_FIT");
    assert.equal(f.read().displayMethod, 7);
    assert.deepEqual(f.calls, [["setDisplayMethod", 7]]);
});

check(() => {
    const f = fixture();
    const missing = f.api.setDisplayMethod("AVPLAY_DISPLAY_WIN_STRETCH");
    assert.equal(missing.outcome, "unknown-constant");
    assert.equal(JSON.stringify(missing.available),
        JSON.stringify(["AVPLAY_DISPLAY_CROP", "AVPLAY_DISPLAY_WIN_FIT", "AVPLAY_DISPLAY_WIN_TRIM"]));
    const legacy = f.api.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
    assert.equal(legacy.outcome, "unknown-constant",
        "the product's legacy display string is not an AVPlay constant");
    assert.equal(f.calls.length, 0, "an unnamed constant is never sent to the firmware");
});

check(() => {
    const f = fixture({ ff2Value: 11 });
    const entry = f.api.setSpeed("AVPLAY_SPEED_FAST_FORWARD_2X");
    assert.equal(entry.outcome, "accepted");
    assert.equal(entry.value, 11);
    assert.equal(entry.before, "0");
    assert.equal(entry.after, "11");
    assert.deepEqual(f.calls, [["setSpeed", 11]]);
});

check(() => {
    const f = fixture({ state: "IDLE" });
    const entry = f.api.setSpeed("AVPLAY_SPEED_FAST_FORWARD_2X");
    assert.equal(entry.outcome, "requires-stream");
    assert.equal(entry.state, "IDLE");
    assert.equal(JSON.stringify(entry.allowedStates),
        JSON.stringify(["READY", "PLAYING", "PAUSED", "BUFFERING"]));
    assert.equal(f.calls.length, 0, "no speed call is made without an open stream");
});

check(() => {
    const f = fixture();
    assert.equal(f.api.setDisplayArea({ x: 0, y: 0, width: 1920, height: 1080 }).outcome, "accepted");
    assert.deepEqual(f.read().area, { x: 0, y: 0, width: 1920, height: 1080 });
    const invalid = [{ x: -1, y: 0, width: 10, height: 10 }, { x: 0, y: 0.5, width: 10, height: 10 },
        { x: 0, y: 0, width: NaN, height: 10 }, { x: 0, y: 0, width: 10 },
        { x: 0, y: 0, width: 0, height: 10 }, null];
    invalid.forEach(rect => {
        const entry = f.api.setDisplayArea(rect);
        assert.equal(entry.outcome, "invalid-rect", `refuses ${JSON.stringify(rect)}`);
    });
    assert.equal(f.calls.length, 1, "an invalid rectangle never reaches the firmware");
});

check(() => {
    const f = fixture({ missing: ["setSpeed", "getSpeed"] });
    assert.equal(f.api.setSpeed("AVPLAY_SPEED_FAST_FORWARD_2X").outcome, "unsupported");
    assert.equal(f.api.capabilities().missing.includes("setSpeed"), true);
    assert.equal(f.api.capabilities().missing.includes("getSpeed"), true);
    assert.equal(f.calls.length, 0, "an absent method is never called");
});

check(() => {
    const f = fixture({ missing: ["setDisplayMethod", "setDisplayArea"] });
    assert.equal(f.api.setDisplayMethod("AVPLAY_DISPLAY_CROP").outcome, "unsupported");
    assert.equal(f.api.setDisplayArea({ x: 0, y: 0, width: 10, height: 10 }).outcome, "unsupported");
    assert.equal(f.calls.length, 0);
});

check(() => {
    const f = fixture({ missing: ["getDisplayMethod"] });
    const entry = f.api.setDisplayMethod("AVPLAY_DISPLAY_CROP");
    assert.equal(entry.outcome, "accepted");
    assert.equal(entry.before, "unsupported", "a missing getter is reported, not guessed");
    assert.equal(entry.after, "unsupported");
});

check(() => {
    const f = fixture({ throwing: ["setSpeed"] });
    const entry = f.api.setSpeed("AVPLAY_SPEED_REWIND_2X");
    assert.equal(entry.outcome, "rejected");
    assert.match(entry.message, /injected firmware failure/);
    assert.equal(entry.code, "501", "the firmware's own error code is kept");
});

check(() => {
    const f = fixture();
    assert.equal(f.api.prepare("https://media.invalid/synthetic.mp4").outcome, "accepted");
    assert.equal(f.api.prepare("https://media.invalid/synthetic.mp4").via, "prepareAsync");
    assert.deepEqual(f.calls.slice(0, 2), [["open", "https://media.invalid/synthetic.mp4"], ["prepareAsync"]]);
    assert.equal(f.api.play().outcome, "accepted");
    assert.equal(f.api.stop().outcome, "accepted");
    const refused = ["https://user:secret@media.invalid/a.mp4", "https://media.invalid/a.mp4?token=x@y",
        "file:///tmp/a.mp4", "https://media.invalid/a.mp4\nX-Plex-Token: nope", "", null, 42];
    const before = f.calls.length;
    refused.forEach(url => {
        assert.equal(f.api.prepare(url).outcome, "invalid-url", `refuses ${String(url)}`);
    });
    assert.equal(f.calls.length, before, "a refused URL is never handed to AVPlay");
});

check(() => {
    const f = fixture({ noAvplay: true });
    assert.equal(f.api.capabilities().hasAvplay, false);
    assert.equal(f.api.capabilities().present.length, 0);
    assert.equal(f.api.setDisplayMethod("AVPLAY_DISPLAY_CROP").outcome, "no-avplay");
    assert.equal(f.api.setSpeed("AVPLAY_SPEED_FAST_FORWARD_2X").outcome, "no-avplay");
    assert.equal(f.api.setDisplayArea({ x: 0, y: 0, width: 10, height: 10 }).outcome, "no-avplay");
    assert.equal(f.api.prepare("https://media.invalid/a.mp4").outcome, "no-avplay");
    assert.equal(f.api.state(), null);
});

check(() => {
    const f = fixture();
    f.api.setDisplayMethod("AVPLAY_DISPLAY_CROP");
    f.api.setSpeed("AVPLAY_SPEED_NORMAL_PLAYBACK");
    const report = f.api.report();
    assert.equal(report.entries.length, 2);
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(report)).entries.map(entry => entry.request)),
        JSON.stringify(["setDisplayMethod", "setSpeed"]));
    assert(report.entries.every(entry => typeof entry.at === "string"));
    assert.equal(f.api.reset(), 0);
    assert.equal(f.api.report().entries.length, 0);
});

check(() => {
    // The probe is account-free by construction: no network, storage or session surface.
    ["fetch", "XMLHttpRequest", "localStorage", "document.cookie", "webapis.application",
        "webapis.plex", "X-Plex-Token"].forEach(banned => {
        assert.equal(source.includes(banned), false, `the probe must not mention ${banned}`);
    });
});

console.log(`${checks} display/speed probe contract checks passed (host mocks, not device evidence).`);
