"use strict";
// UIFLOW3 Run C structural surfaces against synthetic fixtures only: the search hub
// drill-in ("See all {type}" end card, one limit=100 re-query, zero-request BACK
// replay) and the Top Results shelf (C1/G18); the per-library Recommended pill
// (one /hubs/sections/{key} fetch, home shelf renderer, paged-grid machinery kept
// out of the way, pill memory) (C2/G25); and the home watchlist card badges (one
// cached cloud read per account, guidTail join against the singular guid only,
// invalidation after a write, account-change and silent-failure behaviour) (C3/G21).
// No Plex request, watch-state write or cloud call is real: every client, account
// stub and storage bag below is synthetic and the window.fetch hook fails loudly.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var JSDOM = require("jsdom").JSDOM;
var root = path.resolve(__dirname, "../..");
var app = path.join(root, "samsung/Vemm");
var mainSource = fs.readFileSync(path.join(app, "main.js"), "utf8");
var plexApi = require(path.join(app, "js/plex-api.js"));
var itemMenu = require(path.join(app, "js/item-menu.js"));
var homeHero = require(path.join(app, "js/home-hero.js"));
var queueLib = require(path.join(app, "js/queue.js"));
var preferencesLib = require(path.join(app, "js/preferences.js"));

// Service GUIDs are the SINGULAR guid field with 24-hex tails (the shape the detail
// watchlist row accepts). Guid[] arrays elsewhere on an item are external IDs and
// must never feed the badge join — the fixtures below set both to prove it.
var MOVIE_GUID = "plex://movie/0123456789abcdef01234567";
var SHOW_GUID = "plex://show/00112233445566778899aabb";
var OTHER_GUID = "plex://movie/aaaaaaaaaaaaaaaaaaaaaaaa";
var DECOY_GUID = "plex://movie/cccccccccccccccccccccccc";

function playable(ratingKey, type, title, extra) {
    var item = { ratingKey: ratingKey, type: type, title: title, duration: 600000,
        Media: [{ container: "mp4", bitrate: 8000, Part: [{ id: Number(ratingKey) || 1,
            key: "/library/parts/" + ratingKey + "/stream",
            Stream: [{ id: 11, streamType: 2, language: "English", codec: "aac" }] }] }] };
    Object.keys(extra || {}).forEach(function (name) { item[name] = extra[name]; });
    return item;
}

var movie = playable("201", "movie", "Synthetic Movie", {
    guid: MOVIE_GUID,
    // A Guid[] entry pointing at a listed tail must be ignored: only the singular
    // guid feeds the badge join.
    Guid: [{ id: DECOY_GUID }]
});
var movieB = playable("202", "movie", "Synthetic Other Movie", {
    guid: OTHER_GUID,
    // The singular guid is NOT on the cloud watchlist while the external array
    // entry is: the card must stay unbadged (Guid[] is never consulted).
    Guid: [{ id: DECOY_GUID }]
});
var show = { ratingKey: "210", type: "show", title: "Synthetic Show", guid: SHOW_GUID };
var episode = playable("211", "episode", "Synthetic Episode", {
    guid: "plex://episode/0123456789abcdef01234567",
    grandparentTitle: "Synthetic Show", grandparentRatingKey: "210",
    parentTitle: "Season 1", parentRatingKey: "s1", index: 1
});
var extrasItem = playable("900", "movie", "Synthetic Extras Movie", { guid: OTHER_GUID });

var byKey = {};
[movie, movieB, show, episode, extrasItem].forEach(function (item) { byKey[item.ratingKey] = item; });

function gridItems() { return [movie, show, episode, movieB]; }
function homeHubs() {
    return [{ title: "Synthetic Shelf", Metadata: gridItems() }];
}
function searchHubs() {
    return [
        { type: "movie", title: "Movies", Metadata: [movie, movieB] },
        { type: "show", title: "TV Shows", Metadata: [show, episode] },
        { type: "episode", title: "Episodes", Metadata: [] },
        { title: "Extras", Metadata: [extrasItem] }
    ];
}
function hubItem(index) {
    return playable(String(index), "movie", "Top Movie " + index, { guid: null });
}
function recommendedHubs() {
    var deckRows = [];
    var popularRows = [];
    for (var i = 1; i <= 15; i += 1) {
        deckRows.push(playable(String(300 + i), "movie", "Deck Movie " + i, { viewOffset: 1000, thumb: null }));
        popularRows.push(playable(String(400 + i), "movie", "Popular Movie " + i));
    }
    return [
        { title: "Continue Watching", hubIdentifier: "continueWatching", Metadata: deckRows },
        { title: "Popular Movies", type: "movie", Metadata: popularRows },
        { title: "Recently Added", Metadata: [] },
        { title: "Recently Added Actors", type: "actor", Directory: [{ ratingKey: "a1", tag: "Synthetic Person" }] }
    ];
}

function fixture(options) {
    var opts = options || {};
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://uiflow3-surfaces.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    Object.defineProperty(window.document, "hidden", { value: false, configurable: true });
    var fakeNow = 1700000000000;
    window.fetch = function (url) {
        assert.fail("UIFLOW3 surfaces fixtures must not touch the network: " + url);
    };
    var i18nContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(app, "js/i18n.js"), "utf8"), i18nContext);
    window.VemmI18n = i18nContext.VemmI18n;
    var loaded = { language: "en", quality: "original", skipInterval: 10 };
    Object.keys(opts.prefs || {}).forEach(function (name) { loaded[name] = opts.prefs[name]; });
    window.VemmPreferences = {
        load: function () { return JSON.parse(JSON.stringify(loaded)); },
        save: function (storage, value) { Object.keys(value || {}).forEach(function (name) { loaded[name] = value[name]; }); }
    };
    window.VemmItemMenu = itemMenu;
    window.VemmHomeHero = homeHero;
    window.VemmQueue = queueLib;
    window.PlexApi = plexApi;

    var calls = { search: [], sectionHubs: [], sections: 0, homeHubs: 0,
        sectionItems: [], metadata: [] };
    var client = {
        getSections: function () {
            calls.sections += 1;
            return Promise.resolve([{ key: "1", title: "Synthetic Movies", type: "movie" }]);
        },
        getHomeHubs: function () {
            calls.homeHubs += 1;
            return Promise.resolve(JSON.parse(JSON.stringify(opts.homeHubs === undefined ? homeHubs() : opts.homeHubs)));
        },
        search: function (query, limit) {
            calls.search.push({ query: query, limit: limit });
            return Promise.resolve({ Hub: JSON.parse(JSON.stringify(
                opts.searchHubs === undefined ? searchHubs() : opts.searchHubs)) });
        },
        getSuggestions: function () { return Promise.resolve({ Metadata: [] }); },
        getSectionHubs: function (key) {
            calls.sectionHubs.push(String(key));
            if (opts.failSectionHubs) {
                return Promise.reject(new Error("This server does not offer library recommendations."));
            }
            return Promise.resolve(JSON.parse(JSON.stringify(opts.sectionHubs === undefined ?
                recommendedHubs() : opts.sectionHubs)));
        },
        getSectionItems: function (key, offset, count, filters) {
            calls.sectionItems.push({ key: String(key), offset: offset,
                filters: JSON.parse(JSON.stringify(filters || {})) });
            var items = opts.gridItems || gridItems();
            return Promise.resolve({ items: JSON.parse(JSON.stringify(items)), offset: offset,
                totalSize: items.length });
        },
        getMetadata: function (id) {
            calls.metadata.push(String(id));
            return Promise.resolve(byKey[String(id)] || null);
        },
        getChildren: function () { return Promise.resolve({ Metadata: [] }); },
        getRelated: function () { return Promise.resolve({ Metadata: [] }); },
        getTracks: function () { return Promise.resolve([]); },
        getAllLeaves: function () { return Promise.resolve({ Metadata: [], totalSize: 0 }); },
        getBrowseMenus: function () { return Promise.resolve({ Meta: { Type: [] } }); },
        getCollections: function () { return Promise.resolve({ Metadata: [], totalSize: 0 }); },
        request: function () { return Promise.resolve({ generalDecisionCode: 1000, transcodeDecisionCode: 1000 }); },
        selectStreams: function () { return Promise.resolve(); },
        timeline: function () { return Promise.resolve(); },
        stopTranscode: function () { return Promise.resolve(); },
        streamUrl: function (urlPath) { return "https://pms.synthetic.invalid" + urlPath; },
        cancelRequests: function () {},
        image: function () { return Promise.reject(new Error("No image request is permitted")); }
    };
    if (opts.noSectionHubs) { delete client.getSectionHubs; }

    var account = null;
    var watchlistCalls = [];
    var writes = [];
    if (opts.account) {
        account = {
            watchlist: function (filter, start) {
                watchlistCalls.push({ filter: filter, start: start });
                if (opts.rejectWatchlist) { return Promise.reject(new Error("Watchlist is unreachable.")); }
                var page = typeof opts.watchlistPage === "function" ?
                    opts.watchlistPage(watchlistCalls.length) : opts.watchlistPage;
                return Promise.resolve(JSON.parse(JSON.stringify(page || { Metadata: [] })));
            },
            setWatchlist: function (guid, add) {
                writes.push({ guid: guid, add: add });
                return Promise.resolve({});
            },
            catalogueState: function () { return Promise.resolve({ Metadata: [{ watchlistedAt: 0 }] }); }
        };
    }

    var timers = [];
    window.setTimeout = function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; };
    window.clearTimeout = function () {};
    window.setInterval = function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; };
    window.clearInterval = function () {};

    var boot = mainSource.lastIndexOf('    addConnectForm("");');
    if (boot === -1) { throw new Error("The boot seam in main.js moved"); }
    vm.runInNewContext(mainSource.slice(0, boot) +
        "    window.surfaces = { preferences: function () { return preferences; }," +
        " setPref: function (name, value) { preferences[name] = value; return savePreferences(); }," +
        " openSearch: openSearch, openSection: openSection, openDetail: openDetail," +
        " loadHome: function () { loadHome(false); }, backView: backView," +
        " setup: function (c) { currentClient = c; }," +
        " signIn: function (linked, profile) { accountClient = linked; activeProfile = profile || null;" +
        " linkedProfile = profile || null; }," +
        " signOut: function () { accountClient = null; activeProfile = null; linkedProfile = null; }," +
        " invalidateBadges: invalidateWatchlistIndex };\n}());", {
        window: window, document: window.document, navigator: window.navigator,
        location: window.location, localStorage: window.localStorage,
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
        setInterval: window.setInterval, clearInterval: window.clearInterval,
        fetch: window.fetch, Promise: Promise, URL: URL, Blob: Blob,
        Date: { now: function () { return fakeNow; } }
    });
    window.surfaces.setup(client);

    function settle(ticks) {
        var chain = Promise.resolve();
        for (var tick = 0; tick < (ticks === undefined ? 8 : ticks); tick += 1) {
            chain = chain.then(function () { return new Promise(function (resolve) { process.nextTick(resolve); }); });
        }
        return chain;
    }
    function qsa(selector) { return Array.prototype.slice.call(window.document.querySelectorAll(selector)); }
    function buttons() { return qsa("#screen button"); }
    function texts(nodes) {
        return nodes.map(function (node) { return node.textContent.trim(); });
    }
    function findButton(label) {
        var match = buttons().filter(function (node) { return node.textContent.trim() === label; });
        assert.ok(match.length, "A " + JSON.stringify(label) + " control exists");
        return match[0];
    }
    function hasButton(label) {
        return buttons().some(function (node) { return node.textContent.trim() === label; });
    }
    function click(label) { findButton(label).click(); return settle(); }
    function status() { return window.document.getElementById("status"); }
    function statusText() { return status().textContent.trim(); }
    function shelf(title) {
        var wanted = qsa("#screen .shelf").filter(function (node) {
            var heading = node.querySelector("h3");
            return heading && heading.textContent.trim() === title;
        });
        assert.strictEqual(wanted.length, 1, "Exactly one shelf titled " + JSON.stringify(title));
        return wanted[0];
    }
    function cardTitles(row) {
        return qsa(".card-title", row).length ? [] : [];
    }
    function rowCards(row) {
        return Array.prototype.slice.call(row.querySelectorAll("button")).filter(function (node) {
            return !/\bshelf-see-all\b/.test(node.className);
        });
    }
    function cardTitle(card) {
        var title = card.querySelector(".card-title");
        return title ? title.textContent.trim() : "";
    }
    function badgeCards() {
        return qsa("#screen .card-watchlist");
    }

    return {
        dom: dom, window: window, surfaces: window.surfaces, calls: calls,
        account: account, watchlistCalls: watchlistCalls, writes: writes,
        settle: settle, qsa: qsa, texts: texts, findButton: findButton, hasButton: hasButton,
        click: click, status: status, statusText: statusText, shelf: shelf,
        rowCards: rowCards, cardTitle: cardTitle, badgeCards: badgeCards
    };
}

// C1/G18 — one live search builds Top Results + per-hub shelves; every non-empty
// typed hub ends with its "See all {type}" card; empty and untyped hubs do not.
async function searchSurfaces() {
    var box = fixture();
    box.surfaces.openSearch("synthetic");
    await box.settle();
    assert.strictEqual(box.calls.search.length, 1, "the live search queries the server exactly once");
    assert.strictEqual(box.calls.search[0].query, "synthetic");
    var top = box.qsa("#screen .top-results");
    assert.strictEqual(top.length, 1, "a Top Results shelf heads the results");
    assert.strictEqual(top[0].querySelector("h3").textContent.trim(), "Top Results");
    var topCards = box.rowCards(top[0].querySelector(".shelf-row"));
    assert.deepStrictEqual(topCards.map(box.cardTitle),
        ["Synthetic Movie", "Synthetic Other Movie", "Synthetic Show", "Synthetic Episode"],
        "Top Results dedupes across hubs in hub order with zero extra requests");
    assert.strictEqual(box.calls.search.length, 1, "Top Results costs no request of its own");
    var movies = box.shelf("Movies");
    var sees = box.qsa("#screen .shelf-see-all");
    assert.deepStrictEqual(box.texts(sees), ["See all Movies", "See all TV Shows"],
        "every non-empty typed hub closes with exactly one See all end card");
    assert.strictEqual(sees[0].getAttribute("aria-label"), "See all Movies",
        "the See all card announces itself for the screen reader");
    assert.ok(movies.querySelector(".shelf-see-all"), "the See all card sits at the end of its own row");
    assert.ok(!box.hasButton("See all Episodes"), "a zero-item hub gets no See all card");
    assert.strictEqual(box.qsa("#screen .shelf").filter(function (node) {
        var heading = node.querySelector("h3");
        return heading && heading.textContent.trim() === "Episodes";
    }).length, 0, "the zero-item hub renders no shelf at all");
    var extras = box.shelf("Extras");
    assert.ok(!extras.querySelector(".shelf-see-all"),
        "an untyped hub cannot be matched back, so it gets no See all card");
    assert.ok(!topCards.some(function (card) { return box.cardTitle(card) === "Synthetic Extras Movie"; }),
        "untyped-hub items do not contribute to Top Results");
    assert.strictEqual(box.statusText(), "Search complete.", "the finished search reports completion");
    box.dom.window.close();
}

// C1/G18 — the See all drill-in re-queries once with limit 100, renders the whole
// hub in one grid (no paging), and BACK replays the results with zero requests.
async function searchDrillIn() {
    var wide = [movie, movieB,
        playable("203", "movie", "Synthetic Third Movie"),
        playable("204", "movie", "Synthetic Fourth Movie")];
    var box = fixture({ searchHubs: [{ type: "movie", title: "Movies", Metadata: wide }] });
    box.surfaces.openSearch("synthetic");
    await box.settle();
    assert.strictEqual(box.calls.search.length, 1);
    await box.click("See all Movies");
    assert.strictEqual(box.calls.search.length, 2, "activating See all fires exactly one re-query");
    assert.deepStrictEqual(box.calls.search[1], { query: "synthetic", limit: 100 },
        "the drill-in re-queries /hubs/search with limit 100 — no paging loop");
    assert.strictEqual(box.qsa("#screen .item-list button").length, 4,
        "the whole returned hub renders in one grid");
    assert.ok(!box.hasButton("Load more"), "hub answers carry no totalSize, so no Load more appears");
    assert.strictEqual(box.statusText(), "4 items shown.", "the drill-in listing reports its size");
    box.surfaces.backView();
    await box.settle();
    assert.strictEqual(box.calls.search.length, 2,
        "BACK replays the collected hubs from memory: zero further requests");
    assert.strictEqual(box.window.document.querySelector(".remote-input").value, "synthetic",
        "the query survives the round trip");
    assert.strictEqual(box.qsa("#screen .top-results").length, 1, "Top Results replays too");
    assert.strictEqual(box.texts(box.qsa("#screen .shelf-see-all")).join("|"), "See all Movies",
        "the result shelves replay intact");
    assert.strictEqual(box.statusText(), "Search complete.", "the replayed view restates completion");
    box.dom.window.close();
}

// C1/G18 — Top Results caps at eight and its cards open the detail normally;
// BACK from the detail replays the results with zero requests.
async function searchTopCapAndDetail() {
    var many = [];
    for (var i = 1; i <= 9; i += 1) { many.push(hubItem(i)); }
    var more = [];
    for (var j = 10; j <= 13; j += 1) { more.push(hubItem(j)); }
    var box = fixture({ searchHubs: [
        { type: "movie", title: "Movies", Metadata: many },
        { type: "show", title: "TV Shows", Metadata: more }
    ] });
    box.surfaces.openSearch("synthetic");
    await box.settle();
    var topCards = box.rowCards(box.qsa("#screen .top-results")[0].querySelector(".shelf-row"));
    assert.strictEqual(topCards.length, 8, "Top Results holds at most eight items");
    assert.deepStrictEqual(topCards.map(box.cardTitle),
        ["Top Movie 1", "Top Movie 2", "Top Movie 3", "Top Movie 4", "Top Movie 5",
            "Top Movie 6", "Top Movie 7", "Top Movie 8"],
        "the cap keeps the first eight in hub order");
    topCards[0].click();
    await box.settle();
    assert.deepStrictEqual(box.calls.metadata, ["1"], "a Top Results card opens the normal detail");
    box.surfaces.backView();
    await box.settle();
    assert.strictEqual(box.calls.search.length, 1, "BACK from the detail costs zero search requests");
    assert.strictEqual(box.window.document.querySelector(".remote-input").value, "synthetic");
    assert.strictEqual(box.qsa("#screen .top-results").length, 1);
    box.dom.window.close();
}

// C2/G25 — the Recommended pill fetches the library hubs exactly once and renders
// them through the home shelf renderer, keeping the paged grid out of the way.
async function recommendedPill() {
    var box = fixture();
    box.surfaces.setPref("continueWatchingSize", 6);
    box.surfaces.openSection({ key: "1", title: "Synthetic Movies", type: "movie" });
    await box.settle();
    assert.strictEqual(box.calls.sectionItems.length, 1, "the library opens on its normal grid");
    var pills = box.qsa("#screen .section-pill");
    assert.deepStrictEqual(box.texts(pills), ["All", "Recently added", "Recommended"],
        "the pill bar grows the Recommended pill next to the browse pills");
    assert.ok(box.hasButton("Recommended"));
    await box.click("Recommended");
    assert.deepStrictEqual(box.calls.sectionHubs, ["1"],
        "selecting Recommended fires exactly one /hubs/sections/{key} fetch");
    assert.strictEqual(box.calls.sectionItems.length, 1, "the paged section listing is not re-requested");
    box.calls.sectionItems.forEach(function (request) {
        assert.ok(!request.filters.includeGuids && !request.filters.includeUserState,
            "no request ever mixes includeGuids/includeUserState into a paged listing");
    });
    assert.strictEqual(box.surfaces.preferences().sectionPills["1"], "hubs",
        "the Recommended pill round-trips through the per-library pill memory");
    assert.strictEqual(box.window.document.getElementById("section-pill-hubs")
        .getAttribute("aria-current"), "true", "the pill shows its own highlight");
    assert.strictEqual(box.qsa("#screen .recommended-hubs").length, 1, "the hubs panel renders");
    assert.deepStrictEqual(box.texts(box.qsa("#screen .hub-title")),
        ["Continue Watching", "Popular Movies"],
        "hubs render as shelves; empty and Directory-only hubs are skipped");
    assert.strictEqual(box.rowCards(box.shelf("Continue Watching").querySelector(".shelf-row")).length, 6,
        "the Continue Watching shelf keeps the remembered deck row size");
    assert.strictEqual(box.rowCards(box.shelf("Popular Movies").querySelector(".shelf-row")).length, 12,
        "plain hubs keep the twelve-card home row");
    assert.strictEqual(box.qsa("#screen .shelf-actions").length, 2,
        "each media shelf carries its Play all / Shuffle all actions");
    assert.ok(box.shelf("Popular Movies").querySelector(".shelf-actions"), "Play all rides the shelf");
    assert.ok(!box.hasButton("Sort and filters") && !box.qsa("#screen .item-list").length,
        "the grid toolbar and paged listing stay out of the Recommended view");
    assert.strictEqual(box.statusText(), "", "a healthy hubs view leaves no status behind");
    box.dom.window.close();
}

// C2/G25 — memory, BACK and switching: the pill highlight returns from the detail
// and from a fresh open, the Library pill restores the untouched grid, and BACK at
// the root returns home without touching the grid machinery.
async function recommendedMemoryAndBack() {
    var box = fixture();
    box.surfaces.openSection({ key: "1", title: "Synthetic Movies", type: "movie" });
    await box.settle();
    await box.click("Recommended");
    var popular = box.shelf("Popular Movies").querySelector(".shelf-row");
    box.rowCards(popular)[0].click();
    await box.settle();
    assert.strictEqual(box.calls.metadata.length, 1, "a Recommended card opens the normal detail");
    box.surfaces.backView();
    await box.settle();
    assert.strictEqual(box.window.document.getElementById("section-pill-hubs")
        .getAttribute("aria-current"), "true", "BACK returns to the library with the pill highlighted");
    assert.strictEqual(box.qsa("#screen .recommended-hubs").length, 1,
        "the hubs view replays without crashing into the grid");
    assert.ok(!box.qsa("#screen .item-list").length, "no grid DOM appears behind the pills");
    await box.click("All");
    assert.strictEqual(box.calls.sectionItems.length, 2,
        "switching back to the Library pill re-requests the untouched browse listing");
    assert.ok(box.hasButton("Sort and filters"), "the grid toolbar is back as it was");
    assert.strictEqual(box.window.document.getElementById("section-pill-all")
        .getAttribute("aria-current"), "true");
    box.dom.window.close();

    var remembered = fixture({ prefs: { sectionPills: { "1": "hubs" } } });
    remembered.surfaces.openSection({ key: "1", title: "Synthetic Movies", type: "movie" });
    await remembered.settle();
    assert.deepStrictEqual(remembered.calls.sectionHubs, ["1"],
        "a remembered Recommended pill opens the hubs view directly");
    assert.strictEqual(remembered.calls.sectionItems.length, 0, "the grid listing is not requested");
    assert.strictEqual(remembered.window.document.getElementById("section-pill-hubs")
        .getAttribute("aria-current"), "true");
    await remembered.click("Back to Home");
    assert.ok(remembered.window.document.getElementById("screen").className
        .indexOf("screen-home") !== -1, "BACK from the recommended view lands on home");
    remembered.dom.window.close();
}

// C2/G25 — an empty or failing hubs answer keeps a friendly empty state, names the
// problem through the status line, and leaves the pill bar usable.
async function recommendedFailures() {
    var failing = fixture({ failSectionHubs: true });
    failing.surfaces.openSection({ key: "1", title: "Synthetic Movies", type: "movie" });
    await failing.settle();
    await failing.click("Recommended");
    assert.strictEqual(failing.qsa("#screen .recommended-hubs .empty-state").length, 1,
        "a failed hubs answer shows the friendly empty state");
    assert.strictEqual(failing.qsa("#screen .recommended-hubs .empty-state")[0].textContent.trim(),
        "No recommendations were returned.");
    assert.strictEqual(failing.statusText(), "This server does not offer library recommendations.",
        "the failure is named explicitly, not swallowed");
    assert.strictEqual(failing.qsa("#screen .section-pill").length, 3, "the pill bar stays usable");
    await failing.click("All");
    assert.strictEqual(failing.calls.sectionItems.length, 2, "the browse pills still work after the failure");
    failing.dom.window.close();

    var bare = fixture({ noSectionHubs: true });
    bare.surfaces.openSection({ key: "1", title: "Synthetic Movies", type: "movie" });
    await bare.settle();
    await bare.click("Recommended");
    assert.strictEqual(bare.qsa("#screen .recommended-hubs .empty-state").length, 1,
        "a server without the hubs endpoint degrades to the same empty state");
    bare.dom.window.close();

    var empty = fixture({ sectionHubs: [{ title: "Popular Movies", Metadata: [] }] });
    empty.surfaces.openSection({ key: "1", title: "Synthetic Movies", type: "movie" });
    await empty.settle();
    await empty.click("Recommended");
    assert.strictEqual(empty.qsa("#screen .recommended-hubs .empty-state").length, 1,
        "an empty hubs answer shows the empty state instead of a blank screen");
    assert.strictEqual(empty.statusText(), "", "an empty (non-error) answer raises no error status");
    empty.dom.window.close();
}

// C3/G21 — home with a signed-in profile reads the cloud watchlist exactly once,
// badges matching movie/show cards by singular-guid tail join, ignores episodes and
// Guid[] arrays, caches per account, and re-reads only after invalidation.
async function watchlistBadges() {
    var listed = { Metadata: [{ guid: MOVIE_GUID }, { guid: SHOW_GUID }, { guid: DECOY_GUID }] };
    var box = fixture({ account: true, watchlistPage: listed });
    box.surfaces.signIn(box.account, { title: "Synthetic profile", id: "p1" });
    box.surfaces.loadHome();
    await box.settle();
    assert.strictEqual(box.calls.sections, 1, "home still loads through the existing seams");
    assert.deepStrictEqual(box.watchlistCalls, [{ filter: "all", start: 0 }],
        "home with a signed-in account fires exactly ONE watchlist(all, 0) read");
    var badges = box.badgeCards();
    assert.strictEqual(badges.length, 2,
        "badges mark the movie and the show only — never the episode, never the unlisted film");
    badges.forEach(function (mark) {
        assert.strictEqual(mark.getAttribute("aria-label"), "On watchlist",
            "the badge announces itself for the screen reader");
    });
    box.dom.window.close();

    var second = fixture({ account: true, watchlistPage: listed });
    second.surfaces.signIn(second.account, { title: "Synthetic profile", id: "p1" });
    second.surfaces.loadHome();
    await second.settle();
    second.surfaces.loadHome();
    await second.settle();
    assert.strictEqual(second.watchlistCalls.length, 1,
        "the index is cached: a second home visit costs zero requests");
    assert.strictEqual(second.badgeCards().length, 2, "the cached badges still render");
    second.surfaces.invalidateBadges();
    second.surfaces.loadHome();
    await second.settle();
    assert.strictEqual(second.watchlistCalls.length, 2,
        "an invalidated index re-reads exactly once on the next home");
    var otherAccount = null;
    var otherCalls = [];
    otherAccount = {
        watchlist: function (filter, start) {
            otherCalls.push({ filter: filter, start: start });
            return Promise.resolve({ Metadata: [{ guid: SHOW_GUID }] });
        },
        setWatchlist: function () { return Promise.resolve({}); },
        catalogueState: function () { return Promise.resolve({ Metadata: [] }); }
    };
    second.surfaces.signIn(otherAccount, { title: "Other profile", id: "p2" });
    second.surfaces.openSection({ key: "1", title: "Synthetic Movies", type: "movie" });
    await second.settle();
    assert.strictEqual(second.badgeCards().length, 0,
        "the previous account's badges vanish immediately on account change");
    second.surfaces.loadHome();
    await second.settle();
    assert.deepStrictEqual(otherCalls, [{ filter: "all", start: 0 }],
        "the new account reads its own watchlist exactly once");
    assert.strictEqual(second.badgeCards().length, 1, "only the new account's item badges");
    assert.strictEqual(second.watchlistCalls.length, 2, "the old account's cache never re-enters");
    second.dom.window.close();
}

// C3/G21 — a successful detail watchlist write invalidates the cache so the next
// home re-reads once; a failed read stays silent; a token-only session without a
// resolved cloud profile (the protected zero-provider-call contract) reads nothing.
async function watchlistWriteAndSilence() {
    var calls = 0;
    var box = fixture({ account: true, watchlistPage: function () {
        calls += 1;
        return calls === 1 ? { Metadata: [{ guid: MOVIE_GUID }] } : { Metadata: [] };
    } });
    box.surfaces.signIn(box.account, { title: "Synthetic profile", id: "p1" });
    box.surfaces.loadHome();
    await box.settle();
    assert.strictEqual(box.badgeCards().length, 1, "the listed movie badges on home");
    var homeCard = box.qsa("#screen .shelf-row button").filter(function (card) {
        return box.cardTitle(card) === "Synthetic Movie";
    })[0];
    homeCard.click();
    await box.settle();
    await box.click("Add to Watchlist");
    assert.ok(/Nothing changes until you confirm/.test(
        box.qsa(".help-text").map(function (node) { return node.textContent; }).join(" ")),
        "the existing write keeps its confirmation");
    await box.click("Confirm");
    assert.strictEqual(box.writes.length, 1, "the confirmed write still runs");
    assert.strictEqual(box.writes[0].guid, MOVIE_GUID, "the write rides the singular service guid");
    await box.click("Refresh");
    box.surfaces.backView(); // leaves the confirmation view (Refresh already reopened the detail)
    await box.settle();
    box.surfaces.backView(); // and then the card visit: home
    await box.settle();
    assert.strictEqual(box.watchlistCalls.length, 2,
        "the successful write invalidated the cache: the next home re-reads exactly once");
    assert.strictEqual(box.badgeCards().length, 0, "the badges show the fresh server answer");
    box.dom.window.close();

    var silent = fixture({ account: true, rejectWatchlist: true });
    silent.surfaces.signIn(silent.account, { title: "Synthetic profile", id: "p1" });
    silent.surfaces.loadHome();
    await silent.settle();
    assert.ok(silent.window.document.getElementById("screen").className
        .indexOf("screen-home") !== -1, "a failed watchlist read never blocks home");
    assert.strictEqual(silent.badgeCards().length, 0, "a failed read simply shows no badges");
    assert.strictEqual(silent.status().className, "status",
        "the silent failure raises no error banner of its own");
    silent.dom.window.close();

    var tokenOnly = fixture({ account: true });
    tokenOnly.surfaces.signIn(tokenOnly.account, null);
    tokenOnly.surfaces.loadHome();
    await tokenOnly.settle();
    assert.strictEqual(tokenOnly.watchlistCalls.length, 0,
        "a raw token restore without a resolved cloud profile issues zero provider reads");
    assert.strictEqual(tokenOnly.badgeCards().length, 0);
    assert.ok(tokenOnly.window.document.getElementById("screen").className
        .indexOf("screen-home") !== -1, "home still renders for a token-only session");
    tokenOnly.dom.window.close();

    var signedOut = fixture({ account: true, watchlistPage: { Metadata: [] } });
    signedOut.surfaces.loadHome();
    await signedOut.settle();
    assert.strictEqual(signedOut.watchlistCalls.length, 0,
        "no account client means zero cloud reads and no badge requests");
    signedOut.dom.window.close();
}

// C1/C2 — the carried-over plex-api seams speak the operator-probed endpoint
// shapes: /hubs/search?query&q&limit with no paging-killer flags and a single
// /hubs/sections/{key} read that never carries includeGuids/includeUserState.
async function apiEndpointShapes() {
    var urls = [];
    function syntheticFetch(url) {
        urls.push(String(url));
        return Promise.resolve({
            ok: true, status: 200,
            // A json-only injected transport: plex-api routes pre-decoded fixtures
            // through response.json() (documented test-transport seam).
            json: function () { return Promise.resolve({ MediaContainer: { Hub: [] } }); }
        });
    }
    var client = plexApi.createClient({
        baseUrl: "https://pms.synthetic.invalid", token: "synthetic-token", fetch: syntheticFetch
    });
    await client.search("synthetic query", 100);
    assert.strictEqual(urls.length, 1, "the search drill-in issues exactly one request");
    assert.ok(/\/hubs\/search\?/.test(urls[0]), "the search endpoint is /hubs/search");
    assert.ok(/query=synthetic%20query/.test(urls[0]), "the query rides the documented parameter");
    assert.ok(/limit=100/.test(urls[0]), "the drill-in limit rides through to the endpoint");
    assert.ok(urls[0].indexOf("includeGuids") === -1 && urls[0].indexOf("includeUserState") === -1,
        "search requests never carry the paging-killer flags");
    urls.length = 0;
    await client.search("synthetic");
    assert.ok(/limit=50/.test(urls[0]), "the default search size stays fifty");
    urls.length = 0;
    await client.getSectionHubs("2");
    assert.strictEqual(urls.length, 1, "the Recommended view fires exactly one hub request");
    assert.ok(/\/hubs\/sections\/2$/.test(urls[0].split("?")[0]), "the endpoint is /hubs/sections/{key}");
    assert.ok(urls[0].indexOf("includeGuids") === -1 && urls[0].indexOf("includeUserState") === -1,
        "the hub listing stays container-paged: no includeGuids/includeUserState");
    await assert.rejects(function () { return client.getSectionHubs("show-1"); },
        "a non-numeric section key is rejected before any request");
    assert.strictEqual(urls.length, 1, "the rejected key cost no request");
}

async function run() {
    await searchSurfaces();
    await searchDrillIn();
    await searchTopCapAndDetail();
    await recommendedPill();
    await recommendedMemoryAndBack();
    await recommendedFailures();
    await watchlistBadges();
    await watchlistWriteAndSilence();
    await apiEndpointShapes();
    console.log("Tizen UIFLOW3 Run C surface contracts: search See-all + Top Results, Recommended pill, watchlist badges passed");
}

run().then(null, function (error) {
    console.error(error && error.stack || error);
    process.exit(1);
});
