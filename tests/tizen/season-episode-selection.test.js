"use strict";
// Season episode selection (owner request 2026-11-06): the episode row keeps a visible
// selection on the episode the viewer is pointing at, watched episodes stay marked, and
// the hero Play/Resume pill retargets to the selected episode instead of the On Deck
// entry the moment the viewer engages the list.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

function episode(key, index, title, viewOffset, viewCount) {
    return { ratingKey: key, type: "episode", title: title, parentRatingKey: "133", parentIndex: 1,
        index: index, duration: 100000, viewOffset: viewOffset, viewCount: viewCount,
        grandparentTitle: "Synthetic Show",
        Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
            Part: [{ id: Number(key), key: "/library/parts/" + key + "/file.mkv", Stream: [] }] }] };
}
var episodeOne = episode("141", 1, "Arrival", 100000, 1);      // fully watched
var episodeTwo = episode("142", 2, "Crossing", 0, undefined);  // fresh
var episodeThree = episode("143", 3, "Lighthouse", 40000, undefined); // partial
var episodeFive = episode("145", 5, "Harbour", 20000, undefined);     // On Deck, season 2
var episodeSix = episode("146", 6, "Signal", 0, undefined);
var seasonOne = { ratingKey: "133", type: "season", title: "Season 1", index: 1, seasonNumber: "1",
    parentRatingKey: "132", leafCount: 3, viewedLeafCount: 1 };
var seasonTwo = { ratingKey: "134", type: "season", title: "Season 2", index: 2, seasonNumber: "2",
    parentRatingKey: "132", leafCount: 2, viewedLeafCount: 0 };
var episodeSeven = episode("147", 1, "Quiet Hours", 90000, 1);  // fully watched
var episodeEight = episode("148", 2, "Last Light", 95000, 1);   // fully watched, furthest offset
var seasonThree = { ratingKey: "135", type: "season", title: "Season 3", index: 3, seasonNumber: "3",
    parentRatingKey: "132", leafCount: 2, viewedLeafCount: 2 };
var show = { ratingKey: "132", type: "show", title: "Synthetic Show",
    summary: "A synthetic synopsis for the selection journey.", OnDeck: { Metadata: [episodeFive] } };
var children = { "132": [seasonOne, seasonTwo, seasonThree], "133": [episodeOne, episodeTwo, episodeThree],
    "134": [episodeFive, episodeSix], "135": [episodeSeven, episodeEight] };
var metadata = { "132": show, "133": seasonOne, "134": seasonTwo, "135": seasonThree, "141": episodeOne,
    "142": episodeTwo, "143": episodeThree, "145": episodeFive, "146": episodeSix,
    "147": episodeSeven, "148": episodeEight };

function fixture() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var calls = [];
    var played = [];
    window.TextDecoder = TextDecoder;
    window.fetch = function (target) {
        var url = new URL(target);
        calls.push(url.pathname);
        var payload;
        if (url.pathname === "/api/v2/home/users") { payload = { users: [] }; }
        else if (url.pathname === "/api/v2/resources") {
            payload = [{ clientIdentifier: "synthetic-server", name: "Synthetic PMS", provides: "server",
                owned: true, accessToken: "synthetic-server-token",
                connections: [{ uri: "https://pms.synthetic.invalid" }] }];
        } else {
            var container;
            var childrenPath = /^\/library\/metadata\/(\d+)\/children$/.exec(url.pathname);
            if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-server" }; }
            else if (url.pathname === "/library/sections") {
                container = { Directory: [{ key: "1", type: "show", title: "Shows" }] };
            } else if (url.pathname === "/hubs/promoted") {
                container = { Hub: [{ title: "Shows", Metadata: [show] }] };
            } else if (childrenPath && children[childrenPath[1]]) {
                container = { totalSize: children[childrenPath[1]].length, Metadata: children[childrenPath[1]] };
            } else if (/^\/library\/metadata\/\d+$/.test(url.pathname) && metadata[url.pathname.split("/").pop()]) {
                container = { Metadata: [metadata[url.pathname.split("/").pop()]] };
            } else { throw new Error("Unexpected synthetic request: " + url.pathname); }
            payload = { MediaContainer: container };
        }
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(payload); } });
    };
    window.localStorage.setItem("vemm-tizen-account", JSON.stringify({
        version: 2, storage: "unencrypted", token: "synthetic-account-token"
    }));
    window.localStorage.setItem("vemm-tizen-favorite-libraries", JSON.stringify({ "synthetic-server": ["1"] }));
    for (var script of window.document.querySelectorAll("script[src]")) {
        var src = script.getAttribute("src");
        if (src.indexOf("$WEBAPIS") === 0) { continue; }
        window.eval(fs.readFileSync(path.join(app, src), "utf8"));
    }
    // Replace the AVPlay-backed engines after eval so a Play click records the item the
    // hero pill targeted instead of touching a fake media stack.
    window.VemmAvplay = { create: function () { return { close: function () {} }; } };
    window.VemmPlayback = { create: function (options) {
        played.push(options.item);
        return {
            start: function () { return Promise.resolve(); },
            snapshot: function () { return { state: "playing", position: 0, duration: options.item.duration }; },
            pause: function () { return Promise.resolve(); }, play: function () { return Promise.resolve(); },
            seek: function () { return Promise.resolve(); }, stop: function () { return Promise.resolve(options.item); },
            selection: function () { return { audioId: 0, subtitleId: 0 }; },
            part: function () { return options.item.Media[0].Part[0]; },
            quality: function () { return { source: options.item.Media[0], stream: options.item.Media[0],
                mode: "direct", limit: "original" }; },
            tracks: function () { return []; }, setSubtitleOffset: function () {}
        };
    } };
    async function settle() {
        for (var tick = 0; tick < 14; tick += 1) {
            await new Promise(function (resolve) { setTimeout(resolve, 0); });
        }
    }
    function click(text) {
        var control = Array.from(window.document.querySelectorAll("button")).filter(function (node) {
            return !node.hidden && node.textContent.trim() === text;
        })[0];
        assert(control, "Missing control: " + text);
        control.click();
    }
    function pills() {
        return Array.from(window.document.querySelectorAll(".detail-actions .detail-pill"));
    }
    function primaryPill() {
        var pill = pills().filter(function (node) {
            return /detail-primary/.test(node.className) && /detail-pill-play/.test(node.className);
        })[0];
        assert(pill, "the show detail exposes a primary play pill");
        return pill;
    }
    function restartPill() {
        return pills().filter(function (node) { return node.textContent.trim() === "Play from beginning"; })[0];
    }
    function cards() { return Array.from(window.document.querySelectorAll(".episode-row .media-card")); }
    function selectedCards() { return Array.from(window.document.querySelectorAll(".episode-row .episode-current")); }
    function key(code) {
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: code, bubbles: true }));
    }
    function showCard() {
        return Array.from(window.document.querySelectorAll(".media-card")).filter(function (node) {
            return node.vemmCard && node.vemmCard.item.ratingKey === "132";
        })[0];
    }
    async function openShow() {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();
        var card = showCard();
        assert(card, "the synthetic show is on Home");
        card.click();
        await settle();
    }
    return { window: window, settle: settle, click: click, key: key, cards: cards,
        selectedCards: selectedCards, primaryPill: primaryPill, restartPill: restartPill,
        openShow: openShow, played: played, calls: calls };
}

async function run() {
    var box = fixture();
    await box.openShow();

    // The hero pill starts on the On Deck episode (S2 E5 holds a resume position).
    assert.strictEqual(box.primaryPill().textContent.trim(), "Resume",
        "the show detail opens with the On Deck episode resumable");
    assert(box.restartPill() && !box.restartPill().hidden,
        "a resumable On Deck episode offers Play from beginning");

    // Opening Season 1 puts the visible selection on the resume-cursor episode.
    box.click("Season 1");
    await box.settle();
    assert.strictEqual(box.cards().length, 3, "the season row fills with episodes");
    assert.strictEqual(box.selectedCards().length, 1, "exactly one episode carries the selection ring");
    assert.strictEqual(box.selectedCards()[0].vemmCard.item.ratingKey, "143",
        "the selection opens on the episode holding the newest resume position");
    assert.strictEqual(box.window.document.activeElement.vemmCard.item.ratingKey, "143",
        "focus and selection agree after the season opens");

    // Watching state stays legible inside the row.
    assert.strictEqual(box.window.document.querySelectorAll(".episode-row .card-watched").length, 1,
        "the fully watched episode carries a watched mark in the season row");
    assert(box.window.document.querySelector(".episode-row .card-progress"),
        "the partially watched episode carries a progress bar in the season row");

    // Moving the selection to a fresh episode retargets the hero pill to Play.
    box.cards()[1].focus();  // S1 E2 Crossing — fresh
    await box.settle();
    assert.strictEqual(box.selectedCards().length, 1,
        "the selection ring moves instead of duplicating");
    assert.strictEqual(box.selectedCards()[0].vemmCard.item.ratingKey, "142",
        "the selection follows the episode the viewer is pointing at");
    assert.strictEqual(box.primaryPill().textContent.trim(), "Play",
        "the hero pill switches to Play for the selected fresh episode");
    assert(box.restartPill().hidden,
        "Play from beginning hides while the selected episode has no resume position");

    // Arrow keys move the selection too.
    box.key(39);
    assert.strictEqual(box.window.document.activeElement.vemmCard.item.ratingKey, "143",
        "right moves focus to the next episode");
    assert.strictEqual(box.selectedCards()[0].vemmCard.item.ratingKey, "143",
        "the selection ring follows the arrow key");
    assert.strictEqual(box.primaryPill().textContent.trim(), "Resume",
        "the hero pill resumes the selected partly watched episode");
    assert.strictEqual(box.restartPill().hidden, false,
        "Play from beginning returns for the selected resumable episode");

    // Pressing the hero pill now plays the selected episode, not the On Deck entry.
    box.cards()[1].focus();  // back to the fresh E2
    await box.settle();
    box.primaryPill().click();
    await box.settle();
    assert.strictEqual(box.played.length, 1, "the hero pill starts playback");
    assert.strictEqual(box.played[0].ratingKey, "142",
        "playback targets the episode selected in the row, not the On Deck entry");

    // A fully watched episode plays from the beginning instead of resuming at the end.
    var second = fixture();
    await second.openShow();
    second.click("Season 1");
    await second.settle();
    second.cards()[0].focus();  // S1 E1 Arrival — fully watched
    await second.settle();
    assert.strictEqual(second.primaryPill().textContent.trim(), "Play",
        "a fully watched selection plays from the beginning");
    assert(second.restartPill().hidden, "no duplicate restart pill for a finished episode");
    second.primaryPill().click();
    await second.settle();
    assert.strictEqual(second.played.length, 1, "the fully watched selection still plays");
    assert.strictEqual(second.played[0].ratingKey, "141",
        "playback targets the fully watched episode the viewer selected");
    assert(!second.calls.some(function (p) { return /\/viewstate|\/played|\/unplayed|\/scrobble/.test(p); }),
        "selecting episodes from the row never writes watch state");

    // UIF-P4 (TV-UIFLOWS §7, STATE-DIFF rank 9): a season with nothing left to resume
    // opens on its first card — not on the furthest-watched episode.
    var third = fixture();
    await third.openShow();
    third.click("Season 3");
    await third.settle();
    assert.strictEqual(third.cards().length, 2, "the fully watched season fills its row");
    assert.strictEqual(third.selectedCards()[0].vemmCard.item.ratingKey, "147",
        "a fully watched season opens with the ring on the first card");
    assert.strictEqual(third.window.document.activeElement.vemmCard.item.ratingKey, "147",
        "focus lands on the first card when no episode in the season can resume");

    box.window.close();
    second.window.close();
    third.window.close();
    console.log("Tizen season episode selection retarget tests: passed");
}

run().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
