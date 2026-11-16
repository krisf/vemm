"use strict";
/* Regression for issue #9: in Direct Play, Samsung AVPlay auto-selects an embedded text
 * track and keeps firing onsubtitlechange even after "Subtitles off" (subtitleStreamID=0).
 * The subtitle event handler must drop the cue and silence AVPlay when the current
 * selection has no subtitle. */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/Vemm");
var movie = { ratingKey: "10", type: "movie", title: "Synthetic direct play movie", duration: 100000,
    Media: [{ id: 20, Part: [{ id: 20, key: "/library/parts/20/file.mp4", size: 4000000,
        Stream: [{ streamType: 1, codec: "h264" }, { streamType: 2, codec: "aac" }] }] }] };

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var silentCalls = [];
    var listener = null;
    var state = "NONE";
    window.TextDecoder = TextDecoder;
    window.webapis = { avplay: {
        getState: function () { return state; },
        open: function () { state = "IDLE"; },
        close: function () { state = "NONE"; },
        stop: function () { state = "IDLE"; },
        setDisplayRect: function () {},
        setDisplayMethod: function () {},
        setListener: function (value) { listener = value; },
        prepareAsync: function (success) { state = "READY"; success(); },
        getDuration: function () { return 100000; },
        getCurrentTime: function () { return 0; },
        seekTo: function (target, success) { success(); },
        play: function () { state = "PLAYING"; },
        pause: function () { state = "PAUSED"; },
        getTotalTrackInfo: function () { return [{ type: "AUDIO", index: 0 }]; },
        setSelectTrack: function () {},
        setSilentSubtitle: function (value) { silentCalls.push(value); },
        suspend: function () {},
        restore: function () {}
    } };
    window.fetch = function (target, options) {
        var url = new URL(target);
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
            } else if (url.pathname === "/hubs/promoted") {
                container = { Hub: [{ title: "Movies", Metadata: [movie] }] };
            } else if (url.pathname === "/library/metadata/10") { container = { Metadata: [movie] }; }
            else if (url.pathname === "/playQueues") {
                container = { playQueueID: 1, Metadata: [{ ratingKey: "10", playQueueItemID: 1 }] };
            } else if (url.pathname === "/video/:/transcode/universal/decision") {
                payload = { MediaContainer: { generalDecisionCode: 0, transcodeDecisionCode: 0,
                    Metadata: [{ Media: [{ Part: [{ decision: "directplay",
                        key: "/library/parts/20/file.mp4" }] }] }] } };
                return Promise.resolve({ ok: true, status: 200,
                    json: function () { return Promise.resolve(payload); } });
            } else if (url.pathname === "/library/sections/1/all") { container = { Metadata: [], size: 0 }; }
            else if (/\/:\/timeline/.test(url.pathname)) {
                return Promise.resolve({ ok: true, status: 200,
                    json: function () { return Promise.resolve({ MediaContainer: {} }); } });
            }
            else { throw new Error("Unexpected synthetic request: " + url.pathname); }
            payload = { MediaContainer: container };
        }
        return Promise.resolve({ ok: true, status: 200,
            json: function () { return Promise.resolve(payload); } });
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
        for (var tick = 0; tick < 10; tick += 1) {
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
    try {
        await settle();
        click("Use linked account");
        await settle();
        click("Synthetic PMS (owned)");
        await settle();
        var card = window.document.querySelector(".media-card");
        assert(card, "The synthetic movie must be visible");
        card.click();
        await settle();
        click("Play");
        await settle();
        assert(listener, "Direct Play must reach the native player listener");
        assert.strictEqual(state, "PLAYING", "The native player must be playing");
        listener.onsubtitlechange(3000, "Ghost cue from AVPlay");
        assert.strictEqual(window.document.getElementById("subtitle-text").textContent, "",
            "Subtitles off must not render cues AVPlay auto-selected during Direct Play");
        assert(silentCalls.indexOf(true) !== -1,
            "Subtitles off must silence AVPlay text rendering with setSilentSubtitle(true)");
    } finally { dom.window.close(); }
    console.log("Tizen Direct Play subtitles-off silences AVPlay cues: passed");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
