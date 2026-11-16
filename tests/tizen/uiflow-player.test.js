"use strict";
// UIF-P1 player-flow fidelity against synthetic fixtures only: chapter HUD title and scrub-bar
// chapter ticks, per-marker auto skip preferences with legacy migration in the player, the
// Up Next countdown preference (default length, presets, immediate) with total any-key
// cancellation, and the throttled passive-scrobble sync toast. No Plex request, AVPlay session
// or household watch state is touched.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var JSDOM = require("jsdom").JSDOM;
var root = path.resolve(__dirname, "../..");

var item = {
    ratingKey: "synthetic-episode",
    type: "episode",
    title: "A Synthetic Journey",
    grandparentTitle: "Synthetic Show",
    grandparentThumb: "/library/metadata/show/thumb",
    parentTitle: "Season 2",
    parentIndex: 2,
    index: 4,
    summary: "A synthetic episode used only by this test.",
    year: 2025,
    contentRating: "TV-PG",
    duration: 60000,
    viewOffset: 45000,
    Chapter: [
        { id: 1, index: 0, tag: "Arrival", startTimeOffset: 0 },
        { id: 2, index: 1, tag: "Discovery", startTimeOffset: 20000 },
        { id: 3, index: 2, tag: "Return", startTimeOffset: 40000 }
    ],
    Marker: [
        { id: 7, type: "intro", startTimeOffset: 3000, endTimeOffset: 5000 },
        { id: 9, type: "credits", startTimeOffset: 54000, endTimeOffset: 60000, final: "1" }
    ],
    Media: [{
        container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: 1, key: "/library/parts/synthetic/file", Stream: [
            { id: 11, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English", codec: "aac" },
            { id: 21, streamType: 3, language: "English", languageCode: "eng", displayTitle: "English", codec: "srt" }
        ] }]
    }]
};

function withoutChapters() {
    var bare = JSON.parse(JSON.stringify(item));
    delete bare.Chapter;
    return bare;
}

function fixture(options) {
    var opts = options || {};
    var played = opts.item || item;
    var playbackPosition = 45000;
    var dom = new JSDOM(fs.readFileSync(path.join(root, "samsung/Vemm/index.html"), "utf8"), {
        url: "https://uiflow.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    Object.defineProperty(window.document, "hidden", { value: false, configurable: true });
    var callbacks = {};
    var seeks = [];
    var starts = 0;
    window.fetch = function () { assert.fail("The player preview must not use the network"); };
    var i18nContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, "samsung/Vemm/js/i18n.js"), "utf8"), i18nContext);
    window.VemmI18n = i18nContext.VemmI18n;
    // A shipped-shape preference bag. New keys are only present when the test supplies them,
    // so fixtures without them exercise the legacy fallback paths.
    var loaded = { quality: "original", nextEpisode: opts.nextEpisode || "countdown", language: "en",
        skipInterval: 10, subtitleDelayMs: 0, subtitleSize: "medium", subtitlePosition: "low",
        subtitleColor: "white", subtitleBackground: "off", directPlay: "auto" };
    Object.keys(opts.prefs || {}).forEach(function (name) { loaded[name] = opts.prefs[name]; });
    window.VemmPreferences = {
        load: function () { return JSON.parse(JSON.stringify(loaded)); },
        save: function () {}
    };
    window.VemmSkipMarkers = require("../../samsung/Vemm/js/skip-markers.js");
    window.VemmSubtitles = require("../../samsung/Vemm/js/subtitles.js");
    window.VemmQueue = require("../../samsung/Vemm/js/queue.js");
    window.VemmAvplay = { create: function (options) { callbacks.avplay = options; return {}; } };
    window.VemmPlayback = {
        create: function (options) {
            callbacks.player = options;
            var state = "idle";
            return {
                start: function () { starts += 1; state = "playing"; return Promise.resolve(); },
                snapshot: function () { return { state: state, position: playbackPosition, duration: played.duration }; },
                pause: function () { state = "paused"; return Promise.resolve(); },
                play: function () { state = "playing"; return Promise.resolve(); },
                seek: function (position) { seeks.push(position); return Promise.resolve(position); },
                stop: function () { state = "idle"; return Promise.resolve(played); },
                selection: function () { return { audioId: 11, subtitleId: 21 }; },
                part: function () { return played.Media[0].Part[0]; },
                quality: function () { return { source: played.Media[0], stream: played.Media[0], mode: "direct", limit: "original" }; },
                tracks: function () { return []; },
                setSubtitleOffset: function () {}
            };
        }
    };
    var client = {
        nextEpisode: function () {
            return Promise.resolve({ ratingKey: "synthetic-next", type: "episode", title: "Next Synthetic Episode",
                grandparentTitle: "Synthetic Show", parentIndex: 2, index: 5,
                thumb: "/library/metadata/next/thumb" });
        },
        getMetadata: function (id) {
            if (String(id) === "synthetic-next") {
                return Promise.resolve({ ratingKey: "synthetic-next", type: "episode", title: "Next Synthetic Episode",
                    duration: 60000, Media: played.Media });
            }
            return Promise.resolve(played);
        },
        getTracks: function () { return Promise.resolve([]); },
        getAllLeaves: function () { return Promise.resolve({ Metadata: [], totalSize: 0 }); },
        cancelRequests: function () {},
        image: function () { return Promise.reject(new Error("No image request is permitted in this fixture")); }
    };
    var source = fs.readFileSync(path.join(root, "samsung/Vemm/main.js"), "utf8");
    var boot = source.lastIndexOf('    addConnectForm("");');
    assert(boot !== -1, "The app boot boundary remains available to isolated UI tests");
    source = source.slice(0, boot) +
        '    startPlayer(' + JSON.stringify(played) + ', window.__syntheticClient, 45000, 0, null);' + ' }());';
    window.__syntheticClient = client;
    var timers = [];
    var timersNext = 1;
    vm.runInNewContext(source, {
        document: window.document,
        window: window,
        navigator: window.navigator,
        console: console,
        Promise: Promise,
        URL: window.URL,
        Blob: window.Blob,
        setTimeout: function (callback, delay) {
            var id = timersNext++;
            timers.push({ id: id, callback: callback, delay: delay, interval: false });
            return id;
        },
        clearTimeout: function (id) { timers.forEach(function (timer) { if (timer.id === id) { timer.callback = null; } }); },
        setInterval: function (callback, delay) {
            var id = timersNext++;
            timers.push({ id: id, callback: callback, delay: delay, interval: true });
            return id;
        },
        clearInterval: function (id) { timers.forEach(function (timer) { if (timer.id === id) { timer.callback = null; } }); }
    });
    function findButton(label, scope) {
        return Array.prototype.slice.call((scope || window.document).querySelectorAll("button")).filter(function (button) {
            return button.textContent.trim() === label;
        })[0] || null;
    }
    function click(label, scope) {
        var control = findButton(label, scope);
        assert(control, "Missing button: " + label);
        control.click();
        return control;
    }
    function key(code) {
        var event = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "keyCode", { value: code });
        window.document.dispatchEvent(event);
    }
    async function settle() { for (var i = 0; i < 10; i += 1) { await Promise.resolve(); } }
    function fire(delay) {
        var fired = 0;
        timers.forEach(function (timer) {
            if (timer.callback && timer.delay === delay) {
                var callback = timer.callback;
                if (!timer.interval) { timer.callback = null; }
                callback();
                fired += 1;
            }
        });
        return fired;
    }
    function status() { return (window.document.getElementById("status") || {}).textContent || ""; }
    function time(position) {
        callbacks.avplay.onEvent({ type: "time", position: position, duration: played.duration });
    }
    return {
        dom: dom, window: window, document: window.document, callbacks: callbacks, seeks: seeks,
        starts: function () { return starts; }, findButton: findButton, click: click, key: key,
        settle: settle, fire: fire, status: status, time: time
    };
}

// Chapter title beside the remaining-time clock, and chapter tick marks on the scrub track.
async function chapterHudAndTicks() {
    var app = fixture();
    try {
        await app.settle();
        var label = app.document.querySelector(".playback-chapter");
        assert(label, "An item with chapters shows the current chapter in the HUD");
        assert(app.document.querySelector(".playback-time").contains(label),
            "The chapter label sits with the clocks, near the remaining-time text");
        assert.strictEqual(label.textContent, "Return", "The chapter covering the resume position is named");
        app.time(25000);
        assert.strictEqual(label.textContent, "Discovery", "The chapter label follows the playhead");
        app.time(5000);
        assert.strictEqual(label.textContent, "Arrival", "The chapter that starts at zero counts");

        var ticks = app.document.querySelectorAll(".playback-progress .chapter-tick");
        assert.strictEqual(ticks.length, 2, "Every chapter boundary after the start gets one tick");
        assert(Math.abs(parseFloat(ticks[0].style.left) - 20000 * 100 / 60000) < 0.01,
            "The first tick sits at its chapter boundary on the track");
        assert(Math.abs(parseFloat(ticks[1].style.left) - 40000 * 100 / 60000) < 0.01,
            "The second tick sits at its chapter boundary on the track");
    } finally { app.dom.window.close(); }

    var bare = fixture({ item: withoutChapters() });
    try {
        await bare.settle();
        assert(!bare.document.querySelector(".playback-chapter"), "No chapter label without chapter metadata");
        assert.strictEqual(bare.document.querySelectorAll(".chapter-tick").length, 0,
            "No tick marks without chapter metadata");
    } finally { bare.dom.window.close(); }
}

// Each marker type is gated on its own preference; the legacy combined key still works.
async function perMarkerAutoSkip() {
    var introOnly = fixture({ prefs: { autoSkipIntro: "on", autoSkipCredits: "off" }, nextEpisode: "off" });
    try {
        introOnly.time(4000);
        assert.strictEqual(introOnly.seeks[introOnly.seeks.length - 1], 5000,
            "Auto skip intro jumps the playhead to the end of the intro");
        assert(introOnly.status().indexOf("Skipping intro") !== -1, "The intro skip is announced");
        introOnly.time(55000);
        assert(introOnly.status().indexOf("Skipping credits") === -1,
            "Auto skip credits off keeps the credits even when intro skipping is on");
        assert(introOnly.findButton("Skip Credits"), "The credits marker stays a manual choice");
    } finally { introOnly.dom.window.close(); }

    var creditsOnly = fixture({ prefs: { autoSkipIntro: "off", autoSkipCredits: "on" }, nextEpisode: "off" });
    try {
        creditsOnly.time(4000);
        assert.strictEqual(creditsOnly.seeks.length, 0,
            "Auto skip credits on does not touch the intro");
        assert(creditsOnly.findButton("Skip Intro"), "The intro marker stays a manual choice");
        creditsOnly.time(55000);
        assert(creditsOnly.status().indexOf("Skipping credits") !== -1,
            "Auto skip credits finishes the episode at the final credits marker");
        await creditsOnly.settle();
    } finally { creditsOnly.dom.window.close(); }

    // A stored Auto skip from an older version drives both rows.
    var legacy = fixture({ prefs: { autoSkip: "on" }, nextEpisode: "off" });
    try {
        legacy.time(4000);
        assert.strictEqual(legacy.seeks[legacy.seeks.length - 1], 5000,
            "The legacy Auto skip preference still auto-skips the intro");
        legacy.time(55000);
        assert(legacy.status().indexOf("Skipping credits") !== -1,
            "The legacy Auto skip preference still auto-skips the credits");
        await legacy.settle();
    } finally { legacy.dom.window.close(); }
}

// Up Next uses the countdown preference for its ring, and "immediate" starts the successor
// as soon as it loads.
async function upNextCountdownPreference() {
    ["5", "10", "15", "30"].forEach(function (seconds) {
        var app = fixture({ prefs: { upNextCountdown: seconds } });
        try {
            app.time(56000);
            var countdown = app.document.querySelector(".up-next-countdown");
            assert(countdown, "Up Next shows its countdown for the " + seconds + "s preset");
            assert(countdown.textContent.indexOf("starts in " + seconds + "s") !== -1,
                "Up Next counts down from the configured " + seconds + "s preset");
        } finally { app.dom.window.close(); }
    });

    // Without the preference (stored by an older version) the caller's seconds still apply.
    var legacy = fixture();
    try {
        legacy.time(56000);
        assert(legacy.document.querySelector(".up-next-countdown").textContent.indexOf("starts in 10s") !== -1,
            "Up Next keeps its ten-second default for stored preferences without the key");
    } finally { legacy.dom.window.close(); }

    var immediate = fixture({ prefs: { upNextCountdown: "immediate" } });
    try {
        immediate.time(56000);
        await immediate.settle();
        assert.strictEqual(immediate.starts(), 2,
            "The immediate preset starts the next episode as soon as it loads");
        assert(!immediate.document.querySelector(".up-next-card"),
            "The immediate preset does not hold the Up Next card up");
    } finally { immediate.dom.window.close(); }
}

// Any remote key while the countdown runs cancels the auto-start; the card stays usable,
// and Back keeps its two-step cancel-then-close gesture.
async function anyKeyCancelsUpNext() {
    var app = fixture({ prefs: { upNextCountdown: "30" } });
    try {
        app.time(56000);
        await app.settle();
        assert(app.document.querySelector(".up-next-card"), "Up Next is up and counting");
        app.key(458);
        assert(app.status().indexOf("Auto-play cancelled") !== -1, "Any key reports the cancelled auto-play");
        assert(app.document.querySelector(".up-next-countdown").textContent.indexOf("Auto-play cancelled") !== -1,
            "The countdown text switches to the cancellation");
        assert(app.document.querySelector(".up-next-card"), "The card stays up after any-key cancellation");
        assert(app.findButton("Play next episode"), "The cancelled card keeps its explicit choices");
        for (var i = 0; i < 40; i += 1) { app.fire(1000); }
        await app.settle();
        assert.strictEqual(app.starts(), 1, "A cancelled countdown never auto-starts the next episode");
        assert(app.document.querySelector(".up-next-card"), "The cancelled card does not close itself");

        // Back keeps the pinned two-step gesture: first cancels, second closes.
        var stepwise = fixture({ prefs: { upNextCountdown: "30" } });
        try {
            stepwise.time(56000);
            stepwise.key(10009);
            assert(stepwise.document.querySelector(".up-next-card"), "Back holds the card open");
            assert(stepwise.status().indexOf("Auto-play cancelled") !== -1, "Back reports the cancellation");
            stepwise.key(10009);
            assert(!stepwise.document.querySelector(".up-next-card"), "A second Back closes the card");
        } finally { stepwise.dom.window.close(); }
    } finally { app.dom.window.close(); }
}

// A passive scrobble success says "Saved to Plex." at most once a minute per session.
async function syncToastThrottle() {
    var app = fixture();
    try {
        await app.settle();
        assert(app.status().indexOf("Saved to Plex") === -1, "Nothing is claimed before a sync succeeds");
        app.callbacks.player.onEvent({ type: "progress-synced" });
        assert(app.status().indexOf("Saved to Plex") !== -1, "A passive progress sync is acknowledged");
        app.callbacks.player.onEvent({ type: "progress-error", message: "Synthetic sync failure" });
        assert(app.status().indexOf("Synthetic sync failure") !== -1, "An error is still surfaced");
        app.callbacks.player.onEvent({ type: "progress-synced" });
        assert(app.status().indexOf("Synthetic sync failure") !== -1,
            "The Saved to Plex toast is throttled within its minute");
        assert(app.status().indexOf("Saved to Plex") === -1, "The throttled toast does not flash back");
    } finally { app.dom.window.close(); }
}

async function run() {
    await chapterHudAndTicks();
    await perMarkerAutoSkip();
    await upNextCountdownPreference();
    await anyKeyCancelsUpNext();
    await syncToastThrottle();
    console.log("Tizen UIF-P1 chapter HUD, per-marker skip, Up Next countdown and sync toast contracts: passed");
}

run().catch(function (error) { console.error(error); process.exitCode = 1; });
