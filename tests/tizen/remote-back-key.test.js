"use strict";
// UI journeys for the LG parity features: the per-server Favorite libraries onboarding step, the
// card hold menu (long OK versus short OK), the Continue Watching preference, and the "Other
// servers" alternate-source panel. Every server, profile and identifier is synthetic.
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");

function Node(tag, text) {
    this.tag = tag;
    this.tagName = String(tag).toUpperCase();
    this.textContent = text || "";
    this.children = [];
    this.events = {};
    this.attributes = {};
    this.parentNode = null;
    this.value = "";
}
Node.prototype.appendChild = function (child) { child.parentNode = this; this.children.push(child); return child; };
Node.prototype.removeChild = function (child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; };
Node.prototype.replaceChild = function (next, previous) {
    this.children.splice(this.children.indexOf(previous), 1, next);
    next.parentNode = this;
    previous.parentNode = null;
    return previous;
};
Object.defineProperty(Node.prototype, "firstChild", { get: function () { return this.children[0]; } });
Node.prototype.addEventListener = function (name, callback) { this.events[name] = callback; };
Node.prototype.setAttribute = function (name, value) { this.attributes[name] = value; };
Node.prototype.focus = function () { Node.document.activeElement = this; };
Node.prototype.click = function () { if (this.events.click) { this.events.click(); } };
Node.prototype.querySelectorAll = function () {
    var result = [];
    function visit(node) {
        if (node.tag === "button" || node.tag === "input") { result.push(node); }
        node.children.forEach(visit);
    }
    this.children.forEach(visit);
    return result;
};
Node.prototype.querySelector = function (selector) {
    var cls = String(selector).replace(/^\./, "");
    var result = [];
    function visit(node) {
        if (node.className && (" " + node.className + " ").indexOf(" " + cls + " ") !== -1) { result.push(node); }
        node.children.forEach(visit);
    }
    this.children.forEach(visit);
    return result[0] || null;
};
function findById(node, id) {
    if (node.id === id) { return node; }
    for (var i = 0; i < node.children.length; i += 1) {
        var found = findById(node.children[i], id);
        if (found) { return found; }
    }
    return null;
}
function texts(node) {
    var out = [];
    (function visit(entry) { out.push(entry.textContent); entry.children.forEach(visit); }(node));
    return out;
}

function memoryStorage(initial) {
    var data = initial || {};
    return {
        get length() { return Object.keys(data).length; },
        key: function (index) { return Object.keys(data)[index] || null; },
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        setItem: function (key, value) { data[key] = String(value); },
        removeItem: function (key) { delete data[key]; },
        data: data
    };
}

var FAVORITES = "vemm-tizen-favorite-libraries";
var episode = { ratingKey: "50", type: "episode", title: "Synthetic Episode", viewOffset: 6000,
    grandparentRatingKey: "30", parentRatingKey: "40" };
var movie = { ratingKey: "7", type: "movie", title: "Synthetic Movie", guid: "plex://movie/5d7768295af944001f1f7477" };

function boot(storage) {
    var screen = new Node("main");
    var status = new Node("p");
    var listeners = {};
    var timers = [];
    var document = {
        activeElement: null,
        getElementById: function (id) { return id === "screen" ? screen : id === "status" ? status : findById(screen, id); },
        createElement: function (tag) { return new Node(tag); },
        querySelector: function () { return null; },
        addEventListener: function (name, callback) { listeners[name] = callback; }
    };
    Node.document = document;
    var record = { opened: [], findGuid: [], selected: [], queues: 0 };
    function server(name, sections) {
        return {
            name: name,
            cancelRequests: function () {},
            getSections: function () { return Promise.resolve(sections); },
            getHomeHubs: function () {
                return Promise.resolve([
                    { title: "Continue Watching", hubIdentifier: "home.continue", Metadata: [episode] },
                    { title: "Recent Shows", hubIdentifier: "home.television.recent", librarySectionID: 2,
                        Metadata: [{ ratingKey: "60", type: "show", title: "Shows Shelf Item" }] },
                    { title: "Recent Movies", hubIdentifier: "home.movies.recent", librarySectionID: 1, Metadata: [movie] }
                ]);
            },
            getMetadata: function (id) {
                record.opened.push(name + ":" + id);
                return Promise.resolve(String(id) === "7" ? movie : { ratingKey: String(id), type: "episode", title: "Opened " + id });
            },
            getRelated: function () { return Promise.resolve({ Hub: [] }); },
            findGuid: function (section, guid) {
                record.findGuid.push(name + ":" + section + ":" + guid);
                return Promise.resolve([{ ratingKey: "900", type: "movie", title: "Copy on " + name,
                    Media: [{ videoResolution: "1080" }] }]);
            },
            createVideoPlayQueue: function () { record.queues += 1; return Promise.reject(new Error("unused")); }
        };
    }
    var sections = [{ key: "1", type: "movie", title: "Movies" }, { key: "2", type: "show", title: "Shows" }];
    var clients = { a: server("Alpha", sections), b: server("Beta", [{ key: "5", type: "movie", title: "Films" }]) };
    var api = {
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () { return Promise.resolve({ status: "linked", token: "synthetic-account-token" }); }
        }; },
        createAccountClient: function () { return {
            getProfiles: function () { return Promise.resolve([{ uuid: "synthetic-profile", title: "Synthetic Guest" }]); },
            switchProfile: function () { return Promise.resolve("synthetic-profile-token"); },
            getServers: function () {
                return Promise.resolve([
                    { id: "machine-a", name: "Alpha", owned: true, token: "t-a", connections: [{ uri: "https://a.invalid" }] },
                    { id: "machine-b", name: "Beta", owned: false, token: "t-b", connections: [{ uri: "https://b.invalid" }] }
                ]);
            },
            getWatchlistState: function () { return Promise.resolve(false); }
        }; },
        selectServer: function (entry) {
            record.selected.push(entry.id);
            return Promise.resolve({ relay: false, client: entry.id === "machine-a" ? clients.a : clients.b });
        }
    };
    var window = { PlexApi: api, VemmHomeHero: require("../../samsung/Vemm/js/home-hero.js"), Promise: Promise, URL: URL, Blob: Blob, localStorage: storage,
        fetch: function () { assert.fail("The synthetic UI must not use the network"); },
        addEventListener: function () {} };
    ["i18n.js", "js/preferences.js", "js/favorites.js", "js/item-menu.js"].forEach(function (file) {
        var path = require.resolve("../../samsung/Vemm/" + (file === "i18n.js" ? "js/i18n.js" : file));
        vm.runInNewContext(fs.readFileSync(path, "utf8"), window);
    });
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/main.js"), "utf8"), {
        document: document, window: window, console: console,
        setTimeout: function (callback, delay) { timers.push({ callback: callback, delay: delay }); return timers.length; },
        clearTimeout: function (id) { if (timers[id - 1]) { timers[id - 1].callback = null; } }
    });
    function find(label) {
        return screen.querySelectorAll().find(function (node) { return node.tag === "button" && node.textContent === label; });
    }
    function click(label) {
        var control = find(label);
        assert(control, "Missing control: " + label + " in " + JSON.stringify(screen.querySelectorAll().map(function (n) { return n.textContent; })));
        control.events.click();
    }
    function cards() { return screen.querySelectorAll().filter(function (node) { return node.className === "media-card"; }); }
    function key(name, code) { listeners[name]({ keyCode: code, repeat: false, preventDefault: function () {} }); }
    function fire(delay) {
        timers.forEach(function (timer) {
            if (timer.callback && timer.delay === delay) { var callback = timer.callback; timer.callback = null; callback(); }
        });
    }
    async function settle() { for (var i = 0; i < 60; i += 1) { await Promise.resolve(); } }
    async function signIn(serverLabel) {
        click("Get a new code");
        await settle();
        click("Synthetic Guest");
        await settle();
        var serverButton = screen.querySelectorAll().find(function (node) { return node.textContent.indexOf(serverLabel) === 0; });
        assert(serverButton, "Missing server control " + serverLabel);
        serverButton.events.click();
        await settle();
    }
    return { screen: screen, status: status, find: find, click: click, cards: cards, key: key, fire: fire,
        backbutton: function () { if (listeners.backbutton) { listeners.backbutton({ preventDefault: function () {} }); } },
        settle: settle, signIn: signIn, record: record, document: document, window: window };
}

async function remoteBackWalksViews() {
    var storage = memoryStorage({});
    storage.setItem(FAVORITES, JSON.stringify({ "machine-a": ["1", "2"] }));
    var app = boot(storage);
    await app.signIn("Alpha (owned)");
    var deckCard = app.cards()[0];
    deckCard.events.click();
    await app.settle();
    assert.deepStrictEqual(app.record.opened, ["Alpha:50"], "A card click opens the item detail");
    assert(app.screen.className.indexOf("screen-detail") !== -1, "The detail view replaced home");
    // The Samsung remote BACK button arrives as keyCode 461 on this firmware family;
    // it must walk the view stack instead of doing nothing (owner report 2026-11-05:
    // no way to leave an episode detail on the TV).
    app.key("keydown", 461);
    await app.settle();
    assert(app.screen.className.indexOf("screen-home") !== -1,
        "Remote BACK (keyCode 461) returns from the item detail to the previous view");
    app.cards()[0].events.click();
    await app.settle();
    assert(app.screen.className.indexOf("screen-detail") !== -1, "The card reopens the detail view");
    app.backbutton();
    await app.settle();
    assert(app.screen.className.indexOf("screen-home") !== -1,
        "A backbutton event walks the view stack the same way");
}

async function visibleBackPillReturnsToPreviousView() {
    var storage = memoryStorage({});
    storage.setItem(FAVORITES, JSON.stringify({ "machine-a": ["1", "2"] }));
    var app = boot(storage);
    await app.signIn("Alpha (owned)");
    app.cards()[0].events.click();
    await app.settle();
    assert(app.screen.className.indexOf("screen-detail") !== -1, "The card click opens the episode detail");
    // Owner report 2026-11-05: the only Back control was buried inside the hidden
    // More menu, so an episode detail had no visible way back to the season view.
    var row = app.screen.querySelector(".detail-actions");
    assert(row, "The episode detail renders an action row");
    var pill = null;
    row.children.forEach(function (child) {
        if (child.tag === "button" && child.textContent === "Back") { pill = child; }
    });
    assert(pill, "The action row exposes a visible Back pill");
    pill.click();
    await app.settle();
    assert(app.screen.className.indexOf("screen-home") !== -1,
        "The visible Back pill returns from the episode detail to the previous view");
}

async function run() {
    await remoteBackWalksViews();
    await visibleBackPillReturnsToPreviousView();
    console.log("Tizen remote BACK key, backbutton event and visible Back pill walk the view stack: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
