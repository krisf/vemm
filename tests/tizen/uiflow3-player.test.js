"use strict";
// UIFLOW3 player-experience contracts against synthetic fixtures only: pre-play audio and
// subtitle selection from the detail page (A1), the cinema-trailer chain before a movie
// started from the top (A2), pass-out protection gating Up Next auto-play (A3), rewind on
// resume (A4), the three-state skip-intro/skip-credits rows with legacy migration (A5) and
// the 60-second Up Next countdown preset (A6). No Plex request, AVPlay session or household
// watch state is touched: every client, adapter and clock below is synthetic.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var JSDOM = require("jsdom").JSDOM;
var root = path.resolve(__dirname, "../..");
var app = path.join(root, "samsung/Vemm");
var mainSource = fs.readFileSync(path.join(app, "main.js"), "utf8");

var trailerOne = { ratingKey: "201", type: "clip", subtype: "trailer", extraType: 1,
    title: "Synthetic Trailer One", duration: 90000,
    Media: [{ container: "mp4", bitrate: 4000, Part: [{ id: 901, key: "/library/parts/201/stream",
        Stream: [{ id: 911, streamType: 2, language: "English", languageCode: "eng", codec: "aac" }] }] }] };
var trailerTwo = { ratingKey: "202", type: "clip", subtype: "trailer", extraType: 1,
    title: "Synthetic Trailer Two", duration: 60000,
    Media: [{ container: "mp4", bitrate: 4000, Part: [{ id: 902, key: "/library/parts/202/stream",
        Stream: [{ id: 921, streamType: 2, language: "English", languageCode: "eng", codec: "aac" }] }] }] };
var bonusExtra = { ratingKey: "203", type: "clip", subtype: "bonus", extraType: 2,
    title: "Synthetic Bonus", duration: 60000,
    Media: [{ container: "mp4", bitrate: 4000, Part: [{ id: 903, key: "/library/parts/203/stream",
        Stream: [{ id: 931, streamType: 2, language: "English", languageCode: "eng", codec: "aac" }] }] }] };

var movie = { ratingKey: "200", type: "movie", title: "Synthetic Film",
    summary: "A synthetic film used only by this test.", duration: 6000000,
    Marker: [{ id: 7, type: "intro", startTimeOffset: 3000, endTimeOffset: 5000 }],
    Extras: { Metadata: [trailerOne, trailerTwo, bonusExtra] },
    Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: 1, key: "/library/parts/movie/file", Stream: [
            { id: 11, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English (Default)", codec: "aac" },
            { id: 12, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English (Dolby)", codec: "eac3" },
            { id: 21, streamType: 3, language: "English", languageCode: "eng", displayTitle: "English", codec: "srt" },
            { id: 22, streamType: 3, language: "Spanish", languageCode: "spa", displayTitle: "Spanish", codec: "srt" }
        ] }] }] };

var episode = { ratingKey: "300", type: "episode", title: "A Synthetic Journey",
    grandparentTitle: "Synthetic Show", grandparentRatingKey: "show-1", parentTitle: "Season 2",
    parentIndex: 2, index: 4, summary: "A synthetic episode used only by this test.",
    duration: 60000,
    Chapter: [{ id: 1, index: 0, tag: "Arrival", startTimeOffset: 0 }],
    Marker: [
        { id: 7, type: "intro", startTimeOffset: 3000, endTimeOffset: 5000 },
        { id: 9, type: "credits", startTimeOffset: 54000, endTimeOffset: 60000, final: "1" }
    ],
    Extras: { Metadata: [trailerOne] },
    Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: 2, key: "/library/parts/episode/file", Stream: [
            { id: 11, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English (Default)", codec: "aac" },
            { id: 21, streamType: 3, language: "English", languageCode: "eng", displayTitle: "English", codec: "srt" }
        ] }] }] };

var nextEpisode = { ratingKey: "301", type: "episode", title: "The Next Synthetic",
    grandparentTitle: "Synthetic Show", grandparentRatingKey: "show-1", parentTitle: "Season 2",
    parentIndex: 2, index: 5, duration: 60000,
    Media: [{ container: "mp4", Part: [{ id: 3, key: "/library/parts/next/file", Stream: [
        { id: 11, streamType: 2, language: "English", languageCode: "eng", codec: "aac" }] }] }] };

var byKey = {};
[movie, episode, nextEpisode, trailerOne, trailerTwo, bonusExtra].forEach(function (item) {
    byKey[item.ratingKey] = item;
});

function fixture(options) {
    var opts = options || {};
    var played = opts.item || episode;
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://uiflow3.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    Object.defineProperty(window.document, "hidden", { value: false, configurable: true });
    var fakeNow = 1700000000000;
    window.fetch = function () { assert.fail("UIFLOW3 fixtures must not use the network"); };
    var i18nContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(app, "js/i18n.js"), "utf8"), i18nContext);
    window.VemmI18n = i18nContext.VemmI18n;
    // A shipped-shape preference bag; new keys are present only when the test supplies them.
    var loaded = { quality: "original", nextEpisode: "countdown", language: "en", skipInterval: 10,
        subtitleDelayMs: 0, subtitleSize: "medium", subtitlePosition: "low", subtitleColor: "white",
        subtitleBackground: "off", directPlay: "auto", subtitleBurnIn: "off" };
    Object.keys(opts.prefs || {}).forEach(function (name) { loaded[name] = opts.prefs[name]; });
    window.VemmPreferences = {
        load: function () { return JSON.parse(JSON.stringify(loaded)); },
        save: function () {}
    };
    window.VemmSkipMarkers = require(path.join(app, "js/skip-markers.js"));
    window.VemmSubtitles = require(path.join(app, "js/subtitles.js"));
    window.VemmQueue = require(path.join(app, "js/queue.js"));
    window.VemmItemMenu = require(path.join(app, "js/item-menu.js"));

    var created = [];   // every playback session: { item, offset, mediaIndex }
    var starts = 0;
    var seeks = [];
    var requests = [];  // client.request calls (the decision endpoint)
    var streamPuts = []; // client.selectStreams calls
    var avplay = null;
    var adapter = {
        open: function (url, offset, paused) { return Promise.resolve(); },
        snapshot: function () { return { state: "playing", position: 0, duration: played.duration }; },
        close: function () {},
        seek: function (position) { return Promise.resolve(position); },
        pause: function () {}, play: function () {},
        tracks: function () { return []; },
        selectTrack: function () {}, subtitles: function () {}, setVolume: function () {}
    };
    window.VemmAvplay = { create: function (options) { avplay = options; return adapter; } };
    var realPlayback = opts.realPlayback ? require(path.join(app, "js/playback.js")) : null;
    window.VemmPlayback = {
        create: function (options) {
            created.push({ item: options.item, offset: options.settings.offset,
                mediaIndex: options.settings.mediaIndex, audioId: options.settings.audioId,
                subtitleId: options.settings.subtitleId });
            if (realPlayback) {
                var real = realPlayback.create(options);
                created[created.length - 1].player = real;
                return real;
            }
            var state = "idle";
            var position = opts.offset || 0;
            starts += 1;
            return {
                start: function () { state = "playing"; return Promise.resolve(); },
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
        nextEpisode: function () { return Promise.resolve(nextEpisode); },
        request: function (urlPath, method, query) {
            requests.push({ path: urlPath, method: method, query: query });
            return Promise.resolve({ generalDecisionCode: 1000, transcodeDecisionCode: 1000 });
        },
        selectStreams: function (partId, audioId, subtitleId) {
            streamPuts.push({ partId: partId, audioId: audioId, subtitleId: subtitleId });
            return Promise.resolve();
        },
        timeline: function () { return Promise.resolve(); },
        stopTranscode: function () { return Promise.resolve(); },
        streamUrl: function (urlPath) { return "https://pms.synthetic.invalid" + urlPath; },
        cancelRequests: function () {},
        image: function () { return Promise.reject(new Error("No image request is permitted")); }
    };
    window.__syntheticClient = client;

    var timers = [];
    window.setTimeout = function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; };
    window.clearTimeout = function () {};
    window.setInterval = function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; };
    window.clearInterval = function () {};
    var boot = mainSource.lastIndexOf('    addConnectForm("");');
    if (boot === -1) { throw new Error("The boot seam in main.js moved"); }
    var bootCall;
    if (opts.bootDetail) { bootCall = 'openDetail("' + opts.bootDetail + '", window.__syntheticClient);'; }
    else if (opts.bootSettings) { bootCall = "openSettings();"; }
    else { bootCall = "startPlayer(" + JSON.stringify(played) + ", window.__syntheticClient, " +
        (opts.offset || 0) + ", 0, null);"; }
    vm.runInNewContext(mainSource.slice(0, boot) + "    " + bootCall + "\n}());", {
        window: window, document: window.document, navigator: window.navigator,
        location: window.location, localStorage: window.localStorage,
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
        setInterval: window.setInterval, clearInterval: window.clearInterval,
        fetch: window.fetch, Promise: Promise, URL: URL, Blob: Blob,
        Date: { now: function () { return fakeNow; } }
    });

    function settle(ticks) {
        // The real playback start chain (selectStreams -> decision -> open) needs more
        // microtask turns than the stub, so tests that drive it ask for a deeper settle.
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
    function key(code) {
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: code, bubbles: true, cancelable: true }));
        return settle();
    }
    function time(position) {
        avplay.onEvent({ type: "time", position: position, duration: played.duration });
        return settle();
    }
    function timeNow(position) {
        avplay.onEvent({ type: "time", position: position, duration: played.duration });
    }
    function ended() {
        avplay.onEvent({ type: "ended" });
        return settle();
    }
    return {
        dom: dom, window: window, document: window.document,
        findButton: findButton, click: click, key: key, time: time, ended: ended,
        settle: settle, fire: fire, created: created, requests: requests, streamPuts: streamPuts,
        seeks: seeks, timeNow: timeNow, starts: function () { return starts; },
        advance: function (ms) { fakeNow += ms; },
        status: function () { return (window.document.getElementById("status") || {}).textContent || ""; }
    };
}

// A1: the detail page picker chooses audio and subtitle streams before any player exists,
// the choice rides along with playback, and the picker itself asks the server for nothing.
async function prePlayTrackSelection() {
    var app1 = fixture({ bootDetail: "200", realPlayback: true });
    try {
        await app1.settle();
        assert.strictEqual(app1.requests.length, 0, "Opening the detail page sends no decision request");
        await app1.click("More");
        await app1.click("Playback settings");
        var panel = app1.document.getElementById("player-menu");
        assert.ok(panel, "The pre-play picker opens without a player");
        assert.ok(app1.findButton("Audio", panel) && app1.findButton("Subtitles", panel),
            "The picker offers both stream kinds");
        assert.ok(!app1.findButton("Playback options", panel) && !app1.findButton("Close menu", panel),
            "Player-only rows are absent from the pre-play picker");
        assert.ok(app1.findButton("Close", panel), "The pre-play picker closes itself");
        await app1.click("English", panel);
        panel = app1.document.getElementById("player-menu");
        var dolby = app1.findButton("English (Dolby)", panel);
        assert.ok(dolby, "The audio streams are listed by display title");
        assert.strictEqual(dolby.getAttribute("aria-pressed"), "false", "The default audio track is not yet chosen");
        dolby.click();
        await app1.settle();
        panel = app1.document.getElementById("player-menu");
        assert.strictEqual(app1.findButton("English (Dolby)", panel).getAttribute("aria-pressed"), "true",
            "The chosen audio track reads as selected");
        await app1.click("Subtitles", panel);
        panel = app1.document.getElementById("player-menu");
        await app1.click("English", panel);
        panel = app1.document.getElementById("player-menu");
        await app1.click("Subtitles off", panel);
        panel = app1.document.getElementById("player-menu");
        assert.strictEqual(app1.findButton("Subtitles off", panel).getAttribute("aria-pressed"), "true",
            "The Off choice reads as selected");
        assert.strictEqual(app1.requests.length, 0, "The picker itself sends no request");
        assert.strictEqual(app1.streamPuts.length, 0, "The picker itself sends no stream write");
        await app1.click("Close", panel);
        assert.strictEqual(app1.document.getElementById("player-menu"), null, "Close leaves the picker");
        await app1.click("Play");
        await app1.settle(16);
        assert.strictEqual(app1.streamPuts.length, 1, "Playback registers the chosen streams once");
        assert.deepStrictEqual(
            { partId: app1.streamPuts[0].partId, audioId: app1.streamPuts[0].audioId,
                subtitleId: app1.streamPuts[0].subtitleId },
            { partId: 1, audioId: 12, subtitleId: 0 },
            "The chosen audio track and the Off subtitle choice are written");
        assert.strictEqual(app1.requests.length, 1, "Exactly one decision request is sent");
        assert.strictEqual(app1.requests[0].query.audioStreamID, 12,
            "The playback request carries the chosen audio stream");
        assert.strictEqual(app1.requests[0].query.subtitleStreamID, 0,
            "The playback request carries the cleared subtitle stream");
        assert.strictEqual(app1.requests[0].query.subtitles, "none",
            "Subtitle burn-in stays off for the cleared track");
        assert.strictEqual(app1.created[0].audioId, 12, "The session settings carry the remembered audio choice");
        assert.strictEqual(app1.created[0].subtitleId, 0, "The session settings carry the remembered Off choice");
    } finally {
        // The real playback session holds a Node interval until it is stopped.
        if (app1.created[0] && app1.created[0].player) { app1.created[0].player.stop(); }
        app1.dom.window.close();
    }
}

// A1: the in-player panel keeps its rows and its reload-on-pick behavior unchanged.
async function inPlayerTrackPanelUnchanged() {
    var app2 = fixture({ item: episode, offset: 45000 });
    try {
        await app2.settle();
        await app2.click("Audio");
        var panel = app2.document.getElementById("player-menu");
        assert.ok(panel, "The in-player panel still opens");
        assert.ok(app2.findButton("Playback options", panel) && app2.findButton("Close menu", panel),
            "The in-player panel keeps Playback options and Close menu rows");
        assert.ok(!app2.findButton("Close", panel), "The in-player panel keeps its original close row");
        await app2.click("English", panel);
        panel = app2.document.getElementById("player-menu");
        var dolby = app2.findButton("English (Dolby)", panel);
        assert.ok(!dolby, "The episode fixture exposes one audio track");
        await app2.click("English (Default)", panel);
        assert.strictEqual(app2.created.length, 2, "Picking a track restarts playback through the existing seam");
        assert.strictEqual(app2.created[1].audioId, 11, "The restart keeps the chosen audio track");
        assert.strictEqual(app2.created[1].subtitleId, 21, "Picking audio keeps the current subtitle track");
        assert.strictEqual(app2.created[1].offset, 45000, "The restart resumes at the current position");
    } finally { app2.dom.window.close(); }
}

// A2: a movie started from the top plays up to N trailers first; resume, episodes and the
// disabled setting never play trailers, and the visible queue never learns about them.
async function cinemaTrailers() {
    var app3 = fixture({ item: movie, prefs: { cinemaTrailers: "1" } });
    try {
        await app3.settle();
        assert.strictEqual(app3.created.length, 1, "The chain starts with the first trailer only");
        assert.strictEqual(app3.created[0].item.ratingKey, "201", "Trailer one plays first");
        assert.strictEqual(app3.created[0].offset, 0, "The trailer starts at the beginning");
        await app3.ended();
        await app3.settle();
        assert.strictEqual(app3.created.length, 2, "The movie follows the trailer");
        assert.strictEqual(app3.created[1].item.ratingKey, "200", "The movie plays after the trailer");
        assert.strictEqual(app3.created[1].offset, 0, "The movie starts from the top after the trailer");
        assert.strictEqual(app3.document.querySelectorAll(".queue-row").length, 0,
            "Trailers never appear in the visible play queue");
        // The movie after the chain behaves like any movie: its intro marker is honored.
        app3.prefs = null;
        await app3.time(4000);
        assert.strictEqual(app3.created[1].item.ratingKey, "200", "The movie is still playing");
    } finally { app3.dom.window.close(); }

    var app4 = fixture({ item: movie, prefs: { cinemaTrailers: "2" } });
    try {
        await app4.settle();
        assert.strictEqual(app4.created[0].item.ratingKey, "201", "Trailer one plays first");
        await app4.ended();
        await app4.settle();
        assert.strictEqual(app4.created.length, 2, "The second trailer follows");
        assert.strictEqual(app4.created[1].item.ratingKey, "202", "Trailer two plays second");
        await app4.ended();
        await app4.settle();
        assert.strictEqual(app4.created.length, 3, "The movie follows both trailers");
        assert.strictEqual(app4.created[2].item.ratingKey, "200", "The movie plays last");
    } finally { app4.dom.window.close(); }

    var app5 = fixture({ item: movie, offset: 45000, prefs: { cinemaTrailers: "2" } });
    try {
        await app5.settle();
        assert.strictEqual(app5.created.length, 1, "A resumed movie never plays trailers");
        assert.strictEqual(app5.created[0].item.ratingKey, "200", "Resume goes straight to the movie");
    } finally { app5.dom.window.close(); }

    var app6 = fixture({ item: movie, prefs: { cinemaTrailers: "off" } });
    try {
        await app6.settle();
        assert.strictEqual(app6.created.length, 1, "The default setting plays no trailers");
        assert.strictEqual(app6.created[0].item.ratingKey, "200", "Off goes straight to the movie");
    } finally { app6.dom.window.close(); }

    var app7 = fixture({ item: episode, prefs: { cinemaTrailers: "2" } });
    try {
        await app7.settle();
        assert.strictEqual(app7.created.length, 1, "Episodes never play trailers");
        assert.strictEqual(app7.created[0].item.ratingKey, "300", "The episode plays directly");
    } finally { app7.dom.window.close(); }
}

// A3: after the configured idle time Up Next auto-play asks "Still watching?" first; Yes
// starts the next episode, Back/No cancels exactly like the card's own cancellation, a
// recent keypress auto-starts normally and "never" disables the gate.
async function passOutProtection() {
    var app8 = fixture({ item: episode, prefs: { passOutProtection: "1", upNextCountdown: "5" } });
    try {
        await app8.key(458);
        app8.advance(2 * 3600000);
        await app8.time(56000);
        assert.ok(app8.findButton("Skip Credits"), "The credits pill still appears");
        await app8.fire(1000);
        await app8.fire(1000);
        await app8.fire(1000);
        await app8.fire(1000);
        await app8.fire(1000);
        await app8.fire(1000);
        var overlay = app8.document.getElementById("still-watching");
        assert.ok(overlay, "The idle viewer is asked before auto-play starts the next episode");
        assert.strictEqual(overlay.getAttribute("role"), "dialog", "The overlay is a dialog");
        assert.ok(app8.findButton("Yes, keep playing", overlay) && app8.findButton("No, stop here", overlay),
            "The overlay offers yes and no");
        assert.strictEqual(app8.starts(), 1, "The next episode is not started while the overlay is up");
        assert.ok(app8.document.getElementById("up-next-panel"), "The Up Next card stays behind the overlay");
        await app8.click("No, stop here");
        assert.strictEqual(app8.document.getElementById("still-watching"), null, "No closes the overlay");
        assert.strictEqual(app8.starts(), 1, "No cancels auto-play");
        assert.ok(app8.document.querySelector(".up-next-countdown").textContent.indexOf("Auto-play cancelled") !== -1,
            "No uses the existing cancellation semantics");
    } finally { app8.dom.window.close(); }

    var app9 = fixture({ item: episode, prefs: { passOutProtection: "1", upNextCountdown: "5" } });
    try {
        await app9.key(458);
        app9.advance(2 * 3600000);
        await app9.time(56000);
        await app9.fire(1000);
        await app9.fire(1000);
        await app9.fire(1000);
        await app9.fire(1000);
        await app9.fire(1000);
        await app9.fire(1000);
        assert.ok(app9.document.getElementById("still-watching"), "The overlay gates auto-play");
        await app9.click("Yes, keep playing");
        assert.strictEqual(app9.document.getElementById("still-watching"), null, "Yes closes the overlay");
        assert.strictEqual(app9.starts(), 2, "Yes starts the next episode");
    } finally { app9.dom.window.close(); }

    var app10 = fixture({ item: episode, prefs: { passOutProtection: "1", upNextCountdown: "5" } });
    try {
        await app10.key(458);
        app10.advance(2 * 3600000);
        await app10.time(56000);
        await app10.fire(1000);
        await app10.fire(1000);
        await app10.fire(1000);
        await app10.fire(1000);
        await app10.key(458); // a press during the countdown wakes the viewer up again
        await app10.fire(1000);
        await app10.fire(1000);
        assert.strictEqual(app10.document.getElementById("still-watching"), null,
            "A recent keypress lets auto-play run");
        assert.strictEqual(app10.starts(), 2, "The next episode auto-starts after a recent press");
    } finally { app10.dom.window.close(); }

    var app11 = fixture({ item: episode, prefs: { passOutProtection: "never", upNextCountdown: "5" } });
    try {
        await app11.key(458);
        app11.advance(5 * 3600000);
        await app11.time(56000);
        await app11.fire(1000);
        await app11.fire(1000);
        await app11.fire(1000);
        await app11.fire(1000);
        await app11.fire(1000);
        await app11.fire(1000);
        assert.strictEqual(app11.document.getElementById("still-watching"), null,
            "Never disables the gate no matter how long the idle time");
        assert.strictEqual(app11.starts(), 2, "Never auto-starts as before");
    } finally { app11.dom.window.close(); }

    // The overlay answers the remote too: Back is No.
    var app12 = fixture({ item: episode, prefs: { passOutProtection: "1", upNextCountdown: "5" } });
    try {
        await app12.key(458);
        app12.advance(2 * 3600000);
        await app12.time(56000);
        await app12.fire(1000);
        await app12.fire(1000);
        await app12.fire(1000);
        await app12.fire(1000);
        await app12.fire(1000);
        await app12.fire(1000);
        assert.ok(app12.document.getElementById("still-watching"), "The overlay is up");
        await app12.key(10009);
        assert.strictEqual(app12.document.getElementById("still-watching"), null, "Back answers No");
        assert.strictEqual(app12.starts(), 1, "Back cancels auto-play");
    } finally { app12.dom.window.close(); }
}

// A4: a resume offset is rewound by the configured seconds, clamped at zero; fresh starts
// and the default setting are untouched.
async function rewindOnResume() {
    var app13 = fixture({ item: episode, offset: 45000, prefs: { rewindOnResume: "10" } });
    try {
        await app13.settle();
        assert.strictEqual(app13.created[0].offset, 35000, "Ten seconds are rewound from the resume point");
    } finally { app13.dom.window.close(); }

    var app14 = fixture({ item: episode, offset: 3000, prefs: { rewindOnResume: "10" } });
    try {
        await app14.settle();
        assert.strictEqual(app14.created[0].offset, 0, "The rewind clamps at the top of the file");
    } finally { app14.dom.window.close(); }

    var app15 = fixture({ item: episode, offset: 0, prefs: { rewindOnResume: "10" } });
    try {
        await app15.settle();
        assert.strictEqual(app15.created[0].offset, 0, "A fresh start is unaffected");
    } finally { app15.dom.window.close(); }

    var app16 = fixture({ item: episode, offset: 45000 });
    try {
        await app16.settle();
        assert.strictEqual(app16.created[0].offset, 45000, "The default setting never rewinds");
    } finally { app16.dom.window.close(); }
}

// A5: stored two-state skip values migrate to the three-state rows, the legacy combined key
// migrates too, and each state drives the pill and the auto-jump for both marker kinds.
function bag(overrides) {
    var value = { quality: "original", language: "en", nextEpisode: "countdown", skipInterval: 10 };
    Object.keys(overrides || {}).forEach(function (name) { value[name] = overrides[name]; });
    return value;
}

async function skipMarkerStates() {
    var storage = (function () {
        var values = {};
        return { getItem: function (k) { return values[k] === undefined ? null : values[k]; },
            setItem: function (k, v) { values[k] = String(v); }, removeItem: function (k) { delete values[k]; } };
    }());
    var prefs = require(path.join(app, "js/preferences.js"));
    prefs.save(storage, bag({ autoSkipIntro: "on", autoSkipCredits: "off" }));
    var migrated = prefs.load(storage);
    assert.strictEqual(migrated.autoSkipIntro, "automatically", "A stored on migrates to automatically");
    assert.strictEqual(migrated.autoSkipCredits, "manually", "A stored off migrates to manually");
    prefs.save(storage, bag({ autoSkip: "on" }));
    var legacy = prefs.load(storage);
    assert.strictEqual(legacy.autoSkipIntro, "automatically", "The legacy key maps on to automatically");
    assert.strictEqual(legacy.autoSkipCredits, "automatically", "The legacy key fills both rows");
    assert.strictEqual(legacy.autoSkip, "on", "The legacy key round-trips unchanged");
    prefs.save(storage, bag({ autoSkip: "off" }));
    assert.strictEqual(prefs.load(storage).autoSkipIntro, "manually", "Legacy off migrates to manually");
    var fresh = prefs.load((function () {
        var empty = {};
        return { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
    }()));
    assert.strictEqual(fresh.autoSkipIntro, "manually", "The fresh default is manually");
    assert.strictEqual(fresh.autoSkipCredits, "manually", "The fresh default is manually for credits too");
    assert.deepStrictEqual(prefs.autoSkipModes, ["disabled", "manually", "automatically"],
        "The exported skip ladder is three-state");
    assert.throws(function () { prefs.save(storage, bag({ autoSkipIntro: "sometimes" })); }, /invalid/,
        "Unknown skip values are rejected");

    var app17 = fixture({ item: episode, offset: 45000, prefs: { autoSkipIntro: "disabled", autoSkipCredits: "disabled" } });
    try {
        await app17.time(4000);
        assert.ok(!app17.findButton("Skip Intro"), "Disabled shows no intro pill");
        assert.strictEqual(app17.seeks.length, 0, "Disabled never jumps");
        await app17.time(56000);
        assert.ok(!app17.findButton("Skip Credits"), "Disabled shows no credits pill");
        assert.strictEqual(app17.document.getElementById("up-next-panel"), null,
            "Disabled credits never raises the Up Next countdown");
    } finally { app17.dom.window.close(); }

    var app18 = fixture({ item: episode, offset: 45000, prefs: { autoSkipIntro: "manually", autoSkipCredits: "manually" } });
    try {
        await app18.time(4000);
        var intro = app18.findButton("Skip Intro");
        assert.ok(intro, "Manually shows the intro pill");
        assert.strictEqual(app18.seeks.length, 0, "Manually never jumps on its own");
        intro.click();
        await app18.settle();
        assert.deepStrictEqual(app18.seeks, [5000], "OK on the pill skips the intro");
        await app18.time(56000);
        var credits = app18.findButton("Skip Credits");
        assert.ok(credits, "Manually shows the credits pill");
        assert.strictEqual(app18.seeks.length, 1, "Manually never finishes on its own");
        credits.click();
        await app18.settle();
        assert.strictEqual(app18.starts(), 1, "The credits pill hands over to the Up Next flow");
        assert.ok(app18.document.getElementById("up-next-panel"),
            "OK on the credits pill finishes the episode and offers the successor");
    } finally { app18.dom.window.close(); }

    var app19 = fixture({ item: episode, offset: 45000, prefs: { autoSkipIntro: "automatically", autoSkipCredits: "automatically", nextEpisode: "off" } });
    try {
        app19.timeNow(4000);
        assert.ok(app19.status().indexOf("Skipping intro") !== -1, "The automatic intro jump is announced");
        await app19.settle();
        assert.deepStrictEqual(app19.seeks, [5000], "Automatically jumps the intro");
        app19.timeNow(56000);
        assert.ok(app19.status().indexOf("Skipping credits") !== -1,
            "Automatically finishes the episode at the credits marker");
        await app19.settle();
    } finally { app19.dom.window.close(); }

    // Legacy stored values still drive the player through the migrated rows.
    var app20 = fixture({ item: episode, offset: 45000, prefs: { autoSkip: "on", nextEpisode: "off" } });
    try {
        await app20.time(4000);
        assert.deepStrictEqual(app20.seeks, [5000], "Legacy on behaves like automatically in the player");
    } finally { app20.dom.window.close(); }
}

// A5/A6 settings rows: renamed skip rows with the three labels, the new playback rows and
// the 60-second countdown preset, plus the ring honoring it.
async function settingsRowsAndCountdown() {
    var app21 = fixture({ bootSettings: true, prefs: { autoSkipIntro: "automatically", autoSkipCredits: "manually",
        cinemaTrailers: "1", passOutProtection: "never", rewindOnResume: "30", upNextCountdown: "60" } });
    try {
        await app21.settle();
        assert.ok(app21.findButton("Skip intro: Automatically"), "The intro row reads Skip intro: Automatically");
        assert.ok(app21.findButton("Skip credits: Manually"), "The credits row reads Skip credits: Manually");
        assert.ok(app21.findButton("Cinema trailers: 1"), "The cinema trailers row shows its value");
        assert.ok(app21.findButton("Pass-out protection: Never"), "The pass-out row shows Never");
        assert.ok(app21.findButton("Rewind on resume: 30 seconds"), "The rewind row shows 30 seconds");
        assert.ok(app21.findButton("Up Next countdown: 60 seconds"), "The countdown row lists 60 seconds");
        await app21.click("Skip intro: Automatically");
        assert.ok(app21.findButton("Disabled"), "The choices list Disabled");
        assert.ok(app21.findButton("Manually"), "The choices list Manually");
        assert.ok(app21.findButton("Automatically"), "The choices list Automatically");
    } finally { app21.dom.window.close(); }

    var app22 = fixture({ item: episode, offset: 45000, prefs: { upNextCountdown: "60" } });
    try {
        await app22.time(56000);
        var countdown = app22.document.querySelector(".up-next-countdown");
        assert.ok(countdown, "The Up Next card appears at the final credits marker");
        assert.ok(countdown.textContent.indexOf("60") !== -1, "The ring counts down from the 60-second preset");
    } finally { app22.dom.window.close(); }

    var prefs = require(path.join(app, "js/preferences.js"));
    var storage = (function () {
        var values = {};
        return { getItem: function (k) { return values[k] === undefined ? null : values[k]; },
            setItem: function (k, v) { values[k] = String(v); }, removeItem: function (k) { delete values[k]; } };
    }());
    prefs.save(storage, bag({ upNextCountdown: "60" }));
    assert.strictEqual(prefs.load(storage).upNextCountdown, "60", "The 60-second preset round-trips");
    assert.throws(function () { prefs.save(storage, bag({ upNextCountdown: "61" })); }, /invalid/,
        "Unknown countdown presets are rejected");
    assert.deepStrictEqual(prefs.upNextCountdowns, ["immediate", "5", "10", "15", "30", "60"],
        "The exported countdown ladder includes 60");
    assert.deepStrictEqual(prefs.cinemaTrailerCounts, ["off", "1", "2"], "The trailer ladder is exported");
    assert.deepStrictEqual(prefs.passOutModes, ["never", "1", "2", "3"], "The pass-out ladder is exported");
    assert.deepStrictEqual(prefs.rewindOnResumeModes, ["none", "5", "10", "15", "30"], "The rewind ladder is exported");
    prefs.save(storage, bag({ cinemaTrailers: "2", passOutProtection: "3", rewindOnResume: "5" }));
    var saved = prefs.load(storage);
    assert.strictEqual(saved.cinemaTrailers, "2", "The trailer setting round-trips");
    assert.strictEqual(saved.passOutProtection, "3", "The pass-out setting round-trips");
    assert.strictEqual(saved.rewindOnResume, "5", "The rewind setting round-trips");
    assert.throws(function () { prefs.save(storage, bag({ cinemaTrailers: "3" })); }, /invalid/,
        "Unknown trailer counts are rejected");
    assert.throws(function () { prefs.save(storage, bag({ passOutProtection: "4" })); }, /invalid/,
        "Unknown pass-out hours are rejected");
    assert.throws(function () { prefs.save(storage, bag({ rewindOnResume: "7" })); }, /invalid/,
        "Unknown rewind seconds are rejected");
}

async function run() {
    await prePlayTrackSelection();
    await inPlayerTrackPanelUnchanged();
    await cinemaTrailers();
    await passOutProtection();
    await rewindOnResume();
    await skipMarkerStates();
    await settingsRowsAndCountdown();
    console.log("Tizen UIFLOW3 pre-play tracks, cinema trailers, pass-out gate, rewind, three-state skip and 60s countdown contracts: passed");
}

run().catch(function (error) { console.error(error); process.exitCode = 1; });
