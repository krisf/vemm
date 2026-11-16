"use strict";
// UIF-P4 (TV-UIFLOWS §6/§7, STATE-DIFF ranks 3, 4, 9): discovery surfaces — a "Categories"
// genre browse next to Folders that filters the normal grid, a "More Like This" related shelf
// on movie/show details (fetched once per title, hidden when the hub is empty or fails), and
// the season row that opens with focus on the on-deck/next-unwatched episode, else its first
// card. Every server is synthetic; nothing here can reach a real account.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

function playable(key, title, extra) {
    var item = { ratingKey: key, type: "movie", title: title, year: 2024, duration: 300000,
        Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
            Part: [{ id: Number(key), key: "/library/parts/" + key + "/file.mp4", Stream: [] }] }] };
    if (extra) { Object.keys(extra).forEach(function (name) { item[name] = extra[name]; }); }
    return item;
}
var alpha = playable("201", "Alpha Movie");
var beta = playable("202", "Beta Movie");
var gamma = playable("203", "Gamma Movie");
var related = [playable("291", "Related One"), playable("292", "Related Two")];

function episode(key, index, title, viewOffset, viewCount) {
    return { ratingKey: key, type: "episode", title: title, parentRatingKey: "151", parentIndex: 1,
        index: index, duration: 100000, viewOffset: viewOffset, viewCount: viewCount,
        grandparentTitle: "Partly Watched Show",
        Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
            Part: [{ id: Number(key), key: "/library/parts/" + key + "/file.mkv", Stream: [] }] }] };
}
var epOne = episode("161", 1, "Cold Open", 100000, 1);          // fully watched
var epTwo = episode("162", 2, "Signal Drift", 0, undefined);    // fresh
var epThree = episode("163", 3, "Night Shift", 40000, undefined); // partial
var show = { ratingKey: "150", type: "show", title: "Partly Watched Show",
    summary: "A synthetic synopsis for the discovery journey." };
var season = { ratingKey: "151", type: "season", title: "Season 1", index: 1, seasonNumber: "1",
    parentRatingKey: "150", leafCount: 3, viewedLeafCount: 1 };

function finished(key, index, title, offset) {
    var ep = episode(key, index, title, offset, 1);
    ep.parentRatingKey = "171";
    ep.grandparentTitle = "Finished Show";
    return ep;
}
var epDoneOne = finished("181", 1, "Quiet Hours", 90000);
var epDoneTwo = finished("182", 2, "Last Light", 95000);
var finishedShow = { ratingKey: "170", type: "show", title: "Finished Show",
    summary: "Every episode of this synthetic show is watched." };
var finishedSeason = { ratingKey: "171", type: "season", title: "Season 1", index: 1,
    seasonNumber: "1", parentRatingKey: "170", leafCount: 2, viewedLeafCount: 2 };

var children = { "150": [season], "151": [epOne, epTwo, epThree],
    "170": [finishedSeason], "171": [epDoneOne, epDoneTwo] };
var metadata = { "150": show, "151": season, "170": finishedShow, "171": finishedSeason,
    "161": epOne, "162": epTwo, "163": epThree, "181": epDoneOne, "182": epDoneTwo,
    "201": alpha, "202": beta, "203": gamma, "291": related[0], "292": related[1] };

var windows = [];
function closeWindows() {
    windows.forEach(function (target) { target.close(); });
    windows.length = 0;
}

function fixture() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    windows.push(window);
    var calls = [];
    var played = [];
    window.TextDecoder = TextDecoder;
    window.fetch = function (target) {
        var url = new URL(target);
        calls.push(url.pathname + url.search);
        var payload;
        if (url.pathname === "/api/v2/home/users") { payload = { users: [] }; }
        else if (url.pathname === "/api/v2/resources") {
            payload = [{ clientIdentifier: "synthetic-server", name: "Synthetic PMS", provides: "server",
                owned: true, accessToken: "synthetic-server-token",
                connections: [{ uri: "https://pms.synthetic.invalid" }] }];
        } else {
            var container;
            var childrenPath = /^\/library\/metadata\/(\d+)\/children$/.exec(url.pathname);
            var relatedPath = /^\/hubs\/metadata\/(\d+)\/related$/.exec(url.pathname);
            if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-server" }; }
            else if (url.pathname === "/library/sections") {
                container = { Directory: [{ key: "1", type: "movie", title: "Movies" },
                    { key: "2", type: "show", title: "Shows" }] };
            } else if (url.pathname === "/hubs/continueWatching") { container = { Hub: [] }; }
            else if (url.pathname === "/hubs/promoted") {
                container = { Hub: [{ title: "Featured Movies", context: "all.movies",
                    Metadata: [alpha, beta, gamma] },
                { title: "Featured Shows", context: "all.shows", Metadata: [show, finishedShow] }] };
            } else if (url.pathname === "/library/sections/1/genre") {
                container = { Directory: [{ key: "1", title: "Action" }, { key: "2", title: "Comedy" }] };
            } else if (url.pathname === "/library/sections/1/all") {
                container = { totalSize: 3, offset: 0, Metadata: [alpha, beta, gamma] };
            } else if (url.pathname === "/library/sections/2/all") {
                container = { totalSize: 2, offset: 0, Metadata: [show, finishedShow] };
            } else if (relatedPath) {
                if (relatedPath[1] === "201") { container = { Hub: [{ Metadata: related }] }; }
                else if (relatedPath[1] === "203") { throw new Error("Synthetic related failure."); }
                else { container = { Hub: [] }; }
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
    function buttons(scope) {
        return Array.prototype.filter.call((scope || window.document).querySelectorAll("button"), function (node) {
            return !node.hidden;
        });
    }
    function click(text, scope) {
        var control = buttons(scope).filter(function (node) {
            return node.textContent.trim() === text;
        })[0];
        assert(control, "Missing control: " + text);
        control.click();
    }
    function status() { return window.document.getElementById("status").textContent; }
    function card(key) {
        var target = Array.prototype.filter.call(window.document.querySelectorAll(".media-card"), function (node) {
            return node.vemmCard && node.vemmCard.item.ratingKey === key;
        })[0];
        assert(target, "a card for synthetic item " + key + " renders");
        return target;
    }
    async function openHome() {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();
    }
    function counted(pathname) {
        return calls.filter(function (entry) { return entry.indexOf(pathname) === 0; }).length;
    }
    function episodeCards() {
        return Array.prototype.slice.call(window.document.querySelectorAll(".episode-row .media-card"));
    }
    function focusedEpisode() {
        var active = window.document.activeElement;
        return active && active.vemmCard ? active.vemmCard.item.ratingKey : "";
    }
    function selectedEpisode() {
        var ring = window.document.querySelector(".episode-row .episode-current");
        return ring && ring.vemmCard ? ring.vemmCard.item.ratingKey : "";
    }
    return { window: window, settle: settle, click: click, buttons: buttons, status: status, card: card,
        openHome: openHome, counted: counted, calls: calls, played: played, episodeCards: episodeCards,
        focusedEpisode: focusedEpisode, selectedEpisode: selectedEpisode };
}

async function categoriesBrowse() {
    var box = fixture();
    await box.openHome();
    box.click("Movies");
    await box.settle();
    var toolbar = box.window.document.querySelector(".page-toolbar");
    assert(toolbar, "the library toolbar is rendered");
    var labels = box.buttons(toolbar).map(function (node) { return node.textContent.trim(); });
    assert(labels.indexOf("Categories") !== -1, "the toolbar offers Categories");
    assert.strictEqual(labels.indexOf("Categories"), labels.indexOf("Folders") + 1,
        "Categories sits next to Folders, like the official library tabs");
    box.click("Categories", toolbar);
    await box.settle();
    var chips = box.buttons(box.window.document.querySelector(".category-list"));
    assert.deepStrictEqual(chips.map(function (node) { return node.textContent.trim(); }),
        ["Action", "Comedy"], "genre chips come from the mocked genre Directory");
    box.click("Action");
    await box.settle();
    var filtered = box.calls.filter(function (entry) { return entry.indexOf("/library/sections/1/all") === 0; });
    assert(/genre=Action/.test(filtered[filtered.length - 1]),
        "picking a genre chip lists that genre through the normal grid request");
    assert(box.window.document.getElementById("section-layout"),
        "the layout control keeps working after a genre pick");
    assert(box.window.document.querySelectorAll("#item-list .media-card").length === 3,
        "the grid re-renders the section items");
    await box.settle();
    assert(!box.window.document.querySelector(".status-error"), "browsing categories reports no error");
}

async function relatedShelfAndCache() {
    var box = fixture();
    await box.openHome();
    box.card("201").click();
    await box.settle();
    var shelf = box.window.document.querySelector(".related-shelf");
    assert(shelf, "the movie detail renders a More Like This shelf when the hub has items");
    assert.strictEqual(shelf.querySelector("h3").textContent.trim(), "More Like This");
    assert.deepStrictEqual(Array.prototype.map.call(shelf.querySelectorAll(".media-card"), function (node) {
        return node.vemmCard.item.title;
    }), ["Related One", "Related Two"], "the shelf lists the related titles as normal cards");
    assert.strictEqual(box.counted("/hubs/metadata/201/related"), 1, "the related hub is requested once");
    box.click("Back");
    await box.settle();
    box.card("201").click();
    await box.settle();
    assert(box.window.document.querySelector(".related-shelf"), "the shelf renders again from the cache");
    assert.strictEqual(box.counted("/hubs/metadata/201/related"), 1,
        "reopening the same detail reuses the cached related items");
    box.click("Back");
    await box.settle();
    box.card("202").click();
    await box.settle();
    assert(box.window.document.querySelector(".detail-title"), "Beta Movie's detail still renders");
    assert(!box.window.document.querySelector(".related-shelf"),
        "an empty related hub removes the shelf silently");
    assert(!box.window.document.querySelector(".status-error"), "an empty related hub is not an error");
}

async function relatedFailureStaysSilent() {
    var box = fixture();
    await box.openHome();
    box.card("203").click();
    await box.settle();
    assert(box.window.document.querySelector(".detail-title"), "a failing related hub keeps the detail");
    assert(!box.window.document.querySelector(".related-shelf"), "a failing related hub renders no shelf");
    assert(!box.window.document.querySelector(".status-error"), "a failing related hub stays silent");
    assert.strictEqual(box.counted("/hubs/metadata/203/related"), 1, "the failed hub is not retried in view");
}

async function seasonFocusOrder() {
    var box = fixture();
    await box.openHome();
    box.card("150").click();
    await box.settle();
    box.click("Season 1");
    await box.settle();
    assert.strictEqual(box.episodeCards().length, 3, "the season row fills with episodes");
    assert.strictEqual(box.focusedEpisode(), "163",
        "the row opens with focus on the partly watched on-deck episode");
    assert.strictEqual(box.selectedEpisode(), "163", "the ring and focus agree on the opened season");

    var second = fixture();
    await second.openHome();
    second.card("170").click();
    await second.settle();
    second.click("Season 1");
    await second.settle();
    assert.strictEqual(second.episodeCards().length, 2, "the finished season fills its row");
    assert.strictEqual(second.focusedEpisode(), "181",
        "a fully watched season opens on its first card, not the furthest-watched episode");
    assert.strictEqual(second.selectedEpisode(), "181", "the ring follows the first card");

    var third = fixture();
    await third.openHome();
    third.card("150").click();
    await third.settle();
    third.click("Season 1");
    await third.settle();
    third.episodeCards()[1].focus();  // a fresh episode keeps manual selection alive
    await third.settle();
    assert.strictEqual(third.selectedEpisode(), "162", "viewer selection still overrides the opening focus");
    assert(!box.window.document.querySelector(".status-error"), "browsing seasons reports no error");
}

async function run() {
    try {
        await categoriesBrowse();
        await relatedShelfAndCache();
        await relatedFailureStaysSilent();
        await seasonFocusOrder();
    } finally {
        closeWindows();
    }
    console.log("Tizen category browse, related shelf and season focus tests: passed");
}

run().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
