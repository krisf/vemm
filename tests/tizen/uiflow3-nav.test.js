"use strict";
// UIFLOW3 Run B navigation contracts against synthetic fixtures only: the remembered
// per-library browse pill (B5), PageUp/PageDown chapter hops and ten-minute seeks in
// the player (B6), Back dismissing a raised skip pill before leaving the player (B7),
// the disabled "File unavailable" hero pill (B8), the un-gated Queue panel for audio
// with track-labelled rows (B9) and the track Go to artist / Go to album rows (B10).
// No Plex request, AVPlay session or household watch state is touched: every client,
// adapter and storage bag below is synthetic.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var JSDOM = require("jsdom").JSDOM;
var root = path.resolve(__dirname, "../..");
var app = path.join(root, "samsung/Vemm");
var mainSource = fs.readFileSync(path.join(app, "main.js"), "utf8");
var itemMenu = require(path.join(app, "js/item-menu.js"));
var preferencesLib = require(path.join(app, "js/preferences.js"));

var moviesSection = { key: "1", title: "Movies", type: "movie" };

function playable(ratingKey, type, title, extra) {
    var item = { ratingKey: ratingKey, type: type, title: title, duration: 600000,
        Media: [{ container: "mp4", bitrate: 8000, Part: [{ id: Number(ratingKey) || 1,
            key: "/library/parts/" + ratingKey + "/stream",
            Stream: [{ id: 11, streamType: 2, language: "English", languageCode: "eng",
                displayTitle: "English", codec: "aac" }] }] }] };
    Object.keys(extra || {}).forEach(function (name) { item[name] = extra[name]; });
    return item;
}

var movie = playable("200", "movie", "Synthetic Film");
var longMovie = playable("205", "movie", "Synthetic Long Film", { duration: 6000000 });
var chapteredEpisode = playable("310", "episode", "Chaptered Synthetic Episode", {
    grandparentTitle: "Synthetic Show", grandparentRatingKey: "show-1",
    parentTitle: "Season 2", parentRatingKey: "season-2", index: 4, duration: 600000,
    Chapter: [{ id: 1, index: 0, tag: "Opening", startTimeOffset: 0 },
        { id: 2, index: 1, tag: "Middle", startTimeOffset: 120000 },
        { id: 3, index: 2, tag: "Finale", startTimeOffset: 240000 }]
});
var introEpisode = playable("311", "episode", "Intro Synthetic Episode", {
    grandparentTitle: "Synthetic Show", grandparentRatingKey: "show-1",
    parentTitle: "Season 2", parentRatingKey: "season-2", index: 5, duration: 60000,
    Marker: [{ id: 7, type: "intro", startTimeOffset: 3000, endTimeOffset: 5000 }]
});
var creditsEpisode = playable("312", "episode", "Credits Synthetic Episode", {
    grandparentTitle: "Synthetic Show", grandparentRatingKey: "show-1",
    parentTitle: "Season 2", parentRatingKey: "season-2", index: 6, duration: 60000,
    Marker: [{ id: 8, type: "credits", startTimeOffset: 50000, endTimeOffset: 60000 }]
});
var trackOne = playable("801", "track", "Synthetic Track One", {
    grandparentTitle: "Synthetic Artist", grandparentRatingKey: "artist-1",
    parentTitle: "Synthetic Album", parentRatingKey: "album-1", duration: 300000 });
var trackTwo = playable("802", "track", "Synthetic Track Two", {
    grandparentTitle: "Synthetic Artist", grandparentRatingKey: "artist-1",
    parentTitle: "Synthetic Album", parentRatingKey: "album-1", duration: 280000 });
var trackNoKeys = playable("803", "track", "Synthetic Keyless Track", { duration: 260000 });
var artist = { ratingKey: "artist-1", type: "artist", title: "Synthetic Artist" };
var album = { ratingKey: "album-1", type: "album", title: "Synthetic Album" };
// G7: items whose Part list is empty — the server knows the file is gone.
var brokenMovie = { ratingKey: "700", type: "movie", title: "Synthetic Broken Film",
    duration: 6000000, Media: [] };
var brokenEpisode = { ratingKey: "701", type: "episode", title: "Synthetic Broken Episode",
    grandparentTitle: "Synthetic Show", grandparentRatingKey: "show-1",
    parentTitle: "Season 2", parentRatingKey: "season-2", index: 6, duration: 60000,
    Media: [{ container: "mp4", Part: [] }] };
var brokenTrack = { ratingKey: "702", type: "track", title: "Synthetic Broken Track",
    grandparentTitle: "Synthetic Artist", grandparentRatingKey: "artist-1",
    parentTitle: "Synthetic Album", parentRatingKey: "album-1", duration: 300000, Media: [] };

var byKey = {};
[movie, chapteredEpisode, introEpisode, creditsEpisode, trackOne, trackTwo, trackNoKeys, artist, album,
    brokenMovie, brokenEpisode, brokenTrack].forEach(function (item) {
        byKey[item.ratingKey] = item;
    });

function fixture(options) {
    var opts = options || {};
    var played = opts.item || movie;
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://uiflow3-nav.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    Object.defineProperty(window.document, "hidden", { value: false, configurable: true });
    var fakeNow = 1700000000000;
    window.fetch = function () { assert.fail("UIFLOW3 nav fixtures must not use the network"); };
    var i18nContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(app, "js/i18n.js"), "utf8"), i18nContext);
    window.VemmI18n = i18nContext.VemmI18n;
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
    window.VemmItemMenu = itemMenu;

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
                part: function () { return played.Media[0] && played.Media[0].Part[0]; },
                quality: function () { return { source: played.Media[0], stream: played.Media[0],
                    mode: "direct", limit: "original" }; },
                tracks: function () { return []; },
                selectTrack: function () {}, subtitles: function () {},
                setSubtitleOffset: function () {}, position: function () { return position; }
            };
        }
    };
    var metadataCalls = [];
    var sectionRequests = [];
    var client = {
        getMetadata: function (id) {
            metadataCalls.push(String(id));
            return Promise.resolve(byKey[String(id)] || played);
        },
        getChildren: function () { return Promise.resolve({ Metadata: [] }); },
        getRelated: function () { return Promise.resolve({ Metadata: [] }); },
        getTracks: function () { return Promise.resolve([]); },
        getAllLeaves: function () { return Promise.resolve({ Metadata: [], totalSize: 0 }); },
        getSectionItems: function (key, offset, count, filters) {
            sectionRequests.push({ key: String(key), offset: offset, count: count,
                filters: JSON.parse(JSON.stringify(filters || {})) });
            return Promise.resolve({ items: [movie], offset: offset, totalSize: 1 });
        },
        nextEpisode: function () { return Promise.resolve(movie); },
        getBrowseMenus: function () { return Promise.resolve({ Meta: { Type: [{ active: true,
            Sort: [{ key: "title", title: "Title" }], Filter: [] }] } }); },
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
    window.setTimeout = function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; };
    window.clearTimeout = function () {};
    window.setInterval = function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; };
    window.clearInterval = function () {};

    var boot = mainSource.lastIndexOf('    addConnectForm("");');
    if (boot === -1) { throw new Error("The boot seam in main.js moved"); }
    var bootCall = opts.bootPlayer ? "startPlayer(" + JSON.stringify(played) +
        ", window.__syntheticClient, " + (opts.offset || 0) + ", 0, null);" :
        (opts.bootDetail ? 'openDetail("' + opts.bootDetail + '", window.__syntheticClient);' : "");
    vm.runInNewContext(mainSource.slice(0, boot) + "    " + bootCall +
        "    window.journey = { preferences: function () { return preferences; }," +
        " setPref: function (name, value) { preferences[name] = value; return savePreferences(); }," +
        " openSection: openSection, openBrowseOptions: openBrowseOptions, openDetail: openDetail," +
        " openItemMenu: openItemMenu, startPlayer: startPlayer, backView: backView," +
        " hasPlayer: function () { return !!player; }," +
        " setupQueue: function (items) { playQueue = window.VemmQueue.create(items); }," +
        " setup: function (c) { currentClient = c; accountClient = c; } };\n}());", {
        window: window, document: window.document, navigator: window.navigator,
        location: window.location, localStorage: window.localStorage,
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
        setInterval: window.setInterval, clearInterval: window.clearInterval,
        fetch: window.fetch, Promise: Promise, URL: URL, Blob: Blob,
        Date: { now: function () { return fakeNow; } }
    });

    function settle(ticks) {
        var chain = Promise.resolve();
        for (var tick = 0; tick < (ticks === undefined ? 2 : ticks); tick += 1) {
            chain = chain.then(function () { return new Promise(function (resolve) { process.nextTick(resolve); }); });
        }
        return chain;
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
        window.document.dispatchEvent(new window.KeyboardEvent("keydown",
            { keyCode: code, bubbles: true, cancelable: true }));
        return settle();
    }
    function time(position) {
        avplay.onEvent({ type: "time", position: position, duration: played.duration });
        return settle();
    }
    return {
        dom: dom, window: window, document: window.document, journey: window.journey,
        findButton: findButton, click: click, key: key, time: time, settle: settle,
        seeks: seeks, saved: saved, metadataCalls: metadataCalls, sectionRequests: sectionRequests
    };
}

// B5 (G26): each library remembers its last pill; unknown ids (Run C's future pill)
// round-trip through storage and fall back to the default view.
async function rememberedPills() {
    var app1 = fixture({});
    try {
        app1.journey.setup(app1.window.__syntheticClient);
        app1.journey.openSection(moviesSection);
        var bar = app1.document.querySelector(".section-pills");
        assert.ok(bar, "the library toolbar carries a pill bar");
        assert.strictEqual(bar.getAttribute("aria-label"), "Library filters");
        var allPill = app1.document.getElementById("section-pill-all");
        var recentPill = app1.document.getElementById("section-pill-recent");
        assert.ok(allPill && recentPill, "the All and Recently added pills exist");
        assert.strictEqual(allPill.getAttribute("aria-current"), "true",
            "a fresh library opens on the default pill");
        assert.ok(!recentPill.getAttribute("aria-current"), "the other pill is not marked current");
        assert.strictEqual(app1.sectionRequests.slice(-1)[0].filters.sort, undefined,
            "the default pill sends no sort filter");
        // Choosing Recently added filters the list and remembers the choice per library.
        recentPill.click();
        await app1.settle();
        assert.strictEqual(app1.journey.preferences().sectionPills["1"], "recent",
            "the pill id is remembered under the library key");
        assert.strictEqual(app1.saved.slice(-1)[0].sectionPills["1"], "recent",
            "the pill choice is persisted through savePreferences");
        assert.strictEqual(app1.sectionRequests.slice(-1)[0].filters.sort, "addedAt:desc",
            "the Recently added pill filters the listing");
        assert.strictEqual(app1.document.getElementById("section-pill-recent").getAttribute("aria-current"), "true",
            "the chosen pill reads as current");
        // Re-opening the library restores the remembered pill and its filters.
        app1.journey.openSection(moviesSection);
        await app1.settle();
        assert.strictEqual(app1.document.getElementById("section-pill-recent").getAttribute("aria-current"), "true",
            "re-opening restores the remembered pill");
        assert.strictEqual(app1.sectionRequests.slice(-1)[0].filters.sort, "addedAt:desc",
            "re-opening re-applies the remembered filters");
        // An unknown saved id (Run C's "recommended") survives storage untouched but
        // falls back to the default pill on screen.
        app1.journey.setPref("sectionPills", { "1": "recommended" });
        app1.journey.openSection(moviesSection);
        await app1.settle();
        assert.strictEqual(app1.document.getElementById("section-pill-all").getAttribute("aria-current"), "true",
            "an unknown saved pill id falls back to All");
        assert.strictEqual(app1.journey.preferences().sectionPills["1"], "recommended",
            "the unknown id is not destroyed, so Run C's pill will restore");
        var roundTrip = { quality: "original", language: "en", nextEpisode: "countdown",
            sectionPills: { "1": "recommended" } };
        var store = { value: null,
            getItem: function () { return this.value; },
            setItem: function (name, value) { this.value = value; } };
        preferencesLib.save(store, roundTrip);
        assert.strictEqual(preferencesLib.load(store).sectionPills["1"], "recommended",
            "preferences storage round-trips unknown pill ids for Run C");
        // The browse options "All titles" reset clears the remembered pill too.
        app1.journey.openBrowseOptions(moviesSection);
        await app1.click("All titles");
        assert.strictEqual(app1.journey.preferences().sectionPills["1"], "all",
            "\"All titles\" resets the remembered pill to the default");
        assert.strictEqual(app1.document.getElementById("section-pill-all").getAttribute("aria-current"), "true",
            "\"All titles\" reopens the library unfiltered");
        assert.strictEqual(app1.sectionRequests.slice(-1)[0].filters.sort, undefined,
            "the reset listing carries no sort filter");
    } finally {
        app1.dom.window.close();
    }
}

// B6 (G26-adjacent): PageUp/PageDown hop chapter starts when the item has chapters,
// otherwise they seek ten minutes.
async function pageUpDown() {
    var app2 = fixture({ item: chapteredEpisode, offset: 60000, bootPlayer: true });
    try {
        await app2.settle(6);
        await app2.key(34);
        assert.strictEqual(app2.seeks.slice(-1)[0], 120000,
            "PageDown jumps to the next chapter start");
        await app2.key(33);
        assert.strictEqual(app2.seeks.slice(-1)[0], 0,
            "PageUp jumps back to the previous chapter start");
        await app2.key(33);
        assert.strictEqual(app2.seeks.slice(-1)[0], 0,
            "PageUp at the first chapter stays at the start");
        await app2.key(34);
        await app2.key(34);
        assert.strictEqual(app2.seeks.slice(-1)[0], 240000, "PageDown reaches the last chapter");
        await app2.key(34);
        assert.strictEqual(app2.seeks.slice(-1)[0], 600000,
            "PageDown past the last chapter lands on the end");
        await app2.key(33);
        assert.strictEqual(app2.seeks.slice(-1)[0], 240000,
            "PageUp from the end returns to the last chapter start");
    } finally {
        app2.dom.window.close();
    }
    var app3 = fixture({ item: longMovie, offset: 3000000, bootPlayer: true });
    try {
        await app3.settle(6);
        await app3.key(34);
        assert.strictEqual(app3.seeks.slice(-1)[0], 3600000,
            "without chapters PageDown seeks ten minutes forward");
        await app3.key(33);
        await app3.key(33);
        assert.strictEqual(app3.seeks.slice(-1)[0], 2400000,
            "without chapters PageUp seeks ten minutes back");
    } finally {
        app3.dom.window.close();
    }
}

// B7 (G27): Back closes a raised skip pill first and keeps playback; the next Back
// walks the old exit path.
async function backDismissesSkipPill() {
    var app4 = fixture({ item: introEpisode, offset: 0, bootPlayer: true });
    try {
        await app4.settle(6);
        await app4.time(3500);
        assert.ok(app4.findButton("Skip Intro"), "the skip pill raises inside the intro marker");
        await app4.key(10009);
        assert.strictEqual(app4.findButton("Skip Intro"), null,
            "Back dismisses the skip pill before anything else");
        assert.ok(app4.journey.hasPlayer(), "the first Back stays inside the player");
        assert.ok(app4.document.querySelector(".player-hud"), "the player HUD is still on screen");
        await app4.key(10009);
        await app4.settle(6);
        assert.ok(!app4.journey.hasPlayer(), "the next Back leaves the player");
    } finally {
        app4.dom.window.close();
    }
}

// B8 (G7): a title without a playable Part shows a disabled "File unavailable" hero
// pill instead of Play, and the copy explains why.
async function fileUnavailable() {
    var app5 = fixture({ bootDetail: "700" });
    try {
        await app5.settle(6);
        var pill = app5.findButton("File unavailable");
        assert.ok(pill, "the hero pill reads File unavailable without a playable Part");
        assert.strictEqual(pill.disabled, true, "the unavailable pill is disabled");
        assert.ok(/damaged|not analyzed/i.test(pill.getAttribute("title") || ""),
            "the pill keeps the existing playback-error copy as its explanation");
        assert.strictEqual(app5.findButton("Play"), null, "no Play pill is offered");
        // Selecting an unplayable episode in the strip re-disables the pill; the
        // playable one re-enables it.
        await app5.click("More");
    } finally {
        app5.dom.window.close();
    }
    var app6 = fixture({ bootDetail: "200" });
    try {
        await app6.settle(6);
        var play = app6.findButton("Play");
        assert.ok(play && !play.disabled, "a playable movie still offers an enabled Play pill");
        assert.strictEqual(app6.findButton("File unavailable"), null,
            "no unavailable label appears for playable media");
    } finally {
        app6.dom.window.close();
    }
    // The rule covers episodes and tracks too.
    var app7 = fixture({ bootDetail: "701" });
    try {
        await app7.settle(6);
        var episodePill = app7.findButton("File unavailable");
        assert.ok(episodePill && episodePill.disabled, "an episode without Parts is unplayable");
    } finally {
        app7.dom.window.close();
    }
    var app8 = fixture({ bootDetail: "702" });
    try {
        await app8.settle(6);
        var trackPill = app8.findButton("File unavailable");
        assert.ok(trackPill && trackPill.disabled, "a track without Parts is unplayable");
    } finally {
        app8.dom.window.close();
    }
}

// B9 (G55): audio keeps the full Queue panel in the More menu, and its rows read
// "title — artist / album" instead of a bare title.
async function audioQueuePanel() {
    var app9 = fixture({ item: trackOne, bootPlayer: true });
    try {
        await app9.settle(6);
        app9.journey.setupQueue([trackOne, trackTwo]);
        await app9.click("More");
        var queueRow = app9.findButton("Queue");
        assert.ok(queueRow, "the audio More menu offers the full Queue panel");
        assert.ok(!queueRow.className.match(/menu-drill-in/),
            "the audio Queue row keeps the plain styling the media-ui contract pins");
        await app9.click("Queue");
        var panel = app9.document.getElementById("player-menu");
        assert.ok(panel, "the queue panel opens for audio");
        var labels = [];
        Array.prototype.forEach.call(panel.querySelectorAll(".queue-title"), function (row) {
            labels.push(row.textContent.trim());
        });
        assert.ok(labels.some(function (label) {
            return label === "Synthetic Track One — Synthetic Artist / Synthetic Album";
        }), "the current track row reads title — artist / album");
        assert.ok(labels.some(function (label) {
            return label === "Synthetic Track Two — Synthetic Artist / Synthetic Album";
        }), "the queued track row reads title — artist / album");
    } finally {
        app9.dom.window.close();
    }
}

function rowIds(item, options) {
    return itemMenu.rows(item, options).map(function (row) { return row.id; });
}

// B10 (G58): tracks gain Go to artist / Go to album rows in the card menu and the
// detail More menu, wired to the existing openDetail-by-key path; rows without their
// rating key are absent and other types keep their old rows.
async function trackParentRows() {
    // The pure row builder first.
    assert.ok(rowIds(trackOne).indexOf("artist") !== -1 && rowIds(trackOne).indexOf("album") !== -1,
        "a track with both keys lists artist and album rows");
    assert.strictEqual(rowIds(trackNoKeys).indexOf("artist"), -1,
        "a track without an artist key hides the artist row");
    assert.strictEqual(rowIds(trackNoKeys).indexOf("album"), -1,
        "a track without an album key hides the album row");
    assert.ok(rowIds(movie).indexOf("artist") === -1 && rowIds(movie).indexOf("album") === -1,
        "movies keep their original rows");
    var episodeIds = rowIds({ ratingKey: "310", type: "episode", title: "E",
        grandparentRatingKey: "show-1", parentRatingKey: "season-2" });
    assert.ok(episodeIds.indexOf("show") !== -1 && episodeIds.indexOf("season") !== -1 &&
        episodeIds.indexOf("artist") === -1, "episodes keep show/season rows only");

    // The detail More menu rows drive openDetail by rating key with zero extra requests.
    var app10 = fixture({ bootDetail: "801" });
    try {
        await app10.settle(6);
        await app10.click("More");
        assert.ok(app10.findButton("Go to artist"), "the detail More menu offers Go to artist");
        assert.ok(app10.findButton("Go to album"), "the detail More menu offers Go to album");
        await app10.click("Go to artist");
        assert.ok(app10.metadataCalls.indexOf("artist-1") !== -1,
            "Go to artist opens the artist by grandparentRatingKey");
        assert.strictEqual(app10.findButton("Go to artist"), null,
            "the artist page itself offers no artist row");
    } finally {
        app10.dom.window.close();
    }
    var app11 = fixture({ bootDetail: "801" });
    try {
        await app11.settle(6);
        await app11.click("More");
        await app11.click("Go to album");
        assert.ok(app11.metadataCalls.indexOf("album-1") !== -1,
            "Go to album opens the album by parentRatingKey");
    } finally {
        app11.dom.window.close();
    }
    // The card hold menu dispatches the same ids through openItemMenu.
    var app12 = fixture({});
    try {
        app12.journey.setup(app12.window.__syntheticClient);
        var node = app12.document.createElement("button");
        node.vemmCard = { item: trackOne, client: app12.window.__syntheticClient, options: {} };
        app12.journey.openItemMenu(node);
        await app12.settle();
        assert.ok(app12.findButton("Go to artist"), "the card menu lists Go to artist for tracks");
        await app12.click("Go to artist");
        assert.ok(app12.metadataCalls.indexOf("artist-1") !== -1,
            "the card menu opens the artist by rating key");
    } finally {
        app12.dom.window.close();
    }
}

// Owner report 2026-11-15/16: the raised Skip Intro AND Skip Credits pills must be
// reachable by walking the visible control row with the remote's left/right keys (the
// GUI's tab-order equivalent) and via the UP/DOWN spatial path, not only the wake-key
// shortcut or the Markers menu. Both marker kinds share the same hudSkipControl pill.
async function assertSkipPillReachable(item, startOffset, position, label) {
    var app = fixture({ item: item, offset: startOffset, bootPlayer: true });
    try {
        await app.settle(6);
        await app.time(position);
        var pill = app.findButton(label);
        assert.ok(pill, "the " + label + " pill raises inside its marker");
        var controls = pill.parentNode;
        assert.ok(/playback-controls/.test(controls.className || ""),
            "the pill lives in the playback control row");
        var order = Array.prototype.slice.call(controls.querySelectorAll("button"))
            .map(function (node) { return node.textContent.trim(); });
        assert.ok(order.indexOf(label) !== -1,
            "the pill is a button in the row's DOM order: " + order.join(" | "));
        // Start at the first control and walk right; the pill must receive focus.
        controls.querySelectorAll("button")[0].focus();
        var reached = false;
        var walked = [];
        for (var step = 0; step < 12; step += 1) {
            walked.push(app.document.activeElement.textContent.trim());
            if (app.document.activeElement === pill) { reached = true; break; }
            await app.key(39);
        }
        assert.ok(reached,
            "right-arrow walk reaches the " + label + " pill; walked: " + walked.join(" -> "));
        // Spatial path: the pill floats above the row, so UP from a control must
        // land on it (owner report 2026-11-15), a second UP reaches the progress
        // slider, and DOWN walks back down through the pill to the row.
        var pause = controls.querySelectorAll("button")[1];
        assert.ok(pause, "a transport control exists to start the vertical walk");
        pause.focus();
        await app.key(38);
        assert.strictEqual(app.document.activeElement, pill,
            "UP from the transport row focuses the raised " + label + " pill");
        var progress = app.document.querySelector(".playback-progress");
        await app.key(38);
        assert.strictEqual(app.document.activeElement, progress,
            "a second UP continues from the pill to the progress slider");
        await app.key(40);
        assert.strictEqual(app.document.activeElement, pill,
            "DOWN from the progress slider returns to the pill");
        await app.key(40);
        assert.ok(controls.contains(app.document.activeElement) && app.document.activeElement !== pill,
            "DOWN from the pill returns to the transport row");
    } finally {
        app.dom.window.close();
    }
}
async function skipPillReachableByArrows() {
    await assertSkipPillReachable(introEpisode, 0, 3500, "Skip Intro");
    await assertSkipPillReachable(creditsEpisode, 0, 55000, "Skip Credits");
}

async function run() {
    await rememberedPills();
    await pageUpDown();
    await backDismissesSkipPill();
    await skipPillReachableByArrows();
    await fileUnavailable();
    await audioQueuePanel();
    await trackParentRows();
    console.log("Tizen UIFLOW3 Run B navigation contracts: pills, PageUp/Down, skip-pill Back, file unavailable, audio queue, track rows passed");
}

run().then(null, function (error) {
    console.error(error && error.stack || error);
    process.exit(1);
});
