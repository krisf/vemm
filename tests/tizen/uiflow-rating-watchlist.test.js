"use strict";
// UIF-P2 (UIFLOW_PLAN §P2): star rating write path and Watchlist label fidelity.
//  - js/plex-api.js exposes setRating (PUT /:\/rate, -1 removes) and ratingFor(item).
//  - The detail More menu and the hold menu both offer "Rate" on movie/show/episode cards;
//    every write goes through the confirmation screen (nothing hits the network beforehand).
//  - The detail header echoes an existing userRating as "★ 8.0"-style text.
//  - Detail pages with a plex:// guid read the provider userState exactly once and flip the
//    existing row between "Add to Watchlist"/"Remove from Watchlist"; items without a guid
//    trigger zero provider requests. Everything is a synthetic fixture: no real network,
//    no real household watch state.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var itemMenu = require("../../samsung/Vemm/js/item-menu.js");
var plexApi = require("../../samsung/Vemm/js/plex-api.js");

var MOVIE_GUID = "plex://movie/5d776b59ad5437001f79c6f8";
var SHOW_GUID = "plex://show/5d776b59ad5437001e031892";
var MOVIE_TAIL = MOVIE_GUID.split("/").pop();
var SHOW_TAIL = SHOW_GUID.split("/").pop();

function stars(count) { return new Array(count + 1).join("★"); }

function baseFixture(options) {
    options = options || {};
    var state = { userRating: options.userRating === undefined ? null : options.userRating,
        listed: !!options.listed, userStateFails: !!options.userStateFails };
    var movie = { ratingKey: "201", type: "movie", title: "Synthetic Film",
        guid: MOVIE_GUID, summary: "Synthetic film synopsis.", duration: 600000,
        Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
            Part: [{ id: 201, key: "/library/parts/201/file.mp4", Stream: [] }] }] };
    var show = { ratingKey: "210", type: "show", title: "Synthetic Show", guid: SHOW_GUID,
        summary: "Synthetic show synopsis." };
    var season = { ratingKey: "212", type: "season", title: "Season 1", index: 1,
        seasonNumber: "1", parentRatingKey: "210", leafCount: 1 };
    var episode = { ratingKey: "211", type: "episode", title: "Pilot", parentTitle: "Season 1",
        parentRatingKey: "212", parentIndex: 1, index: 1, duration: 100000, viewOffset: 30000,
        grandparentTitle: "Synthetic Show", grandparentRatingKey: "210",
        Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
            Part: [{ id: 211, key: "/library/parts/211/file.mkv", Stream: [] }] }] };
    var children = { "210": [season], "212": [episode] };

    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var calls = [];  // { host, pathname, method, params }
    window.TextDecoder = TextDecoder;
    window.fetch = function (target, fetchOptions) {
        var url = new URL(target);
        calls.push({ host: url.hostname, pathname: url.pathname,
            method: (fetchOptions && fetchOptions.method) || "GET", params: url.searchParams });
        function reply(container) {
            return Promise.resolve({ ok: true, status: 200,
                json: function () { return Promise.resolve({ MediaContainer: container }); } });
        }
        if (url.pathname === "/api/v2/home/users") {
            return Promise.resolve({ ok: true, status: 200,
                json: function () { return Promise.resolve({ users: [] }); } });
        }
        if (url.pathname === "/api/v2/resources") {
            return Promise.resolve({ ok: true, status: 200, json: function () {
                return Promise.resolve([{ clientIdentifier: "synthetic-server", name: "Synthetic PMS",
                    provides: "server", owned: true, accessToken: "synthetic-server-token",
                    connections: [{ uri: "https://pms.synthetic.invalid" }] }]);
            } });
        }
        if (url.hostname === "metadata.provider.plex.tv" &&
                url.pathname === "/library/metadata/" + SHOW_TAIL + "/userState") {
            if (state.userStateFails) {
                return Promise.resolve({ ok: false, status: 500, json: function () { return Promise.resolve({}); } });
            }
            return reply({ Metadata: [state.listed ? { watchlistedAt: 1700000000 } : {}] });
        }
        if (url.hostname === "discover.provider.plex.tv" &&
                url.pathname === "/actions/addToWatchlist") { state.listed = true; return reply({}); }
        if (url.hostname === "discover.provider.plex.tv" &&
                url.pathname === "/actions/removeFromWatchlist") { state.listed = false; return reply({}); }
        if (url.hostname === "pms.synthetic.invalid" && url.pathname === "/:/rate") {
            var rating = Number(url.searchParams.get("rating"));
            state.userRating = rating === -1 ? null : rating;
            return reply({});
        }
        if (url.hostname === "pms.synthetic.invalid") {
            var container;
            var childrenMatch = /^\/library\/metadata\/(\d+)\/children$/.exec(url.pathname);
            if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-server" }; }
            else if (url.pathname === "/library/sections") {
                container = { Directory: [{ key: "1", type: "movie", title: "Movies" }] };
            } else if (url.pathname === "/hubs/promoted") {
                container = { Hub: [
                    { title: "Movies", Metadata: [movie, show] },
                    { title: "Continue Watching", hubIdentifier: "home.continue", Metadata: [episode] }
                ] };
            } else if (childrenMatch && children[childrenMatch[1]]) {
                container = { totalSize: children[childrenMatch[1]].length,
                    Metadata: children[childrenMatch[1]] };
            } else if (/^\/library\/metadata\/\d+$/.test(url.pathname)) {
                var key = url.pathname.split("/").pop();
                var item = key === "201" ? movie : key === "210" ? show :
                    key === "211" ? episode : key === "212" ? season : null;
                if (!item) { throw new Error("Unexpected synthetic request: " + url.pathname); }
                var copy = JSON.parse(JSON.stringify(item));
                if (key === "201" && state.userRating) { copy.userRating = state.userRating; }
                container = { Metadata: [copy] };
            } else { throw new Error("Unexpected synthetic request: " + url.pathname); }
            return reply(container);
        }
        throw new Error("Unexpected synthetic request: " + url.hostname + url.pathname);
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
    window.VemmPlayback = { create: function () {
        return { start: function () { return Promise.resolve(); }, snapshot: function () { return { state: "playing" }; },
            pause: function () {}, play: function () {}, seek: function () {}, stop: function () {},
            selection: function () { return { audioId: 0, subtitleId: 0 }; },
            part: function () { return movie.Media[0].Part[0]; },
            quality: function () { return { source: movie.Media[0], stream: movie.Media[0], mode: "direct", limit: "original" }; },
            tracks: function () { return []; }, setSubtitleOffset: function () {} };
    } };

    async function settle() {
        for (var tick = 0; tick < 14; tick += 1) {
            await new Promise(function (resolve) { setTimeout(resolve, 0); });
        }
    }
    function buttons() {
        return Array.from(window.document.querySelectorAll("button")).filter(function (node) {
            return !node.hidden;
        });
    }
    function click(text) {
        var control = buttons().filter(function (node) { return node.textContent.trim() === text; })[0];
        assert(control, "Missing control: " + text);
        control.click();
    }
    function has(text) {
        return buttons().some(function (node) { return node.textContent.trim() === text; });
    }
    function status() { return window.document.querySelector(".status").textContent; }
    function providerCalls() {
        return calls.filter(function (call) { return /\.plex\.tv$/.test(call.host) &&
            call.host !== "www.plex.tv" && call.pathname.indexOf("/api/") !== 0; });
    }
    async function openCard(key) {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();
        var target = Array.from(window.document.querySelectorAll(".media-card")).filter(function (node) {
            return node.vemmCard && node.vemmCard.item.ratingKey === key;
        })[0];
        assert(target, "the home shelves expose the synthetic item " + key);
        target.click();
        await settle();
        assert(window.document.querySelector(".detail-title"), "the card click opened a detail page");
    }
    async function openMore(text) {
        var moreButton = buttons().filter(function (node) {
            return node.getAttribute("aria-label") === "More";
        })[0];
        assert(moreButton, "the detail exposes the More control");
        moreButton.click();
        await settle();
        if (text) { click(text); }
    }
    return { window: window, state: state, calls: calls, settle: settle, click: click, has: has,
        status: status, providerCalls: providerCalls, openCard: openCard, openMore: openMore,
        buttons: buttons };
}

async function rateWriteFlow() {
    var box = baseFixture();
    await box.openCard("201");
    assert(!box.window.document.querySelector(".detail-rating"),
        "an unrated item shows no header rating text");

    await box.openMore("Rate");  // the More menu row opens the star panel
    var panel = box.buttons().filter(function (node) {
        return /^[★]+ \d+$/.test(node.textContent.trim());
    });
    assert.strictEqual(panel.length, 10, "the panel offers exactly ten star rows");
    assert(box.has("Remove rating"), "the panel offers Remove rating");
    assert(!panel.some(function (node) { return node.getAttribute("aria-pressed") === "true"; }),
        "with no current rating no star row is pressed");
    assert.strictEqual(box.calls.filter(function (call) { return call.pathname === "/:/rate"; }).length, 0,
        "opening the rating panel writes nothing");

    box.click(stars(8) + " 8");
    assert(/Nothing changes until you confirm/.test(box.window.document.querySelector(".help-text").textContent),
        "the rating write passes through the confirmation screen");
    assert.strictEqual(box.calls.filter(function (call) { return call.pathname === "/:/rate"; }).length, 0,
        "nothing is written before the confirmation");
    box.click("Confirm");
    await box.settle();
    var write = box.calls.filter(function (call) { return call.pathname === "/:/rate"; })[0];
    assert(write, "confirming sends the rating write");
    assert.strictEqual(write.method, "PUT", "the rating write is a PUT");
    assert.strictEqual(write.params.get("identifier"), "com.plexapp.plugins.library");
    assert.strictEqual(write.params.get("key"), "201");
    assert.strictEqual(write.params.get("rating"), "8");
    assert(/Plex accepted the change/.test(box.status()), "the confirmation reports success");

    box.click("Refresh");
    await box.settle();
    var ratingText = box.window.document.querySelector(".detail-rating");
    assert(ratingText, "the refreshed detail echoes the user rating");
    assert.strictEqual(ratingText.textContent.trim(), "★ 8.0", "the header shows the ★ 8.0 style text");

    await box.openMore("Rate");
    var pressed = box.buttons().filter(function (node) { return node.getAttribute("aria-pressed") === "true"; })[0];
    assert(pressed && pressed.textContent.trim() === stars(8) + " 8",
        "the panel marks the current rating pressed");
    box.click("Remove rating");
    box.click("Confirm");
    await box.settle();
    var removal = box.calls.filter(function (call) { return call.pathname === "/:/rate"; }).pop();
    assert.strictEqual(removal.params.get("rating"), "-1", "Remove rating sends the -1 reset");
}

async function showHeaderHint() {
    // Real-PMS quirk mirrored in the fixture: JSON metadata carries userRating for leaves
    // only (see key === "201" above), so a show can never read its own star back from JSON.
    // The panel rides the just-written value through the success refresh as a hint.
    var box = baseFixture();
    assert(!box.state.userRating, "the fixture starts unrated");
    await box.openCard("210");
    await box.openMore("Rate");
    box.click(stars(8) + " 8");
    box.click("Confirm");
    await box.settle();
    assert.strictEqual(box.state.userRating, 8, "the fixture server recorded the rating");
    box.click("Refresh");
    await box.settle();
    var ratingText = box.window.document.querySelector(".detail-rating");
    assert(ratingText, "the show header shows the rating the viewer just wrote");
    assert.strictEqual(ratingText.textContent.trim(), "★ 8.0",
        "the hint renders with the same ★ N.N shape as leaf readbacks");

    await box.openMore("Rate");
    box.click("Remove rating");
    box.click("Confirm");
    await box.settle();
    assert.strictEqual(box.state.userRating, null, "the fixture server cleared the rating");
    box.click("Refresh");
    await box.settle();
    assert(!box.window.document.querySelector(".detail-rating"),
        "removing the rating leaves no header text behind");
}

async function watchlistMembership() {
    var box = baseFixture({ listed: true });
    await box.openCard("210");
    await box.settle();
    await box.openMore();
    assert(box.has("Remove from Watchlist"), "a watchlisted title flips the row to Remove from Watchlist");
    assert(!box.has("Add to Watchlist"), "the add-side label is replaced, not duplicated");
    var reads = box.providerCalls().filter(function (call) { return /\/userState$/.test(call.pathname); });
    assert.strictEqual(reads.length, 1, "the detail reads the provider userState exactly once");
    assert.strictEqual(reads[0].host, "metadata.provider.plex.tv");
    assert.strictEqual(reads[0].pathname, "/library/metadata/" + SHOW_TAIL + "/userState");

    box.click("Remove from Watchlist");
    assert(/Nothing changes until you confirm/.test(box.window.document.querySelector(".help-text").textContent),
        "removing from the Watchlist also confirms first");
    box.click("Confirm");
    await box.settle();
    var write = box.providerCalls().filter(function (call) {
        return call.pathname === "/actions/removeFromWatchlist";
    })[0];
    assert(write && write.method === "PUT", "the confirmed removal PUTs removeFromWatchlist");
    assert.strictEqual(write.params.get("ratingKey"), SHOW_TAIL);
    box.click("Refresh");
    await box.settle();
    await box.openMore();
    assert(box.has("Add to Watchlist"), "after a successful toggle the row reads Add to Watchlist again");
}

async function watchlistFallbacks() {
    var unlisted = baseFixture({ listed: false });
    await unlisted.openCard("210");
    await unlisted.settle();
    await unlisted.openMore("Add to Watchlist");
    unlisted.click("Confirm");
    await unlisted.settle();
    assert(unlisted.providerCalls().some(function (call) {
        return call.pathname === "/actions/addToWatchlist" && call.method === "PUT" &&
            call.params.get("ratingKey") === SHOW_TAIL;
    }), "an unlisted title adds through the confirmation");

    var failing = baseFixture({ userStateFails: true });
    await failing.openCard("210");
    await failing.settle();
    await failing.openMore();
    assert(failing.has("Add to Watchlist"),
        "a failed userState read falls back silently to the add-side label");
    assert(!/500|unreachable/.test(failing.status()),
        "the background membership read never surfaces an error toast");
}

async function noGuidZeroProviderCalls() {
    var box = baseFixture();
    await box.openCard("211");  // the guid-less episode
    await box.settle();
    assert.strictEqual(box.providerCalls().length, 0,
        "an item without a plex:// guid triggers zero provider requests");
    await box.openMore();
    assert(!box.has("Add to Watchlist") && !box.has("Remove from Watchlist"),
        "no watchlist row appears without a catalogue guid");
}

function moduleContracts() {
    var movieRow = itemMenu.rows({ ratingKey: "5", type: "movie", title: "M" });
    assert(movieRow.some(function (row) { return row.id === "rate" && row.label === "Rate"; }),
        "the hold menu offers Rate on an unrated movie card");
    assert(itemMenu.rows({ ratingKey: "6", type: "episode" }).some(function (row) { return row.id === "rate"; }),
        "the hold menu offers Rate on episode cards");
    assert(itemMenu.rows({ ratingKey: "7", type: "show" }).some(function (row) { return row.id === "rate"; }),
        "the hold menu offers Rate on show cards");
    assert(!itemMenu.rows({ ratingKey: "8", type: "season" }).some(function (row) { return row.id === "rate"; }),
        "season cards stay out of the rating surface");
    assert(!itemMenu.rows({ ratingKey: "9", type: "album" }).some(function (row) { return row.id === "rate"; }),
        "music cards stay out of the rating surface");
    var rateCalls = [];
    var client = plexApi.createClient({ baseUrl: "https://pms.synthetic.invalid", token: "t",
        fetch: function (target, fetchOptions) {
            var url = new URL(target);
            rateCalls.push({ pathname: url.pathname, method: fetchOptions.method, params: url.searchParams });
            return Promise.resolve({ ok: true, status: 200,
                json: function () { return Promise.resolve({ MediaContainer: {} }); } });
        } });
    assert.deepStrictEqual(plexApi.ratingFor({ userRating: "8" }), 8, "ratingFor reads item.userRating");
    assert.deepStrictEqual(plexApi.ratingFor({ userRating: 7.5 }), 7.5);
    assert.strictEqual(plexApi.ratingFor({}), null, "no userRating reads as null");
    assert.strictEqual(plexApi.ratingFor({ userRating: 0 }), null, "a zero userRating reads as null");
    return client.setRating({ ratingKey: "12" }, 6).then(function () {
        var call = rateCalls.pop();
        assert.strictEqual(call.pathname, "/:/rate");
        assert.strictEqual(call.method, "PUT");
        assert.strictEqual(call.params.get("key"), "12");
        assert.strictEqual(call.params.get("rating"), "6");
        return client.setRating({ ratingKey: "12" }, -1);
    }).then(function () {
        assert.strictEqual(rateCalls.pop().params.get("rating"), "-1", "-1 removes the rating");
        return Promise.all([
            assert.rejects(client.setRating({ ratingKey: "12" }, 0), /1 to 10/),
            assert.rejects(client.setRating({ ratingKey: "12" }, 11), /1 to 10/),
            assert.rejects(client.setRating({ ratingKey: "12" }, 2.5), /1 to 10/),
            assert.rejects(client.setRating({ ratingKey: "12" }, -2), /1 to 10/)
        ]);
    }).then(function () {
        assert.throws(function () { client.setRating({ ratingKey: "not-a-key" }, 5); }, /identifier/,
            "an invalid rating key never reaches the network");
        assert.strictEqual(rateCalls.length, 0, "invalid ratings never reach the network");
    });
}

async function run() {
    await moduleContracts();
    await rateWriteFlow();
    await showHeaderHint();
    await watchlistMembership();
    await watchlistFallbacks();
    await noGuidZeroProviderCalls();
    console.log("Tizen UIF-P2 star rating and Watchlist affordance contracts: passed");
}

run().then(function () { process.exit(0); }, function (error) {
    console.error(error); process.exit(1);
});
