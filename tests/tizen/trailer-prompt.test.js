"use strict";
// The trailer offer on a movie detail page. It appears after a few idle seconds, restarts its
// timer on any key press, dismisses with Back or "Not now", and never survives the view that
// armed it. Timers are driven by a queue so the test never waits in real time.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");

function streamPart(id, key, duration) {
    return { id: id, key: key, duration: duration,
        Stream: [{ id: id + 1, streamType: 1, codec: "h264", displayTitle: "1080p" },
            { id: id + 2, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English", codec: "aac" }] };
}
var trailer = { ratingKey: "201", type: "clip", subtype: "trailer", extraType: 1, title: "Synthetic Trailer",
    duration: 90000, Media: [{ container: "mp4", bitrate: 4000, Part: [streamPart(9001, "/library/parts/201/stream", 90000)] }] };
var movie = { ratingKey: "200", type: "movie", title: "Synthetic Film",
    summary: "A synthetic film used to test the trailer offer.", duration: 6000000,
    Media: [{ container: "mp4", bitrate: 8000, Part: [streamPart(9000, "/library/parts/200/stream", 6000000)] }],
    Extras: { Metadata: [trailer] } };
var quietMovie = { ratingKey: "202", type: "movie", title: "Quiet Film",
    summary: "A synthetic film with no trailer attached.", duration: 6000000,
    Media: [{ container: "mp4", bitrate: 8000, Part: [streamPart(9002, "/library/parts/202/stream", 6000000)] }] };
var metadata = { "200": movie, "201": trailer, "202": quietMovie };

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var calls = [];
    window.TextDecoder = TextDecoder;
    window.fetch = function (target, options) {
        var url = new URL(target);
        calls.push({ path: url.pathname, method: (options || {}).method || "GET" });
        var payload;
        if (url.pathname === "/api/v2/home/users") { payload = { users: [] }; }
        else if (url.pathname === "/api/v2/resources") {
            payload = [{ clientIdentifier: "synthetic-server", name: "Synthetic PMS", provides: "server", owned: true,
                accessToken: "synthetic-server-token", connections: [{ uri: "https://pms.synthetic.invalid" }] }];
        } else if (url.pathname === "/playQueue/video") {
            payload = { MediaContainer: { items: [], playQueueID: "synthetic-queue" } };
        } else {
            var container;
            if (url.pathname === "/identity") { container = { machineIdentifier: "synthetic-server" }; }
            else if (url.pathname === "/library/sections") {
                container = { Directory: [{ key: "1", type: "movie", title: "Movies" }] };
            } else if (url.pathname === "/hubs/promoted") {
                container = { Hub: [{ title: "Movies", Metadata: [movie, quietMovie] }] };
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

    // Playback timers are queued so the five second idle window can be advanced on demand.
    var realSetTimeout = window.setTimeout;
    var queue = [];
    var nextTimerId = 1;
    window.setTimeout = function (callback, delay) {
        var id = nextTimerId++;
        queue.push({ id: id, callback: callback, delay: delay || 0, interval: false });
        return id;
    };
    window.clearTimeout = function (id) {
        queue.forEach(function (timer) { if (timer.id === id) { timer.callback = null; } });
    };
    window.setInterval = function (callback, delay) {
        var id = nextTimerId++;
        queue.push({ id: id, callback: callback, delay: delay || 0, interval: true });
        return id;
    };
    window.clearInterval = window.clearTimeout;
    function pending(delay) {
        return queue.filter(function (timer) { return timer.callback && timer.delay === delay; });
    }
    function fire(delay) {
        var fired = 0;
        pending(delay).forEach(function (timer) {
            var callback = timer.callback;
            if (!timer.interval) { timer.callback = null; }
            callback();
            fired += 1;
        });
        return fired;
    }
    async function settle() {
        for (var tick = 0; tick < 12; tick += 1) {
            fire(0);
            await new Promise(function (resolve) { realSetTimeout(resolve, 0); });
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
    function prompt() { return window.document.getElementById("trailer-prompt"); }
    function active() { return window.document.activeElement; }
    function card(ratingKey) {
        return Array.from(window.document.querySelectorAll(".media-card")).find(function (candidate) {
            return candidate.vemmCard && candidate.vemmCard.item.ratingKey === ratingKey;
        });
    }
    function callsFor(pathname) { return calls.filter(function (call) { return call.path === pathname; }); }

    try {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();
        assert(card("200"), "the synthetic film is on Home");

        // Opening a movie detail arms the offer but does not show it.
        card("200").click();
        await settle();
        assert.strictEqual(window.document.getElementById("screen").className.indexOf("screen-detail") !== -1,
            true, "the movie detail opened");
        assert.strictEqual(prompt(), null, "the offer waits instead of interrupting");
        assert.strictEqual(pending(5000).length, 1, "the offer is armed with an idle timer");
        var armedId = pending(5000)[0].id;

        // Any key press restarts the idle window instead of stacking a second timer.
        key(38);
        assert.strictEqual(pending(5000).length, 1, "a key press keeps exactly one idle timer");
        assert.notStrictEqual(pending(5000)[0].id, armedId, "a key press replaces the pending timer");
        assert.strictEqual(prompt(), null, "the offer still waits after the restart");

        // When the idle window lapses the offer appears and takes focus.
        var returnFocus = active();
        assert.strictEqual(fire(5000), 1, "the idle timer fires once");
        assert(prompt(), "the offer appears after the idle window");
        assert.strictEqual(prompt().getAttribute("role"), "dialog", "the offer is announced as a dialog");
        assert.strictEqual(prompt().getAttribute("aria-label"), "Play trailer?", "the offer names itself");
        assert.strictEqual(prompt().querySelector(".trailer-prompt-title").textContent, "Play trailer?",
            "the offer asks before playing anything");
        assert(prompt().querySelector(".trailer-prompt-text").textContent.indexOf("Synthetic Film") !== -1,
            "the offer names the film it belongs to");
        assert.strictEqual(active(), Array.from(prompt().querySelectorAll("button")).find(function (button) {
            return button.textContent.trim() === "Play trailer";
        }), "the offer focuses its own primary choice");

        // Back dismisses it and hands focus back where it came from.
        key(10009);
        assert.strictEqual(prompt(), null, "Back dismisses the offer");
        assert.strictEqual(active(), returnFocus, "Back restores the focus the offer took");
        assert.strictEqual(pending(5000).length, 0, "a dismissed offer does not re-arm itself");

        // "Not now" dismisses it the same way, and the film is not played.
        key(10009);
        await settle();
        assert(card("200"), "Back from the detail returns to Home");
        card("200").click();
        await settle();
        assert.strictEqual(pending(5000).length, 1, "reopening the detail arms the offer again");
        var secondReturnFocus = active();
        fire(5000);
        assert(prompt(), "the offer appears again on the reopened detail");
        click("Not now");
        assert.strictEqual(prompt(), null, "\"Not now\" dismisses the offer");
        assert.strictEqual(active(), secondReturnFocus, "\"Not now\" restores the focus it took");
        assert.strictEqual(callsFor("/library/metadata/201").length, 0,
            "dismissing the offer never loads the trailer");

        // Leaving the view tears the pending offer down, so it cannot appear on another screen.
        key(10009);
        await settle();
        assert.strictEqual(pending(5000).length, 0, "leaving the detail clears the armed timer");
        fire(5000);
        assert.strictEqual(prompt(), null, "a cleared offer never surfaces on the next view");

        // Accepting the offer plays the trailer, not the film.
        card("200").click();
        await settle();
        fire(5000);
        assert(prompt(), "the offer is up before it is accepted");
        click("Play trailer");
        await settle();
        assert.strictEqual(prompt(), null, "accepting the offer closes it");
        assert(callsFor("/library/metadata/201").length >= 1,
            "the trailer is the item playback was asked for");

        // A film with no trailer attached never arms the offer.
        async function goHome() {
            for (var hop = 0; hop < 4 && !card("202"); hop += 1) {
                key(10009);
                await settle();
            }
            assert(card("202"), "Home is reachable again");
        }
        await goHome();
        card("202").click();
        await settle();
        assert.strictEqual(pending(5000).length, 0, "a film without a trailer arms nothing");
        fire(5000);
        assert.strictEqual(prompt(), null, "a film without a trailer never shows the offer");

        // The new copy ships translated for both supported languages.
        ["es", "be"].forEach(function (language) {
            window.VemmI18n.setLanguage(language);
            ["Play trailer?", "Not now", "Play trailer"].forEach(function (source) {
                assert.notStrictEqual(window.VemmI18n.text(source), source,
                    language + ": " + source + " is translated");
            });
            assert.notStrictEqual(window.VemmI18n.text("{title} has a trailer you could watch first.",
                { title: "Synthetic Film" }), "{title} has a trailer you could watch first.",
                language + ": the offer body is translated");
            assert(window.VemmI18n.text("{title} has a trailer you could watch first.",
                { title: "Synthetic Film" }).indexOf("Synthetic Film") !== -1,
                language + ": the offer body keeps the title");
        });
    } finally { dom.window.close(); }
    console.log("Tizen movie detail trailer offer: passed");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
