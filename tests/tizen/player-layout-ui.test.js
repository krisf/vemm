"use strict";
// LG-parity player interactions against a synthetic item and a mocked player. No Plex request,
// AVPlay session, timeline update or household account is used.
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
        { id: 1, index: 0, tag: "Arrival", startTimeOffset: 0, thumb: "/chapter/arrival" },
        { id: 2, index: 1, tag: "Discovery", startTimeOffset: 20000, thumb: "/chapter/discovery" },
        { id: 3, index: 2, tag: "Return", startTimeOffset: 40000, thumb: "/chapter/return" }
    ],
    Marker: [{ id: 9, type: "credits", startTimeOffset: 54000, endTimeOffset: 60000, final: "1" }],
    Media: [{
        container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: 1, key: "/library/parts/synthetic/file", Stream: [
            { id: 11, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English — Stereo", codec: "aac" },
            { id: 12, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English — Commentary", codec: "aac" },
            { id: 13, streamType: 2, language: "French", languageCode: "fra", displayTitle: "French", codec: "aac" },
            { id: 21, streamType: 3, language: "English", languageCode: "eng", displayTitle: "English", codec: "srt" }
        ] }]
    }]
};

function track(ratingKey, index, title) {
    return {
        ratingKey: ratingKey, type: "track", index: index, title: title,
        albumArtist: "Synthetic Artist", parentTitle: "Synthetic Album", parentIndex: 1,
        parentArt: "/library/metadata/album/art", duration: 300000,
        Media: [{ container: "mp3", audioCodec: "mp3", Part: [{ id: 900 + index, key: "/library/parts/track/file",
            Stream: [{ id: 31 + index, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English", codec: "mp3" }] }] }]
    };
}
var musicTracks = [track("9001", 1, "First Synthetic Track"), track("9002", 2, "Second Synthetic Track"),
    track("9003", 3, "Third Synthetic Track")];
var album = { ratingKey: "9000", type: "album", title: "Synthetic Album", albumArtist: "Synthetic Artist" };

function episode(ratingKey, index, title) {
    return {
        ratingKey: ratingKey, type: "episode", index: index, parentIndex: 1, title: title,
        grandparentTitle: "Synthetic Show", grandparentThumb: "/library/metadata/show/thumb",
        parentTitle: "Synthetic Season", duration: 60000,
        Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
            Part: [{ id: 1000 + index, key: "/library/parts/episode/file", Stream: [
                { id: 41 + index, streamType: 2, language: "English", languageCode: "eng",
                    displayTitle: "English", codec: "aac" }] }] }]
    };
}
var queueEpisodes = [episode("7101", 1, "First Synthetic Episode"),
    episode("7102", 2, "Second Synthetic Episode"), episode("7103", 3, "Third Synthetic Episode")];
var show = { ratingKey: "7100", type: "show", title: "Synthetic Show", leafCount: 3, viewedLeafCount: 0 };

function playerFixture(trackOptions) {
    var options = trackOptions || {};
    var played = options.item || item;
    var playbackPosition = options.position !== undefined ? options.position : 45000;
    var dom = new JSDOM(fs.readFileSync(path.join(root, "samsung/Vemm/index.html"), "utf8"), {
        url: "https://player.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    Object.defineProperty(window.document, "hidden", { value: false, configurable: true });
    var callbacks = {};
    var adapters = 0;
    var seeks = [];
    var starts = 0;
    var plays = 0;
    var playerSettings = [];
    var timers = [];
    var timersNext = 1;
    window.fetch = function () { assert.fail("The player preview must not use the network"); };
    var i18nContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, "samsung/Vemm/js/i18n.js"), "utf8"), i18nContext);
    window.VemmI18n = i18nContext.VemmI18n;
    window.VemmPreferences = {
        load: function () { return { quality: "original", nextEpisode: "countdown", language: "en",
            skipInterval: 10, subtitleDelayMs: options.initialDelay || 0, autoSkip: options.autoSkip || "off",
            subtitleSize: "medium", subtitlePosition: "low",
            subtitleColor: "white", subtitleBackground: "off", directPlay: "auto" }; },
        save: function () {}
    };
    window.VemmSkipMarkers = require("../../samsung/Vemm/js/skip-markers.js");
    window.VemmSubtitles = require("../../samsung/Vemm/js/subtitles.js");
    window.VemmQueue = require("../../samsung/Vemm/js/queue.js");
    window.VemmAvplay = { create: function (options) { adapters += 1; callbacks.avplay = options; return {}; } };
    window.VemmPlayback = {
        create: function (options) {
            playerSettings.push(options.settings);
            var state = "idle";
            return {
                start: function () {
                    starts += 1;
                    if (trackOptions && trackOptions.failFirstStart && starts === 1) {
                        return Promise.reject(new Error("Synthetic stream negotiation failure"));
                    }
                    state = "playing";
                    return Promise.resolve();
                },
                snapshot: function () { return { state: state, position: playbackPosition, duration: played.duration }; },
                pause: function () { state = "paused"; return Promise.resolve(); },
                play: function () { plays += 1; state = "playing"; return Promise.resolve(); },
                seek: function (position) { seeks.push(position); return Promise.resolve(position); },
                stop: function () { state = "idle"; return Promise.resolve(played); },
                selection: function () { return { audioId: 11, subtitleId: 21 }; },
                part: function () { return played.Media[0].Part[0]; },
                quality: function () { return { source: played.Media[0], stream: played.Media[0], mode: "direct", limit: "original" }; },
                tracks: function () { return []; },
                setSubtitleOffset: function (offset) { callbacks.subtitleOffset = offset; }
            };
        }
    };
    var client = {
        nextEpisode: function () {
            return Promise.resolve({ ratingKey: "synthetic-next", type: "episode", title: "Next Synthetic Episode",
                grandparentTitle: "Synthetic Show", parentIndex: 2, index: 5,
                thumb: "/library/metadata/next/thumb" });
        },
        previousEpisode: function () {
            return Promise.resolve({ ratingKey: "synthetic-previous", type: "episode", title: "Previous Synthetic Episode",
                grandparentTitle: "Synthetic Show", parentIndex: 2, index: 3,
                thumb: "/library/metadata/previous/thumb" });
        },
        getMetadata: function (id) {
            var match = musicTracks.concat(queueEpisodes).filter(function (candidate) {
                return candidate.ratingKey === String(id);
            })[0];
            if (String(id) === "synthetic-previous") {
                return Promise.resolve({ ratingKey: "synthetic-previous", type: "episode", title: "Previous Synthetic Episode" });
            }
            return Promise.resolve(match || { ratingKey: "synthetic-next", type: "episode", title: "Next Synthetic Episode" });
        },
        getTracks: function () { return Promise.resolve(musicTracks.slice()); },
        getAllLeaves: function () { return Promise.resolve({ Metadata: queueEpisodes.slice(), totalSize: queueEpisodes.length }); },
        cancelRequests: function () {},
        image: function () { return Promise.reject(new Error("No image request is permitted in this fixture")); }
    };
    var source = fs.readFileSync(path.join(root, "samsung/Vemm/main.js"), "utf8");
    var boot = source.lastIndexOf('    addConnectForm("");');
    assert(boot !== -1, "The app boot boundary remains available to isolated UI tests");
    source = source.slice(0, boot) + (options.playAll ?
        '    playAllFromDetail(' + JSON.stringify(show) + ', window.__syntheticClient, ' +
            JSON.stringify(!!options.shuffle) + ');' : options.album ?
        '    startAlbum(' + JSON.stringify(album) + ', window.__syntheticClient, ' +
            JSON.stringify(!!options.shuffle) + ');' :
        '    startPlayer(' + JSON.stringify(played) + ', window.__syntheticClient, 45000, 0, ' +
            JSON.stringify(trackOptions || null) + ');') + ' }());';
    window.__syntheticClient = client;
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
    function key(code, repeat) {
        var event = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, repeat: !!repeat });
        Object.defineProperty(event, "keyCode", { value: code });
        window.document.dispatchEvent(event);
    }
    async function settle() { for (var i = 0; i < 8; i += 1) { await Promise.resolve(); } }
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
    return {
        dom: dom, window: window, document: window.document, callbacks: callbacks, seeks: seeks,
        starts: function () { return starts; }, plays: function () { return plays; },
        adapters: function () { return adapters; },
        playerSettings: playerSettings, timers: timers,
        findButton: findButton, click: click, key: key, settle: settle, fire: fire, status: status
    };
}

async function hudAndPanels() {
    var app = playerFixture();
    try {
        var controls = Array.prototype.slice.call(app.document.querySelectorAll(".playback-controls button"))
            .map(function (button) { return button.textContent.trim(); });
        ["Subtitles", "Audio", "More"].forEach(function (name) {
            assert(controls.indexOf(name) !== -1, "The transport exposes " + name + " directly");
        });
        assert(app.findButton("Info"), "The HUD includes an Info tab");
        assert(app.findButton("Chapters"), "An item with chapter metadata includes a Chapters tab");
        assert(app.document.querySelector(".playback-remaining"), "The HUD shows a negative time-left clock");
        assert(app.document.querySelector(".playback-context").textContent.indexOf("Synthetic Show") !== -1,
            "The episode HUD identifies its show");

        app.click("Info");
        var info = app.document.querySelector("#player-info");
        assert(info && info.textContent.indexOf("Synthetic Show") !== -1, "Info shows playing-item context");
        assert(info.querySelector(".info-artwork"), "Info uses the item's artwork");
        assert(info.textContent.indexOf("TV-PG") !== -1, "Info includes its rating");
        app.callbacks.avplay.onEvent({ type: "time", position: 50000, duration: item.duration });
        assert(info.querySelector(".player-info-position").textContent.indexOf("0:50") !== -1,
            "The Info playback facts follow the live playback position");

        app.click("Chapters");
        var cards = app.document.querySelectorAll("#chapter-strip .chapter-card");
        assert.strictEqual(cards.length, 3, "The chapter strip renders the chapter list");
        assert.strictEqual(cards[1].querySelector("img").getAttribute("data-artwork-source"), "/chapter/discovery",
            "Chapter cards use Plex Chapter.thumb");
        assert(cards[2].textContent.indexOf("00:40") !== -1, "Chapter cards show their timestamps");
    } finally { app.dom.window.close(); }
}

async function upNextAndTracks() {
    var app = playerFixture();
    try {
        app.callbacks.avplay.onEvent({ type: "time", position: 56000, duration: item.duration });
        await app.settle();
        assert(app.document.querySelector(".up-next-card"), "Final credits reveal the Up Next card");
        assert(app.document.querySelector(".up-next-screen"), "Up Next takes the whole screen");
        assert(app.document.querySelector(".up-next-eyebrow"), "Up Next labels itself");
        assert(app.document.querySelector(".up-next-ring"), "Up Next draws its countdown ring");
        assert(app.document.querySelector(".up-next-artwork"), "Up Next shows the successor's artwork");
        assert(app.document.querySelector(".up-next-title").textContent.indexOf("Next Synthetic Episode") !== -1,
            "Up Next names the episode that is coming");
        assert(app.document.querySelector(".up-next-meta").textContent.indexOf("Synthetic Show") !== -1,
            "Up Next names the show the successor belongs to");
        assert(app.findButton("Watch Credits"), "The viewer can choose to watch credits");
        assert(app.findButton("Play next episode"), "The next-episode action is explicit");
        assert(app.findButton("Watch something else"), "The viewer can browse instead of continuing");
        assert.strictEqual(app.findButton("Stop"), null, "Mid-playback Up Next does not offer to stop");
        assert(app.document.querySelector(".up-next-countdown"), "Up Next shows its countdown");
        assert.strictEqual(app.document.activeElement, app.findButton("Play next episode"),
            "Up Next focuses its primary choice");

        // Back first stops the countdown, so the card stays up for an explicit choice.
        app.key(10009);
        assert(app.document.querySelector(".up-next-card"), "Back holds the card open instead of choosing");
        assert(app.findButton("Play next episode"), "The held card keeps its choices");
        assert(app.status().indexOf("Auto-play cancelled") !== -1, "Back reports that auto-play was cancelled");
        app.key(10009);
        assert(!app.document.querySelector(".up-next-card"), "A second Back closes the card");
        assert(app.findButton("Pause / Play"), "Closing Up Next returns to the transport");

        app.click("Audio");
        assert(app.findButton("English"), "Tracks open on a language-selection step");
        assert(app.findButton("Other languages"), "Other languages remain discoverable");
        assert(app.findButton("Subtitles off"), "Subtitles off is available from the menu");
        app.click("English");
        assert(app.findButton("English — Stereo"), "A language step lists tracks within that language");
        assert(app.findButton("Back to languages"), "The track language step has an explicit return");
        app.click("Back to languages");
        app.click("Other languages");
        assert(app.findButton("French"), "Other languages opens the remaining language choices");
        app.click("French");
        assert(app.findButton("French"), "The selected language step lists its matching track");
    } finally { app.dom.window.close(); }
}

async function autoSkipIsOptInAndUndoable() {
    var withIntro = JSON.parse(JSON.stringify(item));
    withIntro.Marker = [{ id: 7, type: "intro", startTimeOffset: 1000, endTimeOffset: 30000 },
        { id: 9, type: "credits", startTimeOffset: 54000, endTimeOffset: 60000, final: "1" }];

    // Off by default: the marker still raises its manual pill and nothing moves on its own.
    var off = playerFixture({ item: withIntro });
    try {
        off.callbacks.avplay.onEvent({ type: "time", position: 5000, duration: item.duration });
        assert.strictEqual(off.seeks.length, 0, "Auto skip is off unless the viewer turns it on");
        assert(off.findButton("Skip Intro"), "With auto skip off the marker still offers a manual choice");
    } finally { off.dom.window.close(); }

    var app = playerFixture({ item: withIntro, autoSkip: "on" });
    try {
        app.callbacks.avplay.onEvent({ type: "time", position: 5000, duration: item.duration });
        assert.strictEqual(app.seeks[app.seeks.length - 1], 30000, "Auto skip jumps to the end of the intro");
        assert(app.status().indexOf("Skipping intro") !== -1, "Auto skip says what it just did");
        assert.strictEqual(app.findButton("Skip Intro"), null, "An auto skip replaces the manual pill");

        // Back inside the window returns the playhead and never re-skips the same marker.
        app.key(10009);
        assert.strictEqual(app.seeks[app.seeks.length - 1], 5000, "Back inside the window returns to the segment start");
        assert(app.status().indexOf("Back to the start") !== -1, "The undo is announced");
        app.callbacks.avplay.onEvent({ type: "time", position: 6000, duration: item.duration });
        assert.strictEqual(app.seeks.length, 2, "A declined marker is never auto-skipped again");
        assert(app.findButton("Skip Intro"), "The declined marker stays available by hand");

        // A hand seek takes the playhead back, so the pending undo must not fight it.
        app.click("Skip Intro");
        assert.strictEqual(app.seeks[app.seeks.length - 1], 30000, "The manual pill still skips");
        var afterManual = app.seeks.length;
        app.key(10009);
        assert.strictEqual(app.seeks.length, afterManual, "A hand seek clears the pending undo");
    } finally { app.dom.window.close(); }

    // The window is time limited: once it lapses, Back belongs to the app again.
    var expiring = playerFixture({ item: withIntro, autoSkip: "on" });
    try {
        expiring.callbacks.avplay.onEvent({ type: "time", position: 5000, duration: item.duration });
        assert.strictEqual(expiring.seeks[expiring.seeks.length - 1], 30000, "Auto skip jumped first");
        assert.strictEqual(expiring.fire(3000), 1, "The undo window is time limited");
        var beforeBack = expiring.seeks.length;
        expiring.key(10009);
        assert.strictEqual(expiring.seeks.length, beforeBack, "An expired undo no longer moves the playhead");
    } finally { expiring.dom.window.close(); }

    // A hand-driven seek owns the playhead: the marker must not jump over it.
    var scrubbing = playerFixture({ item: withIntro, autoSkip: "on" });
    try {
        // Scrubbing is the arrow-key path taken from the progress bar, not from the transport row.
        scrubbing.document.getElementById("playback-progress").focus();
        scrubbing.key(39);
        scrubbing.callbacks.avplay.onEvent({ type: "time", position: 5000, duration: item.duration });
        assert.strictEqual(scrubbing.seeks.length, 0, "Auto skip stays out of a user-initiated scrub");
        assert(scrubbing.findButton("Skip Intro"), "The marker is offered by hand while scrubbing");
        scrubbing.fire(300);
        assert.strictEqual(scrubbing.seeks[scrubbing.seeks.length - 1], 55000,
            "The committed scrub seek is the viewer's own target");
        scrubbing.callbacks.avplay.onEvent({ type: "time", position: 40000, duration: item.duration });
        assert.strictEqual(scrubbing.findButton("Skip Intro"), null,
            "A playhead outside every marker removes the pill again");
    } finally { scrubbing.dom.window.close(); }
}

async function nowPlayingKeepsMusicContext() {
    var app = playerFixture({ album: true });
    await app.settle();
    try {
        var panel = app.document.querySelector(".now-playing");
        assert(panel, "Music playback keeps a now-playing view behind the transport");
        assert(app.document.querySelector(".now-playing-artwork"), "Now playing shows the album artwork");
        assert.strictEqual(app.document.querySelector(".now-playing-title").textContent, "First Synthetic Track",
            "Now playing names the track");
        var credits = app.document.querySelector(".now-playing-credits").textContent;
        assert(credits.indexOf("Synthetic Artist") !== -1 && credits.indexOf("Synthetic Album") !== -1,
            "Now playing names the artist and the album");
        assert.strictEqual(app.document.querySelector(".now-playing-queue").textContent, "Playing 1 of 3",
            "Now playing shows the queue position");

        // The transport fades away; the now-playing context must not fade with it.
        assert.strictEqual(app.fire(5000), 1, "The transport auto-hides on its own timer");
        assert(app.document.querySelector(".player-hud").hidden, "The transport hides itself");
        assert(app.document.querySelector(".now-playing"), "Now playing survives the transport fading out");

        app.click("More");
        app.click("Next track");
        await app.settle();
        await app.settle();
        assert.strictEqual(app.document.querySelector(".now-playing-title").textContent, "Second Synthetic Track",
            "Now playing follows the queue");
        assert.strictEqual(app.document.querySelector(".now-playing-queue").textContent, "Playing 2 of 3",
            "The queue position follows the queue");
    } finally { app.dom.window.close(); }
}

async function timingStatsAndErrors() {
    var app = playerFixture({ cues: [
        { start: 44000, end: 44999, text: "Earlier cue" },
        { start: 45000, end: 46000, text: "Current cue" }
    ] });
    try {
        app.callbacks.avplay.onEvent({ type: "time", position: 45000, duration: item.duration });
        assert.strictEqual(app.document.getElementById("subtitle-text").textContent, "Current cue");
        app.click("Subtitles");
        app.click("Subtitle timing");
        var timing = app.document.querySelector(".subtitle-timing");
        assert(timing, "Subtitle timing opens a live on-screen capsule");
        var before = timing.textContent;
        app.key(39);
        assert.notStrictEqual(timing.textContent, before, "RIGHT changes the subtitle offset live");
        assert.strictEqual(timing.querySelector(".subtitle-timing-value").textContent, "+0.1 s",
            "A fresh LG timing key advances exactly 100 ms");
        assert.strictEqual(app.document.getElementById("subtitle-text").textContent, "Earlier cue",
            "The live delay immediately changes the rendered text subtitle");
        for (var repeat = 0; repeat < 8; repeat += 1) { app.key(39, true); }
        assert.strictEqual(timing.querySelector(".subtitle-timing-value").textContent, "+1.3 s",
            "The eighth held repeat advances by the LG 500 ms fast step");
        app.key(13);
        assert(!app.document.querySelector(".subtitle-timing"), "OK closes subtitle timing");

        app.click("More");
        app.click("Stats for nerds");
        assert(app.document.querySelector(".playback-stats"), "Stats for nerds opens a playback overlay");
        app.callbacks.avplay.onEvent({ type: "time", position: 51000, duration: item.duration });
        assert(app.document.querySelector(".playback-stats-position").textContent.indexOf("0:51") !== -1,
            "Stats follow the live playback position");

        app.callbacks.avplay.onEvent({ type: "error", detail: "Synthetic decoder failure" });
        var error = app.document.querySelector(".playback-error");
        assert(error, "A playback error owns a recovery panel");
        assert(error.querySelectorAll("button").length > 0, "The recovery panel offers actionable controls");
        assert(Array.prototype.some.call(error.querySelectorAll("button"), function (button) {
            return /back/i.test(button.textContent);
        }), "The recovery panel always offers Back");
    } finally { app.dom.window.close(); }
}

async function subtitleTimingUsesTrackBounds() {
    var sidecar = playerFixture({ cues: [], subtitleSidecar: true, initialDelay: 60000 });
    try {
        sidecar.click("Subtitles");
        sidecar.click("Subtitle timing");
        sidecar.key(39);
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "+60.0 s",
            "Sidecar timing clamps at the LG +60 s bound");
        sidecar.key(37);
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "+59.9 s",
            "Sidecar timing can move earlier by one 100 ms step");
    } finally { sidecar.dom.window.close(); }

    var sidecarMinimum = playerFixture({ cues: [], subtitleSidecar: true, initialDelay: -60000 });
    try {
        sidecarMinimum.click("Subtitles");
        sidecarMinimum.click("Subtitle timing");
        sidecarMinimum.key(37);
        assert.strictEqual(sidecarMinimum.document.querySelector(".subtitle-timing-value").textContent, "-60.0 s",
            "Sidecar timing clamps at the LG -60 s bound");
        sidecarMinimum.key(39);
        assert.strictEqual(sidecarMinimum.document.querySelector(".subtitle-timing-value").textContent, "-59.9 s",
            "Sidecar timing can move later by one 100 ms step");
    } finally { sidecarMinimum.dom.window.close(); }

    var embedded = playerFixture({ cues: [], subtitleSidecar: false, initialDelay: 0 });
    try {
        embedded.click("Subtitles");
        embedded.click("Subtitle timing");
        embedded.key(37);
        assert.strictEqual(embedded.document.querySelector(".subtitle-timing-value").textContent, "0.0 s",
            "Embedded text subtitles cannot advance before their not-yet-read cues");
    } finally { embedded.dom.window.close(); }
}

async function subtitleTimingZeroDetentAndTrackAvailability() {
    var sidecar = playerFixture({ cues: [], subtitleSidecar: true, initialDelay: 100 });
    try {
        sidecar.click("Subtitles");
        sidecar.click("Subtitle timing");
        for (var repeat = 0; repeat < 8; repeat += 1) { sidecar.key(37, true); }
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "0.0 s",
            "The held-key sweep detents at zero rather than crossing immediately");
        sidecar.key(37);
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "-0.1 s",
            "A fresh press passes through the zero detent");
    } finally { sidecar.dom.window.close(); }

    var native = playerFixture({ cues: null, subtitleId: 21 });
    try {
        native.click("Subtitles");
        assert.strictEqual(native.findButton("Subtitle timing"), null,
            "Device-native subtitles are not offered a live app-overlay timing control");
        native.click("More");
        assert.strictEqual(native.findButton("Subtitle timing"), null,
            "Device-native subtitle timing is also absent from the More menu");
    } finally { native.dom.window.close(); }
}

async function failedPlayerRecoveryRestartsThePipeline() {
    var app = playerFixture({ cues: [], subtitleSidecar: true, audioId: 11, subtitleId: 21, failFirstStart: true });
    try {
        await app.settle();
        assert(app.document.querySelector(".playback-error"), "A failed startup offers recovery");
        app.click("Retry playback");
        await app.settle();
        assert.strictEqual(app.starts(), 2, "Retry creates and starts a fresh player pipeline");
        assert.strictEqual(app.plays(), 0, "Retry does not call play on the failed AVPlay instance");
        assert.strictEqual(app.playerSettings[1].audioId, 11, "Retry preserves the selected audio stream");
        assert.strictEqual(app.playerSettings[1].subtitleId, 21, "Retry preserves the selected subtitle stream");
        assert.strictEqual(app.playerSettings[1].offset, 45000, "Retry preserves the failed session position");
        assert.strictEqual(app.adapters(), 2, "Retry allocates a fresh AVPlay adapter");
        assert.strictEqual(app.playerSettings[1].subtitleSidecar, true, "Retry preserves sidecar identity");
        app.callbacks.avplay.onEvent({ type: "error", detail: "Synthetic decoder failure" });
        app.click("Restart");
        await app.settle();
        assert.strictEqual(app.starts(), 3, "Restart also resolves and starts a fresh pipeline");
        assert.strictEqual(app.playerSettings[2].offset, 0, "Restart starts the fresh pipeline at zero");
        assert.strictEqual(app.playerSettings[2].audioId, 11, "Restart preserves explicit audio selection");
        assert.strictEqual(app.playerSettings[2].subtitleId, 21, "Restart preserves explicit subtitle selection");
        assert.strictEqual(app.adapters(), 3, "Restart allocates another fresh AVPlay adapter");
    } finally { app.dom.window.close(); }
}

async function playAllRunsItsOwnQueue() {
    var app = playerFixture({ playAll: true });
    try {
        await app.settle();
        var hud = app.document.querySelector(".player-hud");
        assert(hud, "Play all starts a run instead of a single item");
        assert.strictEqual(hud.querySelector("h2").textContent, "First Synthetic Episode",
            "Play all begins at the first episode in order");
        app.click("More");
        var options = app.document.querySelector("#player-menu");
        assert(options, "Playback options open over a run");
        assert(options.textContent.indexOf("Queue") !== -1, "An episode run is offered as a queue");
        var labels = Array.prototype.slice.call(options.querySelectorAll("button")).map(function (button) {
            return button.textContent.trim();
        });
        assert(labels.indexOf("Previous episode") !== -1, "Episode runs step backwards by episode");
        assert(labels.indexOf("Next episode") !== -1, "Episode runs step forwards by episode");
        assert.strictEqual(app.findButton("Next track", options), null,
            "An episode run does not borrow the music-queue wording");
        app.click("Next episode");
        await app.settle();
        assert.strictEqual(app.document.querySelector(".player-hud h2").textContent,
            "Second Synthetic Episode", "Steering the queue advances to the next episode");
        assert.strictEqual(app.starts(), 2, "Each queue step starts one fresh pipeline");
        app.callbacks.avplay.onEvent({ type: "ended" });
        await app.settle();
        assert.strictEqual(app.document.querySelector(".player-hud h2").textContent,
            "Third Synthetic Episode", "Finishing an episode advances the run on its own");
        assert.strictEqual(app.document.querySelector(".up-next-card"), null,
            "A queued run does not stop for the server's next-episode card");
        app.callbacks.avplay.onEvent({ type: "ended" });
        await app.settle();
        assert.strictEqual(app.document.querySelector(".player-hud"), null,
            "The run ends after its last episode");
        assert.strictEqual(app.findButton("Next episode"), null, "A finished run leaves the queue behind");
    } finally { app.dom.window.close(); }
}

async function shuffledPlayAllKeepsTheRun() {
    var app = playerFixture({ playAll: true, shuffle: true });
    try {
        await app.settle();
        var hud = app.document.querySelector(".player-hud");
        assert(hud, "Shuffle all starts a run too");
        var titles = ["First Synthetic Episode", "Second Synthetic Episode", "Third Synthetic Episode"];
        assert(titles.indexOf(hud.querySelector("h2").textContent) !== -1,
            "Shuffle all starts one of the show's episodes");
        app.click("More");
        var options = app.document.querySelector("#player-menu");
        assert(options && options.textContent.indexOf("Queue") !== -1,
            "A shuffled run is still steered as a queue");
    } finally { app.dom.window.close(); }
}

async function transportSkipsByEpisode() {
    var app = playerFixture();
    try {
        await app.settle();
        var labels = Array.prototype.slice.call(app.document.querySelectorAll(".playback-controls button"))
            .map(function (button) { return button.textContent.trim(); });
        assert(labels.indexOf("Previous episode") !== -1, "The transport steps to the previous episode");
        assert(labels.indexOf("Next episode") !== -1, "The transport steps to the next episode");
        assert(labels.join("|").indexOf("Back 10 seconds") === -1 &&
            labels.join("|").indexOf("Forward 10 seconds") === -1,
            "The 10-second scrub buttons are gone from the transport row (owner request 2026-11-05)");
        // Fixture position is 45s — mid-episode — so Previous restarts the current episode.
        app.click("Previous episode");
        await app.settle();
        assert(app.seeks.indexOf(0) !== -1, "Previous mid-episode restarts the current episode");
        app.click("Next episode");
        await app.settle();
        assert.strictEqual(app.document.querySelector(".player-hud h2").textContent,
            "Next Synthetic Episode", "Next starts the next episode");
    } finally { app.dom.window.close(); }
}

async function previousEpisodeNearTheStart() {
    var app = playerFixture({ position: 4000 });
    try {
        await app.settle();
        app.click("Previous episode");
        await app.settle();
        assert.strictEqual(app.document.querySelector(".player-hud h2").textContent,
            "Previous Synthetic Episode",
            "Near the start, Previous steps to the previous episode instead of restarting");
    } finally { app.dom.window.close(); }
}

async function hudReappearanceDefaultsToPause() {
    var app = playerFixture();
    try {
        await app.settle();
        var nextControl = app.findButton("Next episode");
        assert(nextControl, "The transport row exposes the Next episode control");
        nextControl.focus();
        app.fire(5000); // the idle timer retracts the HUD
        var hud = app.document.querySelector(".player-hud");
        assert(hud.hidden, "The HUD retracts after the idle window");
        app.key(40); // Down reopens the HUD
        assert(!hud.hidden, "The HUD reopens");
        assert.strictEqual(app.document.activeElement, app.findButton("Pause / Play"),
            "After the menu retracts, the default selection returns to Pause / Play");
    } finally { app.dom.window.close(); }
}

async function skipPillStaysReachableFromTheRemote() {
    // Owner report 2026-11-07: the Skip pill showed but the remote's arrows could never
    // select it. It must sit in the transport row's arrow walk, keep the menu open while
    // it waits, and a navigation key after a retract must land on a control (the pill
    // when one is raised) instead of scrubbing with focus on the page body.
    var withIntro = JSON.parse(JSON.stringify(item));
    withIntro.Marker = [{ id: 7, type: "intro", startTimeOffset: 1000, endTimeOffset: 30000 },
        { id: 9, type: "credits", startTimeOffset: 54000, endTimeOffset: 60000, final: "1" }];
    var app = playerFixture({ item: withIntro });
    try {
        app.callbacks.avplay.onEvent({ type: "time", position: 5000, duration: item.duration });
        var pill = app.findButton("Skip Intro");
        assert(pill, "The intro marker raises its Skip pill");
        assert.strictEqual(app.document.activeElement, pill, "The raised pill takes focus so one OK skips");
        var row = Array.prototype.slice.call(app.document.querySelectorAll(".playback-controls button"))
            .map(function (button) { return button.textContent.trim(); });
        assert.strictEqual(row.indexOf("Skip Intro"), row.indexOf("Audio") + 1,
            "The pill sits in the transport row between Audio and More for the arrow keys");

        pill.blur();
        app.findButton("Pause / Play").focus();
        for (var step = 0; step < 4; step += 1) { app.key(39); }
        assert.strictEqual(app.document.activeElement, pill,
            "Four right arrows from Pause / Play land on the Skip pill");

        // The idle retract still happens with a pill waiting (the product contract); the
        // wake arrow must then reopen the menu ON the pill, not scrub from the body.
        await app.settle();
        app.fire(5000);
        await app.settle();
        assert.strictEqual(app.document.querySelector(".player-hud").hidden, true,
            "The menu still retracts during uninterrupted playback with a pill waiting");
        app.key(39);
        assert.strictEqual(app.document.querySelector(".player-hud").hidden, false,
            "The wake arrow reopens the retracted menu");
        assert.strictEqual(app.document.activeElement, pill,
            "The wake arrow lands on the raised Skip pill instead of scrubbing from the page body");
    } finally { app.dom.window.close(); }
}

async function run() {
    await hudAndPanels();
    await upNextAndTracks();
    await autoSkipIsOptInAndUndoable();
    await nowPlayingKeepsMusicContext();
    await timingStatsAndErrors();
    await subtitleTimingUsesTrackBounds();
    await subtitleTimingZeroDetentAndTrackAvailability();
    await failedPlayerRecoveryRestartsThePipeline();
    await playAllRunsItsOwnQueue();
    await shuffledPlayAllKeepsTheRun();
    await transportSkipsByEpisode();
    await previousEpisodeNearTheStart();
    await hudReappearanceDefaultsToPause();
    await skipPillStaysReachableFromTheRemote();
    console.log("Tizen LG-style player HUD, panels, Up Next, auto skip, now playing, tracks, timing, stats and recovery: passed (synthetic player)");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
