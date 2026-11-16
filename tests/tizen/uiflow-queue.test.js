"use strict";
// UIF-P3 (TV-UIFLOWS §2/§3/§6, STATE-DIFF ranks 1, 2, 10): the play queue is a viewer-facing
// view — shelf "Play all"/"Shuffle all" start a real run, the in-player More menu drills into a
// Queue panel (current highlighted, jump, move, remove — all local, no confirmation screen and
// no watch-state writes), and the card hold menu offers Play Next / Add to Queue.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var queue = require("../../samsung/Vemm/js/queue");

function movie(key, title) {
    return { ratingKey: key, type: "movie", title: title, year: 2024, duration: 300000,
        Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
            Part: [{ id: Number(key), key: "/library/parts/" + key + "/file.mp4", Stream: [] }] }] };
}
var movies = [movie("201", "Alpha Movie"), movie("202", "Beta Movie"), movie("203", "Gamma Movie")];
var collection = { ratingKey: "301", type: "collection", title: "Synthetic Collection" };
var shelfItems = movies.concat([collection]);
// The library grid route serves a big section so "Play all" can prove its 100-item cap:
// 103 playable bulk items after the three named movies, plus a trailing unplayable collection.
var bulk = [];
for (var bulkKey = 901; bulkKey <= 1003; bulkKey += 1) { bulk.push(movie(String(bulkKey), "Bulk " + bulkKey)); }
var sectionItems = movies.concat(bulk).concat([collection]);
var metadata = { "301": collection };
movies.forEach(function (item) { metadata[item.ratingKey] = item; });
bulk.forEach(function (item) { metadata[item.ratingKey] = item; });

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
            if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-server" }; }
            else if (url.pathname === "/library/sections") {
                container = { Directory: [{ key: "1", type: "movie", title: "Movies" }] };
            } else if (url.pathname === "/hubs/continueWatching") { container = { Hub: [] }; }
            else if (url.pathname === "/hubs/promoted") {
                container = { Hub: [{ title: "Featured Movies", context: "all.movies", Metadata: shelfItems }] };
            } else if (url.pathname === "/library/sections/1/all") {
                container = { totalSize: sectionItems.length, offset: 0, Metadata: sectionItems };
            } else if (url.pathname === "/playQueues") {
                payload = { MediaContainer: {} };
                return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(payload); } });
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
    function shelf(title) {
        var panel = Array.prototype.filter.call(window.document.querySelectorAll(".shelf"), function (node) {
            var heading = node.querySelector(".hub-title");
            return heading && heading.textContent.trim() === title;
        })[0];
        assert(panel, "the Home shelf \"" + title + "\" renders");
        return panel;
    }
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
    async function pressHold(node) {
        node.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 13, bubbles: true }));
        await new Promise(function (resolve) { setTimeout(resolve, 700); });
        window.document.dispatchEvent(new window.KeyboardEvent("keyup", { keyCode: 13, bubbles: true }));
        await settle();
    }
    function menu() { return window.document.getElementById("player-menu"); }
    function queueRows() {
        return Array.prototype.slice.call(window.document.querySelectorAll("#player-menu .queue-row"));
    }
    function rowTitles() {
        return queueRows().map(function (row) {
            return row.querySelector(".queue-title").textContent.trim();
        });
    }
    async function openQueuePanel() {
        click("More");
        await settle();
        click("Queue");
        await settle();
        assert(menu() && menu().querySelector(".queue-row"), "the More menu drills into the Queue panel");
    }
    return { window: window, settle: settle, click: click, buttons: buttons, status: status, shelf: shelf,
        card: card, openHome: openHome, pressHold: pressHold, menu: menu, queueRows: queueRows,
        rowTitles: rowTitles, openQueuePanel: openQueuePanel, played: played, calls: calls };
}

function assertNoWatchWrites(calls) {
    assert(!calls.some(function (pathname) { return /viewstate|\/played|\/unplayed|scrobble/.test(pathname); }),
        "queue edits never write watch state: " + calls.join(" "));
}

async function shelfPlayAll() {
    var box = fixture();
    await box.openHome();
    var panel = box.shelf("Featured Movies");
    var labels = box.buttons(panel).map(function (node) { return node.textContent.trim(); });
    assert(labels.indexOf("Play all") !== -1, "the shelf header offers Play all");
    assert(labels.indexOf("Shuffle all") !== -1, "the shelf header offers Shuffle all");
    box.click("Play all", panel);
    await box.settle();
    assert(box.window.document.querySelector(".player-hud"), "Play all starts a run, not a single item");
    assert.strictEqual(box.played.length, 1, "exactly one item started");
    assert.strictEqual(box.played[0].ratingKey, "201", "Play all starts the first item in shelf order");
    assertNoWatchWrites(box.calls);
}

async function sectionPlayAll() {
    var box = fixture();
    await box.openHome();
    box.click("Movies");
    await box.settle();
    var toolbar = box.window.document.querySelector(".page-toolbar");
    assert(toolbar, "the library toolbar is still there");
    var labels = box.buttons(toolbar).map(function (node) { return node.textContent.trim(); });
    assert(labels.indexOf("Play all") !== -1, "the section toolbar offers Play all");
    assert(labels.indexOf("Shuffle all") !== -1, "the section toolbar offers Shuffle all");
    box.click("Play all", toolbar);
    await box.settle();
    assert(box.window.document.querySelector(".player-hud"), "the section run started");
    assert.strictEqual(box.played[box.played.length - 1].ratingKey, "201",
        "Play all starts the first playable item the grid shows (skipping the collection card)");
    await box.openQueuePanel();
    var titles = box.rowTitles();
    assert.strictEqual(titles.length, 100, "the section run enqueues at most 100 items");
    assert.strictEqual(titles[0], "Alpha Movie");
    assert.strictEqual(titles[99], "Bulk 997", "items past the 100-cap are not queued");
    assert(titles.indexOf("Synthetic Collection") === -1, "the unplayable collection card is not queued");
    assertNoWatchWrites(box.calls);
}

async function shuffleStartAndQueuePanel() {
    var box = fixture();
    await box.openHome();
    box.window.Math.random = function () { return 0; };
    var panel = box.shelf("Featured Movies");
    box.click("Shuffle all", panel);
    await box.settle();
    assert(box.window.document.querySelector(".player-hud"), "Shuffle all starts a run");
    assert.strictEqual(box.played[0].ratingKey, "201", "the shuffled run still starts on the first item");
    await box.openQueuePanel();
    assert.deepStrictEqual(box.rowTitles(), ["Alpha Movie", "Gamma Movie", "Beta Movie"],
        "the panel lists the shuffled play order, deterministic under a fixed shuffle source");
    var rows = box.queueRows();
    assert(/queue-current/.test(rows[0].className), "the queue's current item is highlighted in the panel");
    assert.strictEqual(rows[0].querySelector(".queue-title").getAttribute("aria-current"), "true");
    box.click("Playback options");
    await box.settle();
    box.click("Next episode");
    await box.settle();
    assert.strictEqual(box.played[box.played.length - 1].ratingKey, "203",
        "next follows the shuffled order, not shelf order");
    assertNoWatchWrites(box.calls);
}

async function queuePanelEdits() {
    var box = fixture();
    await box.openHome();
    var panel = box.shelf("Featured Movies");
    box.click("Play all", panel);
    await box.settle();
    await box.openQueuePanel();
    assert.deepStrictEqual(box.rowTitles(), ["Alpha Movie", "Beta Movie", "Gamma Movie"],
        "the panel lists the queue in play order");

    var betaRow = box.queueRows().filter(function (row) {
        return row.querySelector(".queue-title").textContent.trim() === "Beta Movie";
    })[0];
    betaRow.querySelector('[data-queue-action="move-down"]').click();
    await box.settle();
    assert.deepStrictEqual(box.rowTitles(), ["Alpha Movie", "Gamma Movie", "Beta Movie"],
        "move down changes what plays next");

    box.click("Gamma Movie");
    await box.settle();
    assert.strictEqual(box.played[box.played.length - 1].ratingKey, "203",
        "selecting a queued item stops the current playback and plays it");
    assert.strictEqual(box.played.length, 2, "the jump is a stop-then-play, not a second surface");
    await box.settle();
    assert(box.menu() && box.menu().querySelector(".queue-row"), "the queue panel stays usable after a jump");
    var rows = box.queueRows();
    var currentIndex = rows.map(function (row) { return /queue-current/.test(row.className); }).indexOf(true);
    assert.strictEqual(currentIndex, 1, "the panel re-highlights the new current item");
    assert.strictEqual(box.played.length, 2, "re-highlighting the panel never restarts playback");

    var betaRow2 = box.queueRows().filter(function (row) {
        return row.querySelector(".queue-title").textContent.trim() === "Beta Movie";
    })[0];
    betaRow2.querySelector('[data-queue-action="remove"]').click();
    await box.settle();
    assert.deepStrictEqual(box.rowTitles(), ["Alpha Movie", "Gamma Movie"],
        "remove drops the item from the queue");
    assert.strictEqual(box.played.length, 2, "a queue edit never restarts the player");
    assertNoWatchWrites(box.calls);
}

async function holdMenuQueueRows() {
    var box = fixture();
    await box.openHome();
    await box.pressHold(box.card("202"));
    var menu = box.menu();
    assert(menu, "holding OK on a movie card opens the action menu");
    var labels = box.buttons(menu).map(function (node) { return node.textContent.trim(); });
    assert.strictEqual(labels[0], "Play", "Play stays the default first row");
    assert(labels.indexOf("Play Next") !== -1, "the hold menu offers Play Next");
    assert(labels.indexOf("Add to Queue") !== -1, "the hold menu offers Add to Queue");
    assert.strictEqual(labels[labels.length - 1], "Cancel", "Cancel stays last");

    box.click("Add to Queue", menu);
    await box.settle();
    assert.strictEqual(box.played.length, 0, "Add to Queue with nothing playing starts nothing");
    assert(box.status().length > 0, "the idle Add to Queue explains itself");

    await box.pressHold(box.card("202"));
    box.click("Play Next", box.menu());
    await box.settle();
    assert.strictEqual(box.played.length, 1, "Play Next with nothing queued plays the card");
    assert.strictEqual(box.played[0].ratingKey, "202");
    assertNoWatchWrites(box.calls);
}

function queueModule() {
    var tracks = [1, 2, 3].map(function (id) {
        return { type: "track", ratingKey: String(id), title: "Track " + id };
    });
    var track4 = { type: "track", ratingKey: "4", title: "Track 4" };
    var q = queue.create(tracks);
    assert.strictEqual(q.insertNext(track4), 4);
    assert.deepStrictEqual(q.items().map(function (t) { return t.ratingKey; }), ["1", "4", "2", "3"],
        "Play Next lands right after the current item");
    assert.throws(function () { q.append(tracks[1]); }, /already in the queue/);
    assert.throws(function () { q.append({ type: "track", ratingKey: "x" }); }, /playable/);
    var tooMany = [];
    for (var i = 10; i < 210; i += 1) { tooMany.push({ type: "track", ratingKey: String(i) }); }
    var big = queue.create(tooMany.slice(0, 200));
    assert.throws(function () { big.append({ type: "track", ratingKey: "999" }); }, /1 to 200/);

    assert.throws(function () { q.removeAt(0); }, /playing item/);
    assert.strictEqual(q.removeAt(2).ratingKey, "2");
    assert.deepStrictEqual(q.items().map(function (t) { return t.ratingKey; }), ["1", "4", "3"]);
    q.shuffle(true);
    q.shuffle(false);
    assert.deepStrictEqual(q.items().map(function (t) { return t.ratingKey; }), ["1", "4", "3"],
        "inserted items survive an unshuffle");

    assert.strictEqual(q.moveTo(2, 0).ratingKey, "3");
    assert.deepStrictEqual(q.items().map(function (t) { return t.ratingKey; }), ["3", "1", "4"]);
    assert.strictEqual(q.position(), 1, "moving items keeps the current item current");
    assert.throws(function () { q.moveTo(1, -1); }, /another position/);
    assert.strictEqual(q.select(2).ratingKey, "4");
    assert.strictEqual(q.position(), 2);
    assert.strictEqual(q.next(), null, "select moves the cursor: the end stays the end");
    assert.throws(function () { q.select(9); }, /available item/);
}

async function run() {
    queueModule();
    await shelfPlayAll();
    await sectionPlayAll();
    await shuffleStartAndQueuePanel();
    await queuePanelEdits();
    await holdMenuQueueRows();
    console.log("Tizen play queue, shelf actions and card queue rows: passed");
}

run().then(function () { process.exit(0); }, function (error) {
    console.error(error); process.exit(1);
});
