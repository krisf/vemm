"use strict";
// Season view filters, sort and the bulk mark-watched confirmation screen. The filter and the
// sort are server-side query parameters on the children request, and every bulk watch-state
// write stays behind an explicit confirmation screen.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

// addedAt drives the synthetic server's sort so the test can tell a server sort from a
// client-side re-order.
var episodeOne = { ratingKey: "141", type: "episode", title: "Arrival", parentRatingKey: "133", parentIndex: 1,
    index: 1, duration: 100000, viewCount: 1, addedAt: 300, grandparentTitle: "Synthetic Show" };
var episodeTwo = { ratingKey: "142", type: "episode", title: "Crossing", parentRatingKey: "133", parentIndex: 1,
    index: 2, duration: 100000, viewCount: 1, addedAt: 200, grandparentTitle: "Synthetic Show" };
var episodeThree = { ratingKey: "143", type: "episode", title: "Lighthouse", parentRatingKey: "133", parentIndex: 1,
    index: 3, duration: 100000, addedAt: 100, grandparentTitle: "Synthetic Show" };
var episodeFive = { ratingKey: "145", type: "episode", title: "Harbour", parentRatingKey: "134", parentIndex: 2,
    index: 5, duration: 100000, viewOffset: 20000, addedAt: 500, grandparentTitle: "Synthetic Show" };
var episodeSix = { ratingKey: "146", type: "episode", title: "Signal", parentRatingKey: "134", parentIndex: 2,
    index: 6, duration: 100000, addedAt: 400, grandparentTitle: "Synthetic Show" };
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
        calls.push({ path: url.pathname, query: url.searchParams });
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
                // The synthetic server honours the same parameters the app sends.
                var items = children[childrenPath[1]].slice();
                if (url.searchParams.get("includeNotWatched") === "1") {
                    items = items.filter(function (item) { return !item.viewCount; });
                }
                var sort = url.searchParams.get("sort");
                if (sort === "addedAt:desc") { items.sort(function (a, b) { return b.addedAt - a.addedAt; }); }
                else if (sort === "addedAt:asc") { items.sort(function (a, b) { return a.addedAt - b.addedAt; }); }
                else if (sort) { throw new Error("Unexpected sort: " + sort); }
                container = { totalSize: items.length, Metadata: items };
            } else if (url.pathname === "/:/scrobble" || url.pathname === "/:/unscrobble") {
                container = {};
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
    function press(target) {
        var node = target || window.document.activeElement;
        node.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 13, bubbles: true }));
        node.dispatchEvent(new window.KeyboardEvent("keyup", { keyCode: 13, bubbles: true }));
    }
    function hold(target) {
        target.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 13, bubbles: true }));
        return new Promise(function (resolve) { setTimeout(resolve, 750); });
    }
    function choices() {
        return Array.from(window.document.querySelectorAll(".season-bar .season-choice"));
    }
    function tools() {
        return Array.from(window.document.querySelectorAll(".season-tools .season-tool"));
    }
    function tool(kind) { return window.document.querySelector(".season-tool-" + kind); }
    function cards() { return Array.from(window.document.querySelectorAll(".episode-row .media-card")); }
    function cardKeys() { return cards().map(function (card) { return card.vemmCard.item.ratingKey; }); }
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
    function callsFor(pathname) { return calls.filter(function (call) { return call.path === pathname; }); }
    function lastQuery(pathname) {
        var found = callsFor(pathname);
        assert(found.length, "No request for " + pathname);
        return found[found.length - 1].query;
    }
    function screenText() { return window.document.getElementById("screen").textContent; }

    try {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();
        assert(showCard(), "The synthetic show is on Home");
        showCard().click();
        await settle();

        // The filter and sort row sits inside the season bar, so bar traversal reaches it.
        assert(window.document.querySelector(".season-bar .season-tools"),
            "the filter row lives inside the season bar");
        assert.strictEqual(tools().length, 2, "filter and sort show before a season is opened");
        assert.strictEqual(tool("filter").textContent.trim(), "All episodes");
        assert.strictEqual(tool("filter").getAttribute("aria-pressed"), "false");
        assert.strictEqual(tool("sort").textContent.trim(), "Server order");
        assert(!tool("bulk"), "no bulk action before a season is selected");

        // Opening a season adds the bulk pill for that season.
        choose("Season 1");
        await settle();
        assert.deepStrictEqual(cardKeys(), ["141", "142", "143"], "a season opens with its episodes");
        assert.strictEqual(tool("bulk").textContent.trim(), "Mark season watched",
            "a partly watched season offers to mark itself watched");

        // The unwatched filter is a server parameter, not a client-side trim.
        tool("filter").click();
        await settle();
        assert.strictEqual(tool("filter").textContent.trim(), "Unwatched only");
        assert.strictEqual(tool("filter").getAttribute("aria-pressed"), "true");
        assert.strictEqual(lastQuery("/library/metadata/133/children").get("includeNotWatched"), "1",
            "the filter is sent to the server");
        assert.deepStrictEqual(cardKeys(), ["143"], "only unwatched episodes render");
        tool("filter").click();
        await settle();
        assert.strictEqual(tool("filter").getAttribute("aria-pressed"), "false");
        assert.strictEqual(lastQuery("/library/metadata/133/children").get("includeNotWatched"), null,
            "clearing the filter stops asking for unwatched only");
        assert.deepStrictEqual(cardKeys(), ["141", "142", "143"], "the full episode set returns");

        // Sort cycles through server order, newest and oldest, again as a server parameter.
        tool("sort").click();
        await settle();
        assert.strictEqual(tool("sort").textContent.trim(), "Newest first");
        assert.strictEqual(lastQuery("/library/metadata/133/children").get("sort"), "addedAt:desc");
        assert.deepStrictEqual(cardKeys(), ["141", "142", "143"], "newest first follows the server order");
        tool("sort").click();
        await settle();
        assert.strictEqual(tool("sort").textContent.trim(), "Oldest first");
        assert.strictEqual(lastQuery("/library/metadata/133/children").get("sort"), "addedAt:asc");
        assert.deepStrictEqual(cardKeys(), ["143", "142", "141"], "oldest first reorders the row");
        tool("sort").click();
        await settle();
        assert.strictEqual(tool("sort").textContent.trim(), "Server order");
        assert.strictEqual(lastQuery("/library/metadata/133/children").get("sort"), null,
            "server order sends no sort parameter");

        // Left and right walk the bar's controls, so the chips are reachable from the pills.
        choices()[2].focus();
        key(39);
        assert.strictEqual(active(), tool("filter"), "right leaves the season pills for the filter chip");
        key(39);
        assert.strictEqual(active(), tool("sort"), "right moves to the sort chip");
        key(37);
        assert.strictEqual(active(), tool("filter"), "left moves back inside the chip row");
        key(37);
        assert.strictEqual(active(), choices()[2], "left leaves the chip row for the season pills");
        key(40);
        assert(cards().length && active().classList.contains("media-card"),
            "down from the chips reaches the episode row");

        // The bulk pill opens an explicit confirmation screen naming the episode count.
        assert.strictEqual(callsFor("/:/scrobble").length, 0,
            "nothing is written before the viewer confirms");
        tool("bulk").click();
        await settle();
        assert(window.document.getElementById("screen").className.indexOf("screen-confirmation") !== -1,
            "the bulk action opens its own confirmation screen");
        assert(screenText().indexOf("Season 1") !== -1, "the screen names the season being changed");
        assert(screenText().indexOf("3 episodes are affected.") !== -1,
            "the screen says how many episodes the change covers");
        assert(screenText().indexOf("This changes every episode in this show or season.") !== -1,
            "the screen repeats that the change is not limited to one episode");
        click("Cancel");
        await settle();
        assert.strictEqual(callsFor("/:/scrobble").length, 0,
            "cancelling writes nothing");
        assert.strictEqual(window.document.getElementById("screen").className.indexOf("screen-detail") !== -1,
            true, "cancel returns to the show detail");

        // Confirming sends exactly one season-level request.
        tool("bulk").click();
        await settle();
        click("Confirm mark watched");
        await settle();
        var scrobbles = callsFor("/:/scrobble");
        assert.strictEqual(scrobbles.length, 1, "one season-level request marks the whole season");
        assert.strictEqual(scrobbles[0].query.get("key"), "133");
        assert.strictEqual(scrobbles[0].query.get("identifier"), "com.plexapp.plugins.library");
        assert.strictEqual(callsFor("/:/unscrobble").length, 0);
        assert(scrobbles.every(function (call) { return call.query.get("key") === "133"; }),
            "episodes are never written one by one");
        assert.strictEqual(window.document.querySelector(".season-choice-current").textContent.trim(),
            "Season 1", "the season stays selected after the write");

        // Held OK on a season choice is the same bulk shortcut, still behind confirmation.
        var second = choices().find(function (button) { return button.textContent.trim() === "Season 2"; });
        second.focus();
        await hold(second);
        assert(window.document.getElementById("screen").className.indexOf("screen-confirmation") !== -1,
            "a held OK opens the confirmation screen instead of opening the season");
        assert(screenText().indexOf("Season 2") !== -1, "the held season is the one being changed");
        assert(screenText().indexOf("2 episodes are affected.") !== -1,
            "the count comes from the season metadata");
        assert.strictEqual(callsFor("/:/scrobble").length, 1,
            "the held shortcut writes nothing until it is confirmed");
        click("Cancel");
        await settle();

        // A short press still opens the season rather than the confirmation screen.
        var third = choices().find(function (button) { return button.textContent.trim() === "Specials"; });
        third.focus();
        press(third);
        await settle();
        assert(window.document.getElementById("screen").className.indexOf("screen-confirmation") === -1,
            "a short press opens the season");
        assert.strictEqual(window.document.querySelector(".episode-notice").hidden, false,
            "the empty season still explains itself");

        // The new copy ships translated for both supported languages.
        ["es", "be"].forEach(function (language) {
            window.VemmI18n.setLanguage(language);
            ["All episodes", "Unwatched only", "Server order", "Newest first", "Oldest first",
                "Sort episodes", "Mark season watched", "Mark season unwatched"].forEach(function (source) {
                assert.notStrictEqual(window.VemmI18n.text(source), source,
                    language + ": " + source + " is translated");
            });
            assert.notStrictEqual(window.VemmI18n.text("{count} episodes are affected.", { count: 3 }),
                "{count} episodes are affected.", language + ": the count line is translated");
            assert(window.VemmI18n.text("{count} episodes are affected.", { count: 3 }).indexOf("3") !== -1,
                language + ": the count line keeps the number");
        });
    } finally { dom.window.close(); }
    console.log("Tizen season view filters: passed");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
