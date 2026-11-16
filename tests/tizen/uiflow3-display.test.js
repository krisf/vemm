"use strict";
// UIFLOW3 Run B display contracts against synthetic fixtures only: the opt-in topbar
// clock and the player finish-time clock with the shared 24h/12h format (B1), the
// per-type watched card checkmarks (B2), the reduce-motion kill switch (B3) and the
// Continue Watching row size (B4). No Plex request, AVPlay session or household watch
// state is touched: every client, adapter, clock and storage bag below is synthetic.
process.env.TZ = "UTC";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var JSDOM = require("jsdom").JSDOM;
var root = path.resolve(__dirname, "../..");
var app = path.join(root, "samsung/Vemm");
var mainSource = fs.readFileSync(path.join(app, "main.js"), "utf8");
var cssSource = fs.readFileSync(path.join(app, "css/style.css"), "utf8");
var plexApi = require(path.join(app, "js/plex-api.js"));

// One fixed wall clock (2023-11-14T22:13:20Z) so every formatted time is predictable.
var EPOCH = 1700000000000;

function playableMovie(ratingKey, title, extra) {
    var item = { ratingKey: ratingKey, type: "movie", title: title, duration: 6000000,
        Media: [{ container: "mp4", Part: [{ id: Number(ratingKey), key: "/library/parts/" + ratingKey + "/file",
            Stream: [{ id: 11, streamType: 1, codec: "h264" }] }] }] };
    Object.keys(extra || {}).forEach(function (name) { item[name] = extra[name]; });
    return item;
}

var watchedMovie = playableMovie("501", "Synthetic Watched Film", { viewCount: 3 });
var watchedShow = { ratingKey: "502", type: "show", title: "Synthetic Watched Show", viewCount: 2 };
var watchedEpisode = { ratingKey: "503", type: "episode", title: "Synthetic Watched Episode",
    grandparentTitle: "Synthetic Watched Show", viewCount: 1,
    Media: [{ container: "mp4", Part: [{ id: 503, key: "/library/parts/503/file", Stream: [
        { id: 11, streamType: 1, codec: "h264" }] }] }] };
var watchedTrack = { ratingKey: "504", type: "track", title: "Synthetic Watched Track",
    grandparentTitle: "Synthetic Artist", parentTitle: "Synthetic Album", viewCount: 1 };
var freshMovie = playableMovie("505", "Synthetic Fresh Film");

var deckItems = [];
for (var deckIndex = 0; deckIndex < 20; deckIndex += 1) {
    deckItems.push(playableMovie(String(601 + deckIndex), "Synthetic Deck Item " + (deckIndex + 1)));
}

var movie = playableMovie("200", "Synthetic Film");
movie.Media[0].Part[0].Stream[0].streamType = 2;
var byKey = {};
[movie, watchedMovie, watchedShow, watchedEpisode, watchedTrack].concat(deckItems).forEach(function (item) {
    byKey[item.ratingKey] = item;
});

function fixture(options) {
    var opts = options || {};
    var played = opts.item || movie;
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://uiflow3-display.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    Object.defineProperty(window.document, "hidden", { value: false, configurable: true });
    var fakeNow = EPOCH;
    // A Date whose "now" is frozen until the test advances it; the constructor still
    // builds real dates so new Date(Date.now() + offset) works for the finish-time clock.
    function FakeDate(value) {
        return new Date(value === undefined ? fakeNow : value);
    }
    FakeDate.now = function () { return fakeNow; };
    window.fetch = function () { assert.fail("UIFLOW3 display fixtures must not use the network"); };
    var i18nContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(app, "js/i18n.js"), "utf8"), i18nContext);
    window.VemmI18n = i18nContext.VemmI18n;
    // A shipped-shape preference bag; new keys are present only when the test supplies them.
    var loaded = { quality: "original", nextEpisode: "countdown", language: "en", skipInterval: 10,
        subtitleDelayMs: 0, subtitleSize: "medium", subtitlePosition: "low", subtitleColor: "white",
        subtitleBackground: "off", directPlay: "auto", subtitleBurnIn: "off" };
    Object.keys(opts.prefs || {}).forEach(function (name) { loaded[name] = opts.prefs[name]; });
    var saved = [];
    window.VemmPreferences = {
        load: function () { return JSON.parse(JSON.stringify(loaded)); },
        save: function (storage, value) { saved.push(JSON.parse(JSON.stringify(value))); }
    };
    window.VemmSkipMarkers = require(path.join(app, "js/skip-markers.js"));
    window.VemmSubtitles = require(path.join(app, "js/subtitles.js"));
    window.VemmQueue = require(path.join(app, "js/queue.js"));
    window.VemmItemMenu = require(path.join(app, "js/item-menu.js"));
    window.VemmHomeHero = require(path.join(app, "js/home-hero.js"));

    var seeks = [];
    var adapter = {
        open: function () { return Promise.resolve(); },
        snapshot: function () { return { state: "playing", position: 0, duration: played.duration }; },
        close: function () {},
        seek: function (position) { return Promise.resolve(position); },
        pause: function () {}, play: function () {},
        tracks: function () { return []; },
        selectTrack: function () {}, subtitles: function () {}, setVolume: function () {}
    };
    var avplay = null;
    window.VemmAvplay = { create: function (options) { avplay = options; return adapter; } };
    window.VemmPlayback = {
        create: function (options) {
            var state = "playing";
            var position = opts.offset || 0;
            return {
                start: function () { return Promise.resolve(); },
                snapshot: function () { return { state: state, position: position, duration: played.duration }; },
                pause: function () { state = "paused"; return Promise.resolve(); },
                play: function () { state = "playing"; return Promise.resolve(); },
                seek: function (target) { seeks.push(target); position = target; return Promise.resolve(target); },
                stop: function () { state = "idle"; return Promise.resolve(played); },
                selection: function () { return { audioId: 11, subtitleId: 21, explicit: false }; },
                part: function () { return played.Media[0].Part[0]; },
                quality: function () { return { source: played.Media[0], stream: played.Media[0],
                    mode: "direct", limit: "original" }; },
                tracks: function () { return []; },
                selectTrack: function () {}, subtitles: function () {},
                setSubtitleOffset: function () {}, position: function () { return position; }
            };
        }
    };
    var client = {
        getMetadata: function (id) { return Promise.resolve(byKey[String(id)] || played); },
        getChildren: function () { return Promise.resolve({ Metadata: [] }); },
        getRelated: function () { return Promise.resolve({ Metadata: [] }); },
        getTracks: function () { return Promise.resolve([]); },
        getAllLeaves: function () { return Promise.resolve({ Metadata: [], totalSize: 0 }); },
        getSectionItems: function () { return Promise.resolve({ items: [], offset: 0, totalSize: 0 }); },
        nextEpisode: function () { return Promise.resolve(movie); },
        request: function () { return Promise.resolve({ generalDecisionCode: 1000, transcodeDecisionCode: 1000 }); },
        selectStreams: function () { return Promise.resolve(); },
        timeline: function () { return Promise.resolve(); },
        stopTranscode: function () { return Promise.resolve(); },
        streamUrl: function (urlPath) { return "https://pms.synthetic.invalid" + urlPath; },
        cancelRequests: function () {},
        image: function () { return Promise.reject(new Error("No image request is permitted")); }
    };
    window.__syntheticClient = client;

    var timers = [];
    var cleared = [];
    window.setTimeout = function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; };
    window.clearTimeout = function (id) { cleared.push(id); };
    window.setInterval = function (callback, delay) { timers.push({ callback: callback, delay: delay, interval: true }); return timers.length; };
    window.clearInterval = function (id) { cleared.push(id); };

    var boot = mainSource.lastIndexOf('    addConnectForm("");');
    if (boot === -1) { throw new Error("The boot seam in main.js moved"); }
    var bootCall = opts.bootPlayer ? "startPlayer(" + JSON.stringify(played) +
        ", window.__syntheticClient, " + (opts.offset || 0) + ", 0, null);" : "";
    // The journey seam exposes the internal screens so the tests drive the same code the
    // boot tail and the Settings rows drive.
    vm.runInNewContext(mainSource.slice(0, boot) + "    " + bootCall +
        "    window.journey = { preferences: function () { return preferences; }," +
        " setPref: function (name, value) { preferences[name] = value; return savePreferences(); }," +
        "" +
        " syncTopbarClock: syncTopbarClock, syncClockTimer: syncClockTimer," +
        " clockTimerActive: function () { return clockTimer !== null; }," +
        " renderHome: renderHome, openDetail: openDetail, openSettings: openSettings," +
        " startPlayer: startPlayer, backView: backView," +
        " setup: function (c) { currentClient = c; accountClient = c; } };\n}());", {
        window: window, document: window.document, navigator: window.navigator,
        location: window.location, localStorage: window.localStorage,
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
        setInterval: window.setInterval, clearInterval: window.clearInterval,
        fetch: window.fetch, Promise: Promise, URL: URL, Blob: Blob, Date: FakeDate
    });

    function settle(ticks) {
        var chain = Promise.resolve();
        for (var tick = 0; tick < (ticks === undefined ? 2 : ticks); tick += 1) {
            chain = chain.then(function () { return new Promise(function (resolve) { process.nextTick(resolve); }); });
        }
        return chain;
    }
    function fire(delay) {
        timers.slice().forEach(function (timer) { if (timer.delay === delay) { timer.callback(); } });
        return settle();
    }
    function findButton(label, scope) {
        var nodes = (scope || window.document).querySelectorAll("button");
        for (var index = 0; index < nodes.length; index += 1) {
            if (nodes[index].textContent.trim() === label) { return nodes[index]; }
        }
        return null;
    }
    function click(label, scope) {
        var target = findButton(label, scope);
        assert.ok(target, "A " + JSON.stringify(label) + " control exists");
        target.click();
        return settle();
    }
    function time(position) {
        avplay.onEvent({ type: "time", position: position, duration: played.duration });
        return settle();
    }
    return {
        dom: dom, window: window, document: window.document, journey: window.journey,
        findButton: findButton, click: click, time: time, settle: settle, fire: fire,
        seeks: seeks, timers: timers, cleared: cleared, saved: saved,
        advance: function (ms) { fakeNow += ms; },
        status: function () { return (window.document.getElementById("status") || {}).textContent || ""; }
    };
}

// B1 (G12): the topbar clock is off by default, appears on every screen when enabled,
// follows the shared 24h/12h format, refreshes on the 30-second timer and leaves no
// timer behind when switched off.
async function topbarClock() {
    var app1 = fixture({});
    try {
        app1.journey.setup(app1.window.__syntheticClient);
        app1.journey.renderHome([], []);
        assert.strictEqual(app1.journey.preferences().showClock, "off", "The clock is off by default");
        assert.strictEqual(app1.document.querySelector(".topbar-clock"), null,
            "No clock is rendered while the preference is off");
        assert.strictEqual(app1.timers.filter(function (timer) { return timer.interval && timer.delay === 30000; }).length, 0,
            "No refresh timer exists while the preference is off");
        // Turn the clock on through the real Settings row, then verify the header span.
        app1.journey.openSettings();
        await app1.click("Show clock: Off");
        await app1.click("On");
        assert.strictEqual(app1.journey.preferences().showClock, "on", "The Settings row saves the choice");
        var span = app1.document.querySelector(".topbar-clock");
        assert.ok(span, "The topbar clock appears when enabled");
        assert.strictEqual(span.textContent, "22:13", "The clock shows the fake wall time in 24h form");
        assert.ok(app1.journey.clockTimerActive(), "The 30-second refresh timer is armed");
        // The shared Clock format choice switches to 12h with AM/PM.
        app1.journey.openSettings();
        await app1.click("Clock format: 24h");
        await app1.click("12h");
        assert.strictEqual(app1.document.querySelector(".topbar-clock").textContent, "10:13 PM",
            "12h mode renders the same instant with AM/PM");
        // Advancing the fake clock and firing the refresh timer re-renders the time.
        app1.advance(30 * 60 * 1000 + 1000);
        await app1.fire(30000);
        assert.strictEqual(app1.document.querySelector(".topbar-clock").textContent, "10:43 PM",
            "The clock refreshes on the 30-second timer");
        // Switching off removes the span and clears the timer.
        app1.journey.openSettings();
        await app1.click("Show clock: On");
        await app1.click("Off");
        assert.strictEqual(app1.document.querySelector(".topbar-clock"), null,
            "Switching the clock off removes the span");
        assert.strictEqual(app1.journey.clockTimerActive(), false,
            "Switching the clock off clears the refresh timer");
    } finally {
        app1.dom.window.close();
    }
}

// B1 (G38): with "Show end time" on, the HUD reads "Ends HH:MM" from now plus the
// remaining duration, refreshed on every clock tick; with it off nothing is rendered.
async function playerEndTime() {
    var app2 = fixture({ prefs: { showEndTime: "on" }, offset: 1500000, bootPlayer: true });
    try {
        await app2.settle(6);
        await app2.time(1500000);
        var end = app2.document.querySelector(".playback-end");
        assert.ok(end, "The finish-time label appears in the HUD");
        // 22:13:20 + (6000000 - 1500000) ms = 23:28:20 UTC.
        assert.strictEqual(end.textContent, "Ends 23:28",
            "The finish time is now plus the remaining duration");
        app2.advance(60 * 1000);
        await app2.time(1500000);
        assert.strictEqual(app2.document.querySelector(".playback-end").textContent, "Ends 23:29",
            "The finish time follows the wall clock as playback continues");
        // 12h mode renders the same finish instant with AM/PM.
        app2.journey.setPref("clockFormat", "12h");
        await app2.time(1500000);
        assert.strictEqual(app2.document.querySelector(".playback-end").textContent, "Ends 11:29 PM",
            "The finish time follows the shared clock format");
        // Turning the preference off mid-playback removes the label again.
        app2.journey.setPref("showEndTime", "off");
        await app2.time(1500000);
        assert.strictEqual(app2.document.querySelector(".playback-end"), null,
            "Turning the preference off removes the finish-time label");
    } finally {
        app2.dom.window.close();
    }
    // The default-off contract: a plain player never renders the label.
    var app3 = fixture({ offset: 1500000, bootPlayer: true });
    try {
        await app3.settle(6);
        await app3.time(1500000);
        assert.strictEqual(app3.document.querySelector(".playback-end"), null,
            "End time stays hidden while the preference is off");
    } finally {
        app3.dom.window.close();
    }
}

function watchedMarks(document) {
    return document.querySelectorAll(".card-watched").length;
}

// B2 (G37): the watched checkmark follows the per-type setting on every card grid.
async function watchedIndicators() {
    var hub = { title: "Synthetic shelf", Metadata: [watchedMovie, watchedShow, watchedEpisode, watchedTrack, freshMovie] };
    var app4 = fixture({});
    try {
        app4.journey.setup(app4.window.__syntheticClient);
        app4.journey.renderHome([], [hub]);
        assert.strictEqual(app4.journey.preferences().watchedIndicators, "all",
            "The setting defaults to Movies & TV");
        assert.strictEqual(watchedMarks(app4.document), 4,
            "all mode marks every watched movie, show, episode and track");
        app4.journey.setPref("watchedIndicators", "movies");
        app4.journey.renderHome([], [hub]);
        assert.strictEqual(watchedMarks(app4.document), 1,
            "movies mode marks only the watched movie");
        app4.journey.setPref("watchedIndicators", "tv");
        app4.journey.renderHome([], [hub]);
        assert.strictEqual(watchedMarks(app4.document), 2,
            "tv mode marks the watched show and episode");
        app4.journey.setPref("watchedIndicators", "none");
        app4.journey.renderHome([], [hub]);
        assert.strictEqual(watchedMarks(app4.document), 0,
            "none mode hides every checkmark");
        // The Settings row offers the four labelled modes.
        app4.journey.setPref("watchedIndicators", "all");
        app4.journey.openSettings();
        var row = app4.findButton("Show watched indicators: Movies & TV");
        assert.ok(row, "The watched-indicator row shows the current mode label");
        await app4.click("Show watched indicators: Movies & TV");
        assert.ok(app4.findButton("Movies only") && app4.findButton("TV only") && app4.findButton("None"),
            "The choice view lists Movies only, TV only and None");
    } finally {
        app4.dom.window.close();
    }
}

// B3 (G39): Reduce motion adds the app-wide class and the stylesheet zeroes every
// transition and animation under it.
async function reduceMotion() {
    var app5 = fixture({});
    try {
        app5.journey.setup(app5.window.__syntheticClient);
        app5.journey.renderHome([], []);
        assert.strictEqual(app5.journey.preferences().reduceMotion, "off", "Reduce motion defaults to off");
        assert.ok(!app5.document.documentElement.classList.contains("vemm-reduce-motion"),
            "No reduce-motion class while the preference is off");
        app5.journey.setPref("reduceMotion", "on");
        assert.ok(app5.document.documentElement.classList.contains("vemm-reduce-motion"),
            "The reduce-motion class lands on the document while the preference is on");
        app5.journey.setPref("reduceMotion", "off");
        assert.ok(!app5.document.documentElement.classList.contains("vemm-reduce-motion"),
            "The class is removed again when the preference is off");
        assert.ok(cssSource.indexOf(".vemm-reduce-motion *") !== -1 &&
            cssSource.indexOf("transition: none !important") !== -1 &&
            cssSource.indexOf("animation: none !important") !== -1,
            "The stylesheet zeroes transitions and animations under the class");
    } finally {
        app5.dom.window.close();
    }
}

function deckCardCount(document) {
    var rows = document.querySelectorAll(".shelf");
    for (var index = 0; index < rows.length; index += 1) {
        var title = rows[index].querySelector(".hub-title");
        if (title && title.textContent === "Continue Watching") {
            return rows[index].querySelectorAll(".shelf-row button").length;
        }
    }
    return -1;
}

// B4 (G30/G50): the Continue Watching row shows 6, 12 or 20 titles (default 12);
// other shelves keep twelve; the deck fetch asks the server for up to twenty.
async function continueWatchingRowSize() {
    var deckHub = { hubIdentifier: "continueWatching", title: "Continue Watching", Metadata: deckItems };
    var plainHub = { title: "Synthetic shelf", Metadata: deckItems };
    var app6 = fixture({});
    try {
        app6.journey.setup(app6.window.__syntheticClient);
        assert.strictEqual(app6.journey.preferences().continueWatchingSize, 12,
            "The row size defaults to twelve");
        app6.journey.renderHome([], [deckHub, plainHub]);
        assert.strictEqual(deckCardCount(app6.document), 12, "The deck row shows twelve titles by default");
        app6.journey.setPref("continueWatchingSize", 6);
        app6.journey.renderHome([], [deckHub, plainHub]);
        assert.strictEqual(deckCardCount(app6.document), 6, "The deck row shrinks to six");
        app6.journey.setPref("continueWatchingSize", 20);
        app6.journey.renderHome([], [deckHub, plainHub]);
        assert.strictEqual(deckCardCount(app6.document), 20, "The deck row grows to twenty");
        // A non-deck shelf keeps the fixed twelve whatever the setting says.
        var plainCount = (function () {
            var rows = app6.document.querySelectorAll(".shelf");
            for (var index = 0; index < rows.length; index += 1) {
                var title = rows[index].querySelector(".hub-title");
                if (title && title.textContent === "Synthetic shelf") {
                    return rows[index].querySelectorAll(".shelf-row button").length;
                }
            }
            return -1;
        }());
        assert.strictEqual(plainCount, 12, "Other shelves stay at twelve");
        // An out-of-range stored value falls back to twelve instead of rendering zero.
        app6.journey.setPref("continueWatchingSize", 99);
        app6.journey.renderHome([], [deckHub]);
        assert.strictEqual(deckCardCount(app6.document), 12, "An unsupported size falls back to twelve");
    } finally {
        app6.dom.window.close();
    }
    // The deck fetch itself asks for up to twenty items so a 20-row setting can fill.
    var urls = [];
    var client = plexApi.createClient({
        baseUrl: "https://pms.synthetic.invalid", token: "synthetic-token",
        fetch: function (url) {
            urls.push(String(url));
            return Promise.resolve({ status: 200, ok: true, json: function () {
                return Promise.resolve({ MediaContainer: { Hub: [] } });
            } });
        }
    });
    await client.getHomeHubs();
    assert.ok(urls.some(function (url) { return url.indexOf("/hubs/continueWatching?count=20") !== -1; }),
        "The Home deck requests up to twenty Continue Watching items");
}

// B1/B3/B4: the new choices live in the right Settings groups with their labels.
async function settingsRows() {
    var app7 = fixture({});
    try {
        app7.journey.openSettings();
        assert.ok(app7.findButton("Show end time: Off"), "Playback group offers Show end time");
        assert.ok(app7.findButton("Clock format: 24h"), "Playback group offers the shared Clock format");
        assert.ok(app7.findButton("Continue Watching items: 12"), "Playback group offers the row size");
        assert.ok(app7.findButton("Show clock: Off"), "Appearance group offers Show clock");
        assert.ok(app7.findButton("Show watched indicators: Movies & TV"), "Appearance group offers watched indicators");
        assert.ok(app7.findButton("Reduce motion: Off"), "Appearance group offers Reduce motion");
        // The row size choice round-trips through the saved bag.
        await app7.click("Continue Watching items: 12");
        await app7.click("20");
        assert.strictEqual(app7.journey.preferences().continueWatchingSize, 20,
            "The row size choice saves immediately");
        assert.strictEqual(app7.saved.slice(-1)[0].continueWatchingSize, 20,
            "The saved preference bag carries the new row size");
    } finally {
        app7.dom.window.close();
    }
}

async function run() {
    await topbarClock();
    await playerEndTime();
    await watchedIndicators();
    await reduceMotion();
    await continueWatchingRowSize();
    await settingsRows();
    console.log("Tizen UIFLOW3 Run B display contracts: clock, end time, watched marks, reduce motion, deck size passed");
}

run().then(null, function (error) {
    console.error(error && error.stack || error);
    process.exit(1);
});
