"use strict";
// Per-library browse layouts, browse-by-folder and the Playlists tab. The layout is a saved
// preference keyed by library, folders come from the section's own directory tree and playlists
// are their own listing that drills into its items.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

var showOne = { ratingKey: "301", type: "show", title: "Harbour Tales",
    summary: "A synthetic synopsis about ships and signals." };
var showTwo = { ratingKey: "302", type: "show", title: "Lighthouse Docs",
    summary: "A second synthetic synopsis used only by this test." };
var showThree = { ratingKey: "303", type: "show", title: "Signal Fires" };
var sectionItems = [showOne, showTwo, showThree];
var folders = [
    { ratingKey: "501", type: "directory", title: "In Progress", name: "In Progress", folder: 1 },
    { ratingKey: "502", type: "directory", title: "Documentaries", name: "Documentaries", folder: 1 }
];
var folderChildren = {
    "501": [showOne],
    "502": [showTwo, showThree]
};
var playlist = { id: "77", type: "playlist", title: "Sunday Picks", playlistType: "show", itemCount: 2 };
var playlistItems = [showTwo, showOne];

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var calls = [];
    window.TextDecoder = TextDecoder;
    window.fetch = function (target, options) {
        var url = new URL(target);
        calls.push({ path: url.pathname, query: url.searchParams });
        var payload;
        if (url.pathname === "/api/v2/home/users") { payload = { users: [] }; }
        else if (url.pathname === "/api/v2/resources") {
            payload = [{ clientIdentifier: "synthetic-server", name: "Synthetic PMS", provides: "server", owned: true,
                accessToken: "synthetic-server-token", connections: [{ uri: "https://pms.synthetic.invalid" }] }];
        } else {
            var container;
            var childrenPath = /^\/library\/metadata\/(\d+)\/children$/.exec(url.pathname);
            var playlistPath = /^\/playlists\/(\d+)\/items$/.exec(url.pathname);
            if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-server" }; }
            else if (url.pathname === "/library/sections") {
                container = { Directory: [{ key: "1", type: "show", title: "Shows" }] };
            } else if (url.pathname === "/hubs/promoted") { container = { Hub: [] }; }
            else if (url.pathname === "/library/sections/1/all" && url.searchParams.get("folder") === "1") {
                container = { totalSize: folders.length, offset: 0, Directory: folders };
            } else if (url.pathname === "/library/sections/1/all") {
                container = { totalSize: sectionItems.length, offset: 0, Metadata: sectionItems };
            } else if (url.pathname === "/playlists") {
                container = { totalSize: 1, offset: 0, Metadata: [playlist] };
            } else if (playlistPath && playlistItems.length) {
                container = { totalSize: playlistItems.length, offset: 0, Metadata: playlistItems };
            } else if (childrenPath && folderChildren[childrenPath[1]]) {
                container = { totalSize: folderChildren[childrenPath[1]].length, offset: 0,
                    Metadata: folderChildren[childrenPath[1]] };
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
    async function settle() {
        for (var tick = 0; tick < 12; tick += 1) {
            await new Promise(function (resolve) { setTimeout(resolve, 0); });
        }
    }
    function click(text) {
        var control = Array.from(window.document.querySelectorAll("button")).find(function (button) {
            return button.textContent.trim() === text;
        });
        assert(control, "Missing control: " + text);
        control.click();
    }
    function byId(id) { return window.document.getElementById(id); }
    function layout() {
        var list = byId("item-list");
        assert(list, "the section renders an item list");
        var match = /item-list-layout-([a-z]+)/.exec(list.className);
        return match ? match[1] : null;
    }
    function cardTitles() {
        return Array.from(window.document.querySelectorAll(".media-card")).map(function (card) {
            return card.vemmCard.item.title;
        });
    }
    function status() { return window.document.getElementById("status").textContent; }
    function savedPreferences() {
        return JSON.parse(window.localStorage.getItem("vemm-tizen-preferences") || "{}");
    }
    function callsFor(pathname, query) {
        return calls.filter(function (call) {
            return call.path === pathname && (!query || query(call.query));
        });
    }
    function openLibrary() {
        var control = Array.from(window.document.querySelectorAll(".library-button")).find(function (button) {
            return button.textContent.trim() === "Shows";
        });
        assert(control, "the account header offers the synthetic library");
        control.click();
    }

    try {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();

        openLibrary();
        await settle();
        assert.deepStrictEqual(cardTitles(), ["Harbour Tales", "Lighthouse Docs", "Signal Fires"],
            "the library opens with its titles");
        assert.strictEqual(layout(), "grid", "a library nobody configured still shows the poster grid");
        assert.strictEqual(byId("section-layout").textContent.trim(), "Layout: Grid");

        // Grid -> List -> Summary -> Grid, with the choice written to the saved preferences.
        byId("section-layout").click();
        await settle();
        assert.strictEqual(layout(), "list", "the toggle reflows the section into compact rows");
        assert.strictEqual(byId("section-layout").textContent.trim(), "Layout: List");
        assert.strictEqual(status().indexOf("Layout set to List.") !== -1, true,
            "the status names the layout that was chosen");
        assert.strictEqual(savedPreferences().sectionViews["1"], "list",
            "the layout is stored under this library's key");
        assert.strictEqual(byId("item-list").querySelectorAll(".media-card").length, 3,
            "the reflow keeps every loaded title");
        assert.strictEqual(byId("item-list").querySelector(".card-summary"), null,
            "the list layout does not carry synopsis text");

        byId("section-layout").click();
        await settle();
        assert.strictEqual(layout(), "summary", "the toggle offers a poster-plus-synopsis reading view");
        assert.strictEqual(byId("item-list").querySelector(".card-summary").textContent,
            "A synthetic synopsis about ships and signals.", "the summary layout shows the synopsis");
        assert.strictEqual(byId("item-list").querySelectorAll(".card-summary").length, 2,
            "titles without a synopsis simply leave the line out");

        byId("section-layout").click();
        await settle();
        assert.strictEqual(layout(), "grid", "the toggle wraps back to the poster grid");
        assert.strictEqual(savedPreferences().sectionViews["1"], "grid",
            "the last choice is the one that is stored");

        // A layout chosen for one library is remembered the next time that library opens.
        byId("section-layout").click();
        await settle();
        click("Back to Home");
        await settle();
        openLibrary();
        await settle();
        assert.strictEqual(layout(), "list", "reopening the library keeps the layout it was left in");

        // Browse by folder asks for the section's directory tree, not its flattened titles.
        click("Folders");
        await settle();
        assert.strictEqual(callsFor("/library/sections/1/all", function (query) {
            return query.get("folder") === "1";
        }).length, 1, "the folder view sends the folder parameter");
        assert.deepStrictEqual(cardTitles(), ["In Progress", "Documentaries"], "the folder tree renders");
        var folderCard = Array.from(window.document.querySelectorAll(".media-card")).find(function (card) {
            return card.vemmCard.item.ratingKey === "502";
        });
        folderCard.click();
        await settle();
        assert.strictEqual(callsFor("/library/metadata/502/children").length, 1,
            "a folder drills into its own children");
        assert.deepStrictEqual(cardTitles(), ["Lighthouse Docs", "Signal Fires"],
            "the folder's contents replace the folder list");
        click("Back");
        await settle();
        click("Back");
        await settle();
        assert.strictEqual(layout(), "list", "leaving the folder view keeps the library layout");

        // Playlists come from the server's playlist list and drill into their own items.
        click("Playlists");
        await settle();
        assert.strictEqual(callsFor("/playlists", function (query) {
            return query.get("playlistType") === "show";
        }).length, 1, "the Playlists tab asks for this library's playlist type");
        assert.deepStrictEqual(cardTitles(), ["Sunday Picks"], "the server's playlists render");
        var playlistCard = Array.from(window.document.querySelectorAll(".media-card")).find(function (card) {
            return card.vemmCard.item.type === "playlist";
        });
        playlistCard.click();
        await settle();
        assert.strictEqual(callsFor("/playlists/77/items").length, 1,
            "a playlist opens through its own item endpoint");
        assert.deepStrictEqual(cardTitles(), ["Lighthouse Docs", "Harbour Tales"],
            "the playlist keeps the order the server gave it");

        // The new copy ships translated for both supported languages.
        ["es", "be"].forEach(function (language) {
            window.VemmI18n.setLanguage(language);
            ["Layout: {layout}", "Grid", "List", "Summary", "Layout set to {layout}.", "Folders",
                "Playlists", "Play all", "Shuffle all", "Queue", "Previous episode", "Next episode",
                "Burn in subtitles"].forEach(function (source) {
                assert.notStrictEqual(window.VemmI18n.text(source), source,
                    language + ": " + source + " is translated");
            });
            assert(window.VemmI18n.text("Layout set to {layout}.", { layout: "List" }) !==
                "Layout set to List.", language + ": the layout confirmation is translated");
        });
    } finally { dom.window.close(); }
    console.log("Tizen per-library browse layouts, folders and playlists: passed");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
