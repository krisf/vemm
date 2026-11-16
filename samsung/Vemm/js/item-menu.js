(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmItemMenu = api; }
}(this, function () {
    "use strict";
    // Card context menu rows, in the LG client's order (rust-modules/screens/src/item_menu.rs):
    // play first, navigation, watched state, play from start, and Remove from Continue Watching
    // last and only on a Continue Watching card. Writes are never the first row.
    var leaves = ["movie", "episode", "clip"];
    var watchable = ["movie", "episode", "show", "season"];

    function rows(item, options) {
        options = options || {};
        if (!item || !item.ratingKey) { return []; }
        var type = item.type;
        var leaf = leaves.indexOf(type) !== -1;
        var list = [];
        if (leaf || type === "show" || type === "season") {
            var onDeck = item.OnDeck && item.OnDeck.Metadata;
            if (Array.isArray(onDeck)) { onDeck = onDeck[0]; }
            list.push({ id: "play", label: item.viewOffset || (type === "show" && onDeck && onDeck.viewOffset) ?
                "Resume" : "Play" });
        }
        // OK on an ordinary card, or on a Continue Watching card in "details" mode, already opens
        // the page; the row is only useful when OK plays.
        if (options.deck && options.continueAction === "play") { list.push({ id: "details", label: "Go to details" }); }
        if (type === "episode" && item.grandparentRatingKey) { list.push({ id: "show", label: "Go to show" }); }
        if (type === "episode" && item.parentRatingKey) { list.push({ id: "season", label: "Go to season" }); }
        // UIFLOW3 B10 (G58): a track mirrors the episode's parent rows — artist and album
        // by rating key, no extra request; rows without their key are simply absent.
        if (type === "track" && item.grandparentRatingKey) { list.push({ id: "artist", label: "Go to artist" }); }
        if (type === "track" && item.parentRatingKey) { list.push({ id: "album", label: "Go to album" }); }
        // UIF-P3 (STATE-DIFF rank 10): queue rows join the hold menu on playable leaves —
        // the same types playableLeaves() will enqueue. They only edit this run's local
        // queue — never a server write, so no confirm screen. Music keeps the LG-parity
        // card menu (the now-playing surface owns the audio queue).
        if (leaves.indexOf(type) !== -1 && validRatingKey(item.ratingKey)) {
            list.push({ id: "queue-next", label: "Play Next" });
            list.push({ id: "queue-add", label: "Add to Queue" });
        }
        if (watchable.indexOf(type) !== -1) {
            var partial = !!item.viewOffset || (item.viewedLeafCount > 0 && item.viewedLeafCount < item.leafCount);
            var watched = !!item.viewCount || (item.leafCount > 0 && item.viewedLeafCount === item.leafCount);
            if (!watched || partial) { list.push({ id: "watched", label: "Mark watched" }); }
            if (watched || partial) { list.push({ id: "unwatched", label: "Mark unwatched" }); }
        }
        // UIF-P2: rating is available on any playable card or show, whether or not the viewer
        // has already rated it (the panel shows the current value).
        if (["movie", "episode", "show"].indexOf(type) !== -1) { list.push({ id: "rate", label: "Rate" }); }
        if (leaf && item.viewOffset) { list.push({ id: "start", label: "Play from beginning" }); }
        if (options.deck && (type === "movie" || type === "episode")) {
            list.push({ id: "remove", label: "Remove from Continue Watching" });
        }
        return list;
    }

    function isDeckHub(hub) {
        var id = String(hub && (hub.hubIdentifier || hub.context || "") || "").toLowerCase();
        return id.indexOf("continue") !== -1 || id.indexOf("ondeck") !== -1;
    }

    function validRatingKey(value) {
        return /^[0-9]+$/.test(String(value || ""));
    }

    function playableEpisode(item) {
        return item && item.type === "episode" && validRatingKey(item.ratingKey);
    }

    function playTarget(item, client) {
        if (!item || !validRatingKey(item.ratingKey)) {
            return Promise.reject(new Error("Plex returned an invalid media identifier."));
        }
        if (item.type === "show") {
            var onDeck = item.OnDeck && item.OnDeck.Metadata;
            if (Array.isArray(onDeck)) { onDeck = onDeck[0]; }
            if (playableEpisode(onDeck)) { return Promise.resolve(onDeck); }
            if (!client || typeof client.getFirstEpisode !== "function") {
                return Promise.reject(new Error("The first episode of this show could not be loaded."));
            }
            return client.getFirstEpisode(item.ratingKey).then(function (episode) {
                if (!playableEpisode(episode)) { throw new Error("Plex did not return a playable episode."); }
                return episode;
            });
        }
        if (item.type === "season") {
            if (!client || typeof client.getChildren !== "function") {
                return Promise.reject(new Error("Episodes in this season could not be loaded."));
            }
            return client.getChildren(item.ratingKey, 0).then(function (container) {
                var episodes = container && container.Metadata;
                if (!Array.isArray(episodes)) { throw new Error("Plex returned an invalid episode list."); }
                for (var i = 0; i < episodes.length; i += 1) {
                    if (playableEpisode(episodes[i])) { return episodes[i]; }
                }
                throw new Error("This season has no available episodes.");
            });
        }
        return Promise.resolve(item);
    }

    // UIFLOW3 A2: every valid trailer extra, in library order — the cinema-trailer chain
    // plays up to two of them. trailerFor keeps returning the first one.
    function trailersFor(item) {
        if (!item || (item.type !== "movie" && item.type !== "show")) { return []; }
        var extras = item.Extras && item.Extras.Metadata;
        if (!Array.isArray(extras)) { return []; }
        var found = [];
        for (var i = 0; i < extras.length; i += 1) {
            var extra = extras[i];
            var media = extra && extra.Media && extra.Media[0];
            var part = media && media.Part && media.Part[0];
            var partKey = part && part.key;
            var isTrailer = extra && extra.type === "clip" &&
                (extra.subtype === "trailer" || Number(extra.extraType) === 1);
            if (isTrailer && validRatingKey(extra.ratingKey) && typeof partKey === "string" &&
                    partKey.charAt(0) === "/" && partKey.charAt(1) !== "/" &&
                    !/[\\?#\r\n]/.test(partKey) && partKey.indexOf("..") === -1) {
                found.push(extra);
            }
        }
        return found;
    }

    function trailerFor(item) {
        return trailersFor(item)[0] || null;
    }

    return { rows: rows, isDeckHub: isDeckHub, playTarget: playTarget,
        trailerFor: trailerFor, trailersFor: trailersFor };
}));
