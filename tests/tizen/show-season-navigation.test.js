"use strict";
// Show detail season navigation: a horizontal season bar above the action pills, the selected
// season's episode row with a resume cursor, and Back that preserves both cursors.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

var episodeOne = { ratingKey: "141", type: "episode", title: "Arrival", parentRatingKey: "133", parentIndex: 1,
    index: 1, duration: 100000, viewOffset: 100000, viewCount: 1, grandparentTitle: "Synthetic Show" };
var episodeTwo = { ratingKey: "142", type: "episode", title: "Crossing", parentRatingKey: "133", parentIndex: 1,
    index: 2, duration: 100000, viewOffset: 40000, viewCount: 1, grandparentTitle: "Synthetic Show" };
var episodeThree = { ratingKey: "143", type: "episode", title: "Lighthouse", parentRatingKey: "133", parentIndex: 1,
    index: 3, duration: 100000, viewOffset: 70000, grandparentTitle: "Synthetic Show" };
var episodeFive = { ratingKey: "145", type: "episode", title: "Harbour", parentRatingKey: "134", parentIndex: 2,
    index: 5, duration: 100000, viewOffset: 20000, grandparentTitle: "Synthetic Show" };
var episodeSix = { ratingKey: "146", type: "episode", title: "Signal", parentRatingKey: "134", parentIndex: 2,
    index: 6, duration: 100000, grandparentTitle: "Synthetic Show" };
var seasonOne = { ratingKey: "133", type: "season", title: "Season 1", index: 1, seasonNumber: "1",
    parentRatingKey: "132", leafCount: 3, viewedLeafCount: 2 };
var seasonTwo = { ratingKey: "134", type: "season", title: "Season 2", index: 2, seasonNumber: "2",
    parentRatingKey: "132", leafCount: 2, viewedLeafCount: 0 };
var specials = { ratingKey: "135", type: "season", title: "Specials", index: 0, seasonNumber: "0",
    parentRatingKey: "132", leafCount: 0, viewedLeafCount: 0 };
var show = { ratingKey: "132", type: "show", title: "Synthetic Show",
    summary: "A synthetic synopsis for the season journey.", OnDeck: { Metadata: [episodeFive] } };

var children = {
    "132": [seasonOne, seasonTwo, specials],
    "133": [episodeOne, episodeTwo, episodeThree],
    "134": [episodeFive, episodeSix],
    "135": []
};
var metadata = { "132": show, "133": seasonOne, "134": seasonTwo, "135": specials, "141": episodeOne,
    "142": episodeTwo, "143": episodeThree, "145": episodeFive, "146": episodeSix };

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var calls = [];
    window.TextDecoder = TextDecoder;
    window.fetch = function (target, options) {
        var url = new URL(target);
        calls.push(url.pathname);
        var payload;
        if (url.pathname === "/api/v2/home/users") { payload = { users: [] }; }
        else if (url.pathname === "/api/v2/resources") {
            payload = [{ clientIdentifier: "synthetic-server", name: "Synthetic PMS", provides: "server", owned: true,
                accessToken: "synthetic-server-token", connections: [{ uri: "https://pms.synthetic.invalid" }] }];
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
    function key(code) {
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: code, bubbles: true }));
    }
    function press() {
        var target = window.document.activeElement;
        target.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 13, bubbles: true }));
        target.dispatchEvent(new window.KeyboardEvent("keyup", { keyCode: 13, bubbles: true }));
    }
    function choices() {
        return Array.from(window.document.querySelectorAll(".season-bar .season-choice"));
    }
    function cards() { return Array.from(window.document.querySelectorAll(".episode-row .media-card")); }
    function active() { return window.document.activeElement; }
    function choose(text) {
        var control = choices().find(function (button) { return button.textContent.trim() === text; });
        assert(control, "Missing season choice: " + text);
        control.click();
    }
    function showCard() {
        return Array.from(window.document.querySelectorAll(".media-card")).find(function (card) {
            return card.vemmCard && card.vemmCard.item.ratingKey === "132";
        });
    }

    try {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();
        assert(showCard(), "The synthetic show is on Home");
        showCard().click();
        await settle();

        // The season bar renders above the existing action pills, one button per season.
        var bar = choices();
        assert.strictEqual(bar.length, 3, "the season bar renders one button per season");
        assert.deepStrictEqual(bar.map(function (button) { return button.textContent.trim(); }),
            ["Season 1", "Season 2", "Specials"], "season labels, with season 0 as Specials");
        var pills = window.document.querySelector(".detail-actions");
        assert(window.document.querySelector(".season-nav").compareDocumentPosition(pills) &
            window.Node.DOCUMENT_POSITION_FOLLOWING, "the season bar sits above the action pills");
        var current = window.document.querySelector(".season-choice-current");
        assert.strictEqual(current.textContent.trim(), "Season 2",
            "the bar opens on the season holding the next episode");
        assert.strictEqual(current.getAttribute("aria-current"), "true");
        assert.strictEqual(cards().length, 0, "no season is opened before the viewer chooses one");
        assert.strictEqual(calls.filter(function (p) { return p === "/library/metadata/132/children"; }).length, 1,
            "seasons load through the existing children endpoint");

        // Left and right move the bar cursor inside the bar.
        current.focus();
        key(37);
        assert.strictEqual(active().textContent.trim(), "Season 1", "left moves within the season bar");
        key(39);
        assert.strictEqual(active().textContent.trim(), "Season 2", "right moves within the season bar");

        // Selecting a season fills the episode row and focuses the resume position.
        press();
        await settle();
        assert.deepStrictEqual(cards().map(function (card) { return card.vemmCard.item.ratingKey; }),
            ["145", "146"], "the selected season's episodes render in order");
        assert(active().classList.contains("media-card"), "selection moves focus into the episode row");
        assert.strictEqual(active().vemmCard.item.ratingKey, "145",
            "the episode holding the newest resume position gets the initial cursor");
        assert(active().querySelector(".card-progress"), "a partially watched episode shows a progress bar");
        assert.strictEqual(active().querySelector(".card-meta").textContent.trim(), "S2 E5 · Harbour",
            "the episode row shows the episode number and title");
        assert(!window.document.querySelector(".episode-row .card-watched"),
            "an episode nobody has finished carries no watched mark");
        assert.strictEqual(calls.filter(function (p) { return p === "/library/metadata/134/children"; }).length, 1,
            "episodes load only for the season the viewer opened");

        // Down jumps from the bar to the row's selection; Up returns to the bar.
        cards()[1].focus();
        key(38);
        assert.strictEqual(active().textContent.trim(), "Season 2", "up leaves the episode row for the season bar");
        key(40);
        assert.strictEqual(active().vemmCard.item.ratingKey, "146",
            "down returns to the last selected episode (owner request 2026-11-06: selection follows the viewer)");

        // OK opens the focused episode detail; Back keeps both cursors.
        press();
        await settle();
        assert.strictEqual(window.document.querySelector(".detail-title").textContent, "Signal",
            "OK opens the selected episode detail through the same path as the flat listing");
        key(8);
        await settle();
        assert.strictEqual(window.document.querySelector(".season-choice-current").textContent.trim(), "Season 2",
            "Back keeps the chosen season selected");
        assert.deepStrictEqual(cards().map(function (card) { return card.vemmCard.item.ratingKey; }),
            ["145", "146"], "Back repopulates the season's episode row");
        assert.strictEqual(active().vemmCard.item.ratingKey, "146",
            "Back restores the episode selection (owner request 2026-11-06: the selection follows the viewer)");

        // An empty season explains itself instead of rendering a blank row.
        choose("Specials");
        await settle();
        assert.strictEqual(cards().length, 0, "an empty season renders no episode cards");
        assert.strictEqual(window.document.querySelector(".episode-notice").textContent.trim(),
            "No episodes in this season yet.", "an empty season shows explicit help text");
        assert.strictEqual(active().textContent.trim(), "Specials",
            "focus stays on the season when there is nothing to open");

        // A partly watched season marks finished episodes and resumes the newest position.
        choose("Season 1");
        await settle();
        assert.deepStrictEqual(cards().map(function (card) { return card.vemmCard.item.ratingKey; }),
            ["141", "142", "143"], "the first season's episodes render");
        assert.strictEqual(active().vemmCard.item.ratingKey, "143",
            "the newest resume position gets the initial cursor");
        assert.strictEqual(window.document.querySelectorAll(".episode-row .card-watched").length, 2,
            "fully watched episodes carry a watched mark");
        assert.strictEqual(active().querySelector(".card-progress-fill").style.width, "70%",
            "the progress bar reflects the stored resume offset");
        assert.strictEqual(window.document.querySelector(".episode-notice").hidden, true,
            "help text hides again once a season has episodes");

        // Back to Home, then a fresh open keeps the untouched detail focus behaviour.
        key(8);
        await settle();
        assert(showCard(), "Back from the show detail returns Home");
        showCard().click();
        await settle();
        assert.strictEqual(active().textContent.trim(), "Read more",
            "a fresh show detail still focuses its first control");
        assert.strictEqual(window.document.querySelector(".season-choice-current").textContent.trim(), "Season 2",
            "a reopened show reselects the season holding the next episode");
        assert.strictEqual(calls.filter(function (p) { return p === "/library/metadata/134/children"; }).length, 3,
            "a reopened show reloads only the selected season (plus the one load the opened " +
            "Signal episode detail makes for its own season strip)");
        assert(!calls.some(function (p) { return /\/viewstate|\/played|\/unplayed|\/playedInTranscode|\/scrobble/.test(p); }),
            "browsing seasons never writes watch state");

        // The new season copy ships translated for both supported languages.
        ["es", "be"].forEach(function (language) {
            window.VemmI18n.setLanguage(language);
            assert.notStrictEqual(window.VemmI18n.text("Season {number}", { number: 1 }), "Season 1",
                "season labels are translated");
            assert.notStrictEqual(window.VemmI18n.text("No episodes in this season yet."),
                "No episodes in this season yet.", "the empty-season help text is translated");
        });
    } finally { dom.window.close(); }
    console.log("Tizen show season navigation: passed");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
