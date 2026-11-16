"use strict";

var assert = require("assert");
var createClient = require("../../samsung/Vemm/js/plex-api.js").createClient;

function response(status, payload) {
    return {
        status: status,
        ok: status >= 200 && status < 300,
        json: function () {
            return Promise.resolve(payload);
        }
    };
}

function run() {
    var calls = [];
    var client = createClient({
        baseUrl: "http://localhost:32400/",
        token: "synthetic-test-token",
        fetch: function (url, options) {
            calls.push({ url: url, options: options });
            if (url === "http://localhost:32400/library/sections") {
                return Promise.resolve(response(200, {
                    MediaContainer: {
                        size: 1,
                        Directory: [{ key: "1", title: "Movies", type: "movie" }]
                    }
                }));
            }
            if (url.indexOf("/hubs/promoted") !== -1) {
                return Promise.resolve(response(200, {
                    MediaContainer: {
                        size: 1,
                        Hub: [{ title: "Continue Watching", Metadata: [] }]
                    }
                }));
            }
            return Promise.resolve(response(200, {
                MediaContainer: {
                    offset: 0,
                    totalSize: 51,
                    Metadata: [{ ratingKey: "10", title: "Movie" }]
                }
            }));
        }
    });

    return client.getSections().then(function (sections) {
        assert.strictEqual(sections.length, 1);
        assert.strictEqual(sections[0].key, "1");
        assert.strictEqual(calls[0].options.headers["X-Plex-Token"], "synthetic-test-token");
        assert.strictEqual(calls[0].options.headers.Accept, "application/json");
        assert.strictEqual(calls[0].url.indexOf("synthetic-test-token"), -1);
        return client.getHomeHubs();
    }).then(function (hubs) {
        assert.strictEqual(hubs[0].title, "Continue Watching");
        return client.getSectionItems("1", 0, 50);
    }).then(function (page) {
        assert.strictEqual(page.items[0].ratingKey, "10");
        assert.strictEqual(page.totalSize, 51);
        assert.strictEqual(calls[calls.length - 1].url,
            "http://localhost:32400/library/sections/1/all?X-Plex-Container-Start=0&X-Plex-Container-Size=50");
        return client.getMetadata("10").then(function () {
            assert(new URL(calls[calls.length - 1].url).searchParams.get("includeOnDeck") === "1",
                "Show detail must request the server-selected episode");
        }).then(function () {
            return client.getSectionItems("../identity", 0, 50);
        }).then(function () {
            assert.fail("invalid section key should reject");
        }, function (error) {
            assert.match(error.message, /section key is invalid/);
        });
    }).then(function () {
        var failingClient = createClient({
            baseUrl: "https://pms.example.invalid",
            token: "synthetic-test-token",
            fetch: function () {
                return Promise.resolve(response(401, { error: "Unauthorized" }));
            }
        });
        return failingClient.getSections().then(function () {
            assert.fail("HTTP failure should reject");
        }, function (error) {
            assert.match(error.message, /HTTP 401/);
            assert.strictEqual(error.message.indexOf("synthetic-test-token"), -1);
        });
    }).then(function () {
        assert.throws(function () {
            createClient({
                baseUrl: "https://user:password@pms.example.invalid",
                fetch: function () {}
            });
        }, /PMS origin/);
    }).then(function () {
        // Trailer/extra asset keys from some servers already carry a query string
        // (e.g. /services/iva/assets/314904/video.mp4?fmt=4&bitrate=5000). streamUrl
        // must accept them and join its own params with & — the strict localPath
        // rejected the "?" and trailers failed before playback (owner report
        // 2026-11-05: "Plex returned an invalid local resource path").
        var trailerUrl = client.streamUrl("/services/iva/assets/314904/video.mp4?fmt=4&bitrate=5000", {});
        assert.ok(trailerUrl.indexOf("?fmt=4&bitrate=5000&X-Plex") !== -1,
            "existing query keeps its ? and client params are appended with &");
        assert.ok(trailerUrl.indexOf("video.mp4?fmt=4&bitrate=5000&X-Plex") !== -1,
            "trailer key keeps its query and client params follow");
        assert.ok(trailerUrl.indexOf("X-Plex-Token=synthetic-test-token") !== -1,
            "trailer key is served with the token appended");
        assert.strictEqual(trailerUrl.indexOf("?fmt=4&bitrate=5000?"), -1,
            "the URL must not contain a second ? separator");
        ["/services/../secret", "//evil.example/path", "http://evil.example/path",
            "/services/a\\b.mp4", "/services/a#frag.mp4", "/services/a\r\nb.mp4"].forEach(function (bad) {
            assert.throws(function () { client.streamUrl(bad, {}); }, /invalid local resource path/,
                "unsafe stream path must still be rejected: " + bad);
        });
        assert.throws(function () { client.streamUrl("/services/a?b#frag", {}); },
            /invalid local resource path/, "a fragment in the query must be rejected");
        // Theme songs arrive as show extras; PMS ignores the type filter, so the client
        // must pick the subtype "opening" entry and ignore trailers. (Owner request
        // 2026-11-06: theme music on show pages, default on.)
        var themeCalls = [];
        var themeClient = createClient({
            baseUrl: "http://localhost:32400/",
            token: "synthetic-test-token",
            fetch: function (url, options) {
                themeCalls.push(url);
                if (url.indexOf("/library/metadata/55/extras") !== -1) {
                    return Promise.resolve(response(200, {
                        MediaContainer: { Metadata: [
                            { ratingKey: "900", type: "movie", subtype: "trailer", title: "Teaser",
                                Media: [{ Part: [{ key: "/services/iva/assets/900/video.mp4?fmt=4&bitrate=5000" }] }] },
                            { ratingKey: "901", type: "theme", subtype: "opening", title: "Theme Song", duration: 62,
                                Media: [{ Part: [{ key: "/services/iva/assets/901/audio.mp3" }] }] }
                        ] }
                    }));
                }
                if (url.indexOf("/library/metadata/56/extras") !== -1) {
                    return Promise.resolve(response(200, { MediaContainer: { Metadata: [] } }));
                }
                return Promise.resolve(response(200, { MediaContainer: { Metadata: [] } }));
            }
        });
        return themeClient.themeSong(55).then(function (song) {
            assert.ok(song, "the opening extra is returned as the theme song");
            assert.strictEqual(song.ratingKey, "901", "trailers must not be mistaken for the theme song");
            assert.strictEqual(song.duration, 62);
            assert.ok(song.url.indexOf("/services/iva/assets/901/audio.mp3") !== -1,
                "the theme song URL is built from the part key");
            assert.ok(song.url.indexOf("X-Plex-Token=synthetic-test-token") !== -1,
                "the theme song URL carries the token");
            assert.strictEqual(themeCalls[0].indexOf("/library/metadata/55/extras") !== -1, true,
                "theme songs are read from the show extras endpoint");
            return themeClient.themeSong(56);
        }).then(function (missing) {
            assert.strictEqual(missing, null, "a show without a theme song resolves to null");
            console.log("Tizen Plex API tests: passed");
        });
    });
}

run().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
