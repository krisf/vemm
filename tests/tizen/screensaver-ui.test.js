"use strict";
// Screen saver regression (owner request 2026-11-06: "add a screensaver feature that
// defaults to ON ... black screen with an occasionally moving Vemm logo"). The saver
// appears after four idle minutes, the mark wanders and fades, any key press wakes the
// screen (and the wake press is swallowed), video playback suppresses it, and the
// preference defaults to on.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var JSDOM = require("jsdom").JSDOM;
var root = path.resolve(__dirname, "../..");

var playerEpisode = { ratingKey: "7201", type: "episode", index: 1, parentIndex: 1, title: "Synthetic Pause",
    grandparentTitle: "Synthetic Show", grandparentRatingKey: "7200", parentTitle: "Synthetic Season",
    duration: 60000, thumb: "/library/metadata/7201/thumb",
    Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: 1001, key: "/library/parts/episode/file", Stream: [
            { id: 41, streamType: 2, language: "English", codec: "aac" }] }] }] };

function fixture(options) {
    var opts = options || {};
    var dom = new JSDOM(fs.readFileSync(path.join(root, "samsung/Vemm/index.html"), "utf8"), {
        url: "https://screensaver.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var timers = [];
    var timersNext = 1;
    window.fetch = function () { assert.fail("the idle screensaver must not use raw fetch"); };
    var i18nContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, "samsung/Vemm/js/i18n.js"), "utf8"), i18nContext);
    window.VemmI18n = i18nContext.VemmI18n;
    window.VemmPreferences = {
        load: function () { return { quality: "original", nextEpisode: "countdown", language: "en",
            skipInterval: 10, subtitleDelayMs: 0, autoSkip: "off", subtitleSize: "medium",
            subtitlePosition: "low", subtitleColor: "white", subtitleBackground: "off",
            directPlay: "auto", themeMusic: "off", screenSaver: opts.screenSaver || "on" }; },
        save: function () {},
        screenSaverModes: ["off", "on"]
    };
    var engine = { state: opts.playState || "idle", stops: 0, closes: 0 };
    window.VemmAvplay = { create: function () {
        return { open: function () { return Promise.resolve(); }, play: function () {},
            setVolume: function () {}, close: function () { engine.closes += 1; }, seek: function () {},
            snapshot: function () { return {}; } };
    } };
    window.VemmPlayback = { create: function () {
        return { start: function () { engine.state = opts.playState || "playing"; return Promise.resolve(); },
            snapshot: function () { return { state: engine.state, position: 0, duration: 60000 }; },
            pause: function () { engine.state = "paused"; return Promise.resolve(); },
            play: function () { engine.state = "playing"; return Promise.resolve(); },
            seek: function () { return Promise.resolve(); },
            stop: function () { engine.stops += 1; engine.state = "idle"; return Promise.resolve(playerEpisode); },
            selection: function () { return { audioId: 41, subtitleId: 0 }; },
            part: function () { return { id: 1001, key: "/library/parts/episode/file" }; },
            quality: function () { return { source: playerEpisode.Media[0], stream: playerEpisode.Media[0],
                mode: "direct", limit: "original" }; },
            tracks: function () { return []; }, setSubtitleOffset: function () {} };
    } };
    window.VemmSubtitles = { parse: function () { return []; } };
    window.VemmSkipMarkers = require(path.join(root, "samsung/Vemm/js/skip-markers.js"));
    window.VemmQueue = require(path.join(root, "samsung/Vemm/js/queue.js"));
    window.__syntheticClient = {
        getMetadata: function () { return Promise.resolve(playerEpisode); },
        nextEpisode: function () { return Promise.resolve(null); },
        previousEpisode: function () { return Promise.resolve(null); },
        getRelated: function () { return Promise.resolve({ Metadata: [] }); },
        cancelRequests: function () {},
        image: function () { return Promise.reject(new Error("No image request is permitted in this fixture")); }
    };
    var source = fs.readFileSync(path.join(root, "samsung/Vemm/main.js"), "utf8");
    var boot = source.lastIndexOf('    addConnectForm("");');
    assert(boot !== -1, "The app boot boundary remains available to isolated UI tests");
    if (opts.playState) {
        // Start a video inside the module scope, then arm the saver exactly like the
        // boot tail does: the pause/play posture is what the saver must respect.
        source = source.slice(0, boot) + '    startPlayer(' + JSON.stringify(playerEpisode) +
            ', window.__syntheticClient, 0); armScreensaver(); }());';
    }
    // Keep the real boot tail so armScreensaver() runs exactly as it does on a TV.
    var context = {
        document: window.document, window: window, navigator: window.navigator, console: console,
        Promise: Promise, URL: window.URL, Blob: window.Blob,
        setTimeout: function (callback, delay) { var id = timersNext++; timers.push({ id: id, callback: callback, delay: delay, interval: false }); return id; },
        clearTimeout: function (id) { timers = timers.filter(function (timer) { return timer.id !== id; }); },
        setInterval: function (callback, delay) { var id = timersNext++; timers.push({ id: id, callback: callback, delay: delay, interval: true }); return id; },
        clearInterval: function (id) { timers = timers.filter(function (timer) { return timer.id !== id; }); },
        requestAnimationFrame: function (callback) { return setTimeout(callback, 16); },
        cancelAnimationFrame: function (id) { clearTimeout(id); },
        localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }
    };
    vm.runInNewContext(source, context);
    function fireDue(elapsedMs) {
        // Fire every timer scheduled within the elapsed window, in order.
        var due = timers.filter(function (timer) { return timer.delay <= elapsedMs; });
        due.forEach(function (timer) {
            timers = timers.filter(function (t) { return t.id !== timer.id; });
            timer.callback();
        });
    }
    function press(key) {
        var event = new window.KeyboardEvent("keydown", { keyCode: key, bubbles: true, cancelable: true });
        window.document.dispatchEvent(event);
        return event;
    }
    function settle() {
        return Promise.resolve().then(function () { return Promise.resolve(); })
            .then(function () { return Promise.resolve(); })
            .then(function () { return Promise.resolve(); });
    }
    return { dom: dom, window: window, engine: engine, settle: settle,
        hud: function () { return window.document.querySelector(".player-hud"); },
        fireDue: fireDue, press: press,
        saver: function () { return window.document.getElementById("screensaver"); },
        logo: function () { var el = window.document.getElementById("screensaver");
            return el ? el.querySelector(".screensaver-logo") : null; } };
}

async function run() {
    // Default on: four idle minutes bring up the black saver with the wandering mark.
    var on = fixture({});
    // The boot tail armed the idle timer; simulate the idle window elapsing.
    on.fireDue(240000);
    assert(on.saver(), "the screensaver appears after four idle minutes");
    assert(on.logo(), "the saver shows the Vemm mark");
    var firstLeft = on.logo().style.left;
    var firstTop = on.logo().style.top;
    assert(firstLeft !== "" && firstTop !== "", "the mark is parked at a random spot");
    // The mark fades back out after a brief visible window.
    on.fireDue(4000);
    assert.strictEqual(on.logo().style.opacity, "0", "the mark fades out again");
    // Wander: the next move relocates the mark.
    on.fireDue(25000);
    assert(on.logo().style.left !== firstLeft || on.logo().style.top !== firstTop,
        "the mark moves to a new spot so nothing stays lit");
    // Any key press wakes the screen and the wake press is swallowed.
    var wake = on.press(13);
    assert.strictEqual(wake.defaultPrevented, true, "the wake press is swallowed");
    assert(!on.saver(), "a key press dismisses the screensaver");
    // The wake press re-armed the idle countdown from scratch.
    on.fireDue(239999);
    assert(!on.saver(), "the idle countdown restarts after waking");
    on.dom.window.close();

    // Owner report 2026-11-07: a PAUSED video is a still frame and must not be left
    // lit. Four idle minutes over a paused player raise the saver without stopping
    // playback; waking returns to the paused HUD.
    var paused = fixture({ playState: "paused" });
    await paused.settle();
    assert(paused.hud(), "the synthetic player rendered its HUD");
    paused.fireDue(240000);
    assert(paused.saver(), "a paused video still earns the screen saver after the idle window");
    assert.strictEqual(paused.engine.stops, 0, "the saver never stops the paused playback");
    assert.strictEqual(paused.engine.closes, 0, "the saver never closes the paused playback engine");
    var wakePaused = paused.press(13);
    assert.strictEqual(wakePaused.defaultPrevented, true, "the wake press over a paused player is swallowed");
    assert(!paused.saver(), "a key press returns from the saver to the paused video");
    assert.strictEqual(paused.hud().hidden, false, "waking reopens the paused player's menu");
    assert.strictEqual(paused.engine.stops, 0, "the paused run survives the saver round trip");
    paused.dom.window.close();

    // A PLAYING video is never covered: the idle pass re-arms instead of bailing.
    var playing = fixture({ playState: "playing" });
    await playing.settle();
    playing.fireDue(240000);
    assert(!playing.saver(), "the saver never covers a moving picture");
    playing.fireDue(240000);
    assert(!playing.saver(), "the idle check re-arms while video keeps playing");
    playing.dom.window.close();

    // Preference off: the saver never appears, no matter how long the screen is idle.
    var off = fixture({ screenSaver: "off" });
    off.fireDue(240000);
    assert(!off.saver(), "the screensaver stays hidden when the preference is off");
    off.dom.window.close();

    // The stylesheet keeps the saver full-screen black above every layer.
    var css = fs.readFileSync(path.join(root, "samsung/Vemm/css/style.css"), "utf8");
    assert(/\.screensaver\s*\{[^}]*background:\s*#000[^}]*z-index:\s*100/s.test(css),
        "the saver is a full black overlay above every layer");
    assert(/\.screensaver-logo\s*\{[^}]*transition:\s*opacity/s.test(css),
        "the mark fades via an opacity transition");

    console.log("Tizen screen saver idle/wake tests: passed");
}

run().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
