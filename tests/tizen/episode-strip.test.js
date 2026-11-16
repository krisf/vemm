"use strict";
// Episode-view season strip (owner report 2026-11-07): while viewing a SINGLE episode,
// the detail page must show the other episodes of that episode's season with the current
// episode selected, and the hero Play/Resume pill must follow the selection. Browsing the
// strip must never write watch state.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

function episode(key, index, title, viewOffset, viewCount) {
    return { ratingKey: key, type: "episode", title: title, parentTitle: "Season 1",
        parentRatingKey: "133", parentIndex: 1, index: index, duration: 100000,
        viewOffset: viewOffset, viewCount: viewCount, grandparentTitle: "Synthetic Show",
        grandparentRatingKey: "132",
        Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
            Part: [{ id: Number(key), key: "/library/parts/" + key + "/file.mkv", Stream: [] }] }] };
}
var episodeOne = episode("141", 1, "Arrival", 100000, 1);      // fully watched
var episodeTwo = episode("142", 2, "Crossing", 0, undefined);  // fresh
var episodeThree = episode("143", 3, "Lighthouse", 40000, undefined); // partial
var seasonOne = { ratingKey: "133", type: "season", title: "Season 1", index: 1, seasonNumber: "1",
    parentRatingKey: "132", leafCount: 3, viewedLeafCount: 1 };
var show = { ratingKey: "132", type: "show", title: "Synthetic Show", summary: "Synthetic synopsis." };
var children = { "132": [seasonOne], "133": [episodeOne, episodeTwo, episodeThree] };
var metadata = { "132": show, "133": seasonOne, "141": episodeOne, "142": episodeTwo, "143": episodeThree };

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
                container = { Hub: [
                    { title: "Shows", Metadata: [show] },
                    { title: "Continue Watching", hubIdentifier: "home.continue", Metadata: [episodeTwo] }
                ] };
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
    function pills() { return Array.from(window.document.querySelectorAll(".detail-actions .detail-pill")); }
    function primaryPill() {
        var pill = pills().filter(function (node) {
            return /detail-primary/.test(node.className) && /detail-pill-play/.test(node.className);
        })[0];
        assert(pill, "the episode detail exposes a primary play pill");
        return pill;
    }
    function restartPill() {
        return pills().filter(function (node) { return node.textContent.trim() === "Play from beginning"; })[0];
    }
    function cards() { return Array.from(window.document.querySelectorAll(".episode-strip .episode-row .media-card")); }
    function selectedCards() { return Array.from(window.document.querySelectorAll(".episode-strip .episode-row .episode-current")); }
    async function openEpisode(key) {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();
        var target = Array.from(window.document.querySelectorAll(".media-card")).filter(function (node) {
            return node.vemmCard && node.vemmCard.item.ratingKey === key;
        })[0];
        assert(target, "the continue-watching shelf exposes the synthetic episode " + key);
        target.click();
        await settle();
        var title = window.document.querySelector(".detail-title");
        assert(title, "the card click opened an episode detail");
    }
    return { window: window, settle: settle, click: click, cards: cards, selectedCards: selectedCards,
        primaryPill: primaryPill, restartPill: restartPill, openEpisode: openEpisode,
        played: played, calls: calls };
}

async function run() {
    var box = fixture();
    // Open the single-episode detail for S1 E2 "Crossing" (fresh).
    await box.openEpisode("142");

    assert(box.window.document.querySelector(".episode-strip .episode-row"),
        "the single-episode detail shows the season's episode strip");
    assert.strictEqual(box.cards().length, 3, "the strip lists every episode of the season");
    assert.strictEqual(box.selectedCards().length, 1, "exactly one strip card carries the selection ring");
    assert.strictEqual(box.selectedCards()[0].vemmCard.item.ratingKey, "142",
        "the opened episode is the selected card, not the resume cursor");
    assert.strictEqual(box.primaryPill().textContent.trim(), "Play",
        "a fresh opened episode shows Play");

    // Owner report 2026-11-16: entering the episode row from outside defaults to the
    // CURRENT episode (E2 here), not episode 1, and the row scrolls it into view. Stub
    // layout positions so the scroll maths is observable in jsdom (which does no layout).
    var stripRow = box.window.document.querySelector(".episode-strip .episode-row");
    box.cards().forEach(function (node, i) {
        Object.defineProperty(node, "offsetLeft", { configurable: true, value: i * 340 });
    });
    box.primaryPill().focus();   // focus sits outside the row (the hero pill)
    box.cards()[0].focus();      // simulate navigating down into the row at episode 1
    await box.settle();
    assert.strictEqual(box.window.document.activeElement, box.cards()[1],
        "entering the episode row defaults focus to the current episode, not episode 1");
    assert.strictEqual(stripRow.scrollLeft, Math.max(0, 1 * 340 - 14),
        "the row is scrolled so the current episode is in view");
    // Moving along the row from inside is NOT redirected — selection follows focus.
    box.cards()[2].focus();
    await box.settle();
    assert.strictEqual(box.window.document.activeElement, box.cards()[2],
        "arrowing along the row from inside keeps the focused card (no snap-back)");

    // Focus follows selection and the hero pill retargets.
    box.cards()[2].focus();  // S1 E3 Lighthouse — partial
    await box.settle();
    assert.strictEqual(box.selectedCards()[0].vemmCard.item.ratingKey, "143",
        "focus moves the selection ring");
    assert.strictEqual(box.primaryPill().textContent.trim(), "Resume",
        "selecting a partially watched episode retargets the pill to Resume");
    assert(box.restartPill() && !box.restartPill().hidden,
        "the selected resumable episode offers Play from beginning");

    box.cards()[0].focus();  // S1 E1 Arrival — fully watched
    await box.settle();
    assert.strictEqual(box.primaryPill().textContent.trim(), "Play",
        "a fully watched selection falls back to Play");

    box.cards()[1].focus();  // back to the opened episode
    await box.settle();
    assert.strictEqual(box.primaryPill().textContent.trim(), "Play",
        "re-selecting the opened episode restores the original label");

    // Selecting E3 then pressing the hero pill plays E3 (resume), not the opened E2.
    box.cards()[2].focus();
    await box.settle();
    box.primaryPill().click();
    await box.settle();
    box.window.document.dispatchEvent(new box.window.KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
    await box.settle();
    assert(box.played.length && box.played[box.played.length - 1].ratingKey === "143",
        "the hero pill plays the selected episode");

    // Browsing the strip never writes watch state.
    assert(!box.calls.some(function (p) { return /viewstate|\/played|\/scrobble/.test(p); }),
        "episode browsing writes no watch state");

    // Owner report 2026-11-07: "the back button sends you back in the UI not necessarily
    // back to season view". From a single episode opened straight off the Home shelf,
    // BOTH the visible Back pill and the remote BACK key must land on the season view
    // with that episode's season selected.
    async function expectSeasonView(b, label) {
        var title = b.window.document.querySelector(".detail-title");
        assert(title && title.textContent.trim() === "Synthetic Show", label + ": Back lands on the show");
        var chip = b.window.document.querySelector(".season-choice-current");
        assert(chip && chip.textContent.trim() === "Season 1", label + ": the episode's season is selected");
        assert.strictEqual(b.window.document.querySelectorAll(".episode-row .media-card").length, 3,
            label + ": the season's episode row is on screen");
    }
    var viaPill = fixture();
    await viaPill.openEpisode("142");
    var backPill = viaPill.window.document.querySelector(".detail-pill-back");
    assert(backPill, "the episode detail exposes the visible Back pill");
    backPill.click();
    await viaPill.settle();
    await expectSeasonView(viaPill, "Back pill");

    var viaKey = fixture();
    await viaKey.openEpisode("142");
    viaKey.window.document.dispatchEvent(new viaKey.window.KeyboardEvent("keydown",
        { keyCode: 461, bubbles: true }));
    await viaKey.settle();
    await expectSeasonView(viaKey, "Remote BACK");

    // And the restore path: an episode opened FROM the season row (after Back landed
    // there) must hand BACK back to the stack (exact spot) without re-entering the
    // episode override. A regression on 2026-11-07 recursed backView -> detailBack ->
    // backView and the pill did nothing.
    var viaRow = viaPill;   // Back pill already landed us on the season view
    var rowCard = viaRow.window.document.querySelectorAll(".episode-row .media-card")[1];
    assert(rowCard, "the season view exposes the episode row");
    rowCard.click();
    await viaRow.settle();
    assert.strictEqual(viaRow.window.document.querySelector(".detail-title").textContent.trim(),
        "Crossing", "the row card opened the episode detail");
    viaRow.window.document.dispatchEvent(new viaRow.window.KeyboardEvent("keydown",
        { keyCode: 461, bubbles: true }));
    await viaRow.settle();
    await expectSeasonView(viaRow, "Row-path BACK restores the show");

    assert(!viaPill.calls.concat(viaKey.calls).some(function (p) {
        return /viewstate|\/played|\/scrobble/.test(p);
    }), "backing out to the season writes no watch state");

    console.log("Tizen episode-view season strip tests: passed");
}

run().then(function () { process.exit(0); }, function (error) {
    console.error(error); process.exit(1);
});
