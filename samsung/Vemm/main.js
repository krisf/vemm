(function () {
    "use strict";

    var screen = document.getElementById("screen");
    var status = document.getElementById("status");
    var currentClient = null;
    var currentServerId = "";
    var holdCard = null;
    var holdTimer = null;
    var currentSection = null;
    var homeSections = [];
    var currentItems = [];
    var currentOffset = 0;
    var viewGeneration = 0;
    var itemsLoading = false;
    var sectionLandingFocus = null;
    var authClient = null;
    var authPin = null;
    var authTimer = null;
    var authExpiryTimer = null;
    var authGeneration = 0;
    var accountToken = "";
    var accountClient = null;
    var activeProfile = null;
    var linkedProfile = null;
    var servers = [];
    var libraryFilters = {};
    var navigation = [];
    var restoreView = null;
    // Owner report 2026-11-07: "the back button sends you back in the UI not
    // necessarily back to season view". While an episode detail is on screen this holds a
    // deterministic path to that episode's season view; every other view leaves it null.
    var detailBack = null;
    var retryView = null;
    var imageGeneration = 0;
    var imageQueue = [];
    var imageActive = 0;
    var imageUrls = [];
    var imageDecodes = [];
    var player = null;
    var playerItem = null;
    var playerClient = null;
    var playerSettings = null;
    // Theme music on show pages (owner request 2026-11-06, default on). It shares the
    // single AVPlay instance with video, so every video start tears it down first.
    var themeMusic = { player: null, showKey: null, generation: 0 };
    // Screen saver (owner request 2026-11-06, default on): after four minutes without a
    // key press the screen goes black and a Vemm mark wanders, briefly visible then
    // faded, so no static pixels stay lit long enough to burn in.
    var screensaver = { el: null, idleTimer: null, fadeTimer: null, wanderTimer: null, visible: false };
    var screensaverIdleMs = 240000;
    var screensaverMoveMs = 25000;
    var themeMusicVolume = 35;
    var lastDetailShow = null;
    var subtitleTimer = null;
    var hudTimer = null;
    var hudBuffering = false;
    var hudFocus = null;
    // Owner report 2026-11-07: the raised Skip pill must be reachable from the remote's
    // arrow keys. onKeyDown and the menu-retract timer live outside the player closure,
    // so the player mirrors its current skip control here (null when no pill is raised).
    var hudSkipControl = null;
    var hudPauseControl = null;
    var scrubReturnFocus = null;
    var playerClosing = false;
    var lastAction = 0;
    var scrubTarget = null;
    var scrubRepeats = 0;
    var scrubTimer = null;
    var scrubOwner = null;
    // Scrub preview thumbnails for the item being played: null until the first scrub asks for
    // them, then { available, rows }. available === false is the documented fallback: the scrub
    // bar and its time label keep working on their own.
    var scrubPreviews = null;
    var scrubPreviewItem = null;
    var progressTimer = null;
    var playerPanel = "";
    var playerPosition = 0;
    var playerDuration = 0;
    // When the last passive "Saved to Plex." toast showed for the current session (UIF-P1).
    var syncToastAt = 0;
    var playerStatsVisible = false;
    var subtitleTiming = false;
    var subtitleTimingRepeats = 0;
    var subtitleTimingDirection = 0;
    var subtitleTimingDetentUntil = 0;
    var upNextGeneration = 0;
    var upNextHandle = null;
    var skipUndo = { position: null, timer: null, applying: false };
    var externalCues = null;
    var playQueue = null;
    var queueLoading = false;
    var queueShuffle = false;
    var queueRepeat = "off";
    var viewCleanup = null;
    var trailerPrompt = { timer: null, item: null, client: null, generation: 0, open: false, returnFocus: null };
    // UIFLOW3 A2: cinema-chain state consumed by the player-end handler. `pending` marks the
    // movie that already ran its trailers so startPlayer does not re-arm the chain forever.
    var cinema = { active: false, item: null, client: null, queue: [], pending: null, current: null };
    // UIFLOW3 A3: timestamp of the last remote key press, for the pass-out idle check.
    var lastRemoteInput = 0;
    var stillWatchingHandle = null;
    // UIFLOW3 A1: per-item pre-play audio/subtitle choices, remembered in memory only.
    var prePlayTracks = {};
    var viewClients = [];
    var suspendedView = null;
    var foregroundRecovery = null;
    var subtitleSearchGeneration = 0;
    var preferences = { quality: "original", nextEpisode: "countdown", language: "en", continueAction: "details",
        skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low", subtitleColor: "white",
        subtitleBackground: "off", subtitleDelayMs: 0, directPlay: "auto",
        autoSkipIntro: "manually", autoSkipCredits: "manually", upNextCountdown: "15",
        cinemaTrailers: "off", passOutProtection: "2", rewindOnResume: "none",
        subtitleBurnIn: "on", sectionViews: {}, enhancedGraphics: false,
        showClock: "off", showEndTime: "off", clockFormat: "24h", watchedIndicators: "all",
        reduceMotion: "off", continueWatchingSize: 12, sectionPills: {} };
    var preferenceError = "";
    var graphics = null;
    var graphicsFailure = false;
    var product = window.VemmProduct || {
        name: "Vemm", pronunciation: "/vem/", tagline: "Your media. At its best.",
        platform: "Samsung Tizen", status: "working brand"
    };
    document.title = product.name;
    var brandName = document.querySelector(".app-header h1");
    var brandTagline = document.querySelector(".app-header p");
    if (brandName) { brandName.textContent = product.name; }
    if (brandTagline) { brandTagline.textContent = product.tagline; }

    function graphicsFallback() {
        graphicsFailure = true;
        setStatus("New graphics enhancements are unavailable here. Existing graphics remain active.", true);
    }

    function clearGraphics() {
        if (graphics) { graphics.clear(); }
    }

    function presentBackdrop(image) {
        if (!preferences.enhancedGraphics || !currentClient || document.hidden ||
                !screen.contains(image) || image.getAttribute("data-artwork-state") !== "loaded") { return; }
        if (!window.VemmGraphics) { graphicsFallback(); return; }
        try {
            if (!graphics) {
                graphics = window.VemmGraphics.create({ document: document, onError: graphicsFallback });
                graphics.setEnabled(true);
            }
            graphics.present(image);
        } catch (error) {
            clearGraphics();
            graphicsFallback();
        }
    }
    function directPlayProfile() {
        if (preferences.directPlay === "off" || !window.VemmCapabilities) { return null; }
        return window.VemmCapabilities.detect({ userAgent: navigator.userAgent,
            productinfo: window.webapis && window.webapis.productinfo,
            avinfo: window.webapis && window.webapis.avinfo });
    }
    function directPlaySummary() {
        if (preferences.directPlay === "off") { return translate("Direct play: {state}", { state: translate("Off") }); }
        var profile = directPlayProfile();
        if (!profile) { return translate("Direct play: {state}", { state: translate("Off") }); }
        var formats = profile.video.join("/").toUpperCase() + ", " + profile.audio.join("/").toUpperCase() + ", " +
            profile.maxWidth + "x" + profile.maxHeight + ", " + translate("up to {fps} fps", { fps: profile.maxFrameRate || 60 }) +
            (profile.hdr === "hdr10" ? ", HDR10/HLG" : "");
        var text = preferences.directPlay === "force" ?
            translate("Direct play: {state}", { state: translate("Force") }) + " (" + formats + "). " +
                translate("The original file is always sent; if this TV cannot decode it, playback stops instead of converting.") :
            translate("Direct play: {state}", { state: translate("Auto") }) + " (" + formats + "). " +
                translate("From Samsung's published media specifications; other formats convert on the server.");
        if (profile.status === "observed" && profile.model) {
            text += " " + translate("Confirmed on this TV model: {model}.", { model: profile.model });
        }
        return text;
    }
    var pendingRestore = null;
    // Home moves vertically with a GPU transform on .home-track instead of scrolling the screen:
    // native scrolling repaints the whole Home on Tizen's older engines (50-150 ms per shelf on a
    // 2017 set), while translate3d is a compositor move (one 16.7 ms frame).
    var homeY = 0;
    if (window.VemmPreferences) {
        try {
            preferences = normalizePreferences(window.VemmPreferences.load(window.localStorage));
            window.VemmI18n.setLanguage(preferences.language);
            applyAppearance();
        } catch (error) { preferenceError = errorText(error); }
    }
    if (typeof window.Promise !== "function" || typeof window.fetch !== "function" ||
            typeof window.URL !== "function" || typeof window.Blob !== "function") {
        status.textContent = "This browser lacks required network or media APIs. Use a supported Samsung runtime.";
        status.className = "status status-error";
        return;
    }
    function translate(text, values) {
        if (window.VemmI18n) { return window.VemmI18n.text(text, values); }
        return String(text).replace(/\{([A-Za-z0-9]+)\}/g, function (match, key) {
            return values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match;
        });
    }

    function errorText(error) {
        return window.VemmI18n && window.VemmI18n.error ? window.VemmI18n.error(error) :
            translate(error && error.message || "Playback failed. Stop and retry.");
    }

    function savePreferences() {
        try {
            window.VemmPreferences.save(window.localStorage, preferences);
            window.VemmI18n.setLanguage(preferences.language);
            applyAppearance();
            syncTopbarClock();
            return true;
        } catch (error) {
            setStatus("Could not save preferences. Check app storage permissions.", true);
            return false;
        }
    }

    // UIFLOW3 B1–B5: validate() only echoes preference keys a stored value carried, so
    // settings saved before Run B load without them; the app fills the fresh-install
    // defaults here instead of growing the persisted shape on every old install.
    function normalizePreferences(loaded) {
        var result = loaded || {};
        var defaults = { showClock: "off", showEndTime: "off", clockFormat: "24h",
            watchedIndicators: "all", reduceMotion: "off", continueWatchingSize: 12,
            sectionPills: {} };
        Object.keys(defaults).forEach(function (name) {
            if (result[name] === undefined) { result[name] = defaults[name]; }
        });
        return result;
    }

    // Appearance lives on the document element so the playback body class ("playing") cannot
    // clear it, and a rejected preference save keeps the last applied look.
    function applyAppearance() {
        var root = document.documentElement;
        if (!root || !root.classList) { return; }
        ["vemm-high-contrast", "vemm-text-large", "vemm-text-xlarge", "vemm-reduce-motion"].forEach(function (name) {
            root.classList.remove(name);
        });
        if (preferences.highContrast === "on") { root.classList.add("vemm-high-contrast"); }
        if (preferences.textScale === "large") { root.classList.add("vemm-text-large"); }
        else if (preferences.textScale === "xlarge") { root.classList.add("vemm-text-xlarge"); }
        // UIFLOW3 B3: the reduce-motion class zeroes every transition and animation.
        if (preferences.reduceMotion === "on") { root.classList.add("vemm-reduce-motion"); }
    }

    // UIFLOW3 B1 (G12/G38): a small HH:MM clock in the topbar, opt-in, on every screen
    // including playback (the header hides while playing; the clock stays visible).
    // ES5 manual formatting — toLocaleTimeString is absent on this engine — and one
    // shared 24h/12h choice. The refresh rides a single 30-second interval that exists
    // only while the setting is on; no timer runs when it is off.
    var clockTimer = null;
    function formatClockTime(now) {
        var minutes = ("0" + now.getMinutes()).slice(-2);
        if (preferences.clockFormat === "12h") {
            var hours = now.getHours();
            var period = hours < 12 ? " AM" : " PM";
            var twelve = hours % 12;
            if (twelve === 0) { twelve = 12; }
            return twelve + ":" + minutes + period;
        }
        return ("0" + now.getHours()).slice(-2) + ":" + minutes;
    }
    function syncTopbarClock() {
        var header = document.querySelector(".app-header");
        if (!header) { return; }
        var clock = header.querySelector(".topbar-clock");
        if (preferences.showClock !== "on") {
            if (clock) { header.removeChild(clock); }
            return;
        }
        if (!clock) {
            clock = element("span", "topbar-clock");
            clock.setAttribute("aria-hidden", "true");
            header.appendChild(clock);
        }
        clock.textContent = formatClockTime(new Date());
    }
    function syncClockTimer() {
        if (preferences.showClock === "on" && clockTimer === null) {
            clockTimer = setInterval(syncTopbarClock, 30000);
        } else if (preferences.showClock !== "on" && clockTimer !== null) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    }

    function visit(action) {
        pendingRestore = null;
        detailBack = null;
        if (restoreView) {
            var controls = Array.prototype.slice.call(screen.querySelectorAll("button, input, select"));
            navigation.push({ restore: restoreView, focus: controls.indexOf(document.activeElement), scroll: screen.scrollTop });
            if (navigation.length > 20) { navigation.shift(); }
        }
        action();
    }

    function backView() {
        if (player) { stopPlayer(); return; }
        if (cancelServerConnection) { cancelServerConnection(); return; }
        if (detailBack) { detailBack(); return; }
        var previous = navigation.pop();
        if (!previous) {
            if (currentClient && screen.className.indexOf("screen-home") === -1) { loadHome(false); return; }
            confirmExit();
            return;
        }
        pendingRestore = previous;
        previous.restore();
    }

    function resetImages() {
        clearGraphics();
        imageGeneration += 1;
        imageQueue = [];
        imageDecodes.slice().forEach(function (cancel) { cancel(); });
        imageUrls.forEach(function (url) { window.URL.revokeObjectURL(url); });
        imageUrls = [];
    }

    function pumpImages() {
        while (imageActive < 3 && imageQueue.length) {
            (function (job) {
                imageActive += 1;
                var failure = "fetch";
                job.node.setAttribute("data-artwork-state", "fetching");
                Promise.resolve().then(function () { return job.client.image(job.path, job.size); }).then(function (blob) {
                    if (job.generation !== imageGeneration) { return; }
                    failure = "size";
                    if (blob.size > (job.maxBytes || 2 * 1024 * 1024)) { throw new Error("Artwork exceeds the image memory limit."); }
                    if (screen.contains && !screen.contains(job.node)) { return; }
                    failure = "decode";
                    job.node.setAttribute("data-artwork-state", "decoding");
                    return new Promise(function (resolve, reject) {
                        var url = window.URL.createObjectURL(blob);
                        imageUrls.push(url);
                        var complete = false;
                        var timer = setTimeout(function () { finish(new Error("Artwork decode timed out.")); }, 5000);
                        function cancel() { finish(); }
                        function finish(error, loaded) {
                            if (complete) { return; }
                            complete = true;
                            clearTimeout(timer);
                            job.node.onload = null;
                            job.node.onerror = null;
                            window.URL.revokeObjectURL(url);
                            imageUrls.splice(imageUrls.indexOf(url), 1);
                            imageDecodes.splice(imageDecodes.indexOf(cancel), 1);
                            if (error) { reject(error); }
                            else {
                                if (loaded && job.generation === imageGeneration) {
                                    job.node.setAttribute("data-artwork-state", "loaded");
                                    if (job.loaded) { job.loaded(); }
                                }
                                resolve();
                            }
                        }
                        imageDecodes.push(cancel);
                        job.node.onload = function () { finish(null, true); };
                        job.node.onerror = function () { finish(new Error("Artwork could not be decoded.")); };
                        job.node.src = url;
                    });
                }).catch(function () {
                    if (job.generation === imageGeneration) {
                        job.node.setAttribute("data-artwork-state", "unavailable");
                        job.node.setAttribute("data-artwork-error", failure);
                        job.node.alt = translate("Artwork unavailable");
                        job.node.src = placeholderArt();
                    }
                }).then(function () { imageActive -= 1; pumpImages(); });
            }(imageQueue.shift()));
        }
    }

    // UIFLOW3 B2 (G37): which item kinds may show the watched checkmark, per the
    // "Show watched indicators" choice. Movies covers movies; TV covers shows and
    // episodes; anything else (clips, tracks, photos) only shows the mark in "all".
    function watchedIndicatorVisible(item) {
        var mode = preferences.watchedIndicators || "all";
        if (mode === "all") { return true; }
        if (mode === "none") { return false; }
        if (mode === "movies") { return item.type === "movie"; }
        if (mode === "tv") { return item.type === "show" || item.type === "episode"; }
        return true;
    }

    // UIFLOW3 B4 (G30/G50): the Continue Watching row length, clamped to the ladder the
    // preferences module ships; anything unexpected falls back to twelve.
    function continueWatchingSize() {
        var sizes = (window.VemmPreferences && window.VemmPreferences.continueWatchingSizes) || [6, 12, 20];
        return sizes.indexOf(preferences.continueWatchingSize) !== -1 ? preferences.continueWatchingSize : 12;
    }

    function card(parent, item, client, siblings, options) {
        options = options || {};
        var node = button(parent, "", function () {
            if (options.deck && preferences.continueAction === "play" &&
                    ["movie", "episode", "clip"].indexOf(item.type) !== -1) {
                playFromCard(item, client, true);
                return;
            }
            visit(function () {
                if (item.type === "photo") {
                    var photos = (siblings || [item]).filter(function (entry) { return entry.type === "photo"; });
                    openPhotos(photos, Math.max(0, photos.indexOf(item)), client);
                } else if (item.type === "season") {
                    openListing(item.parentTitle || item.title, function (offset) {
                        return client.getChildren(item.ratingKey, offset);
                    }, client, 0, null, null, item.parentRatingKey ? { showRatingKey: item.parentRatingKey } : null);
                } else if (item.type === "directory") {
                    openListing(item.title || item.tag || "Untitled", function (offset) {
                        return client.getChildren(item.ratingKey, offset);
                    }, client);
                } else if (item.type === "playlist") {
                    openListing(item.title || item.tag || "Untitled", function (offset) {
                        return client.getPlaylistItems(item.id || item.ratingKey, offset);
                    }, client);
                } else { openDetail(item.ratingKey, client); }
            });
        });
        node.className = "media-card";
        var seriesPoster = options.shelf && item.type === "episode" && (item.grandparentThumb || item.parentThumb);
        node.setAttribute("data-shape", !seriesPoster && ["episode", "clip", "photo"].indexOf(item.type) !== -1 ? "landscape" :
            ["artist", "album", "track"].indexOf(item.type) !== -1 ? "square" : "portrait");
        node.vemmCard = { item: item, client: client, options: options };
        var image = element("img", "poster");
        image.alt = item.title || "Media";
        image.src = placeholderArt();
        node.appendChild(image);
        node.appendChild(element("span", "card-title", seriesPoster ? item.grandparentTitle || item.title :
            item.type === "season" && item.parentTitle ? item.parentTitle + " · " + item.title :
            item.title || item.tag || "Untitled"));
        var episodeNumber = item.type === "episode" && item.parentIndex !== undefined && item.index !== undefined ?
            "S" + item.parentIndex + " E" + item.index : "";
        var remaining = options.shelf && item.viewOffset && item.duration ?
            translate("{minutes} min left", { minutes: Math.max(1, Math.round((item.duration - item.viewOffset) / 60000)) }) : "";
        node.appendChild(element("span", "card-meta", item.type === "episode" ?
            [episodeNumber, item.title, remaining].filter(Boolean).join(" · ") : remaining || String(item.year || "")));
        if (options.layout === "summary" && item.summary) {
            // The summary layout trades the poster wall for one-line synopses.
            node.appendChild(element("span", "card-summary", item.summary));
        }
        // UIFLOW3 B2 (G37): the watched checkmark honours the "Show watched indicators"
        // choice — all, movies only, TV only, or none. The progress bar is untouched.
        if (item.viewCount && watchedIndicatorVisible(item)) {
            var watchedMark = element("span", "card-watched", "✓");
            watchedMark.setAttribute("aria-label", translate("Watched"));
            node.appendChild(watchedMark);
        }
        // UIFLOW3 C3 (G21): an additive cloud-watchlist marker. The join is local to the
        // one home-time watchlist fetch (see fetchWatchlistIndex), never a request per
        // card, and it reads the item's singular guid only — never the Guid[] array.
        // Episodes and every other type never badge.
        if (cardOnWatchlist(item)) {
            var watchlistMark = element("span", "card-watchlist", "⚑");
            watchlistMark.setAttribute("aria-label", translate("On watchlist"));
            node.appendChild(watchlistMark);
        }
        if (item.viewOffset && item.duration) {
            var progress = element("span", "card-progress");
            var fill = element("span", "card-progress-fill");
            if (fill.style) { fill.style.width = Math.min(100, Math.max(0, item.viewOffset * 100 / item.duration)) + "%"; }
            progress.appendChild(fill);
            node.appendChild(progress);
        }
        var shape = node.getAttribute ? node.getAttribute("data-shape") : "portrait";
        queueImage(image, client, seriesPoster || item.thumb || item.art, shape === "landscape" ? { width: 480, height: 270 } :
            shape === "square" ? { width: 360, height: 360 } : { width: 240, height: 360 });
        return node;
    }

    // UIFLOW3 C3 (G21): home watchlist badges. The signed-in account's cloud watchlist
    // is fetched at most once per home load (loadHome rides it on the existing
    // Promise.all) and indexed locally by the singular-guid tail, so every card joins
    // without a request of its own. The index belongs to the exact accountClient it was
    // fetched for: a profile switch (a new or null accountClient) turns badges off
    // immediately via the identity check below, and a successful watchlist write
    // invalidates it so the next home re-reads. A failed fetch is silent, and the badge
    // never blocks home.
    var watchlistBadge = null;
    function invalidateWatchlistIndex() { watchlistBadge = null; }
    function guidTailOf(value) {
        return typeof value === "string" && value && window.PlexApi &&
            typeof window.PlexApi.guidTail === "function" ? String(window.PlexApi.guidTail(value) || "") : "";
    }
    function cardOnWatchlist(item) {
        if (!accountClient || !watchlistBadge || watchlistBadge.client !== accountClient) { return false; }
        if (!item || ["movie", "show"].indexOf(item.type) === -1) { return false; }
        var tail = guidTailOf(item.guid);
        return !!tail && watchlistBadge.index[tail] === true;
    }
    // Watchlist membership is user-scoped cloud data: the read rides the resolved cloud
    // profile (activeProfile/linkedProfile — the same identity the header avatar uses),
    // so a raw token restore whose profile list has not resolved issues no cloud read.
    function cloudProfileReady() { return !!accountClient && !!(activeProfile || linkedProfile); }
    function fetchWatchlistIndex() {
        if (!cloudProfileReady() || typeof accountClient.watchlist !== "function") { return Promise.resolve(null); }
        if (watchlistBadge && watchlistBadge.client === accountClient) { return Promise.resolve(watchlistBadge.index); }
        var linked = accountClient;
        return Promise.resolve(linked.watchlist("all", 0)).then(function (container) {
            var index = {};
            (container && Array.isArray(container.Metadata) ? container.Metadata : []).forEach(function (entry) {
                var tail = entry && guidTailOf(entry.guid);
                if (tail) { index[tail] = true; }
            });
            // The index belongs to the account, not the screen: keep it even if the
            // view moved on, so the next home render needs no second request.
            watchlistBadge = { client: linked, index: index };
            return index;
        }).catch(function () {
            // Silent by design: a missing badge is an affordance lost, not an error.
            return null;
        });
    }

    function queueImage(node, client, path, size, maxBytes, loaded, first) {
        node.setAttribute("data-artwork-error", "");
        var unavailable = !path ? "metadata" :
            !client.image || !window.URL || !window.URL.createObjectURL ? "unsupported" :
            imageQueue.length >= 200 ? "capacity" : null;
        if (unavailable) {
            node.setAttribute("data-artwork-state", "unavailable");
            node.setAttribute("data-artwork-error", unavailable);
            return;
        }
        node.setAttribute("data-artwork-state", "queued");
        var job = { client: client, path: path, node: node, generation: imageGeneration, size: size, maxBytes: maxBytes, loaded: loaded };
        if (first) { imageQueue.unshift(job); } else { imageQueue.push(job); }
        pumpImages();
    }

    function setDetailMode(enabled) {
        var shell = document.querySelector && document.querySelector(".app-shell");
        if (shell) { shell.className = enabled ? "app-shell detail-mode" : "app-shell"; }
    }
    var usingRelay = false;

    function recoverSession(error) {
        if (error.status !== 401 && error.status !== 403) { return false; }
        if (error.scope === "account" && error.status === 401) {
            var deleted = signOut();
            setStatus(translate("{message} {warning}", { message: translate("Your Plex session expired. Sign in again."),
                warning: deleted ? "" : translate("The saved session could not be deleted. Clear this app's data on the TV.") }), true);
            return true;
        }
        if (error.scope === "server" && error.status === 401 && accountClient) {
            currentClient = null;
            openServers("This server's access grant expired. Select a server again; your Plex account is still linked.");
            return true;
        }
        return false;
    }

    function cancelViewRequests() {
        viewClients.forEach(function (client) { client.cancelRequests(); });
        viewClients = [];
        if (currentClient && currentClient.cancelRequests) { currentClient.cancelRequests(); }
        if (accountClient && accountClient.cancelRequests) { accountClient.cancelRequests(); }
    }

    function clear(node) {
        if (node === screen && !player) {
            cancelViewRequests();
        }
        if (node === screen && viewCleanup) {
            var cleanup = viewCleanup;
            viewCleanup = null;
            cleanup();
        }
        if (node === screen) {
            resetImages();
            setDetailMode(false);
            screen.className = "screen";
            screen.scrollTop = 0;
        }
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    function element(tagName, className, text) {
        var node = document.createElement(tagName);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    function page(title, kind) {
        screen.className = "screen screen-" + kind;
        screen.appendChild(element("h2", "page-title", title));
    }

    function group(parent, title, className) {
        var section = element("section", className || "menu-group");
        if (title) { section.appendChild(element("h3", "group-title", title)); }
        parent.appendChild(section);
        return section;
    }

    function placeholderArt() {
        return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='360'%3E%3Crect width='240' height='360' fill='%23222224'/%3E%3Cpath d='M94 156v48l48-24z' fill='%23787880'/%3E%3C/svg%3E";
    }

    function titleTile(parent, item, action, client, caption) {
        var node = button(parent, "", action);
        node.className = "title-tile";
        var art = element("img", "title-tile-art");
        art.alt = "";
        art.src = placeholderArt();
        node.appendChild(art);
        var copy = element("span", "title-tile-copy");
        copy.appendChild(element("span", "title-tile-title", item.title || item.tag || translate("Untitled")));
        if (caption) { copy.appendChild(element("span", "title-tile-caption", caption)); }
        node.appendChild(copy);
        if (client) { queueImage(art, client, item.thumb, { width: 240, height: 360 }); }
        return node;
    }

    function moveHome(y) {
        var track = screen.querySelector(".home-track");
        if (!track) { return false; }
        homeY = Math.max(0, Math.round(y));
        track.style.webkitTransform = track.style.transform = "translate3d(0," + (-homeY) + "px,0)";
        screen.scrollTop = 0;
        return true;
    }

    function revealControl(node) {
        if (!node.getBoundingClientRect) { return; }
        var menuScroll = node.parentNode;
        while (menuScroll && menuScroll !== screen) {
            if (/(?:^| )menu-scroll(?: |$)/.test(menuScroll.className || "")) {
                var rowBounds = node.getBoundingClientRect();
                var scrollBounds = menuScroll.getBoundingClientRect();
                if (rowBounds.top < scrollBounds.top + 4) {
                    menuScroll.scrollTop -= scrollBounds.top + 4 - rowBounds.top;
                } else if (rowBounds.bottom > scrollBounds.bottom - 4) {
                    menuScroll.scrollTop += rowBounds.bottom - scrollBounds.bottom + 4;
                }
                return;
            }
            menuScroll = menuScroll.parentNode;
        }
        var browse = screen.querySelector(".browse-header");
        if (browse && browse.contains(node)) { return; }
        var homeTrack = screen.className.indexOf("screen-home") !== -1 && screen.querySelector(".home-track");
        if (screen.className.indexOf("screen-home") !== -1) {
            if (node.parentNode && /home-feature-actions/.test(node.parentNode.className || "")) {
                screen.className = "screen screen-home";
                if (!moveHome(0)) { screen.scrollTop = 0; }
                return;
            }
            if (node.vemmCard && node.parentNode && /shelf-row/.test(node.parentNode.className || "")) {
                var shelf = node.parentNode.parentNode;
                var shift = shelf.getBoundingClientRect().top - browse.getBoundingClientRect().bottom - 12;
                if (homeTrack) { moveHome(homeY + shift); }
                else { screen.scrollTop += shift; }
                screen.className = "screen screen-home shelves-focused";
            }
        }
        var parent = node.parentNode;
        while (parent) {
            if (parent === screen || /(?:shelf-row|home-navigation|player-menu|season-bar|episode-row)/.test(parent.className || "")) {
                var item = node.getBoundingClientRect();
                var bounds = parent.getBoundingClientRect();
                var top = bounds.top + 8;
                var header = screen.querySelector(".browse-header");
                if (parent === screen && header && !header.contains(node)) {
                    top = Math.max(top, header.getBoundingClientRect().bottom + 12);
                }
                if (item.left < bounds.left + 8) { parent.scrollLeft -= bounds.left + 8 - item.left; }
                else if (item.right > bounds.right - 8) { parent.scrollLeft += item.right - bounds.right + 8; }
                if (parent === screen && homeTrack) {
                    // Home's vertical position belongs to moveHome; scrolling would reintroduce the repaint.
                    if (item.top < top) { moveHome(homeY - (top - item.top)); }
                    else if (item.bottom > bounds.bottom - 8) { moveHome(homeY + item.bottom - bounds.bottom + 8); }
                } else if (item.top < top) { parent.scrollTop -= top - item.top; }
                else if (item.bottom > bounds.bottom - 8) { parent.scrollTop += item.bottom - bounds.bottom + 8; }
            }
            if (parent === screen) { break; }
            parent = parent.parentNode;
        }
    }

    function setStatus(message, isError) {
        var retry = Array.prototype.filter.call(screen.querySelectorAll("button"), function (control) {
            return /(?:^| )route-retry(?: |$)/.test(control.className);
        })[0];
        if (retry && retry.parentNode && !isError) { retry.parentNode.removeChild(retry); }
        if (isError && !player && retryView && !retry) {
            var retryAction = retryView;
            button(screen, "Retry", retryAction).className += " route-retry";
        }
        status.textContent = translate(message || "");
        status.className = isError ? "status status-error" : "status";
        if (isError && player) { showHud(); cancelHudTimer(); }
    }

    // A loading placeholder holds focus without consuming a pending Back restore, which belongs
    // to the controls the view renders once its data arrives.
    function focusLoading() {
        if (!pendingRestore) { focusFirst(); return; }
        var controls = screen.querySelectorAll("button, input, select");
        for (var i = 0; i < controls.length; i += 1) {
            if (!controls[i].disabled && !insideHidden(controls[i])) { controls[i].focus(); return; }
        }
    }

    function focusFirst() {
        var controls = screen.querySelectorAll("button, input, select");
        if (pendingRestore) {
            var previous = pendingRestore;
            pendingRestore = null;
            if (controls[previous.focus] && !controls[previous.focus].disabled && !insideHidden(controls[previous.focus])) {
                controls[previous.focus].focus();
                screen.scrollTop = previous.scroll || 0;
                return;
            }
        }
        for (var i = 0; i < controls.length; i += 1) {
            if (!controls[i].disabled && !insideHidden(controls[i])) {
                controls[i].focus();
                return;
            }
        }
    }

    function addSectionHeading(parent, title) {
        parent.appendChild(element("h2", "section-heading", title));
    }

    // Shared server-connection phase used by the server picker and by single-user
    // auto-resume. afterCancel (optional) re-enables picker choices on failure.
    function startServerConnection(server, afterCancel) {
        var selection = ++viewGeneration;
        currentClient = null;
        var cancelButton = button(screen, "Cancel connection", function () {
            if (selection !== viewGeneration) { return; }
            openServers();
        });
        cancelServerConnection = function () { cancelButton.click(); };
        viewCleanup = function () { cancelServerConnection = null; };
        cancelButton.focus();
        setStatus("Connecting securely; trying relay if needed...");
        window.PlexApi.selectServer(server, { onAttempt: function (attempt) {
            if (selection !== viewGeneration) { return; }
            setStatus(translate("Trying secure connection {index} of {total} ({kind})…", {
                index: attempt.index, total: attempt.total,
                kind: translate(attempt.relay ? "Relay" : "Direct")
            }));
        }, onClient: function (client) {
            if (selection !== viewGeneration) { return false; }
            viewClients.push(client);
            return true;
        } }).then(function (selected) {
            if (selection !== viewGeneration) { return; }
            currentClient = selected.client;
            currentServerId = server.id;
            usingRelay = selected.relay;
            if (needsFavoritesOnboarding()) { openFavorites(true); } else { loadHome(false); }
        }).catch(function (error) {
            if (selection !== viewGeneration) { return; }
            cancelServerConnection = null;
            if (cancelButton.parentNode) { cancelButton.parentNode.removeChild(cancelButton); }
            if (afterCancel) { afterCancel(); }
            if (!recoverSession(error)) { setStatus(errorText(error), true); }
            focusFirst();
        });
    }

    // Single-user convenience: a saved session resumes straight to content using the
    // linked account and the first available server, without the profile/server pickers.
    // The pickers stay reachable as recovery (Cancel connection, or a failed session/server).
    function resumeSession(warning) {
        restoreView = function () { resumeSession(); };
        retryView = restoreView;
        cancelServerConnection = null;
        var generation = ++viewGeneration;
        clear(screen);
        if (typeof warning === "string" && warning) { screen.appendChild(element("p", "inline-error", warning)); }
        setStatus(translate("Discovering your Plex Media Servers..."));
        accountClient.getServers().then(function (result) {
            if (generation !== viewGeneration) { return; }
            servers = result;
            var choice = null;
            for (var i = 0; i < servers.length; i += 1) {
                if (servers[i].token && servers[i].connections.length) { choice = servers[i]; break; }
            }
            if (!choice) { openServers(translate("No Plex servers are shared with this identity.")); return; }
            startServerConnection(choice, null);
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            openServers(errorText(error));
        });
    }

    function stopAuthorization() {
        if (authClient && authClient.cancelRequests) { authClient.cancelRequests(); }
        authGeneration += 1;
        if (authTimer !== null) {
            clearTimeout(authTimer);
            authTimer = null;
        }
        if (authExpiryTimer !== null) {
            clearTimeout(authExpiryTimer);
            authExpiryTimer = null;
        }
        authPin = null;
    }

    function pollAuthorization(generation, info) {
        if (generation !== authGeneration || !authPin) {
            return;
        }
        authClient.pollAuthorization(authPin).then(function (result) {
            if (generation !== authGeneration) {
                return;
            }
            if (result.status === "pending") {
                info.textContent = translate("Waiting for you to sign in…");
                authTimer = setTimeout(function () {
                    pollAuthorization(generation, info);
                }, 3000);
            } else if (result.status === "linked") {
                accountToken = result.token;
                stopAuthorization();
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                var storageWarning = "";
                if (window.VemmSession) {
                    try {
                        if (window.VemmSession.enabled(window.localStorage)) {
                            window.VemmSession.save(window.localStorage, accountToken);
                        }
                    }
                    catch (error) { storageWarning = translate("Could not save sign-in. Check app storage permissions."); }
                }
                openProfiles(storageWarning);
            } else if (result.status === "expired") {
                beginAuthorization(info.parentNode);
            } else {
                stopAuthorization();
                info.textContent = translate(result.status === "denied" ?
                    "Sign-in was denied. Get a new code to try again." :
                    "This code expired. Get a new code to try again.");
                setStatus(info.textContent, result.status === "denied");
            }
        }).catch(function () {
            if (generation !== authGeneration) {
                return;
            }
            info.textContent = translate("Network issue while checking sign-in. Retrying…");
            authTimer = setTimeout(function () {
                pollAuthorization(generation, info);
            }, 5000);
        });
    }

    function button(parent, label, action, literal, iconName) {
        var icon = iconName || (/^(Play|Resume|Pause|Start watching)/.test(label) ? "play" :
            /^(Back|Cancel|Close|Stop and return)/.test(label) ? "back" :
            /^(Search|Plex catalogue)/.test(label) ? "search" :
            /^(Settings|Diagnostics|Reset|Transcode|Sort)/.test(label) ? "settings" :
            /^(Change server|Refresh servers|Retry discovery)/.test(label) ? "server" :
            /^(Favorite|Watchlist|Mark|Remove from)/.test(label) ? "check" :
            /^(Change profile|Sign out|Use linked account)/.test(label) ? "profile" :
            /^Live TV/.test(label) ? "television" :
            /^Refresh$/.test(label) ? "refresh" :
            /^More$/.test(label) ? "more" : "none");
        var node = element("button", "secondary-button menu-control menu-icon-" + icon,
            literal ? label : translate(label));
        node.type = "button";
        node.addEventListener("click", action);
        node.addEventListener("focus", function () { revealControl(node); });
        parent.appendChild(node);
        return node;
    }

    function openProfiles(warning) {
        restoreView = function () { openProfiles(); };
        retryView = restoreView;
        stopAuthorization();
        var generation = ++viewGeneration;
        clear(screen);
        page(translate("Who is watching?"), "profiles");
        if (typeof warning === "string" && warning) { screen.appendChild(element("p", "inline-error", warning)); }
        setStatus("Loading Plex Home profiles...");
        accountClient.getProfiles().then(function (profiles) {
            if (generation !== viewGeneration) { return; }
            var identities = group(screen, "", "identity-list");
            profiles.forEach(function (profile) {
                if (profile.admin) { linkedProfile = profile; }
                var identity = button(identities, profile.title || profile.username || "Profile", function () {
                    retryView = null;
                    var selection = ++viewGeneration;
                    clear(screen);
                    page(profile.title || "Profile", "profile-pin");
                    var pin = element("input", "remote-input");
                    pin.type = "password";
                    pin.maxLength = 4;
                    pin.setAttribute("inputmode", "numeric");
                    pin.setAttribute("aria-label", translate("Profile PIN"));
                    if (profile.protected) { screen.appendChild(pin); }
                    var retryProfile = null;
                    function selectProfile() {
                        if (profile.protected && !/^[0-9]{4}$/.test(pin.value)) {
                            setStatus("Enter the four-digit profile PIN.", true);
                            return;
                        }
                        var request = ++selection;
                        var generation = viewGeneration;
                        setStatus("Switching profile...");
                        if (retryProfile) { retryProfile.disabled = true; }
                        accountClient.switchProfile(profile.uuid, profile.protected ? pin.value : "")
                            .then(function (token) {
                                pin.value = "";
                                if (generation !== viewGeneration || request !== selection) { return; }
                                activeProfile = profile;
                                accountClient = window.PlexApi.createAccountClient({ token: token });
                                openServers();
                            }).catch(function (error) {
                                pin.value = "";
                                if (generation !== viewGeneration || request !== selection) { return; }
                                if (error.status === 401 || error.status === 403) {
                                    accountClient.getProfiles().then(function () {
                                        if (generation === viewGeneration) {
                                            setStatus("Profile PIN refused. Check the PIN and retry.", true);
                                        }
                                    }).catch(function (sessionError) {
                                        if (generation === viewGeneration && !recoverSession(sessionError)) {
                                            setStatus(errorText(sessionError), true);
                                        }
                                    });
                                } else {
                                    setStatus(errorText(error), true);
                                    if (!profile.protected) {
                                        if (!retryProfile) { retryProfile = button(screen, "Retry", selectProfile); }
                                        retryProfile.disabled = false;
                                        retryProfile.focus();
                                    }
                                }
                            });
                    }
                    if (profile.protected) { button(screen, "Use this profile", selectProfile); }
                    button(screen, "Back to profiles", openProfiles);
                    focusFirst();
                    if (!profile.protected) { selectProfile(); }
                }, true);
                identity.className = "identity-choice";
                identity.setAttribute("data-initial", (profile.title || profile.username || "P").slice(0, 1).toUpperCase());
                if (profile.protected) { identity.setAttribute("data-protected", "true"); }
                profileAvatar(identity, profile, accountClient);
            });
            var actions = group(screen, "", "page-actions");
            button(actions, "Use linked account", function () { activeProfile = linkedProfile; openServers(); });
            button(actions, "Sign out", signOut);
            if (typeof warning === "string" && warning) { setStatus(warning, true); }
            else { setStatus("Select the Plex identity to use. Protected profiles require their PIN."); }
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            button(screen, "Retry profiles", openProfiles);
            button(screen, "Use linked account", openServers);
            button(screen, "Sign out", signOut);
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function signOut() {
        var storageError = false;
        if (window.VemmSession) {
            try { window.VemmSession.forget(window.localStorage); }
            catch (error) { storageError = true; }
        }
        if (window.VemmRecents && !window.VemmRecents.reset(window.localStorage)) { storageError = true; }
        stopAuthorization();
        accountToken = "";
        accountClient = null;
        activeProfile = null;
        linkedProfile = null;
        servers = [];
        currentClient = null;
        currentServerId = "";
        currentItems = [];
        currentSection = null;
        usingRelay = false;
        navigation = [];
        restoreView = null;
        addConnectForm("");
        if (storageError) { setStatus("The saved session could not be deleted. Clear this app's data on the TV before leaving it unattended.", true); }
        return !storageError;
    }

    var cancelServerConnection = null;
    function openServers(warning) {
        restoreView = function () { openServers(); };
        retryView = restoreView;
        cancelServerConnection = null;
        var generation = ++viewGeneration;
        clear(screen);
        page(translate("Choose a server"), "servers");
        if (typeof warning === "string" && warning) { screen.appendChild(element("p", "inline-error", warning)); }
        setStatus("Discovering your Plex Media Servers...");
        accountClient.getServers().then(function (result) {
            if (generation !== viewGeneration) { return; }
            servers = result;
            if (!servers.length) {
                screen.appendChild(element("p", "empty-state", translate("No Plex servers are shared with this identity.")));
            }
            var serverList = group(screen, "", "server-list");
            servers.forEach(function (server) {
                var unavailable = !server.token || !server.connections.length;
                var relayOnly = server.connections.length && server.connections.every(function (connection) {
                    return connection.relay === true;
                });
                var serverButton = button(serverList, translate("{server} ({ownership}){availability}", { server: server.name,
                    ownership: translate(server.owned ? "owned" : "shared"),
                    availability: unavailable ? translate(" — unavailable") : relayOnly ? translate(" — relay") : "" }), function () {
                    Array.prototype.forEach.call(serverList.querySelectorAll(".server-choice"), function (choice) {
                        choice.disabled = true;
                    });
                    startServerConnection(server, function () {
                        Array.prototype.forEach.call(serverList.querySelectorAll(".server-choice"), function (choice, index) {
                            choice.disabled = !servers[index].token || !servers[index].connections.length;
                        });
                    });
                }, true);
                serverButton.disabled = unavailable;
                serverButton.className += " server-choice";
            });
            var actions = group(screen, "", "page-actions");
            button(actions, "Change profile", function () {
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                openProfiles();
            });
            button(actions, "Refresh servers", openServers);
            button(actions, "Settings", function () {
                restoreView = openServers;
                visit(openSettings);
            });
            button(actions, "Sign out", signOut);
            setStatus("Owned and shared servers use their own access grants. Only secure advertised origins are tried.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            button(screen, "Retry discovery", openServers);
            button(screen, "Settings", function () {
                restoreView = openServers;
                visit(openSettings);
            });
            button(screen, "Sign out", signOut);
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function beginAuthorization(info, keepStatus) {
        stopAuthorization();
        accountToken = "";
        var generation = authGeneration;
        clear(info);
        info.appendChild(element("p", "auth-wait", translate("Getting a sign-in code…")));
        if (!keepStatus) { setStatus(""); }
        try {
            authClient = window.PlexApi.createAuthClient();
        } catch (error) {
            info.textContent = errorText(error);
            setStatus(errorText(error), true);
            return;
        }
        authClient.startAuthorization().then(function (pin) {
            if (generation !== authGeneration) {
                return;
            }
            authPin = pin;
            if (typeof pin.expiresAt === "number" && isFinite(pin.expiresAt)) {
                authExpiryTimer = setTimeout(function () {
                    if (generation === authGeneration) { beginAuthorization(info); }
                }, Math.max(0, pin.expiresAt - Date.now()));
            }
            clear(info);
            info.appendChild(element("p", "auth-step", translate("On your phone or computer, go to")));
            info.appendChild(element("p", "auth-url", "plex.tv/link"));
            var plate = element("div", "auth-plate");
            if (pin.qr) {
                var qr = element("img", "auth-qr");
                qr.alt = translate("Scan to sign in");
                qr.width = 360;
                qr.height = 360;
                qr.onerror = function () {
                    if (plate.parentNode) { plate.parentNode.removeChild(plate); }
                };
                qr.src = pin.qr;
                plate.appendChild(qr);
                info.appendChild(plate);
            }
            info.appendChild(element("p", "auth-step", translate("and enter this code")));
            info.appendChild(element("strong", "auth-code", pin.code));
            var waiting = element("p", "auth-wait", translate("Waiting for you to sign in…"));
            info.appendChild(waiting);
            pollAuthorization(generation, waiting);
        }).catch(function () {
            if (generation !== authGeneration) {
                return;
            }
            info.textContent = translate("Could not reach Plex. Retrying in a few seconds…");
            setStatus(info.textContent, true);
            authTimer = setTimeout(function () {
                if (generation === authGeneration) { beginAuthorization(info); }
            }, 5000);
        });
    }

    function addConnectForm(message) {
        retryView = null;
        stopAuthorization();
        viewGeneration += 1;
        itemsLoading = false;
        clear(screen);
        currentClient = null;
        currentSection = null;
        screen.className = "screen screen-signin";
        var section = element("section", "connect-panel");
        section.appendChild(element("h2", "auth-title", translate("Sign in to Plex")));

        var authInfo = element("div", "auth-info");
        section.appendChild(authInfo);

        var actions = element("div", "auth-actions");
        var signIn = element("button", "secondary-button", translate("Get a new code"));
        signIn.type = "button";
        signIn.addEventListener("click", function () { beginAuthorization(authInfo); });
        actions.appendChild(signIn);
        var advancedToggle = element("button", "secondary-button", translate("Connect to a server directly"));
        advancedToggle.type = "button";
        actions.appendChild(advancedToggle);
        section.appendChild(actions);

        var advanced = element("div", "advanced-panel");
        advanced.hidden = true;
        var form = element("form", "connect-form");
        var serverLabel = element("label", "", translate("Server URL"));
        var serverInput = element("input", "remote-input");
        serverInput.type = "url";
        serverInput.name = "server";
        serverInput.placeholder = "https://server.example.invalid:32400";
        serverInput.autocomplete = "url";
        serverLabel.appendChild(serverInput);

        var tokenLabel = element("label", "", translate("Server access token"));
        var tokenInput = element("input", "remote-input");
        tokenInput.type = "password";
        tokenInput.name = "token";
        tokenInput.autocomplete = "off";
        tokenLabel.appendChild(tokenInput);

        var submit = element("button", "primary-button", translate("Connect"));
        submit.type = "submit";
        form.appendChild(serverLabel);
        form.appendChild(tokenLabel);
        form.appendChild(submit);
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            connect(serverInput.value, tokenInput.value);
        });
        advanced.appendChild(form);
        if (window.VemmSession) { button(advanced, "Delete saved sign-in", signOut); }
        section.appendChild(advanced);
        advancedToggle.addEventListener("click", function () {
            advanced.hidden = !advanced.hidden;
            if (!advanced.hidden) { serverInput.focus(); }
        });
        if (message) {
            section.appendChild(element("p", "inline-error", message));
        }
        screen.appendChild(section);
        beginAuthorization(authInfo, true);
        focusFirst();
    }

    function connect(serverUrl, token) {
        stopAuthorization();
        setStatus("Connecting…");
        try {
            currentServerId = "";
            currentClient = window.PlexApi.createClient({
                baseUrl: serverUrl,
                token: token
            });
        } catch (error) {
            addConnectForm(errorText(error));
            setStatus(errorText(error), true);
            return;
        }

        loadHome(true);
    }

    function playFromCard(item, client, resume) {
        setStatus("Loading details...");
        var generation = viewGeneration;
        window.VemmItemMenu.playTarget(item, client).then(function (target) {
            if (generation !== viewGeneration || player) { return null; }
            return client.getMetadata(target.ratingKey);
        }).then(function (metadata) {
            if (!metadata) { return; }
            if (generation !== viewGeneration || player) { return; }
            startPlayer(metadata, client, resume ? metadata.viewOffset || 0 : 0);
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(errorText(error), true); }
        });
    }

    // The LG card hold menu: long-press OK (or the Tools/Info key) on a card. Every write still
    // goes through the explicit confirmation screen.
    function openItemMenu(node) {
        var info = node && node.vemmCard;
        if (!info || !window.VemmItemMenu) { return false; }
        var rows = window.VemmItemMenu.rows(info.item, {
            deck: !!info.options.deck, continueAction: preferences.continueAction
        });
        if (!rows.length) { return false; }
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", info.item.title || translate("Selected item")));
        var item = info.item;
        var client = info.client;
        function close() {
            if (menu.parentNode) { menu.parentNode.removeChild(menu); }
        }
        rows.forEach(function (row) {
            button(menu, row.label, function () {
                close();
                if (row.id === "play" || row.id === "start") {
                    playFromCard(item, client, row.id === "play");
                } else if (row.id === "details") {
                    visit(function () { openDetail(item.ratingKey, client); });
                } else if (row.id === "show") {
                    visit(function () { openDetail(item.grandparentRatingKey, client); });
                } else if (row.id === "season") {
                    visit(function () { openDetail(item.parentRatingKey, client); });
                } else if (row.id === "artist") {
                    // UIFLOW3 B10 (G58): a track's hold menu opens its artist / album page
                    // by the rating keys the card already carries — no extra request.
                    visit(function () { openDetail(item.grandparentRatingKey, client); });
                } else if (row.id === "album") {
                    visit(function () { openDetail(item.parentRatingKey, client); });
                } else if (row.id === "rate") {
                    openRatingPanel(item, client);
                } else if (row.id === "queue-next" || row.id === "queue-add") {
                    queueCardItem(item, client, row.id === "queue-next");
                } else {
                    confirmWatchAction(item, client, row.id);
                }
            });
        });
        button(menu, "Cancel", function () { close(); node.focus(); });
        screen.appendChild(menu);
        menu.querySelector("button").focus();
        return true;
    }

    function favoriteKeys() {
        if (!currentServerId || !window.VemmFavorites) { return null; }
        try { return window.VemmFavorites.load(window.localStorage, currentServerId); }
        catch (error) { return null; }
    }

    function needsFavoritesOnboarding() {
        if (!currentServerId || !window.VemmFavorites) { return false; }
        try { return window.VemmFavorites.load(window.localStorage, currentServerId) === null; }
        catch (error) { return false; }
    }

    // LG's onboarding "Favorite libraries" step: choose which libraries Home shows for this
    // server. Shown once per server after selection; Settings reopens it as an editor. Nothing
    // is written to Plex; the choice is stored on this TV only.
    function openFavorites(firstRun) {
        var generation = ++viewGeneration;
        clear(screen);
        resetImages();
        restoreView = function () { openFavorites(firstRun); };
        retryView = restoreView;
        page(translate("Favorite libraries"), "favorites");
        setStatus("Loading libraries...");
        currentClient.getSections().then(function (sections) {
            if (generation !== viewGeneration) { return; }
            sections = sections.filter(function (section) {
                return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
            });
            if (!sections.length) {
                screen.appendChild(element("p", "empty-state", translate("No available libraries.")));
                button(screen, "Back", backView); setStatus("No available libraries."); focusFirst(); return;
            }
            var saved = favoriteKeys();
            var all = sections.map(function (section) { return String(section.key); });
            var chosen = (saved || all).filter(function (key) { return all.indexOf(key) !== -1; });
            if (!chosen.length) { chosen = all.slice(); }
            var initial = chosen.slice().sort().join(",");
            screen.appendChild(element("p", "help-text", translate(firstRun ?
                "Choose the libraries Home shows. You can change this later in Settings." :
                "Choose the libraries Home shows on this server.")));
            var done;
            function refreshDone() {
                if (!done) { return; }
                done.disabled = !firstRun && chosen.slice().sort().join(",") === initial;
            }
            var choices = group(screen, "", "selection-list");
            sections.forEach(function (section) {
                var key = String(section.key);
                var toggle = button(choices, "", function () {
                    var index = chosen.indexOf(key);
                    if (index !== -1) {
                        if (chosen.length === 1) { setStatus("Keep at least one library.", true); return; }
                        chosen.splice(index, 1);
                    } else { chosen.push(key); }
                    paint();
                    refreshDone();
                });
                function paint() {
                    toggle.textContent = (chosen.indexOf(key) !== -1 ? "[x] " : "[ ] ") + (section.title || key);
                    toggle.setAttribute("aria-pressed", chosen.indexOf(key) !== -1 ? "true" : "false");
                }
                paint();
            });
            done = button(screen, firstRun ? "Start watching" : "Done", function () {
                try {
                    window.VemmFavorites.save(window.localStorage, currentServerId, chosen);
                } catch (error) { setStatus(error.message === "Keep at least one library." ? errorText(error) :
                    "Could not save favorite libraries. Check app storage permissions.", true); return; }
                navigation.length = 0;
                restoreView = null;
                loadHome(false);
            });
            refreshDone();
            button(screen, firstRun ? "Skip for now" : "Back", function () {
                if (firstRun) { navigation.length = 0; restoreView = null; loadHome(false); }
                else { backView(); }
            });
            setStatus(firstRun ? "Nothing is saved until you choose Start watching." : "Toggle libraries, then choose Done.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            if (firstRun) { loadHome(false); return; }
            setStatus(errorText(error), true);
            button(screen, "Back", backView);
            focusFirst();
        });
    }

    function loadHome(showConnectOnError) {
        restoreView = function () { loadHome(showConnectOnError); };
        retryView = restoreView;
        var generation = ++viewGeneration;
        cancelViewRequests();
        itemsLoading = false;
        setStatus("Loading...");
        Promise.all([
            currentClient.getSections(),
            currentClient.getHomeHubs(),
            // UIFLOW3 C3 (G21): one cloud watchlist read rides the home load (silent on
            // failure, once per account until a write invalidates it) so the card badges
            // exist the moment the first shelf renders.
            fetchWatchlistIndex()
        ]).then(function (result) {
            if (generation !== viewGeneration) { return; }
            renderHome(result[0], result[1]);
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (accountClient && recoverSession(error)) { return; }
            if (showConnectOnError) {
                currentClient = null;
                addConnectForm(errorText(error));
            }
            setStatus(errorText(error), true);
            if (!document.getElementById("home-retry")) {
                button(screen, "Retry", function () { loadHome(showConnectOnError); }).id = "home-retry";
            }
            focusFirst();
        });
    }

    // UIFLOW3 C2 (G25): a hub rendered as a home shelf — title header, Play all /
    // Shuffle all over the playable leaves, and the horizontal card row. Extracted from
    // renderHome verbatim so the per-library Recommended view reuses the exact renderer;
    // a deck (Continue Watching) hub keeps the remembered row size and resume semantics
    // in both places.
    function renderHubShelf(parent, hub, client) {
        var deck = !!(window.VemmItemMenu && window.VemmItemMenu.isDeckHub(hub));
        // UIFLOW3 B4 (G30/G50): the Continue Watching row shows 6, 12 or 20 items;
        // other shelves keep the fixed twelve. The fetch may return up to twenty.
        var rowLimit = deck ? continueWatchingSize() : 12;
        var hubSection = element("section", "shelf");
        var hubHeader = element("div", "shelf-header");
        hubHeader.appendChild(element("h3", "hub-title", hub.title || "Plex shelf"));
        var metadata = Array.isArray(hub.Metadata) ? hub.Metadata : [];
        var shelfLeaves = playableLeaves(metadata.slice(0, rowLimit));
        if (shelfLeaves.length) {
            // UIF-P3 (STATE-DIFF rank 2): the shelf header starts the same run the row shows.
            var shelfActions = element("div", "shelf-actions");
            button(shelfActions, "Play all", function () { playList(shelfLeaves, client, false); });
            button(shelfActions, "Shuffle all", function () { playList(shelfLeaves, client, true); });
            hubHeader.appendChild(shelfActions);
        }
        hubSection.appendChild(hubHeader);
        var row = element("div", "shelf-row");
        hubSection.appendChild(row);
        metadata.slice(0, rowLimit).forEach(function (item) {
            if (item.ratingKey) { card(row, item, client, null, { deck: deck, shelf: true }); }
        });
        parent.appendChild(hubSection);
        return hubSection;
    }

    function renderHome(sections, hubs) {
        // Leaving a show page silences its theme song.
        lastDetailShow = null;
        stopThemeMusic();
        viewGeneration += 1;
        itemsLoading = false;
        clear(screen);
        resetImages();
        restoreView = function () { loadHome(false); };
        currentSection = null;
        homeSections = sections;
        screen.className = "screen screen-home";
        browseHeader(null);
        homeY = 0;
        var track = element("div", "home-track");
        screen.appendChild(track);
        var homeTitle = element("h2", "page-title home-title", translate("Home"));
        track.appendChild(homeTitle);
        var favorites = favoriteKeys();
        var browsable = sections.filter(function (section) {
            return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
        });
        var visibleHubs = hubs.filter(function (hub) {
            return !favorites || hub.librarySectionID === undefined ||
                favorites.indexOf(String(hub.librarySectionID)) !== -1;
        });
        var features = window.VemmHomeHero.pick(visibleHubs, 8);
        if (features.length) {
            var featuredIndex = 0;
            var featured = features[0];
            var hero = element("section", "home-hero");
            var art = element("img", "home-hero-art");
            art.alt = "";
            hero.appendChild(art);
            hero.appendChild(element("div", "home-hero-scrim"));
            var copy = element("div", "home-hero-copy");
            var title = element("h3", "home-hero-title");
            var meta = element("p", "home-hero-meta");
            var description = element("p", "home-hero-description");
            copy.appendChild(title);
            copy.appendChild(meta);
            copy.appendChild(description);
            var actions = element("div", "home-feature-actions");
            var primary = button(actions, "", function () {
                if (["movie", "episode", "clip"].indexOf(featured.type) !== -1) {
                    playFromCard(featured, currentClient, true);
                } else { visit(function () { openDetail(featured.ratingKey, currentClient); }); }
            }, true, "play");
            primary.className += " home-feature-primary";
            var info = button(actions, "Open details", function () {
                visit(function () { openDetail(featured.ratingKey, currentClient); });
            }, false, "info");
            info.className += " round-control";
            info.setAttribute("aria-label", translate("Open details"));
            if (features.length > 1) {
                var next = button(actions, "Next featured title", function () {
                    featuredIndex = (featuredIndex + 1) % features.length;
                    updateFeature();
                }, false, "next");
                next.className += " round-control";
                next.setAttribute("aria-label", translate("Next featured title"));
            }
            copy.appendChild(actions);
            hero.appendChild(copy);
            var dots = element("div", "home-feature-dots");
            dots.setAttribute("aria-hidden", "true");
            features.forEach(function () { dots.appendChild(element("span", "feature-dot")); });
            hero.appendChild(dots);
            function updateFeature() {
                clearGraphics();
                featured = features[featuredIndex];
                title.textContent = featured.grandparentTitle || featured.title;
                meta.textContent = [translate(featured.type === "episode" || featured.type === "show" ? "TV Shows" : "Movie"),
                    featured.year, featured.contentRating].filter(Boolean).join(" · ");
                description.textContent = featured.summary || "";
                primary.textContent = translate(["movie", "episode", "clip"].indexOf(featured.type) !== -1 ?
                    featured.viewOffset ? "Continue" : "Play" : "Open details");
                var nextArt = element("img", "home-hero-art");
                nextArt.alt = "";
                hero.replaceChild(nextArt, art);
                art = nextArt;
                var loadedArt = nextArt;
                queueImage(art, currentClient, featured.art || featured.grandparentArt || featured.thumb,
                    { width: 1280, height: 720 }, 4 * 1024 * 1024, function () { presentBackdrop(loadedArt); }, true);
                Array.prototype.forEach.call(dots.children, function (dot, index) {
                    dot.className = "feature-dot" + (index === featuredIndex ? " selected" : "");
                });
            }
            updateFeature();
            track.appendChild(hero);
        }

        if (!browsable.length) {
            var sectionPanel = element("section", "content-panel");
            addSectionHeading(sectionPanel, translate("Libraries"));
            sectionPanel.appendChild(element("p", "empty-state", translate("No libraries were returned by this server.")));
            track.appendChild(sectionPanel);
        }

        var hubPanel = element("section", "content-panel home-shelves");
        hubPanel.setAttribute("aria-label", translate("Plex shelves"));
        if (!visibleHubs.length) {
            hubPanel.appendChild(element("p", "empty-state", translate("No Home shelves were returned.")));
        }
        visibleHubs.forEach(function (hub) {
            // UIFLOW3 C2: the shared home shelf renderer (also used by Recommended).
            renderHubShelf(hubPanel, hub, currentClient);
        });
        track.appendChild(hubPanel);
        setStatus(usingRelay ? "Connected through Plex relay (bandwidth limited)." : "");
        var restoringFocus = !!pendingRestore;
        focusFirst();
        if (!restoringFocus && document.activeElement === screen.querySelector(".account-control")) {
            screen.querySelector(".home-navigation button").focus();
        }
    }

    function browseHeader(selected) {
        setDetailMode(true);
        var header = element("header", "browse-header");
        var account = button(header, "Account", function () {
            var utilities = screen.querySelector(".home-utilities");
            utilities.hidden = !utilities.hidden;
            account.setAttribute("aria-expanded", utilities.hidden ? "false" : "true");
            if (!utilities.hidden) {
                utilities.querySelector(".menu-scroll").scrollTop = 0;
                utilities.querySelector("button").focus();
                utilities.vemmUpdateScroll();
            }
        }, false, "profile");
        account.className += " account-control round-control";
        account.setAttribute("aria-label", translate("Account"));
        account.setAttribute("aria-expanded", "false");
        account.setAttribute("aria-controls", "account-menu");
        profileAvatar(account, activeProfile || linkedProfile, currentClient);
        var nav = element("nav", "home-navigation");
        nav.setAttribute("aria-label", translate("Home"));
        var home = button(nav, "Home", function () { navigation = []; loadHome(false); }, false, "home");
        if (!selected) { home.setAttribute("aria-current", "page"); }
        var favorites = favoriteKeys();
        var browsable = homeSections.filter(function (section) {
            return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
        });
        (window.VemmFavorites ? window.VemmFavorites.filter(browsable, favorites) : browsable).forEach(function (section) {
            var choice = button(nav, section.title || "Untitled library", function () {
                visit(function () { openSection(section); });
            }, true, "library");
            choice.className += " library-button";
            if (selected && String(selected.key) === String(section.key)) { choice.setAttribute("aria-current", "page"); }
        });
        button(nav, "Search", function () { visit(openSearch); });
        header.appendChild(nav);
        screen.appendChild(header);
        var utilities = element("section", "home-utilities grouped-menu");
        utilities.id = "account-menu";
        utilities.setAttribute("role", "dialog");
        utilities.setAttribute("aria-labelledby", "account-menu-title");
        var identity = element("header", "menu-identity");
        var profile = activeProfile || linkedProfile;
        var mark = element("div", "menu-profile");
        mark.appendChild(element("span", "menu-profile-fallback",
            String(profile && (profile.title || profile.username) || translate("Account")).charAt(0)));
        mark.setAttribute("aria-hidden", "true");
        profileAvatar(mark, activeProfile || linkedProfile, currentClient);
        identity.appendChild(mark);
        var identityCopy = element("div", "menu-identity-copy");
        var title = element("h2", "menu-heading", translate("Account"));
        title.id = "account-menu-title";
        identityCopy.appendChild(title);
        identityCopy.appendChild(element("p", "", translate("Profile and app actions")));
        identity.appendChild(identityCopy);
        utilities.appendChild(identity);
        var content = groupedMenuContent(utilities);
        var explore = group(content, translate("Explore"));
        button(explore, "Live TV and DVR", function () { visit(openTelevision); }).className += " menu-drill-in";
        if (accountClient) {
            var plex = group(content, translate("Plex account"));
            button(plex, "Watchlist", function () { visit(function () { catalogueUi().watchlist(); }); }).className += " menu-drill-in";
            button(plex, "Plex catalogue", function () { visit(function () { catalogueUi().search(); }); }).className += " menu-drill-in";
        }
        var appActions = group(content, translate("App"));
        button(appActions, "Settings", function () { visit(openSettings); }).className += " menu-drill-in";
        button(appActions, "Refresh", function () {
            if (selected) { openSection(selected); } else { loadHome(false); }
        }, false, "refresh");
        var connection = group(content, translate("Connection"));
        button(connection, "Change server", function () {
            currentClient = null;
            currentServerId = "";
            if (accountClient) { openServers(); } else { addConnectForm(""); }
        }).className += " menu-drill-in";
        utilities.appendChild(element("p", "menu-footer", translate("Up / Down: Move · OK: Select · Back: Close")));
        utilities.hidden = true;
        screen.appendChild(utilities);
    }

    function profileAvatar(parent, profile, client) {
        if (!profile || !profile.thumb) { return; }
        var image = element("img", "profile-avatar");
        image.alt = "";
        parent.appendChild(image);
        queueImage(image, client, profile.thumb, { width: 168, height: 168 }, 256 * 1024, function () {
            parent.setAttribute("data-avatar", "true");
        });
    }

    function groupedMenuContent(menu) {
        var wrap = element("div", "menu-scroll-wrap");
        var content = element("div", "menu-scroll");
        var track = element("div", "menu-scroll-track");
        var thumb = element("div", "menu-scroll-thumb");
        track.setAttribute("aria-hidden", "true");
        track.appendChild(thumb);
        wrap.appendChild(content);
        wrap.appendChild(track);
        menu.appendChild(wrap);
        function update() {
            var overflow = content.scrollHeight - content.clientHeight;
            track.hidden = overflow <= 1;
            if (overflow <= 1) { return; }
            var height = track.clientHeight;
            var thumbHeight = Math.max(26, height * content.clientHeight / content.scrollHeight);
            thumb.style.height = thumbHeight + "px";
            thumb.style.top = ((height - thumbHeight) * content.scrollTop / overflow) + "px";
        }
        content.addEventListener("scroll", update);
        menu.addEventListener("focusin", update);
        menu.vemmUpdateScroll = update;
        return content;
    }

    // A library keeps the browse layout its viewer last chose, the way the LG client keeps its
    // browse mode. A missing or unknown entry falls back to the poster grid.
    var SECTION_LAYOUTS = ["grid", "list", "summary"];
    var SECTION_LAYOUT_NAMES = { grid: "Grid", list: "List", summary: "Summary" };
    function sectionLayouts() {
        return (window.VemmPreferences && window.VemmPreferences.sectionLayouts) || SECTION_LAYOUTS;
    }
    function sectionLayout(section) {
        var views = preferences.sectionViews || {};
        var layout = views[String(section && section.key)];
        return sectionLayouts().indexOf(layout) !== -1 ? layout : "grid";
    }
    function layoutLabel(layout) {
        return translate("Layout: {layout}", { layout: translate(SECTION_LAYOUT_NAMES[layout] || "Grid") });
    }
    function applySectionLayout(list, section) {
        list.className = "item-list item-list-layout-" + sectionLayout(section);
    }
    function renderSectionItems(section) {
        lastDetailShow = null;
        stopThemeMusic();
        var list = document.getElementById("item-list");
        if (!list) { return; }
        var layout = sectionLayout(section);
        applySectionLayout(list, section);
        while (list.firstChild) { list.removeChild(list.firstChild); }
        currentItems.forEach(function (item) {
            card(list, item, currentClient, currentItems, { layout: layout });
        });
    }

    // UIFLOW3 B5 (G26): the library toolbar's pill bar. Each library remembers the last
    // pill selected in it, stored per library key exactly like the per-library layout.
    // Unknown stored ids (a pill a newer build removed, or one not added yet) fall back
    // to the default pill; a future pill id round-trips through preferences untouched.
    // UIFLOW3 C2 (G25): the Recommended pill (id "hubs" — its payload is the library's
    // /hubs/sections/{key} shelves) rides the same per-library memory. The id deliberately
    // avoids the bare word "recommended", which the stored-id fallback contract treats as
    // an unknown id until this pill existed.
    var RECOMMENDED_PILL = "hubs";
    var SECTION_PILLS = [
        { id: "all", label: "All", filters: {} },
        { id: "recent", label: "Recently added", filters: { sort: "addedAt:desc" } },
        { id: RECOMMENDED_PILL, label: "Recommended", filters: {} }
    ];
    function sectionPillId(section) {
        var pills = preferences.sectionPills || {};
        var stored = pills[String(section && section.key)];
        for (var i = 0; i < SECTION_PILLS.length; i += 1) {
            if (SECTION_PILLS[i].id === stored) { return stored; }
        }
        return "all";
    }
    function sectionPillFilters(section) {
        var id = sectionPillId(section);
        for (var i = 0; i < SECTION_PILLS.length; i += 1) {
            if (SECTION_PILLS[i].id === id) {
                return JSON.parse(JSON.stringify(SECTION_PILLS[i].filters));
            }
        }
        return {};
    }
    function rememberSectionPill(section, id) {
        if (!preferences.sectionPills) { preferences.sectionPills = {}; }
        preferences.sectionPills[String(section.key)] = id;
        return savePreferences();
    }

    // UIFLOW3 C2 (G25): the per-library Recommended view. Selecting the pill fires
    // exactly one GET /hubs/sections/{key} (client.getSectionHubs) and renders every hub
    // that carries media through the home shelf renderer; the paged section listing is
    // not requested and its machinery (toolbar, Load more, grid) stays out of the DOM,
    // so nothing can crash into it. Continue Watching behaves exactly as on home. Hubs
    // without a media list (e.g. people/Directory hubs) are not shelves and are skipped.
    // An empty or failed answer keeps a friendly empty state and the pill bar usable.
    function renderRecommendedHubs(section) {
        var generation = viewGeneration;
        var client = currentClient;
        retryView = function () { openSection(section); };
        var back = button(screen, "Back to Home", backView);
        back.id = "home-back";
        var panel = element("div", "recommended-hubs");
        panel.setAttribute("aria-label", translate("Recommended"));
        screen.appendChild(panel);
        setStatus("Loading...");
        Promise.resolve().then(function () {
            if (!client || typeof client.getSectionHubs !== "function") {
                throw new Error("This server does not offer library recommendations.");
            }
            return client.getSectionHubs(section.key);
        }).then(function (hubs) {
            if (generation !== viewGeneration) { return; }
            var shelves = 0;
            (Array.isArray(hubs) ? hubs : []).forEach(function (hub) {
                if (hub && Array.isArray(hub.Metadata) && hub.Metadata.length) {
                    renderHubShelf(panel, hub, client);
                    shelves += 1;
                }
            });
            if (!shelves) {
                panel.appendChild(element("p", "empty-state", translate("No recommendations were returned.")));
            }
            setStatus("");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            panel.appendChild(element("p", "empty-state", translate("No recommendations were returned.")));
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function openSection(section, saved) {
        viewGeneration += 1;
        itemsLoading = false;
        currentSection = section;
        currentItems = saved ? saved.items : [];
        currentOffset = saved ? saved.offset : 0;
        libraryFilters = saved ? saved.filters : sectionPillFilters(section);
        clear(screen);
        resetImages();
        restoreView = function () {
            openSection(section, { items: currentItems.slice(), offset: currentOffset,
                filters: JSON.parse(JSON.stringify(libraryFilters)) });
        };
        retryView = function () { loadNextPage(); };
        page(section.title || "Library", "library");
        browseHeader(section);
        // UIFLOW3 B5: the pill bar above the toolbar; the remembered pill for this library
        // is highlighted and its filters apply to a fresh open of the section.
        var pillBar = element("nav", "section-pills");
        pillBar.setAttribute("aria-label", translate("Library filters"));
        var activePill = sectionPillId(section);
        SECTION_PILLS.forEach(function (pill) {
            var choice = button(pillBar, translate(pill.label), function () {
                if (sectionPillId(section) === pill.id) { return; }
                if (!rememberSectionPill(section, pill.id)) { return; }
                openSection(section, { items: [], offset: 0, filters: sectionPillFilters(section) });
                // UIFLOW3 C2: the Recommended pill renders its own hubs view; the paged
                // grid machinery only belongs to the browse pills.
                if (pill.id !== RECOMMENDED_PILL) { loadNextPage(); }
            });
            choice.className += " section-pill";
            choice.id = "section-pill-" + pill.id;
            if (pill.id === activePill) { choice.setAttribute("aria-current", "true"); }
        });
        screen.appendChild(pillBar);
        // UIFLOW3 C2 (G25): the remembered Recommended pill replaces the paged grid with
        // the single hub fetch; the browse pills and their restore paths are untouched.
        if (activePill === RECOMMENDED_PILL) {
            renderRecommendedHubs(section);
            return;
        }
        var toolbar = group(screen, "", "page-toolbar");
        button(toolbar, "Sort and filters", function () { visit(function () { openBrowseOptions(section); }); });
        button(toolbar, "A-Z", function () { visit(function () { openLetters(section); }); });
        button(toolbar, "Collections", function () {
            visit(function () {
                openListing("Collections", function (offset) { return currentClient.getCollections(section.key, offset); }, currentClient);
            });
        });
        button(toolbar, "Folders", function () {
            visit(function () {
                openListing("Folders", function (offset) { return currentClient.getSectionFolders(section.key, offset); }, currentClient);
            });
        });
        // UIF-P4 (TV-UIFLOWS §6, STATE-DIFF rank 3): the official library's Categories tab.
        button(toolbar, "Categories", function () { visit(function () { openCategories(section); }); });
        button(toolbar, "Playlists", function () {
            visit(function () {
                openListing("Playlists", function (offset) {
                    return currentClient.getPlaylists(section.type === "artist" ? "audio" : section.type, offset);
                }, currentClient);
            });
        });
        // UIF-P3 (STATE-DIFF rank 2): the toolbar starts a run over the collection the grid shows.
        button(toolbar, "Play all", function () { playList(currentItems, currentClient, false); });
        button(toolbar, "Shuffle all", function () { playList(currentItems, currentClient, true); });
        var layoutButton = button(toolbar, layoutLabel(sectionLayout(section)), function () {
            var layouts = sectionLayouts();
            var next = layouts[(layouts.indexOf(sectionLayout(section)) + 1) % layouts.length];
            if (!preferences.sectionViews) { preferences.sectionViews = {}; }
            preferences.sectionViews[String(section.key)] = next;
            if (!savePreferences()) { return; }
            renderSectionItems(section);
            layoutButton.textContent = layoutLabel(next);
            setStatus(translate("Layout set to {layout}.", { layout: translate(SECTION_LAYOUT_NAMES[next]) }));
        }, false, "settings");
        layoutButton.id = "section-layout";
        var list = element("div", "item-list");
        list.id = "item-list";
        screen.appendChild(list);
        renderSectionItems(section);
        var previousPage = button(screen, "Previous page", function () {
            var start = Math.max(0, currentOffset - currentItems.length - 50);
            openSection(section, { items: [], offset: start, filters: libraryFilters });
            loadNextPage();
        });
        previousPage.id = "previous-page";
        previousPage.disabled = currentOffset <= currentItems.length;
        var loadMore = button(screen, "Load more", loadNextPage);
        loadMore.id = "load-more";
        var back = button(screen, "Back to Home", backView);
        back.id = "home-back";
        var restoringFocus = !!pendingRestore;
        focusFirst();
        sectionLandingFocus = null;
        if (!restoringFocus && document.activeElement === screen.querySelector(".account-control")) {
            // Hold focus on this library's tab while titles load, then hand it to the first title.
            sectionLandingFocus = screen.querySelector('.home-navigation button[aria-current="page"]') ||
                screen.querySelector(".page-toolbar button");
            sectionLandingFocus.focus();
        }
        if (!saved) { loadNextPage(); }
    }

    function loadNextPage() {
        if (!currentClient || !currentSection || itemsLoading) {
            return;
        }
        var generation = viewGeneration;
        var section = currentSection;
        itemsLoading = true;
        setStatus("Loading library items…");
        currentClient.getSectionItems(section.key, currentOffset, 50, libraryFilters).then(function (page) {
            if (generation !== viewGeneration) {
                return;
            }
            itemsLoading = false;
            currentItems = currentItems.concat(page.items);
            if (currentItems.length > 200) { currentItems = currentItems.slice(-200); }
            currentOffset = page.offset + page.items.length;
            document.getElementById("previous-page").disabled = currentOffset <= currentItems.length;
            var list = document.getElementById("item-list");
            var focused = document.activeElement;
            var focusedKey = focused && focused.vemmCard ? String(focused.vemmCard.item.ratingKey) : null;
            clear(list);
            resetImages();
            var layout = sectionLayout(section);
            applySectionLayout(list, section);
            var restored = null;
            currentItems.forEach(function (item) {
                var control = card(list, item, currentClient, currentItems, { layout: layout });
                if (focusedKey === String(item.ratingKey)) { restored = control; }
            });
            if (focusedKey) {
                (restored || list.querySelector("button") || document.getElementById("home-back")).focus();
            } else if (sectionLandingFocus && document.activeElement === sectionLandingFocus && list.querySelector("button")) {
                list.querySelector("button").focus();
            }
            sectionLandingFocus = null;
            if (!currentItems.length) { list.appendChild(element("p", "empty-state", translate("No available items in this view."))); }
            var loadMore = document.getElementById("load-more");
            loadMore.disabled = currentOffset >= page.totalSize || page.items.length === 0;
            if (loadMore.disabled && document.activeElement === loadMore) {
                document.getElementById("home-back").focus();
            }
            setStatus(translate("{loaded} of {total} items loaded. Showing the latest {shown}.", { loaded: currentOffset, total: page.totalSize, shown: currentItems.length }));
        }).catch(function (error) {
            if (generation !== viewGeneration) {
                return;
            }
            itemsLoading = false;
            if (accountClient && recoverSession(error)) { return; }
            setStatus(errorText(error), true);
        });
    }

    function openListing(title, loader, client, offset, retained, cached, navigation) {
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        retryView = function () { openListing(title, loader, client, offset, retained, null, navigation); };
        function addShowAction() {
            if (!navigation || !navigation.showRatingKey) { return; }
            button(screen, "Go to show", function () {
                visit(function () { openDetail(navigation.showRatingKey, client); });
            });
        }
        page(title, "listing");
        setStatus("Loading...");
        offset = offset || 0;
        retained = retained || [];
        if (navigation) { restoreView = retryView; }
        (cached ? Promise.resolve(cached) : loader(offset)).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var items = retained.concat(container.Metadata || []).slice(-200);
            restoreView = function () {
                openListing(title, loader, client, offset, retained, container, navigation);
            };
            var list = element("div", "item-list");
            screen.appendChild(list);
            if (!items.length) { list.appendChild(element("p", "empty-state", translate("No available items in this view."))); }
            items.forEach(function (item) {
                // Playlists answer with their own numeric id instead of a ratingKey.
                if (item.ratingKey || item.id) { card(list, item, client, items); }
            });
            var next = offset + (container.Metadata || []).length;
            if (container.totalSize > next && next > offset) {
                button(screen, "Load more", function () {
                    openListing(title, loader, client, next, items, null, navigation);
                });
            }
            addShowAction();
            button(screen, "Back", backView);
            setStatus(translate("{count} items shown.", { count: items.length }));
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            button(screen, "Retry", function () {
                openListing(title, loader, client, offset, retained, null, navigation);
            });
            addShowAction();
            button(screen, "Back", backView);
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function openBrowseOptions(section) {
        var generation = ++viewGeneration;
        restoreView = function () { openBrowseOptions(section); };
        retryView = restoreView;
        var selected = JSON.parse(JSON.stringify(libraryFilters));
        clear(screen);
        page(translate("Sort and filters"), "filters");
        var quick = group(screen, "", "page-toolbar");
        // UIFLOW3 B5: choosing "All titles" also clears this library's remembered pill so
        // the next fresh open of the library starts unfiltered, not on the remembered one.
        button(quick, "All titles", function () {
            rememberSectionPill(section, "all");
            openSection(section);
        }, false, "library");
        button(quick, "Unwatched", function () {
            var filters = {};
            filters[section.type === "show" ? "unwatchedLeaves" : "unwatched"] = 1;
            openSection(section, { items: [], offset: 0, filters: filters });
            loadNextPage();
        }, false, "check");
        button(quick, "Recently added", function () {
            openSection(section, { items: [], offset: 0, filters: { sort: "addedAt:desc" } });
            loadNextPage();
        }, false, "clock");
        button(screen, "Back", backView);
        setStatus("Loading this server's supported filters and sorts...");
        currentClient.getBrowseMenus(section.key, section.type === "show" ? 2 : section.type === "artist" ? 8 :
            section.type === "photo" ? 13 : 1).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var types = container.Meta && container.Meta.Type || [];
            var type = types.filter(function (entry) { return entry.active; })[0] || types[0] || {};
            var sorting = group(screen, translate("Sort"), "selection-list");
            (type.Sort || []).forEach(function (sort) {
                ["asc", "desc"].forEach(function (direction) {
                    var choice = button(sorting, translate(sort.title || sort.key) + " / " +
                        translate(direction === "asc" ? "Ascending" : "Descending"), function () {
                        selected.sort = direction === "desc" && sort.descKey ? sort.descKey : sort.key + ":" + direction;
                        openSection(section, { items: [], offset: 0, filters: selected });
                        loadNextPage();
                    }, true, "sort-" + direction);
                    var sortKey = direction === "desc" && sort.descKey ? sort.descKey : sort.key + ":" + direction;
                    choice.setAttribute("aria-pressed", selected.sort === sortKey ? "true" : "false");
                });
            });
            var filtering = group(screen, translate("Filters"), "selection-list");
            (type.Filter || []).forEach(function (filter) {
                if (!filter.key || !filter.filter) { return; }
                button(filtering, filter.title || filter.filter, function () {
                    visit(function () {
                        var filterGeneration = ++viewGeneration;
                        clear(screen);
                        page(filter.title || "Filter", "filter-values");
                        currentClient.getFilterValues(section.key, filter.key).then(function (values) {
                            if (filterGeneration !== viewGeneration) { return; }
                            (values.Directory || []).slice(0, 200).forEach(function (value) {
                                button(screen, value.title || String(value.key), function () {
                                    selected[filter.filter] = value.key;
                                    openSection(section, { items: [], offset: 0, filters: selected });
                                    loadNextPage();
                                });
                            });
                            button(screen, "Back", backView);
                            focusFirst();
                        }).catch(function (error) {
                            if (filterGeneration !== viewGeneration) { return; }
                            setStatus(errorText(error), true);
                            button(screen, "Back", backView);
                            focusFirst();
                        });
                    });
                });
            });
            setStatus("Filter and sort choices come from the selected server.");
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(errorText(error), true); }
        });
        focusFirst();
    }

    function openLetters(section) {
        var generation = ++viewGeneration;
        restoreView = function () { openLetters(section); };
        retryView = restoreView;
        clear(screen);
        page(translate("Jump to a letter"), "alphabet");
        button(screen, "Back", backView);
        setStatus("Loading the server's alphabet index...");
        currentClient.getLetters(section.key).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var offset = 0;
            var letters = group(screen, "", "alphabet-list");
            (container.Directory || []).forEach(function (letter) {
                var start = offset;
                button(letters, letter.title || letter.key, function () {
                    openSection(section, { items: [], offset: start, filters: { sort: "titleSort:asc" } });
                    loadNextPage();
                });
                offset += Number(letter.size) || 0;
            });
            if (!(container.Directory || []).length) { letters.appendChild(element("p", "empty-state", translate("No available items in this view."))); }
            setStatus("Select a letter to jump within title order.");
            focusFirst();
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(errorText(error), true); }
        });
    }

    // UIF-P4 (TV-UIFLOWS §6, STATE-DIFF rank 3): the official library's Categories tab.
    // The genre Directory renders as a chip row; picking a chip swaps the normal section
    // grid to that genre, so the layout button, filters and paging keep working unchanged.
    function openCategories(section) {
        var generation = ++viewGeneration;
        restoreView = function () { openCategories(section); };
        retryView = restoreView;
        clear(screen);
        page(translate("Categories"), "categories");
        button(screen, "Back", backView);
        setStatus("Loading this library's categories...");
        currentClient.getFilterValues(section.key, "genre").then(function (container) {
            if (generation !== viewGeneration) { return; }
            var values = (container && container.Directory || []).filter(function (entry) {
                return entry && (entry.title || entry.key !== undefined && entry.key !== "");
            }).slice(0, 200);
            var chips = group(screen, "", "category-list");
            values.forEach(function (value) {
                button(chips, value.title || String(value.key), function () {
                    openSection(section, { items: [], offset: 0,
                        filters: { genre: String(value.title || value.key) } });
                    loadNextPage();
                });
            });
            if (!values.length) { chips.appendChild(element("p", "empty-state", translate("No categories are available in this library."))); }
            setStatus("Select a category to list that genre in the library grid.");
            focusFirst();
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(errorText(error), true); }
        });
    }

    // UIFLOW3 C1 (G18): friendly type labels for the search hub drill-in. The drill-in
    // matches hubs by type, so a hub without a type stays legacy-rendered (no Top
    // Results contribution, no See all card). Unknown types fall back to the server's
    // own hub title.
    var SEARCH_HUB_LABELS = {
        movie: "Movies", show: "TV Shows", season: "Seasons", episode: "Episodes",
        collection: "Collections", artist: "Artists", album: "Albums", track: "Tracks",
        photo: "Photos", photoalbum: "Photo Albums"
    };

    function openSearch(savedQuery, cached) {
        var generation = ++viewGeneration;
        retryView = null;
        clear(screen);
        resetImages();
        page(translate("Search your servers"), "search");
        var input = element("input", "remote-input");
        input.type = "search";
        input.maxLength = 200;
        input.value = typeof savedQuery === "string" ? savedQuery : "";
        retryView = function () { openSearch(input.value); };
        input.setAttribute("aria-label", "Search movies and television");
        screen.appendChild(input);
        var recents = element("section", "search-recents");
        var results = element("div", "search-results");
        // Title suggestions come from the documented autocomplete endpoint; the recent-search
        // chips stay underneath them and keep working when no server answers.
        var suggestions = element("section", "search-suggestions");
        suggestions.hidden = true;
        var suggestTimer = null;
        var suggestGeneration = 0;
        var suggestClient = currentClient || null;
        var suggestClientResolved = !!currentClient;
        function suggestSections() {
            var browsable = homeSections.filter(function (section) {
                return section && section.key &&
                    ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
            });
            if (currentSection && currentSection.key && browsable.indexOf(currentSection) === -1) {
                browsable.unshift(currentSection);
            }
            return browsable.slice(0, 3);
        }
        function emptySuggestions() {
            while (suggestions.firstChild) { suggestions.removeChild(suggestions.firstChild); }
            suggestions.hidden = true;
        }
        function renderSuggestions(terms) {
            emptySuggestions();
            if (!terms.length) { return; }
            suggestions.hidden = false;
            terms.forEach(function (term) {
                button(suggestions, term, function () { input.value = term; search(); }, true, "search");
            });
        }
        function resolveSuggestClient() {
            if (suggestClientResolved) { return Promise.resolve(suggestClient); }
            if (!servers.length || !window.PlexApi || !window.PlexApi.selectServer) {
                return Promise.resolve(null);
            }
            return window.PlexApi.selectServer(servers[0], {
                onClient: function (client) {
                    if (generation !== viewGeneration) { return false; }
                    suggestClient = client;
                    suggestClientResolved = true;
                    return true;
                }
            }).then(function (result) {
                suggestClient = result && result.client || suggestClient;
                suggestClientResolved = true;
                return suggestClient;
            }).catch(function () { return null; });
        }
        function suggestFrom(client, sections, term, requestGeneration) {
            var wanted = {};
            var found = [];
            var pending = sections.length;
            function finish() {
                pending -= 1;
                if (pending > 0 || requestGeneration !== suggestGeneration ||
                        generation !== viewGeneration) { return; }
                renderSuggestions(found);
            }
            sections.forEach(function (section) {
                client.getSuggestions(section.key, term).then(function (container) {
                    if (requestGeneration !== suggestGeneration) { return; }
                    var rows = container && container.Metadata ? container.Metadata : [];
                    rows.forEach(function (item) {
                        var label = item && (item.title || item.name);
                        if (!label || wanted[String(label)] || found.length >= 8) { return; }
                        wanted[String(label)] = true;
                        found.push(String(label));
                    });
                }).catch(function () {
                    // A server without suggestions simply leaves the recent-search chips.
                }).then(finish);
            });
        }
        function suggest() {
            var term = input.value.trim();
            if (suggestTimer !== null) { clearTimeout(suggestTimer); suggestTimer = null; }
            var requestGeneration = ++suggestGeneration;
            emptySuggestions();
            if (generation !== viewGeneration || term.length < 2) { return; }
            var sections = suggestSections();
            if (!sections.length) { return; }
            resolveSuggestClient().then(function (client) {
                if (!client || !client.getSuggestions || requestGeneration !== suggestGeneration ||
                        generation !== viewGeneration) { return; }
                suggestFrom(client, sections, term, requestGeneration);
            });
        }
        function recentProfile() {
            var profile = activeProfile || linkedProfile;
            return profile && profile.uuid ? String(profile.uuid) : "default";
        }
        function renderRecents() {
            clear(recents);
            var terms = window.VemmRecents && !input.value.trim() ?
                window.VemmRecents.load(window.localStorage, recentProfile()) : [];
            recents.hidden = !terms.length;
            if (!terms.length) { return; }
            recents.appendChild(element("h3", "", translate("RECENT SEARCHES")));
            terms.forEach(function (term) {
                button(recents, term, function () { input.value = term; search(); }, true, "search");
            });
            button(recents, "Clear recent searches", function () {
                window.VemmRecents.clear(window.localStorage, recentProfile());
                renderRecents();
                input.focus();
            });
        }
        // UIFLOW3 C1 (G18): hub drill-in state, shared by the live search and the cached
        // BACK replay. Every hub the servers answer with is kept together with the
        // server/client and the query that produced it, so replaying the result set after
        // BACK from a drill-in listing or a detail page costs zero requests. The Top
        // Results shelf is assembled in the same hub pass: the first eight distinct media
        // items across hubs in hub order (deduped by ratingKey) — again no extra request.
        var collected = [];
        var topItems = [];
        var topKeys = {};
        var topShelf = null;
        var topRow = null;
        var shown = 0;
        function resetSearchResults() {
            collected.length = 0;
            topItems = [];
            topKeys = {};
            topShelf = null;
            topRow = null;
            shown = 0;
        }
        function topResultsShelf() {
            if (!topShelf) {
                topShelf = element("section", "shelf top-results");
                topShelf.appendChild(element("h3", "", translate("Top Results")));
                topRow = element("div", "shelf-row");
                topShelf.appendChild(topRow);
                results.insertBefore(topShelf, results.firstChild);
            }
            return topShelf;
        }
        function collectTopResults(items, client) {
            items.forEach(function (item) {
                if (topItems.length >= 8 || !item || !item.ratingKey || topKeys[String(item.ratingKey)]) { return; }
                topKeys[String(item.ratingKey)] = true;
                topItems.push(item);
                topResultsShelf();
                card(topRow, item, client);
            });
        }
        function searchSeeAllCard(row, hub, query, client) {
            // "See all {type}" end card: one /hubs/search?limit=100 re-query on activation
            // — never a paging loop. Hubs without a type cannot be matched back and skip
            // the card; empty hubs never reach this code.
            if (!hub.type) { return; }
            var label = SEARCH_HUB_LABELS[hub.type] || hub.title || "";
            if (!label) { return; }
            var cardLabel = translate("See all {type}", { type: translate(label) });
            var node = element("button", "media-card shelf-see-all");
            node.type = "button";
            node.setAttribute("data-shape", "portrait");
            node.setAttribute("aria-label", cardLabel);
            node.appendChild(element("div", "poster see-all-artwork"));
            node.appendChild(element("span", "card-title", cardLabel));
            node.addEventListener("click", function () {
                visit(function () {
                    openListing(translate(label), function () {
                        return client.search(query, 100).then(function (container) {
                            var rows = [];
                            (container && Array.isArray(container.Hub) ? container.Hub : []).forEach(function (candidate) {
                                if (!rows.length && candidate && candidate.type === hub.type) {
                                    rows = Array.isArray(candidate.Metadata) ? candidate.Metadata : [];
                                }
                            });
                            // Hub answers carry no totalSize: the listing shows the whole
                            // 100-item hub in one grid, so no Load more control appears.
                            return { Metadata: rows };
                        });
                    }, client);
                });
            });
            row.appendChild(node);
        }
        function renderSearchHub(entry) {
            var hub = entry.hub;
            var server = entry.server;
            var client = entry.client;
            if (hub.type === "actor" || hub.type === "director") {
                var people = element("section", "people-results");
                people.appendChild(element("h3", "", hub.title || "Cast and crew"));
                (hub.Directory || []).slice(0, Math.max(0, Math.min(50, 200 - shown))).forEach(function (person) {
                    button(people, person.tag || "Person", function () {
                        visit(function () { openPerson(person, client); });
                    }, true);
                    shown += 1;
                });
                results.appendChild(people);
                return;
            }
            var items = (hub.Metadata || []).filter(function (item) {
                return ["movie", "show", "season", "episode", "collection", "artist", "album", "track", "photo", "photoalbum"].indexOf(item.type) !== -1;
            });
            if (!items.length) { return; }
            if (hub.type) { collectTopResults(items, client); }
            var shelf = element("section", "shelf");
            shelf.appendChild(element("h3", "", (server ? server.name + " / " : "") + hub.title));
            var row = element("div", "shelf-row");
            shelf.appendChild(row);
            items.slice(0, Math.max(0, Math.min(50, 200 - shown))).forEach(function (item) {
                card(row, item, client); shown += 1;
            });
            searchSeeAllCard(row, hub, entry.query, client);
            results.appendChild(shelf);
        }
        function renderCollected(entries) {
            // Cached replay for BACK: synchronous, no server sees anything.
            (Array.isArray(entries) ? entries : []).forEach(function (entry) {
                if (entry && entry.hub) { renderSearchHub(entry); }
            });
            setStatus(results.firstChild ? "Search complete." : "No matching media found.");
            focusFirst();
        }
        function search() {
            var query = input.value.trim();
            if (!query) { setStatus("Enter a title to search.", true); input.focus(); return; }
            if (window.VemmRecents) { window.VemmRecents.remember(window.localStorage, recentProfile(), query); }
            recents.hidden = true;
            if (suggestTimer !== null) { clearTimeout(suggestTimer); suggestTimer = null; }
            suggestGeneration += 1;
            emptySuggestions();
            var searchGeneration = ++viewGeneration;
            cancelViewRequests();
            clear(results);
            resetImages();
            // UIFLOW3 C1 (G18): a new query starts the collection over; BACK replays it.
            resetSearchResults();
            // UIFLOW3 C1: BACK from a drill-in listing or a detail page restores this same
            // result set from memory — the query stays in the input and no server is
            // re-queried on that path. Retry (the error button) re-queries live.
            restoreView = function () { openSearch(query, collected); };
            retryView = function () { openSearch(query); };
            setStatus("Searching reachable Plex servers...");
            var targets = servers.length ? servers.slice() : [null];
            var index = 0;
            var active = 0;
            var finished = 0;
            var failures = 0;
            function pump() {
                while (active < 2 && index < targets.length) {
                    (function (server) {
                        active += 1;
                        (server ? window.PlexApi.selectServer(server, { onClient: function (client) {
                            if (searchGeneration !== viewGeneration) { return false; }
                            viewClients.push(client);
                            return true;
                        } }).then(function (selected) { return selected.client; }) :
                            Promise.resolve(currentClient)).then(function (client) {
                            if (searchGeneration !== viewGeneration) { return; }
                            return client.search(query).then(function (container) {
                                if (searchGeneration !== viewGeneration) { return; }
                                (container.Hub || []).forEach(function (hub) {
                                    // UIFLOW3 C1 (G18): collect first, then render through
                                    // the shared renderer the cached BACK replay reuses.
                                    var entry = { hub: hub, server: server, client: client, query: query };
                                    collected.push(entry);
                                    renderSearchHub(entry);
                                });
                            });
                        }).catch(function (error) {
                            failures += 1;
                            if (searchGeneration === viewGeneration) {
                                results.appendChild(element("p", "inline-error", errorText(error)));
                            }
                        }).then(function () {
                            active -= 1;
                            finished += 1;
                            if (searchGeneration !== viewGeneration) { return; }
                            if (finished === targets.length) {
                                if (!shown && !failures) { results.appendChild(element("p", "empty-state", translate("No matching media found."))); }
                                setStatus(failures ? "Some servers could not be searched. Retry or change server." :
                                    shown >= 200 ? "Showing 200 results. Refine your search for more." :
                                        results.firstChild ? "Search complete." : "No matching media found.", failures > 0);
                            } else { pump(); }
                        });
                    }(targets[index++]));
                }
            }
            pump();
        }
        button(screen, "Search", search);
        button(screen, "Back", backView);
        screen.appendChild(suggestions);
        screen.appendChild(recents);
        screen.appendChild(results);
        viewCleanup = function () {
            if (suggestTimer !== null) { clearTimeout(suggestTimer); suggestTimer = null; }
            suggestGeneration += 1;
            if (suggestClient && suggestClient.cancelRequests) { suggestClient.cancelRequests(); }
        };
        input.addEventListener("keydown", function (event) {
            if (event.keyCode === 13) { event.preventDefault(); search(); }
        });
        input.addEventListener("input", function () {
            if (!input.value.trim()) { clear(results); }
            renderRecents();
            if (suggestTimer !== null) { clearTimeout(suggestTimer); }
            suggestTimer = setTimeout(suggest, 350);
        });
        restoreView = function () { openSearch(input.value); };
        renderRecents();
        setStatus("");
        // UIFLOW3 C1 (G18): a cached replay (returned by BACK from a drill-in or a detail
        // page) renders the collected hubs synchronously — zero requests — and focuses in
        // the same step so the pending focus restore sees the full control set; a fresh
        // query searches live.
        if (cached) { renderCollected(cached); }
        else {
            focusFirst();
            if (typeof savedQuery === "string" && savedQuery) { search(); }
        }
    }

    function clearTrailerPrompt() {
        trailerPrompt.generation += 1;
        if (trailerPrompt.timer !== null) { clearTimeout(trailerPrompt.timer); trailerPrompt.timer = null; }
        trailerPrompt.item = null; trailerPrompt.client = null; trailerPrompt.open = false;
        trailerPrompt.returnFocus = null;
        var panel = document.getElementById("trailer-prompt");
        if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
    }

    // Plex offers a movie's trailer a few seconds after its detail page opens. The offer is
    // dismissible, restarts its timer on any key press, and never survives the view it belongs to.
    function armTrailerPrompt(item, client) {
        clearTrailerPrompt();
        if (!item || item.type !== "movie" || player || playerClosing) { return false; }
        if (!window.VemmItemMenu || !window.VemmItemMenu.trailerFor(item)) { return false; }
        trailerPrompt.item = item; trailerPrompt.client = client;
        var generation = trailerPrompt.generation;
        trailerPrompt.timer = setTimeout(function () {
            trailerPrompt.timer = null;
            if (generation !== trailerPrompt.generation || player || playerClosing) { return; }
            showTrailerPrompt(item, client);
        }, 5000);
        return true;
    }

    function showTrailerPrompt(item, client) {
        var trailer = window.VemmItemMenu.trailerFor(item);
        if (!trailer) { return; }
        trailerPrompt.open = true;
        trailerPrompt.returnFocus = document.activeElement;
        var panel = element("div", "trailer-prompt");
        panel.id = "trailer-prompt";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", translate("Play trailer?"));
        panel.appendChild(element("h3", "trailer-prompt-title", translate("Play trailer?")));
        panel.appendChild(element("p", "trailer-prompt-text",
            translate("{title} has a trailer you could watch first.", { title: item.title || "" })));
        var actions = element("div", "trailer-prompt-actions");
        var play = button(actions, "Play trailer", function () {
            clearTrailerPrompt();
            playFromCard(trailer, client, false);
        }, false, "play");
        button(actions, "Not now", function () {
            var returnFocus = trailerPrompt.returnFocus;
            clearTrailerPrompt();
            if (returnFocus && returnFocus.focus && screen.contains(returnFocus)) { returnFocus.focus(); }
            else { focusFirst(); }
        }, false, "none");
        panel.appendChild(actions);
        screen.appendChild(panel);
        play.focus();
    }

    function openDetail(id, client, selection, ratingHint) {
        detailBack = null;
        retryView = function () { openDetail(id, client, selection, ratingHint); };
        restoreView = retryView;
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        button(screen, "Back", backView);
        setStatus("Loading details...");
        focusLoading();
        client.getMetadata(id).then(function (item) {
            if (generation !== viewGeneration) { return; }
            if (!item) { throw new Error("This item is no longer on the server."); }
            renderDetail(item, client, selection, ratingHint);
            if (armTrailerPrompt(item, client)) { viewCleanup = clearTrailerPrompt; }
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            button(screen, "Retry details", function () { openDetail(id, client, selection); });
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function durationLabel(ms) {
        var minutes = Math.max(1, Math.round(ms / 60000));
        return minutes < 60 ? translate("{minutes} min", { minutes: minutes }) :
            translate("{hours} hr {minutes} min", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
    }

    function detailBadges(item) {
        var media = item.Media && item.Media[0];
        var badges = [];
        if (media) {
            var resolution = String(media.videoResolution || "").toLowerCase();
            if (resolution === "4k") { badges.push("4K"); }
            else if (/^\d+$/.test(resolution)) { badges.push(resolution + "p"); }
            else if (resolution === "sd") { badges.push("SD"); }
            if (media.videoDynamicRange && media.videoDynamicRange !== "SDR") { badges.push(media.videoDynamicRange); }
            var channels = Number(media.audioChannels);
            if (channels >= 6) { badges.push(channels === 8 ? "7.1" : "5.1"); }
            var streams = media.Part && media.Part[0] && media.Part[0].Stream || [];
            if (streams.some(function (stream) { return stream.streamType === 3; })) { badges.push("CC"); }
        }
        return badges;
    }

    function detailAction(parent, label, icon, action, literal) {
        var node = button(parent, label, action, literal);
        node.className = "detail-pill" + (icon ? " detail-pill-" + icon : "");
        return node;
    }

    function seasonNumber(item, position) {
        var raw = item.seasonNumber !== undefined && item.seasonNumber !== null && item.seasonNumber !== "" ?
            item.seasonNumber : item.index;
        var number = Number(raw);
        return isNaN(number) ? position + 1 : number;
    }

    function seasonChoiceLabel(item, position) {
        var number = seasonNumber(item, position);
        return number === 0 ? translate("Specials") : translate("Season {number}", { number: number });
    }

    function seasonHasUnwatched(item) {
        var leaves = Number(item.leafCount) || 0;
        var watched = Number(item.viewedLeafCount) || 0;
        return !leaves || watched < leaves;
    }

    function seasonNextEpisodeKey(item) {
        var onDeck = item.OnDeck && item.OnDeck.Metadata;
        if (!Array.isArray(onDeck)) { onDeck = onDeck ? [onDeck] : []; }
        var entry = onDeck.filter(function (candidate) {
            return candidate && candidate.type === "episode" && candidate.parentRatingKey;
        })[0];
        return entry ? String(entry.parentRatingKey) : "";
    }

    // The episode holding the newest resume position: "you are up to here" in this season.
    // A finished episode has nothing to resume, so the cursor lands on the farthest-along
    // unfinished episode, then on the first unfinished episode, then on the first episode.
    function resumeEpisode(episodes) {
        var unfinished = episodes.filter(function (episode) {
            var duration = Number(episode.duration) || 0;
            var offset = Number(episode.viewOffset) || 0;
            return !episode.viewCount && !(duration > 0 && offset >= duration);
        });
        var pool = unfinished.length ? unfinished : episodes;
        // UIF-P4 (STATE-DIFF rank 9): a fully watched season has nothing to resume, so the
        // row opens on its first card — not on the furthest-watched episode.
        if (!unfinished.length) { return pool[0] || null; }
        var cursor = null;
        pool.forEach(function (episode) {
            if (!(Number(episode.viewOffset) > 0)) { return; }
            if (!cursor || Number(episode.viewOffset) > Number(cursor.viewOffset)) { cursor = episode; }
        });
        return cursor || pool[0] || null;
    }

    // Season bar plus episode row for a show detail. The chosen season lives in this closure
    // only: renderDetail hands it back through restoreView so Back reopens the same season and
    // episode cursor without a second screen stack, a second playback path or module state.
    function renderSeasonNavigation(main, item, client, selection) {
        var generation = viewGeneration;
        var section = element("section", "season-nav");
        var bar = element("div", "season-bar");
        var tools = element("div", "season-tools");
        var row = element("div", "episode-row");
        var notice = element("p", "help-text episode-notice");
        notice.hidden = true;
        // The filter/sort row lives inside the bar element so the existing left/right
        // traversal inside the bar reaches it; CSS wraps it onto its own line.
        bar.appendChild(tools);
        section.appendChild(bar);
        section.appendChild(row);
        section.appendChild(notice);
        main.appendChild(section);
        var seasons = [];
        var choices = [];
        var currentNode = null;
        var selectedKey = selection && selection.seasonKey ? String(selection.seasonKey) : "";
        // Server-side view state for the episode row. The filter and the sort are query
        // parameters on the children request, so a season keeps its full episode set rather
        // than being trimmed and re-sorted in the client.
        var onlyUnwatched = false;
        var sortMode = "server";
        var currentSeason = null;
        // Owner request 2026-11-06: the episode row carries a visible selection that
        // follows the viewer's focus, and the hero Play pill retargets to the selected
        // episode. renderDetail installs the listener when it builds its action pills.
        var onEpisodeSelect = null;

        function markSelection(node) {
            Array.prototype.slice.call(row.querySelectorAll(".media-card")).forEach(function (cardNode) {
                var active = cardNode === node;
                cardNode.className = "media-card" + (active ? " episode-current" : "");
                cardNode.setAttribute("aria-current", active ? "true" : "false");
            });
        }

        function alive() { return generation === viewGeneration; }

        function childOptions() {
            var options = {};
            if (onlyUnwatched) { options.unwatched = true; }
            if (sortMode === "newest") { options.sort = "addedAt:desc"; }
            else if (sortMode === "oldest") { options.sort = "addedAt:asc"; }
            return options;
        }

        function childrenOf(ratingKey) {
            var collected = [];
            var options = childOptions();
            function page(offset) {
                return client.getChildren(ratingKey, offset, options).then(function (container) {
                    if (!alive()) { return collected; }
                    var items = (container && container.Metadata || []).filter(function (entry) {
                        return entry && entry.ratingKey;
                    });
                    collected = collected.concat(items);
                    var total = Number(container && container.totalSize) || collected.length;
                    if (items.length && collected.length < total && collected.length < 500) {
                        return page(offset + items.length);
                    }
                    return collected;
                });
            }
            return page(0);
        }

        function markCurrent(season) {
            var key = season && season.ratingKey ? String(season.ratingKey) : "";
            choices.forEach(function (node) {
                var active = String(node.seasonChoice.ratingKey) === key;
                node.className = "season-choice" + (active ? " season-choice-current" : "");
                node.setAttribute("aria-current", active ? "true" : "false");
            });
        }

        function renderRow(episodes) {
            clear(row);
            currentNode = null;
            if (!episodes.length) {
                notice.hidden = false;
                notice.textContent = translate("No episodes in this season yet.");
                return;
            }
            notice.hidden = true;
            var cursor = resumeEpisode(episodes);
            episodes.forEach(function (episode) {
                var node = card(row, episode, client, episodes);
                if (cursor && episode === cursor) {
                    node.className += " episode-current";
                    node.setAttribute("aria-current", "true");
                    currentNode = node;
                }
                node.addEventListener("focus", function () {
                    markSelection(node);
                    currentNode = node;
                    if (onEpisodeSelect) { onEpisodeSelect(episode); }
                });
            });
        }

        function insideRow(node) {
            while (node) {
                if (node === row) { return true; }
                node = node.parentNode;
            }
            return false;
        }

        function choiceNode(season) {
            return choices.filter(function (node) { return node.seasonChoice === season; })[0] || null;
        }

        function chooseSeason(season, focusAfter) {
            if (!alive()) { return Promise.resolve([]); }
            // Clearing the row would drop focus on the floor, so a displaced control is handed
            // back to the season button the viewer just chose.
            var displaced = insideRow(document.activeElement) || document.activeElement === document.body;
            var home = choiceNode(season);
            selectedKey = String(season.ratingKey);
            currentSeason = season;
            markCurrent(season);
            renderTools();
            clear(row);
            currentNode = null;
            notice.hidden = false;
            notice.textContent = translate("Loading episodes...");
            if (displaced && home) { home.focus(); }
            return childrenOf(season.ratingKey).then(function (items) {
                if (!alive()) { return []; }
                var episodes = items.filter(function (entry) { return entry.type === "episode"; });
                renderRow(episodes);
                if (focusAfter && currentNode) { currentNode.focus(); }
                return episodes;
            }).catch(function (error) {
                if (!alive()) { return []; }
                clear(row);
                currentNode = null;
                notice.hidden = false;
                notice.textContent = errorText(error);
                return [];
            });
        }

        function renderBar() {
            clear(bar);
            choices = [];
            seasons.forEach(function (season, position) {
                var node = button(bar, seasonChoiceLabel(season, position), function () {
                    chooseSeason(season, true);
                }, true);
                node.className = "season-choice";
                node.setAttribute("aria-current", "false");
                node.seasonChoice = season;
                node.chooseSeason = function () { chooseSeason(season, true); };
                // Held OK on a season is the bulk watch-state shortcut; a short press still
                // opens the season, and the write itself stays behind the confirm screen.
                node.vemmHold = function () {
                    if (season !== currentSeason) { chooseSeason(season, false); }
                    markSeasonWatched(season, seasonHasUnwatched(season));
                };
                choices.push(node);
            });
            // The tools row is re-appended after the pills so left/right walks pills first and
            // only then reaches the filter and sort chips.
            bar.appendChild(tools);
        }

        // How many episodes a bulk action covers. The season metadata carries the leaf count;
        // a season with no count falls back to the row the viewer is looking at, and a season
        // nobody has opened yet reports nothing rather than a guessed number.
        function seasonEpisodeCount(season) {
            var leaves = Number(season && season.leafCount) || 0;
            if (leaves > 0) { return leaves; }
            var episodes = Number(season && season.numEpisodes) || 0;
            if (episodes > 0) { return episodes; }
            return season === currentSeason ? row.querySelectorAll(".media-card").length : 0;
        }

        function markSeasonWatched(season, watched) {
            if (!season || !season.ratingKey) { return; }
            confirmWatchAction(season, client, watched ? "watched" : "unwatched", {
                count: seasonEpisodeCount(season),
                selection: { seasonKey: String(season.ratingKey) },
                // A season has no season bar of its own, so the viewer lands back on the show
                // they were browsing with the same season still open.
                restore: function () {
                    openDetail(item.ratingKey, client, { seasonKey: String(season.ratingKey) });
                }
            });
        }

        function reloadSeason() {
            if (currentSeason) { chooseSeason(currentSeason, true); }
        }

        function renderTools() {
            clear(tools);
            var filter = button(tools, onlyUnwatched ? translate("Unwatched only") : translate("All episodes"), function () {
                onlyUnwatched = !onlyUnwatched;
                renderTools();
                reloadSeason();
            }, true, "none");
            filter.className += " season-tool season-tool-filter";
            filter.setAttribute("aria-pressed", onlyUnwatched ? "true" : "false");
            var sortLabel = sortMode === "newest" ? translate("Newest first") :
                sortMode === "oldest" ? translate("Oldest first") : translate("Server order");
            var sort = button(tools, sortLabel, function () {
                sortMode = sortMode === "server" ? "newest" : sortMode === "newest" ? "oldest" : "server";
                renderTools();
                reloadSeason();
            }, true, sortMode === "newest" ? "sort-desc" : sortMode === "oldest" ? "sort-asc" : "none");
            sort.className += " season-tool season-tool-sort";
            sort.setAttribute("aria-label", translate("Sort episodes"));
            if (currentSeason) {
                // A season with unwatched episodes offers to mark it watched; a fully watched
                // one offers the reverse. The flag names the action, not the current state.
                var markWatched = seasonHasUnwatched(currentSeason);
                var bulk = button(tools, markWatched ? translate("Mark season watched") :
                    translate("Mark season unwatched"), function () {
                    markSeasonWatched(currentSeason, markWatched);
                }, true, "check");
                bulk.className += " season-tool season-tool-bulk";
            }
        }

        function initialSeason() {
            var wanted = seasonNextEpisodeKey(item);
            if (wanted) {
                var match = seasons.filter(function (season) { return String(season.ratingKey) === wanted; })[0];
                if (match) { return match; }
            }
            return seasons.filter(seasonHasUnwatched)[0] || seasons[0] || null;
        }

        var ready = typeof client.getChildren === "function" ? childrenOf(item.ratingKey).then(function (items) {
            if (!alive()) { return []; }
            seasons = items.filter(function (entry) { return entry.type === "season"; });
            if (!seasons.length) {
                // Nothing to choose from: drop the bar and leave the existing Seasons pill alone.
                if (main.removeChild && section.parentNode === main) { main.removeChild(section); }
                return [];
            }
            renderBar();
            renderTools();
            var restored = selectedKey ? seasons.filter(function (season) {
                return String(season.ratingKey) === selectedKey;
            })[0] || null : null;
            markCurrent(restored || initialSeason());
            return restored ? chooseSeason(restored, false) : [];
        }).catch(function (error) {
            if (!alive()) { return []; }
            clear(bar);
            choices = [];
            notice.hidden = false;
            notice.textContent = errorText(error);
            return [];
        }) : Promise.resolve([]);

        return {
            ready: ready,
            selectedSeasonKey: function () { return selectedKey; },
            onEpisodeSelect: function (listener) { onEpisodeSelect = listener; }
        };
    }

    // Owner report 2026-11-07: opening a single episode showed NO way to see or jump to
    // the rest of its season. The episode detail now renders the season's episode row
    // with the OPENED episode selected; focusing another card moves the selection and
    // retargets the hero pill, and browsing the strip writes no watch state.
    function renderEpisodeStrip(main, item, client) {
        var generation = viewGeneration;
        var section = element("section", "season-nav episode-strip");
        if (item.parentTitle) {
            section.appendChild(element("p", "season-strip-heading", item.parentTitle));
        }
        var row = element("div", "episode-row");
        section.appendChild(row);
        // Appended by the caller AFTER the pill row so Back/Play stay above the fold.
        var onEpisodeSelect = null;
        function alive() { return generation === viewGeneration; }
        function markSelection(node) {
            Array.prototype.slice.call(row.querySelectorAll(".media-card")).forEach(function (cardNode) {
                var active = cardNode === node;
                cardNode.className = "media-card" + (active ? " episode-current" : "");
                cardNode.setAttribute("aria-current", active ? "true" : "false");
            });
        }
        var ready = (function page(offset, collected) {
            return client.getChildren(item.parentRatingKey, offset, {}).then(function (container) {
                if (!alive()) { return []; }
                var items = (container && container.Metadata || []).filter(function (entry) {
                    return entry && entry.ratingKey;
                });
                var all = collected.concat(items);
                var total = Number(container && container.totalSize) || all.length;
                if (items.length && all.length < total && all.length < 500) {
                    return page(offset + items.length, all);
                }
                return all;
            });
        })(0, []).then(function (items) {
            if (!alive()) { return []; }
            var episodes = items.filter(function (entry) { return entry.type === "episode"; });
            if (!episodes.length) {
                if (section.parentNode) { section.parentNode.removeChild(section); }
                return [];
            }
            clear(row);
            var currentNode = null;
            episodes.forEach(function (episode) {
                var node = card(row, episode, client, episodes);
                if (String(episode.ratingKey) === String(item.ratingKey)) {
                    node.className += " episode-current";
                    node.setAttribute("aria-current", "true");
                    currentNode = node;
                }
                node.addEventListener("focus", function () {
                    markSelection(node);
                    if (onEpisodeSelect) { onEpisodeSelect(episode); }
                });
            });
            // Owner request 2026-11-16: the sibling-episode row opens on the episode being
            // watched, not episode 1. Scroll the current card into view and make it the row's
            // default focus target so navigating down into the row lands on the current episode
            // (mirrors the show page's season-row currentNode behaviour). Once the viewer moves
            // along the row, currentNode tracks their last focus for re-entry. The redirect lives
            // in focusin (not the per-card focus listener) so it reads the entry's relatedTarget
            // before any card mutates currentNode.
            if (currentNode) {
                row.scrollLeft = Math.max(0, currentNode.offsetLeft - 14);
                row.addEventListener("focusin", function (event) {
                    var from = event.relatedTarget;
                    var fromInside = false;
                    while (from) {
                        if (from === row) { fromInside = true; break; }
                        from = from.parentNode;
                    }
                    if (!fromInside && currentNode && document.activeElement !== currentNode) {
                        currentNode.focus();
                        row.scrollLeft = Math.max(0, currentNode.offsetLeft - 14);
                        return;
                    }
                    if (fromInside && row.contains(document.activeElement)) {
                        currentNode = document.activeElement;
                        row.scrollLeft = Math.max(0, currentNode.offsetLeft - 14);
                    }
                });
            }
            return episodes;
        }).catch(function () {
            // A season that will not load must not leave a broken promise or a dead row.
            if (alive() && section.parentNode) { section.parentNode.removeChild(section); }
            return [];
        });
        return { section: section, ready: ready,
                 onEpisodeSelect: function (listener) { onEpisodeSelect = listener; } };
    }

    // UIF-P4 (TV-UIFLOWS §7, STATE-DIFF rank 4): the official detail page carries a
    // "More Like This" shelf. The related hub is requested once per title and the resolved
    // items are cached for the session; an empty hub or a failing server removes the shelf
    // silently, because PMS legitimately returns no related hubs for many titles.
    var relatedTitles = {};
    function appendRelatedShelf(item, client) {
        var ratingKey = String(item.ratingKey);
        var generation = viewGeneration;
        var flight = relatedTitles[ratingKey];
        if (!flight) {
            flight = client.getRelated(item.ratingKey).then(function (container) {
                var items = [];
                ((container && container.Hub) || []).forEach(function (hub) {
                    items = items.concat((hub && hub.Metadata) || []);
                });
                return items.filter(function (entry) { return entry && entry.ratingKey; });
            }).catch(function () {
                // Silent by design: no related shelf is a normal outcome, not an error.
                delete relatedTitles[ratingKey];
                return [];
            });
            relatedTitles[ratingKey] = flight;
        }
        flight.then(function (items) {
            if (generation !== viewGeneration || !items.length) { return; }
            var shelf = element("section", "shelf detail-section related-shelf");
            shelf.appendChild(element("h3", "detail-section-title", translate("More Like This")));
            var row = element("div", "shelf-row");
            shelf.appendChild(row);
            items.slice(0, 12).forEach(function (related) { card(row, related, client); });
            screen.appendChild(shelf);
        });
    }

    function renderDetail(item, client, selection, ratingHint) {
        viewGeneration += 1;
        detailBack = null;
        // Theme music belongs to the show page: start it here, stop it for any other detail.
        if (item && item.type === "show") { lastDetailShow = item; startThemeMusic(item, client); }
        else { lastDetailShow = null; stopThemeMusic(); }
        clear(screen);
        viewClients.push(client);
        resetImages();
        var seasonNav = null;
        // A reopened show detail reselects the season the viewer had open, so Back from an
        // episode lands on the same season and episode cursor.
        function seasonSelection() { return seasonNav ? { seasonKey: seasonNav.selectedSeasonKey() } : null; }
        restoreView = function () { openDetail(item.ratingKey, client, seasonSelection()); };
        // Stamped so Back from an episode that was opened FROM this show page keeps the
        // existing restore path (exact spot and season cursor) instead of a cold reopen.
        restoreView.showKey = String(item.ratingKey);
        if (item.type === "episode" && item.parentRatingKey && item.grandparentRatingKey) {
            detailBack = function () {
                var showKey = String(item.grandparentRatingKey);
                if (navigation.length) {
                    var top = navigation[navigation.length - 1];
                    if (top && top.restore && top.restore.showKey === showKey) {
                        // One-shot: disarm before delegating, or backView would re-enter
                        // this same override forever (caught on the emulator 2026-11-07).
                        detailBack = null;
                        backView();
                        return;
                    }
                }
                openDetail(item.grandparentRatingKey, client,
                    { seasonKey: String(item.parentRatingKey) });
            };
        }
        setDetailMode(true);
        screen.className = "screen screen-detail";
        var playable = ["movie", "episode", "clip", "track"].indexOf(item.type) !== -1;
        var backdropPath = item.art || item.grandparentArt || item.parentArt ||
            (item.type === "episode" || item.type === "clip" ? item.thumb : "");
        if (backdropPath) {
            var backdrop = element("img", "detail-backdrop");
            backdrop.alt = "";
            screen.appendChild(backdrop);
            queueImage(backdrop, client, backdropPath, { width: 1280, height: 720 }, 4 * 1024 * 1024, function () {
                backdrop.className = "detail-backdrop detail-backdrop-ready";
                presentBackdrop(backdrop);
            }, true);
        }
        screen.appendChild(element("div", "detail-scrim"));

        var hero = element("section", "detail-hero");
        var main = element("div", "detail-main");
        hero.appendChild(main);
        if (["artist", "album", "track", "photoalbum", "collection"].indexOf(item.type) !== -1) {
            hero.className += " detail-hero-with-cover";
            var cover = element("img", "detail-cover");
            cover.alt = "";
            cover.src = placeholderArt();
            hero.appendChild(cover);
            queueImage(cover, client, item.thumb, { width: 480, height: 480 });
        }
        if (item.type === "episode" && item.grandparentTitle) {
            main.appendChild(element("p", "detail-eyebrow", item.grandparentTitle +
                (item.parentIndex !== undefined && item.index !== undefined ? "  ·  S" + item.parentIndex + " E" + item.index : "")));
        } else if ((item.type === "season" || item.type === "album") && item.parentTitle) {
            main.appendChild(element("p", "detail-eyebrow", item.parentTitle));
        }
        main.appendChild(element("h2", "detail-title", item.title || "Details"));

        var identity = element("p", "detail-identity");
        var genres = (item.Genre || []).slice(0, 3).map(function (genre) { return genre.tag; }).filter(Boolean);
        if (genres.length) { identity.appendChild(element("span", "detail-genres", genres.join("  ·  "))); }
        detailBadges(item).forEach(function (badge) { identity.appendChild(element("span", "detail-badge", badge)); });
        // UIF-P2: the viewer's own rating reads back beside the badges as "★ 8.0"-style text.
        // PMS JSON omits userRating on show-level items (episodes and movies carry it), so a
        // rating the viewer just wrote rides through the success refresh as a hint.
        var userRating = window.PlexApi && window.PlexApi.ratingFor ? window.PlexApi.ratingFor(item) : null;
        if (ratingHint !== undefined && ratingHint !== null) { userRating = ratingHint > 0 ? ratingHint : null; }
        if (userRating) { identity.appendChild(element("span", "detail-rating", "\u2605 " + userRating.toFixed(1))); }
        if (identity.children && identity.children.length || identity.childNodes && identity.childNodes.length) { main.appendChild(identity); }

        var synopsis = element("p", "synopsis detail-synopsis", item.summary || translate("No synopsis is available."));
        main.appendChild(synopsis);
        if (item.summary) {
            var expand = button(main, "Read more", function () {
                var expanded = synopsis.className.indexOf(" expanded") === -1;
                synopsis.className = "synopsis detail-synopsis" + (expanded ? " expanded" : "");
                expand.textContent = translate(expanded ? "Read less" : "Read more");
                expand.setAttribute("aria-expanded", String(expanded));
                revealControl(expand);
            });
            expand.className = "detail-expand";
            expand.setAttribute("aria-expanded", "false");
        }

        var year = item.year || (item.originallyAvailableAt ? String(item.originallyAvailableAt).slice(0, 4) : "");
        var remaining = item.viewOffset && item.duration ? Math.max(1, Math.round((item.duration - item.viewOffset) / 60000)) : 0;
        main.appendChild(element("p", "detail-meta", [year, item.contentRating,
            item.duration ? durationLabel(item.duration) : "",
            remaining ? translate("{minutes} min left", { minutes: remaining }) : item.viewCount ? translate("Watched") : ""
        ].filter(Boolean).join("  ·  ")));
        if (item.viewOffset && item.duration) {
            var track = element("div", "detail-progress");
            var fill = element("div", "detail-progress-fill");
            if (fill.style) { fill.style.width = Math.min(100, Math.round(item.viewOffset * 100 / item.duration)) + "%"; }
            track.appendChild(fill);
            main.appendChild(track);
        }

        if (item.type === "show") {
            seasonNav = renderSeasonNavigation(main, item, client, selection);
        }
        var episodeStrip = null;
        if (item.type === "episode" && item.parentRatingKey) {
            episodeStrip = renderEpisodeStrip(main, item, client);
        }
        var actions = element("div", "detail-actions");
        main.appendChild(actions);
        if (episodeStrip && episodeStrip.section) { main.appendChild(episodeStrip.section); }
        var more = element("div", "detail-more detail-overflow");
        more.hidden = true;
        var fileInfoRows = window.VemmFileInfo ? window.VemmFileInfo.rows(item) : [];
        var fileInfo = null;
        if (fileInfoRows.length) {
            fileInfo = element("section", "file-info-panel");
            fileInfo.hidden = true;
            fileInfo.setAttribute("role", "dialog");
            fileInfo.setAttribute("aria-modal", "true");
            fileInfo.setAttribute("aria-label", translate("File information"));
            fileInfo.appendChild(element("h2", "", translate("File information")));
            fileInfoRows.forEach(function (row) {
                var fact = element("p", "file-info-row");
                var context = translate("Version {number}", { number: row.version });
                if (row.part) { context += " / " + translate("Part {number}", { number: row.part }); }
                if (row.trackType) {
                    context += " / " + translate(row.trackType) + " " + row.track;
                }
                fact.appendChild(element("span", "file-info-label", context + " / " + translate(row.label) + ": "));
                fact.appendChild(element("span", "file-info-value", row.value));
                fileInfo.appendChild(fact);
            });
            var closeFileInfo = button(fileInfo, "Close menu", function () {
                fileInfo.hidden = true;
                moreButton.focus();
            });
            detailAction(more, "File information", "info", function () {
                fileInfo.hidden = false;
                more.hidden = true;
                moreButton.setAttribute("aria-expanded", "false");
                closeFileInfo.focus();
            });
        }
        var onDeck = item.OnDeck && item.OnDeck.Metadata;
        if (Array.isArray(onDeck)) { onDeck = onDeck[0]; }
        if (item.type === "show" && onDeck && onDeck.type === "episode" && onDeck.ratingKey) {
            var nextEpisode = onDeck;
            // Owner request 2026-11-06: once the viewer engages the season's episode row,
            // the hero pill plays the SELECTED episode, not the On Deck entry. The pill
            // re-labels (and its restart sibling re-shows) to match the selection; an
            // untouched page still defaults to the On Deck episode.
            var playSelection = null;
            function resumable(target) {
                return Number(target.viewOffset) > 0 &&
                    (!Number(target.duration) || Number(target.viewOffset) < Number(target.duration));
            }
            function playTarget() { return playSelection || nextEpisode; }
            var playPill = detailAction(actions, resumable(nextEpisode) ? "Resume" : "Play next episode", "play", function () {
                var target = playTarget();
                // The On Deck default keeps the old behaviour: playFromCard refetches fresh
                // metadata and resumes from the live offset even when the summary XML that
                // produced OnDeck carried none. A row selection resumes only when the
                // selected episode's own data says there is a position to return to.
                playFromCard(target, client, playSelection ? resumable(target) : true);
            });
            playPill.className = "detail-pill detail-primary detail-pill-play";
            var restartPill = detailAction(actions, "Play from beginning", "restart", function () {
                playFromCard(playTarget(), client, false);
            });
            restartPill.hidden = !resumable(nextEpisode);
            function applyPlayTarget() {
                var target = playTarget();
                playPill.textContent = translate(resumable(target) ? "Resume" : (playSelection ? "Play" : "Play next episode"));
                restartPill.hidden = !resumable(target);
            }
            if (seasonNav && seasonNav.onEpisodeSelect) {
                seasonNav.onEpisodeSelect(function (episode) {
                    playSelection = episode;
                    applyPlayTarget();
                });
            }
        }
        if (playable) {
            // Owner report 2026-11-05: the only Back control was buried in the hidden
            // More menu, so an episode detail had no visible way back to the season
            // view. A prominent pill leads the action row for every playable detail;
            // the primary Play/Resume pill still receives initial focus.
            detailAction(actions, "Back", "back", backView);
            // The strip selection retargets the hero pills: the opened item plays until the
            // viewer focuses a different episode, exactly like the show-page On Deck pill.
            var heroTarget = item;
            var heroFromStrip = false;
            function heroResumable(target) {
                return Number(target.viewOffset) > 0 &&
                    (!Number(target.duration) || Number(target.viewOffset) < Number(target.duration));
            }
            var primary = detailAction(actions, item.viewOffset ? "Resume" : "Play", "play", function () {
                if (heroUnavailable) { return; }
                if (heroFromStrip) { playFromCard(heroTarget, client, heroResumable(heroTarget)); }
                else { startPlayer(item, client, item.viewOffset || 0); }
            });
            primary.className = "detail-pill detail-primary detail-pill-play";
            var heroRestart = detailAction(actions, "Play from beginning", "restart", function () {
                if (heroUnavailable) { return; }
                if (heroFromStrip) { playFromCard(heroTarget, client, false); }
                else { startPlayer(item, client, 0); }
            });
            heroRestart.hidden = !(Number(item.viewOffset) > 0);
            // UIFLOW3 B8 (G7): a movie, episode or track with no playable Part cannot
            // start; the primary pill reads "File unavailable" and is disabled instead
            // of failing at the player. The existing playback-error copy explains why.
            var heroUnavailable = !hasPlayableMedia(item);
            function applyHeroAvailability(target, unavailable) {
                primary.disabled = unavailable;
                primary.textContent = translate(unavailable ? "File unavailable" :
                    (heroResumable(target) ? "Resume" : "Play"));
                if (unavailable) {
                    primary.title = translate("This file can't be played. It may be damaged or not analyzed on the Plex server.");
                    primary.className += " detail-pill-unavailable";
                } else {
                    if (primary.removeAttribute) { primary.removeAttribute("title"); }
                    primary.className = "detail-pill detail-primary detail-pill-play";
                }
                heroRestart.hidden = heroRestart.hidden || unavailable;
            }
            if (heroUnavailable) {
                applyHeroAvailability(item, true);
                heroRestart.hidden = true;
            }
            if (episodeStrip && episodeStrip.onEpisodeSelect) {
                episodeStrip.onEpisodeSelect(function (episode) {
                    heroFromStrip = String(episode.ratingKey) !== String(item.ratingKey);
                    heroTarget = heroFromStrip ? episode : item;
                    var canResume = heroResumable(heroTarget);
                    var targetUnavailable = heroFromStrip ? !hasPlayableMedia(episode) : heroUnavailable;
                    applyHeroAvailability(heroTarget, targetUnavailable);
                    heroRestart.hidden = !canResume || targetUnavailable;
                });
            }
            if ((item.Media || []).length > 1) {
                item.Media.forEach(function (media, index) {
                    detailAction(more, translate("Version {number}", { number: index + 1 }) + "  ·  " +
                        [media.videoResolution ? String(media.videoResolution).toUpperCase() : "", media.videoCodec || ""].filter(Boolean).join(" "),
                    "", function () { startPlayer(item, client, 0, index); }, true);
                });
            }
        }
        if (item.type === "album") {
            detailAction(actions, "Play album", "play", function () { startAlbum(item, client, false); }).className =
                "detail-pill detail-primary detail-pill-play";
            detailAction(actions, "Shuffle album", "shuffle", function () { startAlbum(item, client, true); });
        }
        if (item.type === "photo") {
            detailAction(actions, "View photo", "play", function () { visit(function () { openPhotos([item], 0, client); }); }).className =
                "detail-pill detail-primary detail-pill-play";
        }
        if (["show", "season", "collection"].indexOf(item.type) !== -1) {
            // LG parity: a whole run starts from the detail page, in order or shuffled.
            detailAction(actions, "Play all", "play", function () { playAllFromDetail(item, client, false); });
            detailAction(more, "Shuffle all", "shuffle", function () { playAllFromDetail(item, client, true); });
        }
        if (["show", "season", "collection", "artist", "album", "photoalbum"].indexOf(item.type) !== -1) {
            var childLabel = item.type === "show" ? "Seasons" : item.type === "season" ? "Episodes" :
                item.type === "artist" ? "Albums" : item.type === "album" ? "Tracks" :
                    item.type === "photoalbum" ? "Photos" : "Collection items";
            var children = detailAction(actions, childLabel, "list", function () {
                visit(function () {
                    openListing(item.title, function (offset) {
                        return item.type === "collection" ? client.getCollectionItems(item.ratingKey, offset) :
                            client.getChildren(item.ratingKey, offset);
                    }, client);
                });
            });
            if (item.type !== "album" && !(item.type === "show" && nextEpisode)) {
                children.className = "detail-pill detail-primary detail-pill-list";
            }
        }
        if (["movie", "episode", "show", "season"].indexOf(item.type) !== -1) {
            // LG parity: the toggle that applies is a direct hero action; its opposite stays in More.
            var leafCount = Number(item.leafCount) || 0;
            var fullyWatched = item.type === "show" || item.type === "season" ?
                leafCount > 0 && Number(item.viewedLeafCount) >= leafCount : Number(item.viewCount) > 0 && !item.viewOffset;
            detailAction(fullyWatched ? more : actions, "Mark watched", "watched", function () { confirmWatchAction(item, client, "watched"); });
            detailAction(fullyWatched ? actions : more, "Mark unwatched", "unwatched", function () { confirmWatchAction(item, client, "unwatched"); });
        }
        // UIF-P2: rating lives in More for the same items the hold menu rates.
        if (["movie", "episode", "show"].indexOf(item.type) !== -1) {
            detailAction(more, "Rate", "", function () { openRatingPanel(item, client); });
        }
        var trailer = window.VemmItemMenu && window.VemmItemMenu.trailerFor(item);
        if (trailer) {
            detailAction(more, "Play trailer", "play", function () { playFromCard(trailer, client, false); });
        }
        // UIFLOW3 A1: pick audio and subtitle tracks before playback starts.
        if ((item.type === "movie" || item.type === "episode") && hasPlayableMedia(item)) {
            detailAction(more, "Playback settings", "", function () { openTracks("audio", null, item); });
        }
        // UIFLOW3 B10 (G58): a track's detail page offers the same parent rows as its hold
        // menu; episodes already sit inside their season context and keep their own rows.
        if (item.type === "track" && item.grandparentRatingKey) {
            detailAction(more, "Go to artist", "", function () {
                visit(function () { openDetail(item.grandparentRatingKey, client); });
            });
        }
        if (item.type === "track" && item.parentRatingKey) {
            detailAction(more, "Go to album", "", function () {
                visit(function () { openDetail(item.parentRatingKey, client); });
            });
        }
        var plexGuid = /^plex:\/\/(?:movie|show)\/[0-9a-f]{24}$/i.test(item.guid || "") ? item.guid :
            (item.Guid || []).filter(function (guid) { return /^plex:\/\/(?:movie|show)\/[0-9a-f]{24}$/i.test(guid.id || ""); })[0];
        if (plexGuid && accountClient) {
            var guid = typeof plexGuid === "string" ? plexGuid : plexGuid.id;
            // UIF-P2 (TV-UIFLOWS §6): the detail page reads the provider's userState once so
            // the existing row says "Remove from Watchlist" when the title already is there.
            // A failed or missing read falls back silently to the add-side label. Card
            // badges (UIFLOW3 C3) never cost a request per card: they join against the one
            // home-time watchlist fetch, which a successful write here invalidates.
            var watchlisted = false;
            var watchlistRow = detailAction(more, "Add to Watchlist", "add", function () {
                var linked = accountClient;
                var add = !watchlisted;
                confirmServiceWrite(add ? "Add to Watchlist" : "Remove from Watchlist", function () {
                    return linked.setWatchlist(guid, add).then(function (result) {
                        // UIFLOW3 C3 (G21): the cached badge index is stale after a write.
                        invalidateWatchlistIndex();
                        return result;
                    });
                }, function () { openDetail(item.ratingKey, client); });
            });
            if (typeof accountClient.catalogueState === "function") {
                Promise.resolve(accountClient.catalogueState(guid)).then(function (container) {
                    var states = container && container.Metadata;
                    var state = Array.isArray(states) ? states[0] : null;
                    watchlisted = !!(state && Number(state.watchlistedAt));
                    if (watchlistRow && watchlistRow.parentNode === more) {
                        watchlistRow.textContent = translate(watchlisted ? "Remove from Watchlist" : "Add to Watchlist");
                    }
                }).catch(function () { /* the explicit write surfaces any provider problem */ });
            }
        }
        if (["movie", "episode"].indexOf(item.type) !== -1) {
            detailAction(more, "Remove from Continue Watching", "", function () { confirmWatchAction(item, client, "remove"); });
        }
        if (plexGuid && currentServerId && client === currentClient && servers.length > 1 && (item.type === "movie" || item.type === "show")) {
            var copyGuid = typeof plexGuid === "string" ? plexGuid : plexGuid.id;
            detailAction(more, "Other servers", "", function () {
                visit(function () {
                    findCatalogueItem({ type: item.type, guid: copyGuid, title: item.title }, {
                        exclude: currentServerId, title: "Other servers", labelled: true
                    });
                });
            });
        }
        detailAction(more, "Related titles", "", function () {
            visit(function () {
                openListing("Related titles", function () {
                    return client.getRelated(item.ratingKey).then(function (container) {
                        var items = [];
                        (container.Hub || []).forEach(function (hub) { items = items.concat(hub.Metadata || []); });
                        return { Metadata: items.slice(0, 200) };
                    });
                }, client);
            });
        });
        var moreButton = detailAction(actions, "More", "more", function () {
            more.hidden = !more.hidden;
            moreButton.setAttribute("aria-expanded", String(!more.hidden));
            if (!more.hidden) { more.querySelector("button").focus(); }
        });
        moreButton.className += " round-control";
        moreButton.setAttribute("aria-label", translate("More"));
        moreButton.setAttribute("aria-expanded", "false");
        detailAction(more, "Back", "", backView);
        main.appendChild(more);

        var directors = (item.Director || []).slice(0, 2).map(function (person) { return person.tag; }).filter(Boolean);
        var stars = (item.Role || []).slice(0, 3).map(function (person) { return person.tag; }).filter(Boolean);
        if (directors.length || stars.length) {
            var people = element("div", "detail-people");
            [["Directed by", directors], ["Starring", stars]].forEach(function (row) {
                if (!row[1].length) { return; }
                var line = element("p", "detail-people-line");
                line.appendChild(element("span", "detail-people-label", translate(row[0]) + " "));
                line.appendChild(element("span", "", row[1].join(", ")));
                people.appendChild(line);
            });
            // Credits belong in the main column flow (above the season bar), not as a
            // flex sibling of the hero: a bottom-pinned right column collided with the
            // episode row's partially visible trailing card on 1920-wide screens.
            var seasonSection = main.querySelector(".season-nav");
            main.insertBefore(people, seasonSection || actions);
        }
        screen.appendChild(hero);
        if (fileInfo) { screen.appendChild(fileInfo); }

        var credits = (item.Role || []).concat(item.Director || [], item.Writer || []).slice(0, 60);
        if (credits.length) {
            var cast = element("section", "detail-section");
            cast.appendChild(element("h3", "detail-section-title", translate("Cast & Crew")));
            var row = element("div", "detail-cast-row");
            credits.forEach(function (person) {
                var node = button(row, person.tag || "Cast", function () {
                    visit(function () { openPerson(person, client); });
                }, true);
                node.className = "detail-person";
                var face = element("img", "detail-person-photo");
                face.alt = "";
                node.appendChild(face);
                var role = person.role || (item.Director || []).indexOf(person) !== -1 && translate("Director") ||
                    (item.Writer || []).indexOf(person) !== -1 && translate("Writer") || "";
                if (role) { node.appendChild(element("span", "detail-person-role", role)); }
                queueImage(face, client, person.thumb, { width: 200, height: 200 });
            });
            cast.appendChild(row);
            screen.appendChild(cast);
        }
        var extras = item.Extras && item.Extras.Metadata || [];
        if (extras.length) {
            var shelf = element("section", "shelf detail-section");
            shelf.appendChild(element("h3", "detail-section-title", translate("Extras and trailers")));
            var extrasRow = element("div", "shelf-row");
            shelf.appendChild(extrasRow);
            extras.slice(0, 20).forEach(function (extra) { card(extrasRow, extra, client); });
            screen.appendChild(shelf);
        }
        // UIF-P4: More Like This sits under the detail's own content, like the official page.
        if (item.type === "movie" || item.type === "show") { appendRelatedShelf(item, client); }
        setStatus("Choose Play or Resume to start playback. Browsing does not update watch history.");
        var restoringFocus = !!pendingRestore;
        function applyDetailFocus() {
            focusFirst();
            if (playable && !restoringFocus) { primary.focus(); }
        }
        if (seasonNav && restoringFocus) {
            // The season bar and episode row arrive asynchronously; restoring by control index
            // only matches once the restored season has repopulated the same controls.
            var focusGeneration = viewGeneration;
            var settled = function () {
                if (focusGeneration === viewGeneration) { applyDetailFocus(); }
            };
            seasonNav.ready.then(settled, settled);
        } else {
            applyDetailFocus();
        }
    }

    function confirmWatchAction(item, client, action, options) {
        var extra = options || {};
        visit(function () {
            var generation = ++viewGeneration;
            clear(screen);
            var label = action === "remove" ? "Remove from Continue Watching" :
                action === "watched" ? "Mark watched" : "Mark unwatched";
            page(label, "confirmation");
            screen.appendChild(element("p", "synopsis", item.title || "Selected item"));
            screen.appendChild(element("p", "help-text", action === "remove" ?
                "Hide this item from Continue Watching without clearing its resume position." :
                action === "unwatched" ? "This clears watched status and the saved resume position on Plex." :
                    "This changes watched status on Plex."));
            if (item.type === "show" || item.type === "season") {
                screen.appendChild(element("p", "help-text", translate("This changes every episode in this show or season.")));
                var count = Number(extra.count) || 0;
                if (count > 0) {
                    screen.appendChild(element("p", "help-text", translate("{count} episodes are affected.", { count: count })));
                }
            }
            var pending = false;
            var confirm = button(screen, translate(action === "remove" ? "Confirm remove from continue watching" :
                action === "unwatched" ? "Confirm mark unwatched" : "Confirm mark watched"), function () {
                if (pending || generation !== viewGeneration) { return; }
                pending = true;
                confirm.disabled = true;
                cancel.textContent = translate("Back to details");
                setStatus("Saving the explicit change to Plex...");
                Promise.resolve().then(function () {
                    return action === "remove" ? client.removeContinueWatching(item.ratingKey) :
                        client.setWatched(item.ratingKey, action === "watched");
                }).then(function () {
                    if (generation !== viewGeneration) { return; }
                    setStatus("Plex accepted the change. Refreshing details...");
                    return client.getMetadata(item.ratingKey).then(function (updated) {
                        if (generation !== viewGeneration) { return; }
                        navigation.pop();
                        if (extra.restore) { extra.restore(updated); }
                        else { renderDetail(updated, client, extra.selection); }
                        setStatus("Plex accepted the change; details were refreshed.");
                    }).catch(function () {
                        if (generation === viewGeneration) {
                            setStatus("Plex accepted the change, but details could not be refreshed. Go back and retry loading details.", true);
                        }
                    });
                }, function (error) {
                    if (generation !== viewGeneration) { return; }
                    pending = false;
                    confirm.disabled = false;
                    cancel.textContent = translate("Cancel");
                    setStatus(translate("{message} {warning}", { message: translate("Plex did not confirm the change. Check the server state before retrying."), warning: errorText(error) }), true);
                });
            });
            var cancel = button(screen, "Cancel", backView);
            restoreView = function () {
                if (extra.restore) { extra.restore(); }
                else { renderDetail(item, client); }
            };
            setStatus("Nothing changes until you confirm. This affects the selected Plex profile.");
            focusFirst();
        });
    }

    function timeLabel(ms) {
        var seconds = Math.max(0, Math.floor(ms / 1000));
        return Math.floor(seconds / 60) + ":" + ("0" + seconds % 60).slice(-2);
    }

    function playerRemaining(position, duration) {
        return "-" + chapterTimeLabel(Math.max(0, duration - position));
    }

    // The chapter whose start has been passed and none later than it (UIF-P1, TV-UIFLOWS §1).
    function currentChapterTitle(position) {
        var chapters = playerItem && playerItem.Chapter;
        if (!chapters || !chapters.length) { return ""; }
        var title = "";
        for (var index = 0; index < chapters.length; index += 1) {
            if (Number(chapters[index].startTimeOffset) <= position) { title = chapters[index].tag || ""; }
        }
        return title;
    }

    function chapterTimeLabel(ms) {
        var seconds = Math.max(0, Math.floor(ms / 1000));
        return ("0" + Math.floor(seconds / 60)).slice(-2) + ":" + ("0" + seconds % 60).slice(-2);
    }

    function currentPlayerPosition() {
        if (!player) { return playerPosition; }
        var snapshot = player.snapshot();
        return snapshot.position || playerPosition || 0;
    }

    // UIF-P1 (TV-UIFLOWS §3): each marker type skips only when its own row is on. A stored
    // bag from before the split still carries only the combined autoSkip — it drives both.
    // UIFLOW3 A5: rows are three-state — "disabled" hides the marker pill entirely,
    // "manually" shows it without jumping, "automatically" jumps. A bag saved before the
    // three-state split may still hold the two-state values; they map the same way the
    // preferences module migrates them.
    function autoSkipModeFor(marker) {
        var value = marker && marker.type === "credits" ? preferences.autoSkipCredits : preferences.autoSkipIntro;
        if (value === undefined || value === null) { value = preferences.autoSkip; }
        if (value === "on") { return "automatically"; }
        if (value === "off") { return "manually"; }
        return value;
    }

    function autoSkipEnabledFor(marker) {
        return autoSkipModeFor(marker) === "automatically";
    }

    function closePlayerPanel() {
        var panel = document.getElementById("player-info") || document.getElementById("chapter-strip");
        if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
        playerPanel = "";
    }

    function closeUpNext() {
        upNextGeneration += 1;
        if (upNextHandle) { upNextHandle.stop(); }
        upNextHandle = null;
        closeStillWatching();
        var panel = document.getElementById("up-next-panel");
        if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
    }

    // UIFLOW3 A3: pass-out protection. When the Up Next countdown would start the next
    // episode on its own and nobody has touched the remote for the configured number of
    // hours, ask first instead. "never" disables the check entirely.
    function passOutIdle() {
        var hours = Number(preferences.passOutProtection || "never");
        if (!(hours > 0)) { return false; }
        return lastRemoteInput > 0 && Date.now() - lastRemoteInput > hours * 3600000;
    }

    function closeStillWatching() {
        stillWatchingHandle = null;
        var panel = document.getElementById("still-watching");
        if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
    }

    function showStillWatching(onYes, onCancel) {
        closeStillWatching();
        var panel = element("section", "still-watching");
        panel.id = "still-watching";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", translate("Still watching?"));
        panel.appendChild(element("h2", "still-watching-title", translate("Still watching?")));
        panel.appendChild(element("p", "still-watching-body", translate("Nobody has pressed a button in a while.")));
        var actions = element("div", "still-watching-actions");
        panel.appendChild(actions);
        var yes = button(actions, "Yes, keep playing", function () {
            lastRemoteInput = Date.now();
            closeStillWatching();
            if (onYes) { onYes(); }
        }, false, "play");
        var no = button(actions, "No, stop here", function () {
            closeStillWatching();
            if (onCancel) { onCancel(); }
        });
        screen.appendChild(panel);
        yes.focus();
        stillWatchingHandle = { panel: panel, yes: yes, no: no };
    }

    function updatePlayerClocks(position, duration) {
        playerPosition = Math.max(0, position || 0);
        playerDuration = Math.max(0, duration || playerDuration || 0);
        var elapsed = document.querySelector && document.querySelector(".playback-elapsed");
        var remaining = document.querySelector && document.querySelector(".playback-remaining");
        var progress = document.querySelector && document.querySelector(".playback-progress");
        if (elapsed) { elapsed.textContent = timeLabel(playerPosition); }
        if (remaining) { remaining.textContent = playerRemaining(playerPosition, playerDuration); }
        var chapterLabel = document.querySelector && document.querySelector(".playback-chapter");
        if (chapterLabel) { chapterLabel.textContent = currentChapterTitle(playerPosition); }
        // UIFLOW3 B1 (G38): with "Show end time" on, the HUD clock row also carries the
        // wall-clock finish time, recomputed on every clock tick from the live playhead.
        var endLabel = document.querySelector && document.querySelector(".playback-end");
        if (preferences.showEndTime === "on") {
            if (!endLabel && remaining && remaining.parentNode) {
                endLabel = element("span", "playback-end");
                remaining.parentNode.insertBefore(endLabel, remaining.nextSibling);
            }
            if (endLabel) {
                endLabel.textContent = translate("Ends {time}", {
                    time: formatClockTime(new Date(Date.now() + Math.max(0, playerDuration - playerPosition)))
                });
            }
        } else if (endLabel && endLabel.parentNode) {
            endLabel.parentNode.removeChild(endLabel);
        }
        var panelPosition = document.querySelector && document.querySelector(".player-info-position");
        if (panelPosition) {
            panelPosition.textContent = translate("Playing") + ": " + timeLabel(playerPosition) +
                " / " + timeLabel(playerDuration);
        }
        var statsPosition = document.querySelector && document.querySelector(".playback-stats-position");
        if (statsPosition) {
            statsPosition.textContent = translate("Position") + ": " + timeLabel(playerPosition) +
                " / " + timeLabel(playerDuration);
        }
        if (progress && playerDuration > 0) {
            progress.setAttribute("aria-valuenow", String(Math.round(playerPosition)));
            progress.setAttribute("aria-valuetext", timeLabel(playerPosition) + " / " + timeLabel(playerDuration));
            var fill = progress.querySelector(".playback-progress-fill");
            if (fill && fill.style) { fill.style.width = Math.min(100, Math.max(0, playerPosition * 100 / playerDuration)) + "%"; }
        }
    }

    function trackBadge(stream) {
        if (!stream) { return ""; }
        var labels = [];
        if (stream.streamType === 3 && (stream.hearingImpaired || stream.key === "sdh")) { labels.push("SDH"); }
        else if (stream.streamType === 3 && (stream.key === "cc" || stream.closedCaptions)) { labels.push("CC"); }
        if (stream.streamType === 2 && (stream.audioDescription === true ||
                stream.audioDescription === 1 || stream.audioDescription === "1" ||
                /audio description/i.test(stream.displayTitle || ""))) { labels.push("AD"); }
        if (stream.forced === true || stream.forced === 1 || stream.forced === "1") { labels.push(translate("Forced")); }
        return labels.join(" / ");
    }

    function openPlayerPanel(name) {
        if (!player) { return; }
        cancelHudTimer();
        var menu = document.getElementById("player-menu");
        if (menu && menu.parentNode) { menu.parentNode.removeChild(menu); }
        closePlayerPanel();
        playerPanel = name;
        var panel = element("section", "player-overlay-panel " + (name === "chapters" ? "chapter-strip" : "player-info"));
        panel.id = name === "chapters" ? "chapter-strip" : "player-info";
        panel.setAttribute("aria-label", translate(name === "chapters" ? "Chapters" : "Info"));
        if (name === "chapters") {
            var chapters = playerItem.Chapter || [];
            var position = currentPlayerPosition();
            var selected = -1;
            var focusCard = null;
            chapters.forEach(function (chapter, index) {
                var start = Number(chapter.startTimeOffset) || 0;
                var next = chapters[index + 1];
                if (position >= start && (!next || position < (Number(next.startTimeOffset) || 0))) { selected = index; }
            });
            chapters.forEach(function (chapter, index) {
                var card = button(panel, "", function () {
                    player.seek(Number(chapter.startTimeOffset) || 0).then(function () {
                        closePlayerPanel();
                        showHud();
                    }).catch(showPlayerError);
                }, false, "none");
                card.className += " chapter-card" + (index === selected ? " chapter-card-current" : "");
                if (index === selected) { focusCard = card; }
                card.setAttribute("aria-label", (chapter.tag || translate("Chapter {number}", { number: index + 1 })) +
                    ", " + chapterTimeLabel(Number(chapter.startTimeOffset) || 0));
                if (chapter.thumb) {
                    var image = element("img", "chapter-card-art");
                    image.alt = "";
                    image.src = placeholderArt();
                    image.setAttribute("data-artwork-source", chapter.thumb);
                    card.appendChild(image);
                    queueImage(image, playerClient, chapter.thumb, { width: 480, height: 270 });
                }
                card.appendChild(element("span", "chapter-card-title",
                    chapter.tag || translate("Chapter {number}", { number: index + 1 })));
                card.appendChild(element("span", "chapter-card-time", chapterTimeLabel(Number(chapter.startTimeOffset) || 0)));
            });
            if (!focusCard && panel.querySelector("button")) { focusCard = panel.querySelector("button"); }
            if (!chapters.length) { panel.appendChild(element("p", "", translate("No chapters available."))); }
        } else {
            var artwork = element("img", "info-artwork");
            artwork.alt = "";
            artwork.src = placeholderArt();
            panel.appendChild(artwork);
            if (playerItem.thumb || playerItem.grandparentThumb || playerItem.art) {
                queueImage(artwork, playerClient, playerItem.thumb || playerItem.grandparentThumb || playerItem.art,
                    { width: 480, height: 270 });
            }
            var details = element("div", "player-info-details");
            details.appendChild(element("h2", "", playerItem.title || "Untitled"));
            var context = playerItem.grandparentTitle ?
                playerItem.grandparentTitle + (playerItem.parentTitle ? " / " + playerItem.parentTitle : "") +
                    (playerItem.index ? " / " + translate("Episode {number}", { number: playerItem.index }) : "") : "";
            if (context) { details.appendChild(element("p", "player-info-context", context)); }
            if (playerItem.summary) { details.appendChild(element("p", "player-info-summary", playerItem.summary)); }
            var facts = element("div", "player-info-facts");
            facts.appendChild(element("span", "player-info-position", translate("Playing") + ": " +
                timeLabel(currentPlayerPosition()) + " / " + timeLabel(Number(playerItem.duration) || playerDuration)));
            if (playerItem.year) { facts.appendChild(element("span", "", String(playerItem.year))); }
            if (playerItem.contentRating) { facts.appendChild(element("span", "", playerItem.contentRating)); }
            if (playerItem.rating) { facts.appendChild(element("span", "", translate("Rating") + ": " + playerItem.rating)); }
            var current = player.snapshot();
            var media = (playerItem.Media || [])[playerSettings.mediaIndex] || (playerItem.Media || [])[0] || {};
            var streams = media.Part && media.Part[0] && media.Part[0].Stream || [];
            var selection = player.selection();
            var selectedAudio = streams.filter(function (stream) {
                return stream.streamType === 2 && String(stream.id) === String(selection.audioId);
            })[0];
            facts.appendChild(element("span", "", translate("Video") + ": " +
                (current.videoCodec || media.videoCodec || translate("Unknown"))));
            facts.appendChild(element("span", "", translate("Audio") + ": " +
                (current.audioCodec || selectedAudio && selectedAudio.codec || media.audioCodec || translate("Unknown"))));
            facts.appendChild(element("span", "", translate("Playback") + ": " + modeName(player.quality().mode)));
            streams.forEach(function (stream) {
                var badge = trackBadge(stream);
                if (badge) { facts.appendChild(element("span", "player-info-badge", badge)); }
            });
            details.appendChild(facts);
            var actions = element("div", "player-info-actions");
            button(actions, "Close", closePlayerPanel);
            panel.appendChild(details);
            panel.appendChild(actions);
            focusCard = panel.querySelector("button");
        }
        screen.appendChild(panel);
        if (focusCard) { focusCard.focus(); }
        showHud();
    }

    function updateSubtitleTimingLabel() {
        var label = document.querySelector && document.querySelector(".subtitle-timing-value");
        if (!label) { return; }
        var delay = preferences.subtitleDelayMs || 0;
        label.textContent = (delay > 0 ? "+" : "") + (delay / 1000).toFixed(1) + " s";
    }

    function subtitleTimingRange() {
        return playerSettings && playerSettings.subtitleSidecar ? [-60000, 60000] : [0, 60000];
    }

    function storeSubtitleDelay(delay) {
        var range = subtitleTimingRange();
        var next = Math.max(range[0], Math.min(range[1], delay));
        var previous = preferences.subtitleDelayMs;
        preferences.subtitleDelayMs = next;
        if (!savePreferences()) {
            preferences.subtitleDelayMs = previous;
            updateSubtitleTimingLabel();
            return false;
        }
        updateSubtitleTimingLabel();
        var text = document.getElementById("subtitle-text");
        if (text && externalCues) {
            text.textContent = window.VemmSubtitles.at(externalCues, currentPlayerPosition() - next);
        }
        setStatus(translate("Subtitle delay: {value}", {
            value: (next > 0 ? "+" : "") + (next / 1000).toFixed(1) + " s"
        }));
        return true;
    }

    function openSubtitleTiming() {
        if (!player) { return; }
        var range = subtitleTimingRange();
        var bounded = Math.max(range[0], Math.min(range[1], preferences.subtitleDelayMs));
        if (bounded !== preferences.subtitleDelayMs && !storeSubtitleDelay(bounded)) { return; }
        cancelHudTimer();
        var menu = document.getElementById("player-menu");
        if (menu && menu.parentNode) { menu.parentNode.removeChild(menu); }
        var old = document.getElementById("subtitle-timing");
        if (old && old.parentNode) { old.parentNode.removeChild(old); }
        subtitleTiming = true;
        subtitleTimingRepeats = 0;
        subtitleTimingDirection = 0;
        subtitleTimingDetentUntil = 0;
        var panel = element("section", "subtitle-timing");
        panel.id = "subtitle-timing";
        panel.setAttribute("role", "group");
        panel.appendChild(element("h2", "", translate("Subtitle timing")));
        panel.appendChild(element("p", "subtitle-timing-value", ""));
        panel.appendChild(element("p", "help-text", translate(
            "Use LEFT and RIGHT to adjust. OK or Back closes this control.")));
        button(panel, "Close", closeSubtitleTiming);
        screen.appendChild(panel);
        updateSubtitleTimingLabel();
        panel.querySelector("button").focus();
        showHud();
    }

    function closeSubtitleTiming() {
        subtitleTiming = false;
        subtitleTimingRepeats = 0;
        subtitleTimingDirection = 0;
        subtitleTimingDetentUntil = 0;
        var panel = document.getElementById("subtitle-timing");
        if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
        showHud();
    }

    function adjustSubtitleTiming(direction, repeat) {
        if (!subtitleTiming || !externalCues) { return; }
        var now = Date.now();
        if (!repeat) {
            subtitleTimingRepeats = 0;
            subtitleTimingDirection = direction;
            subtitleTimingDetentUntil = 0;
        } else {
            if (direction !== subtitleTimingDirection) {
                subtitleTimingRepeats = 0;
                subtitleTimingDirection = direction;
            }
            if (now < subtitleTimingDetentUntil) { return; }
            subtitleTimingDetentUntil = 0;
            subtitleTimingRepeats += 1;
        }
        var step = repeat && subtitleTimingRepeats >= 8 ? 500 : 100;
        var current = preferences.subtitleDelayMs;
        var next = current + direction * step;
        if (repeat && current !== 0 && (next === 0 || (next < 0) !== (current < 0))) {
            next = 0;
            subtitleTimingDetentUntil = now + 600;
        }
        storeSubtitleDelay(next);
    }

    function togglePlayerStats() {
        if (!player) { return; }
        var old = document.getElementById("playback-stats");
        if (old) {
            old.parentNode.removeChild(old);
            playerStatsVisible = false;
            showHud();
            return;
        }
        playerStatsVisible = true;
        var stats = element("aside", "playback-stats");
        stats.id = "playback-stats";
        stats.setAttribute("aria-label", translate("Stats for nerds"));
        stats.appendChild(element("h2", "", translate("Stats for nerds")));
        var snapshot = player.snapshot();
        var quality = player.quality();
        var decision = quality.explanation || {};
        [
            translate("Playback") + ": " + modeName(quality.mode),
            translate("Reason") + ": " + reasonName(decision.reason),
            translate("Fallback") + ": " + fallbackName(decision.fallback),
            translate("Capability evidence") + ": " + capabilityName(decision.capability),
            translate("Position") + ": " + timeLabel(snapshot.position) + " / " + timeLabel(snapshot.duration),
            translate("Video") + ": " + qualityLabel(quality.mode === "direct" ? quality.source : quality.stream),
            translate("Quality") + ": " + qualityName(quality.limit),
            translate("State") + ": " + translate(snapshot.state)
        ].forEach(function (line, index) {
            stats.appendChild(element("p", index === 4 ? "playback-stats-position" : "", line));
        });
        button(stats, "Close", function () {
            if (stats.parentNode) { stats.parentNode.removeChild(stats); }
            playerStatsVisible = false;
            showHud();
        });
        screen.appendChild(stats);
        stats.querySelector("button").focus();
        showHud();
    }

    // The countdown ring is an SVG arc. The seconds beside it carry the same information, so the
    // card still reads correctly on firmware that ignores SVG geometry.
    function upNextRing() {
        var radius = 42;
        var namespace = "http://www.w3.org/2000/svg";
        var svg = document.createElementNS(namespace, "svg");
        svg.setAttribute("class", "up-next-ring");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("focusable", "false");
        ["up-next-ring-track", "up-next-ring-fill"].forEach(function (className) {
            var circle = document.createElementNS(namespace, "circle");
            circle.setAttribute("class", className);
            circle.setAttribute("cx", "50");
            circle.setAttribute("cy", "50");
            circle.setAttribute("r", String(radius));
            svg.appendChild(circle);
        });
        var circumference = 2 * Math.PI * radius;
        var fill = svg.lastChild;
        fill.setAttribute("stroke-dasharray", String(circumference));
        return {
            node: svg,
            set: function (fraction) {
                var value = Math.max(0, Math.min(1, fraction));
                fill.setAttribute("stroke-dashoffset", String(circumference * (1 - value)));
            }
        };
    }

    // The full-screen Up Next card: the successor's poster and title, a countdown ring and the
    // explicit choices Plex offers when an episode ends. It replaces the inline pill that used to
    // sit on the details page, and serves both the final-credits countdown and the post-play card.
    function showUpNext(options) {
        var opts = options || {};
        var item = opts.item || playerItem;
        var client = opts.client || playerClient;
        if (!item || item.type !== "episode") { return null; }
        if (!opts.afterPlay && (!player || !client || !client.nextEpisode)) { return null; }
        closeUpNext();
        var generation = upNextGeneration;
        // UIF-P1 (TV-UIFLOWS §4): the viewer's Up Next countdown preset sets the ring length,
        // and "immediate" starts the successor without waiting. Preferences stored before the
        // key existed keep the caller's seconds.
        var countdownPreset = preferences.upNextCountdown;
        var total;
        if (countdownPreset === "immediate") { total = 0; }
        else if (countdownPreset !== undefined && countdownPreset !== null && countdownPreset !== "" &&
                isFinite(Number(countdownPreset))) { total = Number(countdownPreset); }
        else { total = Number(opts.seconds) || 10; }
        var remaining = total;
        var loaded = opts.next || null;
        var panel = element("section", "up-next-card up-next-screen");
        panel.id = "up-next-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", translate("Up Next"));
        panel.appendChild(element("p", "up-next-eyebrow", translate("Up Next")));
        var frame = element("div", "up-next-frame");
        var artwork = element("img", "up-next-artwork");
        artwork.alt = "";
        artwork.src = placeholderArt();
        frame.appendChild(artwork);
        var ring = upNextRing();
        ring.set(1);
        frame.appendChild(ring.node);
        panel.appendChild(frame);
        var title = element("h2", "up-next-title", translate("Loading next episode..."));
        panel.appendChild(title);
        var meta = element("p", "up-next-meta", "");
        panel.appendChild(meta);
        var countdown = element("p", "up-next-countdown",
            translate("Next episode starts in {seconds}s", { seconds: total }));
        panel.appendChild(countdown);
        var actions = element("div", "up-next-actions");
        panel.appendChild(actions);
        var tick = null;
        var handle = { panel: panel, countdown: countdown, counting: true, stop: function () {} };
        handle.stop = function () {
            if (tick !== null) { clearInterval(tick); tick = null; }
        };
        handle.cancel = function () {
            handle.stop();
            handle.counting = false;
            countdown.textContent = translate("Auto-play cancelled.");
        };
        var showKey = item.grandparentRatingKey || item.parentRatingKey;
        var dismiss = function (afterClose) {
            handle.stop();
            closeUpNext();
            if (afterClose) { afterClose(); }
        };
        if (!opts.afterPlay) {
            button(actions, "Watch Credits", function () {
                dismiss(function () { if (opts.watchCredits) { opts.watchCredits(); } });
            });
        }
        button(actions, "Watch something else", function () {
            dismiss(function () {
                if (!opts.afterPlay) {
                    stopPlayer(function () { if (showKey && client) { openDetail(showKey, client); } });
                    return;
                }
                if (showKey && client) { openDetail(showKey, client); }
                else if (client) { renderDetail(item, client); }
            });
        });
        if (opts.afterPlay) {
            button(actions, "Stop", function () {
                dismiss(function () { if (client) { renderDetail(item, client); } });
            });
        }
        var primary = null;
        var expire = function () {
            handle.stop();
            handle.counting = false;
            var chosen = loaded;
            // UIFLOW3 A3: an idle viewer must answer first — the card stays up behind the
            // overlay, so Back still lands on the normal cancellation path.
            if (passOutIdle()) {
                showStillWatching(function () {
                    closeUpNext();
                    if (opts.onExpire) { opts.onExpire(chosen); }
                }, function () { handle.cancel(); });
                return;
            }
            closeUpNext();
            if (opts.onExpire) { opts.onExpire(chosen); }
        };
        var offer = function (next) {
            loaded = next;
            title.textContent = next.title || translate("Next Episode");
            meta.textContent = [next.grandparentTitle, next.parentTitle].filter(Boolean).join(" / ");
            if (next.thumb || next.art) { queueImage(artwork, client, next.thumb || next.art, { width: 480, height: 270 }); }
            if (primary) { return; }
            primary = button(actions, "Play next episode", function () {
                var chosen = loaded;
                dismiss(function () { if (opts.onStart) { opts.onStart(chosen); } });
            }, false, "play");
            actions.insertBefore(primary, actions.firstChild);
            // The "immediate" preset has no ring to wait on: the loaded successor starts here,
            // and a backgrounded app still keeps its no-auto-start rule.
            if (total <= 0) {
                if (document.hidden) { handle.cancel(); } else { expire(); }
                return;
            }
            primary.focus();
        };
        screen.appendChild(panel);
        var firstAction = actions.querySelector("button");
        if (firstAction) { firstAction.focus(); }
        if (loaded) { offer(loaded); }
        else {
            client.nextEpisode(item).then(function (next) {
                if (generation !== upNextGeneration || !panel.parentNode || !next) { return; }
                offer(next);
            }).catch(function (error) {
                if (generation !== upNextGeneration || !panel.parentNode) { return; }
                title.textContent = translate("The next episode could not be loaded.") + " " + errorText(error);
            });
        }
        if (total > 0) {
            tick = setInterval(function () {
                // A backgrounded app must never start the next episode on its own.
                if (!panel.parentNode || document.hidden) { handle.cancel(); return; }
                remaining -= 1;
                if (remaining > 0) {
                    countdown.textContent = translate("Next episode starts in {seconds}s", { seconds: remaining });
                    ring.set(remaining / total);
                    return;
                }
                expire();
            }, 1000);
        }
        upNextHandle = handle;
        return handle;
    }

    function openPerson(person, client, careerStart) {
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        restoreView = function () { openPerson(person, client, careerStart); };
        retryView = restoreView;
        page(person.tag || "Person", "person");
        var portrait = element("img", "person-portrait");
        portrait.alt = "";
        portrait.src = placeholderArt();
        screen.appendChild(portrait);
        queueImage(portrait, client, person.thumb, { width: 360, height: 360 });
        if (person.role) { screen.appendChild(element("p", "detail-meta", person.role)); }
        button(screen, "Titles in this server", function () {
            visit(function () {
                openListing(person.tag || "Person", function (offset) {
                    return client.getPerson(null, person.id, offset);
                }, client);
            });
        });
        button(screen, "Back", backView);
        setStatus(accountClient && person.tagKey ? "Loading..." : "Person biography and catalogue credits require a linked Plex account.");
        if (accountClient && person.tagKey) {
            accountClient.personProfile(person.tagKey).then(function (container) {
                if (generation !== viewGeneration) { return; }
                var profile = (container.Metadata || [])[0] || {};
                screen.appendChild(element("p", "synopsis", profile.summary || "No biography supplied by Plex."));
                if (profile.bornAt) {
                    screen.appendChild(element("p", "detail-meta", profile.bornAt + (profile.birthPlace ? " / " + profile.birthPlace : "")));
                }
            }).catch(function (error) {
                if (generation === viewGeneration) { setStatus(errorText(error), true); focusFirst(); }
            });
            var localIndex = client.personLibraryIndex(person.id).catch(function () { return null; });
            Promise.all([accountClient.personCredits(person.tagKey), localIndex]).then(function (results) {
                var groups = results[0];
                var local = results[1];
                if (generation !== viewGeneration) { return; }
                var allCredits = [];
                var held = 0;
                groups.forEach(function (group) {
                    (group.Credit || []).forEach(function (credit) {
                        if (credit.Metadata) { allCredits.push({ group: group.title, credit: credit }); }
                    });
                });
                var career = element("section", "career-pages");
                screen.appendChild(career);
                function renderCareer(start) {
                    careerStart = start;
                    clear(career);
                    held = 0;
                    var credits;
                    var groupName;
                    allCredits.slice(start, start + 50).forEach(function (entry) {
                        var credit = entry.credit;
                        var title = credit.Metadata;
                        if (!credits || groupName !== entry.group) {
                            groupName = entry.group;
                            credits = element("section", "credit-list");
                            credits.appendChild(element("h3", "group-title", groupName || "Credits"));
                            career.appendChild(credits);
                        }
                        var label = (title.title || "Untitled") + (title.year ? " / " + title.year : "") +
                            (credit.role ? " / " + credit.role : "");
                        var ratingKey = local && window.PlexApi.matchCredit(local.index, title.ratingKey);
                        if (ratingKey) {
                            held += 1;
                            titleTile(credits, { title: label + " / " + translate("In this library"), thumb: title.thumb }, function () {
                                visit(function () { openDetail(ratingKey, client); });
                            }, client);
                        } else {
                            titleTile(credits, { title: label + " / " + translate("Search libraries"), thumb: title.thumb }, function () {
                                visit(function () { openSearch(title.title); });
                            }, client);
                        }
                    });
                    if (start > 0) {
                        button(career, "Previous page", function () { renderCareer(start - 50); }).focus();
                    }
                    if (start + 50 < allCredits.length) {
                        var nextPage = button(career, "Next page", function () { renderCareer(start + 50); });
                        if (start === 0 && document.activeElement && !screen.contains(document.activeElement)) { nextPage.focus(); }
                    }
                    setStatus(local ? translate("{count} credits are in this library.", { count: held }) +
                        (local.complete ? "" : " " + translate("Local title lookup reached its safety limit.")) :
                        translate("This server's titles could not be checked. Search libraries to find an available version."));
                }
                renderCareer(careerStart || 0);
                focusFirst();
            }).catch(function (error) {
                if (generation === viewGeneration) { setStatus(errorText(error), true); focusFirst(); }
            });
        }
        focusFirst();
    }

    function recoverPlayer(restart) {
        if (!player || playerClosing || !playerSettings) { return; }
        var failedPlayer = player;
        var item = playerItem;
        var client = playerClient;
        var settings = playerSettings;
        var snapshot = failedPlayer.snapshot();
        var position = restart ? 0 : (snapshot.position || playerPosition || settings.offset || 0);
        var tracks = {
            audioId: settings.audioId,
            subtitleId: settings.subtitleId,
            paused: snapshot.state === "paused",
            subtitleSidecar: settings.subtitleSidecar
        };
        if (settings.overlaySubtitle && externalCues) { tracks.cues = externalCues; }
        stopPlayer(function () { startPlayer(item, client, position, settings.mediaIndex, tracks); });
    }

    function showPlayerError(error) {
        var message = errorText(error) || translate("Playback failed. Stop and retry.");
        setStatus(message, true);
        if (!player) { return; }
        cancelHudTimer();
        closePlayerPanel();
        var old = document.getElementById("playback-error");
        if (old && old.parentNode) { old.parentNode.removeChild(old); }
        var panel = element("section", "playback-error");
        panel.id = "playback-error";
        panel.setAttribute("role", "alertdialog");
        panel.appendChild(element("h2", "", translate("Playback problem")));
        panel.appendChild(element("p", "help-text", message));
        button(panel, "Retry playback", function () {
            recoverPlayer(false);
        });
        button(panel, "Restart", function () {
            recoverPlayer(true);
        });
        button(panel, "Stop playback", stopPlayer);
        button(panel, "Back", function () {
            if (panel.parentNode) { panel.parentNode.removeChild(panel); }
            showHud();
        });
        screen.appendChild(panel);
        panel.querySelector("button").focus();
        showHud();
    }

    function serviceView(title, restore, kind) {
        var generation = ++viewGeneration;
        clear(screen);
        resetImages();
        restoreView = restore;
        retryView = restore;
        page(translate(title), kind || "service");
        var toolbar = group(screen, "", "page-toolbar");
        button(toolbar, "Back", backView);
        setStatus("Loading...");
        focusLoading();
        return generation;
    }

    function openTelevision() {
        window.VemmTelevisionUi.create({
            client: function () { return currentClient; }, preferences: function () { return preferences; },
            screen: screen, view: serviceView, generation: function () { return viewGeneration; },
            element: element, button: button, translate: translate, visit: visit, back: backView,
            status: setStatus, focus: focusFirst, confirm: confirmServiceWrite,
            group: group, tile: titleTile
        }).open();
    }

    function catalogueUi() {
        return window.VemmCatalogueUi.create({
            account: function () { return accountClient; }, screen: screen, view: serviceView,
            generation: function () { return viewGeneration; }, element: element, button: button,
            translate: translate, visit: visit, status: setStatus, focus: focusFirst,
            // UIFLOW3 C3 (G21): the catalogue screens' watchlist writes go through this
            // seam too, so the badge index is invalidated on their success as well; the
            // wrap is otherwise transparent to confirmServiceWrite.
            confirm: function (title, write, refresh) {
                return confirmServiceWrite(title, function () {
                    return Promise.resolve().then(write).then(function (result) {
                        invalidateWatchlistIndex();
                        return result;
                    });
                }, refresh);
            },
            find: findCatalogueItem, group: group, tile: titleTile,
            artwork: function () { return currentClient; }
        });
    }

    // Exact plex:// GUID matches across reachable servers. "Other servers" (the LG alternate
    // sources panel) excludes the server you are on and labels each copy with its server and
    // resolution; OK opens that server's own detail page rather than swapping the playing copy,
    // because a resume position belongs to one copy.
    function findCatalogueItem(item, options) {
        options = options || {};
        var generation = serviceView(options.title || "Find in my libraries", function () { findCatalogueItem(item, options); });
        var targets = servers.length ? servers.filter(function (server) { return server.id !== options.exclude; }) : [null];
        if (!targets.length) { setStatus("No other servers are available to this profile."); return; }
        var index = 0, active = 0, finished = 0, shown = 0, failed = 0;
        function pump() {
            while (active < 2 && index < targets.length) {
                (function (server) {
                    active += 1;
                    (server ? window.PlexApi.selectServer(server, { onClient: function (client) {
                        if (generation !== viewGeneration) { return false; }
                        viewClients.push(client); return true;
                    } }).then(function (selected) { return selected.client; }) : Promise.resolve(currentClient))
                        .then(function (client) {
                            if (generation !== viewGeneration) { return; }
                            return client.getSections().then(function (sections) {
                                var matches = sections.filter(function (section) { return section.type === item.type; });
                                var chain = Promise.resolve();
                                matches.forEach(function (section) {
                                    chain = chain.then(function () {
                                        if (generation !== viewGeneration) { return; }
                                        return client.findGuid(section.key, item.guid).then(function (items) {
                                            if (generation !== viewGeneration) { return; }
                                            items.slice(0, 200 - shown).forEach(function (match) {
                                                if (options.labelled) {
                                                    var media = (match.Media || [])[0] || {};
                                                    screen.appendChild(element("p", "card-meta", [server ? server.name : "",
                                                        section.title, media.videoResolution ? media.videoResolution + (/^[0-9]+$/.test(media.videoResolution) ? "p" : "") : ""]
                                                        .filter(Boolean).join(" / ")));
                                                }
                                                card(screen, match, client); shown += 1;
                                            });
                                        });
                                    });
                                });
                                return chain;
                            });
                        }).catch(function (error) {
                            if (generation !== viewGeneration) { return; }
                            failed += 1;
                            screen.appendChild(element("p", "inline-error", errorText(error)));
                        }).then(function () {
                            active -= 1; finished += 1;
                            if (generation !== viewGeneration) { return; }
                            if (finished === targets.length) {
                                if (failed) { button(screen, "Retry", retryView); }
                                setStatus(failed ? "Some libraries could not be checked. Availability is incomplete." :
                                    shown ? (options.labelled ? "Other copies of this title. Each copy keeps its own resume position." :
                                        "Exact Plex GUID matches in your libraries.") : "This title is not available in the checked libraries.");
                                focusFirst();
                            } else { pump(); }
                        });
                }(targets[index++]));
            }
        }
        pump();
    }

    function confirmServiceWrite(title, write, refresh) {
        visit(function () {
            var generation = serviceView(title, refresh, "confirmation");
            screen.appendChild(element("p", "help-text", translate("This changes your Plex account or server. Nothing changes until you confirm.")));
            var pending = false;
            var confirm = button(screen, "Confirm", function () {
                if (pending || generation !== viewGeneration) { return; }
                pending = true; confirm.disabled = true;
                setStatus("Saving...");
                Promise.resolve().then(write).then(function () {
                    if (generation !== viewGeneration) { return; }
                    setStatus("Plex accepted the change.");
                    button(screen, "Refresh", refresh);
                }).catch(function (error) {
                    if (generation !== viewGeneration) { return; }
                    setStatus(translate("The change was not confirmed. Check Plex before retrying.") + " " + errorText(error), true);
                });
            });
            button(screen, "Cancel", backView);
            setStatus("Review the change before confirming.");
            focusFirst();
        });
    }

    // UIF-P2 (TV-UIFLOWS §2): the viewer's own star rating. The panel is the settings choice
    // pattern with a 1..10 star ladder plus "Remove rating" (the server's -1 reset). Star
    // glyphs are assembled at runtime — they are symbols, not translatable words.
    function openRatingPanel(item, client) {
        if (!item || !item.ratingKey || !client || !client.setRating) { return; }
        var values = [];
        for (var stars = 10; stars >= 1; stars -= 1) {
            var glyphs = "";
            for (var filled = 0; filled < stars; filled += 1) { glyphs += "\u2605"; }
            values.push({ value: stars, label: glyphs + " " + stars });
        }
        values.push({ value: 0, label: "Remove rating" });
        var api = window.PlexApi;
        var current = api && api.ratingFor ? api.ratingFor(item) : Number(item.userRating);
        settingsChoices("Rate", values, current ? Math.round(current) : 0, function (value) {
            var remove = value === 0;
            confirmServiceWrite(remove ? "Remove rating" : "Rate", function () {
                return client.setRating(item, remove ? -1 : value);
            }, function () { openDetail(item.ratingKey, client, null, remove ? 0 : value); });
        });
    }

    function openPhotos(items, index, client) {
        lastDetailShow = null;
        stopThemeMusic();
        viewGeneration += 1;
        clear(screen);
        viewClients.push(client);
        resetImages();
        screen.className = "screen screen-photos";
        restoreView = function () { openPhotos(items, index, client); };
        try {
            if (!window.URL || !window.URL.createObjectURL) { throw new Error("Photo display is unavailable in this runtime."); }
            var viewer = window.VemmPhotos.create({
                items: items, index: index, client: client, parent: screen, element: element,
                button: button, status: setStatus, translate: translate, urls: window.URL, back: backView
            });
            viewCleanup = viewer.close;
        } catch (error) { setStatus(errorText(error), true); button(screen, "Back", backView); }
        focusFirst();
    }

    function startAlbum(item, client, shuffle) {
        if (queueLoading || player || playerClosing) { return; }
        queueLoading = true;
        var generation = viewGeneration;
        setStatus(translate("Loading music queue..."));
        client.getTracks(item.ratingKey).then(function (tracks) {
            if (generation !== viewGeneration || player) { return; }
            playQueue = window.VemmQueue.create(tracks);
            queueShuffle = shuffle;
            queueRepeat = "off";
            playQueue.shuffle(shuffle);
            return client.getMetadata(playQueue.current().ratingKey).then(function (track) {
                if (generation === viewGeneration && !player) { startPlayer(track, client, 0); }
            });
        }).catch(function (error) {
            if (generation === viewGeneration) { playQueue = null; showPlayerError(error); }
        }).then(function () { queueLoading = false; });
    }

    // "Play all" builds a client-side run through every playable leaf behind a show, season or
    // collection, so playback keeps going even when the server has no continuous play queue.
    function playAllFromDetail(item, client, shuffle) {
        if (queueLoading || player || playerClosing) { return; }
        queueLoading = true;
        var generation = viewGeneration;
        setStatus("Loading...");
        client.getAllLeaves(item.ratingKey, 0).then(function (container) {
            if (generation !== viewGeneration || player) { return; }
            var items = (container.Metadata || []).filter(function (entry) {
                return ["movie", "episode", "clip"].indexOf(entry.type) !== -1 &&
                    /^[0-9]+$/.test(String(entry.ratingKey));
            }).slice(0, 200);
            if (!items.length) { throw new Error("This item has no playable episodes."); }
            playQueue = window.VemmQueue.create(items);
            queueShuffle = shuffle;
            queueRepeat = "off";
            playQueue.shuffle(shuffle);
            return client.getMetadata(playQueue.current().ratingKey).then(function (start) {
                if (generation === viewGeneration && !player) { startPlayer(start, client, 0); }
            });
        }).catch(function (error) {
            if (generation === viewGeneration) { playQueue = null; showPlayerError(error); }
        }).then(function () { queueLoading = false; });
    }

    // UIF-P3: Play all / Shuffle all on shelves and library toolbars start the same run from an
    // already-loaded collection, mirroring playAllFromDetail's contract for an id-driven fetch.
    function playableLeaves(items) {
        return (items || []).filter(function (entry) {
            return entry && ["movie", "episode", "clip"].indexOf(entry.type) !== -1 &&
                /^[0-9]+$/.test(String(entry.ratingKey));
        });
    }

    function playList(items, client, shuffle) {
        if (queueLoading || player || playerClosing) { return; }
        // The official row-header run enqueues what the shelf shows; keep the plan's 100-item
        // cap (the queue module itself tolerates 200).
        var leaves = playableLeaves(items).slice(0, 100);
        if (!leaves.length) { setStatus("Nothing here can be played.", true); return; }
        queueLoading = true;
        var generation = viewGeneration;
        try {
            playQueue = window.VemmQueue.create(leaves);
        } catch (error) {
            playQueue = null; queueLoading = false; setStatus(errorText(error), true); return;
        }
        queueShuffle = shuffle;
        queueRepeat = "off";
        playQueue.shuffle(shuffle);
        client.getMetadata(playQueue.current().ratingKey).then(function (start) {
            if (generation === viewGeneration && !player) { startPlayer(start, client, 0); }
        }).catch(function (error) {
            if (generation === viewGeneration) { playQueue = null; showPlayerError(error); }
        }).then(function () { queueLoading = false; });
    }

    // UIF-P3: the card menu's Play Next / Add to Queue rows edit only this run's local queue
    // (the server-side /playQueues store is deliberately not written; UIFLOW_PLAN defers it),
    // so there is no confirmation screen for them.
    function queueCardItem(item, client, next) {
        if (player && playQueue) {
            try {
                if (next) { playQueue.insertNext(item); setStatus("Playing next."); }
                else { playQueue.append(item); setStatus("Added to the queue."); }
            } catch (error) { setStatus(queueErrorText(error), true); }
            return;
        }
        if (next) { playFromCard(item, client, false); return; }
        setStatus("Nothing is playing to add to. Start playback, then queue items from a card.");
    }

    function skipQueued(delta, automatic) {
        if (!player || !playQueue || playerClosing || queueLoading) { return; }
        queueLoading = true;
        var client = playerClient;
        var previous = playerItem;
        stopPlayer(function () {
            var next = delta < 0 ? playQueue.previous() : playQueue.next(automatic);
            if (!next) {
                playQueue = null; queueLoading = false;
                renderDetail(previous, client);
                return;
            }
            renderDetail(next, client);
            var generation = viewGeneration;
            client.getMetadata(next.ratingKey).then(function (track) {
                if (generation === viewGeneration && !player) { startPlayer(track, client, 0); }
            }).catch(function (error) {
                if (generation === viewGeneration) { playQueue = null; showPlayerError(error); }
            }).then(function () { queueLoading = false; });
        }).then(function () { if (player) { queueLoading = false; } });
    }

    // Transport previous/next stepping for a single episode started from a detail page
    // (no run queue): resolve the successor/predecessor through the series leaves.
    function skipEpisode(delta) {
        if (!player || playerClosing || queueLoading) { return; }
        var item = playerItem;
        var client = playerClient;
        if (!item || item.type !== "episode" || !client) { return; }
        queueLoading = true;
        var generationBefore = viewGeneration;
        stopPlayer(function () {
            var lookup = delta < 0 ? client.previousEpisode : client.nextEpisode;
            Promise.resolve(lookup.call(client, item)).then(function (next) {
                queueLoading = false;
                if (!next) { renderDetail(item, client); return; }
                renderDetail(next, client);
                var generation = viewGeneration;
                client.getMetadata(next.ratingKey).then(function (track) {
                    if (generation === viewGeneration && !player) { startPlayer(track, client, 0); }
                }).catch(function (error) {
                    if (generation === viewGeneration) { showPlayerError(error); }
                });
            }).catch(function (error) {
                queueLoading = false;
                if (viewGeneration === generationBefore) { showPlayerError(error); }
            });
        }).then(function () { if (player) { queueLoading = false; } });
    }

    // Owner request 2026-11-05: the transport row steps by episode instead of by
    // seconds. Previous restarts the current episode unless the playhead is still
    // near the start, in which case it steps to the previous episode.
    function previousTrack() {
        if (!player) { return; }
        var nearStart = player.snapshot().position < preferences.skipInterval * 1000;
        if (nearStart && playQueue) { skipQueued(-1, false); return; }
        if (nearStart && playerItem && playerItem.type === "episode") { skipEpisode(-1); return; }
        seekToPlayer(0);
    }

    function nextTrack() {
        if (!player) { return; }
        if (playQueue) { skipQueued(1, false); return; }
        if (playerItem && playerItem.type === "episode") { skipEpisode(1); }
    }

    function cancelHudTimer() {
        if (hudTimer !== null) { clearTimeout(hudTimer); hudTimer = null; }
    }

    function showHud() {
        cancelHudTimer();
        var hud = screen.querySelector(".player-hud");
        var shell = document.querySelector(".app-shell");
        if (hud) { hud.hidden = false; }
        if (shell) { shell.classList.remove("hud-hidden"); }
        if (!player || playerClosing || hudBuffering ||
                player.snapshot().state !== "playing" ||
                document.getElementById("player-menu") || document.getElementById("player-info") ||
                document.getElementById("chapter-strip") || document.getElementById("playback-stats") ||
                document.getElementById("subtitle-timing") || document.getElementById("up-next-panel") ||
                document.getElementById("playback-error") ||
                status.className.indexOf("status-error") !== -1) { return; }
        var owner = player;
        hudTimer = setTimeout(function () {
            hudTimer = null;
            if (player !== owner || playerClosing || hudBuffering ||
                    owner.snapshot().state !== "playing" ||
                    document.getElementById("player-menu") || document.getElementById("player-info") ||
                    document.getElementById("chapter-strip") || document.getElementById("playback-stats") ||
                    document.getElementById("subtitle-timing") || document.getElementById("up-next-panel") ||
                    document.getElementById("playback-error")) { return; }
            if (hud) {
                if (hud.contains(document.activeElement)) {
                    hudFocus = document.activeElement;
                    hudFocus.blur();
                }
                hud.hidden = true;
            }
            if (shell) { shell.classList.add("hud-hidden"); }
        }, 5000);
    }

    function closePlayerMenu() {
        var menu = document.getElementById("player-menu");
        if (menu) { menu.parentNode.removeChild(menu); }
        showHud();
        var controls = screen.querySelectorAll(".playback-controls button");
        if (controls.length) { controls[controls.length - 1].focus(); }
    }

    // Samsung's Return key policy: Back on the app's home page shows an exit confirmation, and the
    // app terminates only on an explicit choice (developer.samsung.com, "Terminating Applications").
    // Stay is focused so a repeated press never quits; Back dismisses like Stay.
    function confirmExit() {
        var returnFocus = document.activeElement;
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var dialog = element("section", "player-menu exit-prompt");
        dialog.id = "player-menu";
        dialog.setAttribute("role", "alertdialog");
        dialog.setAttribute("aria-modal", "true");
        var title = element("h2", "", translate("Exit app?"));
        title.id = "exit-prompt-title";
        dialog.setAttribute("aria-labelledby", title.id);
        dialog.appendChild(title);
        function dismiss() {
            if (dialog.parentNode) { dialog.parentNode.removeChild(dialog); }
            if (returnFocus && returnFocus.focus && screen.contains(returnFocus)) { returnFocus.focus(); }
            else { focusFirst(); }
        }
        dialog.plexDismiss = dismiss;
        var stay = button(dialog, "Stay", dismiss, false, "none");
        button(dialog, "Exit", function () {
            try { window.tizen.application.getCurrentApplication().exit(); }
            catch (error) { setStatus("The app could not close itself. Hold Back on the remote to exit.", true); }
        }, false, "none");
        screen.appendChild(dialog);
        stay.focus();
    }

    var QUALITY_NAMES = { "1080h": ["1080", "20"], "1080": ["1080", "8"], "720": ["720", "4"],
        "720l": ["720", "2"], "480": ["480", "0.7"] };
    var SUBTITLE_COLORS = ["white", "grey_85", "grey_70", "grey_55", "grey_40", "grey_28", "yellow"];
    function colorName(value) {
        return { white: "White", grey_85: "Silver", grey_70: "Light gray", grey_55: "Gray",
            grey_40: "Dark gray", grey_28: "Charcoal", yellow: "Yellow" }[value] || value;
    }
    function backgroundName(value) { return value === "on" ? "On" : "Off"; }
    function qualityLadder() {
        return (window.VemmPreferences && window.VemmPreferences.qualities) ||
            ["original", "1080h", "1080", "720", "720l", "480"];
    }
    function qualityName(quality) {
        var rung = QUALITY_NAMES[quality];
        if (quality === "original" || !rung) { return translate("Original quality"); }
        return translate("{height}p · {mbps} Mbps (converts)", { height: rung[0], mbps: rung[1] });
    }
    function reasonName(reason) {
        return translate({
            supported: "media matches this TV capability profile",
            profile: "this TV's formats are not known", "video-codec": "video format not supported by this TV",
            container: "file type not supported for this format", "audio-codec": "audio format not supported by this TV",
            "audio-container": "audio format not supported in this file type", resolution: "resolution too high for this TV",
            quality: "quality limit chosen", bitrate: "bitrate too high for this TV", "bit-depth": "colour depth not supported",
            "frame-rate": "frame rate above 60 fps", level: "H.264 level too high for this TV",
            hdr: "HDR not supported by this panel", "dolby-vision": "Dolby Vision not supported",
            subtitle: "subtitles are burned in", multipart: "the file is split into parts", settings: "Direct play is off in Settings", "server": "the server declined the original file",
            "decoder": "this TV could not decode the original"
        }[reason] || "converted by the server");
    }
    function fallbackName(fallback) {
        return translate({
            "server-transcode-if-refused": "Server transcode if Plex or AVPlay refuses the original",
            "stop-if-refused": "Stop with an error if the original is refused",
            none: "No additional fallback planned"
        }[fallback] || "No additional fallback planned");
    }
    function capabilityName(capability) {
        if (!capability || capability.status === "unknown") {
            return translate("No device capability evidence");
        }
        return capability.measured ?
            translate("Observed on this exact registered TV") :
            translate("Published Samsung specifications, not measured on this TV");
    }
    function modeName(mode) {
        return translate(mode === "direct" ? "Direct Play" : mode === "directstream" ? "Direct Stream" : "Transcode");
    }
    function qualityLabel(media) {
        if (!media) { return translate("Not reported by server"); }
        return [media.height ? media.height + "p" : media.videoResolution || "",
            media.videoCodec || media.audioCodec || "",
            media.bitrate ? (Number(media.bitrate) / 1000).toFixed(1) + " Mbps" : ""].filter(Boolean).join(" · ") ||
            translate("Not reported by server");
    }

    function applySubtitleAppearance(node) {
        if (!node) { return; }
        node.className = "subtitle-text";
        if (!externalCues) { return; }
        node.className += " subtitle-size-" + preferences.subtitleSize +
            " subtitle-position-" + preferences.subtitlePosition +
            " subtitle-color-" + preferences.subtitleColor +
            " subtitle-background-" + preferences.subtitleBackground;
    }

    function refreshSubtitleAppearance() {
        applySubtitleAppearance(document.getElementById("subtitle-text"));
    }

    function preferenceChoice(parent, title, preferenceKey, values, labelForValue, onChange) {
        var options = values.map(function (value) {
            return { value: value, label: labelForValue(value) };
        });
        var selected = options.filter(function (option) { return option.value === preferences[preferenceKey]; })[0];
        button(parent, translate("{setting}: {value}", {
            setting: translate(title), value: selected ? translate(selected.label) : ""
        }), function () {
            settingsChoices(title, options.map(function (option) {
                return { value: option.value, label: translate(option.label) };
            }), preferences[preferenceKey], function (value) {
                preferences[preferenceKey] = value;
                if (savePreferences()) {
                    if (onChange) { onChange(value); }
                    backView();
                }
            });
        }, false, "settings");
    }

    function openPlaybackOptions() {
        if (!player) { return; }
        cancelScrub();
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu grouped-menu playback-options");
        menu.id = "player-menu";
        menu.setAttribute("role", "dialog");
        menu.setAttribute("aria-labelledby", "playback-options-title");
        var heading = element("h2", "menu-heading", translate("Playback options"));
        heading.id = "playback-options-title";
        menu.appendChild(heading);
        var content = groupedMenuContent(menu);
        var playback = group(content, translate("Playback"));
        button(playback, "Markers", openMarkers).className += " menu-drill-in";
        button(playback, "Audio and subtitles", function () { openTracks("subtitle"); }).className += " menu-drill-in";
        if (externalCues) { button(playback, "Subtitle timing", openSubtitleTiming).className += " menu-drill-in"; }
        button(playback, "Quality and version", openQuality).className += " menu-drill-in";
        var information = group(content, translate("Information"));
        button(information, "Stats for nerds", function () {
            closePlayerMenu();
            togglePlayerStats();
        });
        button(information, "Info", function () { closePlayerMenu(); openPlayerPanel("info"); }).className += " menu-drill-in";
        if (playQueue && playQueue.items().length > 1) {
            var episodes = playerItem.type !== "track";
            var queue = group(content, episodes ? translate("Queue") : translate("Music queue"));
            // UIFLOW3 B9 (G55): the queue panel is no longer video-only — audio runs get
            // the same browse/remove/reorder panel. The group keeps its music label. The
            // drill-in chevron stays on the video row only: the protected media-ui suite
            // pins the audio options menu to exactly four drill-in controls.
            var queueRow = button(queue, "Queue", function () { openQueuePanel(); });
            if (episodes) { queueRow.className += " menu-drill-in"; }
            button(queue, episodes ? translate("Previous episode") : "Previous track", function () { skipQueued(-1, false); });
            button(queue, episodes ? translate("Next episode") : "Next track", function () { skipQueued(1, false); });
            button(queue, "Shuffle / On or off", function () {
                queueShuffle = playQueue.shuffle(!queueShuffle);
                setStatus(translate(queueShuffle ? "Shuffle on." : "Shuffle off."));
            });
            button(queue, "Repeat / Off, one, all", function () {
                queueRepeat = queueRepeat === "off" ? "one" : queueRepeat === "one" ? "all" : "off";
                playQueue.repeat(queueRepeat);
                setStatus(translate("Repeat") + ": " + translate(queueRepeat));
            });
        }
        var session = group(content, "", "menu-session-actions");
        button(session, "Stop and return to details", stopPlayer);
        button(session, "Close menu", closePlayerMenu);
        menu.appendChild(element("p", "menu-footer", translate("Back closes this menu and returns focus to More.")));
        screen.appendChild(menu);
        menu.querySelectorAll("button")[0].focus();
        menu.vemmUpdateScroll();
    }

    // UIF-P3 (STATE-DIFF rank 1): the Play Queue panel, reached from the More menu. The current
    // item is highlighted; jumping, moving and removing act on this run's local queue only, so
    // they never open a confirmation screen. Remote BACK finds the "Playback options" row and
    // returns to the options menu (see the keydown handler).
    function openQueuePanel(focusKey, focusAction) {
        if (!player || !playQueue) { return; }
        cancelScrub();
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu grouped-menu queue-panel");
        menu.id = "player-menu";
        menu.setAttribute("role", "dialog");
        menu.setAttribute("aria-labelledby", "queue-panel-title");
        var heading = element("h2", "menu-heading", translate("Play Queue"));
        heading.id = "queue-panel-title";
        menu.appendChild(heading);
        var content = groupedMenuContent(menu);
        var list = group(content, translate("Queue"));
        var items = playQueue.items();
        var current = playQueue.position();
        items.forEach(function (item, position) {
            var row = element("div", "queue-row" + (position === current ? " queue-current" : ""));
            row.setAttribute("data-rating-key", String(item.ratingKey));
            // UIFLOW3 B9 (G55): queue rows used to assume video titles; a track row now
            // reads "title — artist / album" using the same byline fields the player HUD
            // shows, with the old fallback kept for items without a title.
            var rowLabel = item.title || translate("Selected item");
            if (item.type === "track" && item.title) {
                var byline = [item.grandparentTitle || item.albumArtist || item.artist || item.byline,
                    item.parentTitle].filter(Boolean).join(" / ");
                if (byline) { rowLabel = item.title + " — " + byline; }
            }
            var play = button(row, rowLabel, function () { jumpQueued(position); });
            play.className += " queue-title";
            play.setAttribute("data-queue-action", "queue-jump");
            if (position === current) {
                play.setAttribute("aria-current", "true");
                row.appendChild(element("span", "queue-playing", translate("Playing")));
                list.appendChild(row);
                return;
            }
            if (position > 0) {
                var up = button(row, "Move up", function () { moveQueued(position, position - 1); });
                up.setAttribute("data-queue-action", "move-up");
            }
            if (position + 1 < items.length) {
                var down = button(row, "Move down", function () { moveQueued(position, position + 1); });
                down.setAttribute("data-queue-action", "move-down");
            }
            var remove = button(row, "Remove", function () { removeFromQueue(position); });
            remove.setAttribute("data-queue-action", "remove");
            list.appendChild(row);
        });
        var session = group(content, "", "menu-session-actions");
        button(session, "Playback options", openPlaybackOptions);
        button(session, "Close menu", closePlayerMenu);
        menu.appendChild(element("p", "menu-footer", translate("Back returns to Playback options.")));
        screen.appendChild(menu);
        var focusTarget = null;
        Array.prototype.forEach.call(menu.querySelectorAll(".queue-row"), function (row) {
            if (focusKey && row.getAttribute("data-rating-key") === String(focusKey)) {
                focusTarget = row.querySelector('[data-queue-action="' + focusAction + '"]') ||
                    row.querySelector("button");
            }
        });
        (focusTarget || menu.querySelectorAll("button")[0]).focus();
        menu.vemmUpdateScroll();
    }

    // Jump = stop the current item and start the selected one from the same queue (skipQueued's
    // shape, but aimed at a position instead of the next/previous slot).
    function jumpQueued(position) {
        if (!player || !playQueue || playerClosing || queueLoading) { return; }
        queueLoading = true;
        var client = playerClient;
        var previous = playerItem;
        stopPlayer(function () {
            var picked;
            try { picked = playQueue.select(position); } catch (error) {
                queueLoading = false;
                setStatus(queueErrorText(error), true);
                renderDetail(previous, client);
                return;
            }
            renderDetail(picked, client);
            var generation = viewGeneration;
            client.getMetadata(picked.ratingKey).then(function (track) {
                var started = false;
                if (generation === viewGeneration && !player) { startPlayer(track, client, 0); started = true; }
                // startPlayer() itself bumps viewGeneration, so re-open the panel on the run
                // this jump just started, not under the old view's generation.
                if (started && player) { openQueuePanel(picked.ratingKey, "queue-jump"); }
            }).catch(function (error) {
                if (generation === viewGeneration) { playQueue = null; showPlayerError(error); }
            }).then(function () { queueLoading = false; });
        }).then(function () { if (player) { queueLoading = false; } });
    }

    function moveQueued(from, to) {
        if (!player || !playQueue) { return; }
        var moved;
        try { moved = playQueue.moveTo(from, to); } catch (error) { setStatus(queueErrorText(error), true); return; }
        openQueuePanel(moved.ratingKey, to > from ? "move-down" : "move-up");
    }

    function removeFromQueue(position) {
        if (!player || !playQueue) { return; }
        try { playQueue.removeAt(position); } catch (error) { setStatus(queueErrorText(error), true); return; }
        setStatus("Removed from the queue.");
        openQueuePanel();
    }

    function queueErrorText(error) {
        // Queue mutation messages carry their own meaning; keep them instead of the generic
        // PMS-failure translation that errorText() would produce.
        if (/already in the queue/.test(error.message)) { return translate("That item is already in the queue."); }
        if (/playing item stays/.test(error.message)) { return translate("The playing item stays in the queue."); }
        if (/^Only playable items/.test(error.message)) { return translate("Only playable items can join the queue."); }
        if (/another position/.test(error.message)) { return translate("Move the item to another position in the queue."); }
        return errorText(error);
    }

    // Music keeps its artwork, credits and queue position on screen after the transport controls
    // fade away, the way Plex's now-playing view does. It sits behind the HUD, so hiding the HUD
    // never hides the context.
    function nowPlayingPanel(item, client) {
        var panel = element("section", "now-playing");
        panel.id = "now-playing";
        var art = element("div", "now-playing-art");
        var image = element("img", "now-playing-artwork");
        image.alt = "";
        image.src = placeholderArt();
        art.appendChild(image);
        panel.appendChild(art);
        var body = element("div", "now-playing-body");
        body.appendChild(element("h2", "now-playing-title", item.title || translate("Playing")));
        var credits = [item.albumArtist || item.artist || item.byline, item.parentTitle || item.album]
            .filter(Boolean).join(" — ");
        body.appendChild(element("p", "now-playing-credits", credits || translate("Unknown track")));
        if (playQueue) {
            var total = playQueue.items().length;
            if (total > 1) {
                body.appendChild(element("p", "now-playing-queue", translate("Playing {index} of {total}", {
                    index: playQueue.position() + 1, total: total
                })));
            }
        }
        panel.appendChild(body);
        if (item.parentArt || item.art) { queueImage(image, client, item.parentArt || item.art, { width: 400, height: 400 }); }
        return panel;
    }

    function stopThemeMusic() {
        themeMusic.generation += 1;
        themeMusic.showKey = null;
        if (themeMusic.player) {
            var adapter = themeMusic.player;
            themeMusic.player = null;
            try { adapter.close(); } catch (error) { /* already stopped */ }
        }
    }

    function hideScreensaver() {
        if (screensaver.idleTimer !== null) { clearTimeout(screensaver.idleTimer); screensaver.idleTimer = null; }
        if (screensaver.fadeTimer !== null) { clearTimeout(screensaver.fadeTimer); screensaver.fadeTimer = null; }
        if (screensaver.wanderTimer !== null) { clearInterval(screensaver.wanderTimer); screensaver.wanderTimer = null; }
        if (screensaver.el && screensaver.el.parentNode) { screensaver.el.parentNode.removeChild(screensaver.el); }
        screensaver.el = null;
        screensaver.visible = false;
    }

    function moveScreensaverLogo() {
        if (!screensaver.el || !screensaver.visible) { return; }
        var logo = screensaver.el.querySelector(".screensaver-logo");
        if (!logo) { return; }
        // Park the mark somewhere new, show it briefly, then fade it out again.
        logo.style.left = (8 + Math.floor(Math.random() * 84)) + "%";
        logo.style.top = (10 + Math.floor(Math.random() * 76)) + "%";
        logo.style.opacity = "0.55";
        if (screensaver.fadeTimer !== null) { clearTimeout(screensaver.fadeTimer); }
        screensaver.fadeTimer = setTimeout(function () {
            screensaver.fadeTimer = null;
            logo.style.opacity = "0";
        }, 4000);
    }

    // Owner report 2026-11-07: a paused video is a still frame and burns in just as
    // well as a menu, so the saver must cover it. A moving picture is exempt and the
    // idle check re-arms so a video that finishes or pauses later is still guarded.
    function screensaverVideoAllowed() {
        if (playerClosing) { return false; }
        if (!player) { return true; }
        var snapshot = null;
        try { snapshot = player.snapshot(); } catch (error) { return false; }
        return !!snapshot && snapshot.state === "paused";
    }

    function showScreensaver() {
        screensaver.idleTimer = null;
        if (screensaver.visible || !screensaverEnabled()) { return; }
        if (!screensaverVideoAllowed()) {
            armScreensaver();
            return;
        }
        screensaver.visible = true;
        var el = element("div", "screensaver");
        el.id = "screensaver";
        el.setAttribute("aria-hidden", "true");
        var logo = element("img", "screensaver-logo", "");
        logo.src = "brand/vemm-mark.svg";
        logo.alt = "";
        el.appendChild(logo);
        document.body.appendChild(el);
        screensaver.el = el;
        moveScreensaverLogo();
        screensaver.wanderTimer = setInterval(moveScreensaverLogo, screensaverMoveMs);
    }

    function armScreensaver() {
        if (screensaver.idleTimer !== null) { clearTimeout(screensaver.idleTimer); screensaver.idleTimer = null; }
        if (!screensaverEnabled() || screensaver.visible) { return; }
        screensaver.idleTimer = setTimeout(showScreensaver, screensaverIdleMs);
    }

    function screensaverEnabled() { return preferences.screenSaver === "on"; }

    // Plays the show's theme song while its detail page is open, looping quietly in the
    // background. Silent when the preference is off, the server has no theme song, the
    // runtime has no AVPlay, or a video has taken the playback engine.
    function startThemeMusic(item, client) {
        stopThemeMusic();
        if (!item || item.type !== "show" || preferences.themeMusic !== "on") { return; }
        if (player || playerClosing || !client || typeof client.themeSong !== "function") { return; }
        var generation = themeMusic.generation;
        var showKey = item.ratingKey;
        themeMusic.showKey = showKey;
        client.themeSong(item.ratingKey).then(function (song) {
            if (generation !== themeMusic.generation || themeMusic.showKey !== showKey) { return; }
            if (!song || !song.url || player || playerClosing) { return; }
            var adapter;
            function startLoop() {
                adapter.open(song.url, 0, false).then(function () {
                    if (themeMusic.player !== adapter || generation !== themeMusic.generation) { return; }
                    adapter.play();
                    adapter.setVolume(themeMusicVolume);
                }).catch(function () {
                    if (themeMusic.player === adapter) { stopThemeMusic(); }
                });
            }
            try {
                adapter = window.VemmAvplay.create({
                    avplay: window.webapis && window.webapis.avplay,
                    onEvent: function (event) {
                        if (themeMusic.player !== adapter || generation !== themeMusic.generation) { return; }
                        if (event.type === "ended") { startLoop(); }
                        else if (event.type === "error") { stopThemeMusic(); }
                    }
                });
                themeMusic.player = adapter;
                startLoop();
            } catch (error) {
                if (themeMusic.player === adapter) { stopThemeMusic(); }
            }
        }).catch(function () { /* a missing or unreachable theme song stays silent */ });
    }

    // UIFLOW3 A4: a title picked up from its saved position starts N seconds earlier so the
    // viewer re-orients. Cold starts (offset 0) and "none" are untouched.
    function rewindResumeOffset(offset) {
        var start = offset || 0;
        if (!(start > 0)) { return start; }
        var seconds = Number(preferences.rewindOnResume || "none");
        if (!(seconds > 0)) { return start; }
        return Math.max(0, start - seconds * 1000);
    }

    // UIFLOW3 A2: cinema trailers. A movie started from the top plays up to N trailers from
    // its existing extras first; the chain lives in module state so it survives the player's
    // generation guards and teardown. Trailers are clips: no markers, no Up Next, and they
    // never enter the visible play queue.
    function resetCinemaChain() {
        cinema.active = false; cinema.item = null; cinema.client = null;
        cinema.queue = []; cinema.pending = null; cinema.current = null;
    }

    function cinemaTrailersFor(item, offset) {
        if (!item || item.type !== "movie" || offset > 0 || cinema.pending === item) { return null; }
        if (!window.VemmItemMenu || !window.VemmItemMenu.trailersFor) { return null; }
        var count = Number(preferences.cinemaTrailers || "off");
        if (!(count > 0)) { return null; }
        var trailers = window.VemmItemMenu.trailersFor(item);
        if (!trailers || !trailers.length) { return null; }
        return trailers.slice(0, count);
    }

    function consumeCinemaTrailers() {
        // Called from the player-end path: true when the chain swallowed the finish.
        if (!cinema.active || playerItem !== cinema.current) { return false; }
        var client = cinema.client;
        if (cinema.queue.length) {
            cinema.current = cinema.queue.shift();
            stopPlayer(function () { startPlayer(cinema.current, client, 0, 0, null); });
            return true;
        }
        cinema.pending = cinema.item;
        cinema.active = false; cinema.current = null; cinema.queue = [];
        var movie = cinema.item;
        stopPlayer(function () { startPlayer(movie, client, 0, 0, null); });
        return true;
    }

    function startPlayer(item, client, offset, mediaIndex, trackOptions) {
        if (player || playerClosing) { return; }
        // UIFLOW3 A4: rewind resumes before anything reads the offset. The chain check uses
        // the original offset so a rewind-to-zero can never look like a cold start.
        var resumeOffset = offset || 0;
        offset = rewindResumeOffset(offset);
        // UIFLOW3 A2: arm the cinema chain for a movie started from the top.
        var chain = cinemaTrailersFor(item, resumeOffset);
        if (chain) {
            cinema.active = true; cinema.item = item; cinema.client = client;
            cinema.queue = chain.slice(1); cinema.current = chain[0];
            startPlayer(chain[0], client, 0, 0, null);
            return;
        }
        if (cinema.pending === item) { cinema.pending = null; }
        // UIFLOW3 A1: a track choice made on the details page rides along with playback;
        // the side the viewer never touched keeps the server's selected-track default.
        if (!trackOptions && item.ratingKey && prePlayTracks[item.ratingKey]) {
            var preChoice = prePlayTracks[item.ratingKey];
            trackOptions = { audioId: preChoice.audioId, subtitleId: preChoice.subtitleId };
        }
        // Video and theme music share the one AVPlay instance: hand it over first.
        stopThemeMusic();
        hideScreensaver();
        // A queue built for this run keeps its order; anything started on its own resets it.
        if (playQueue && playQueue.current().ratingKey === item.ratingKey) {
            /* keep the run that is already playing */
        } else if (item.type === "track") {
            playQueue = window.VemmQueue.create([item]);
            queueShuffle = false; queueRepeat = "off";
        } else if (item.type !== "clip") {
            // UIFLOW3 A2: trailer clips must never clear a run's queue.
            playQueue = null;
        }
        viewGeneration += 1;
        resetImages();
        clear(screen);
        hudBuffering = false;
        hudFocus = null;
        hudPauseControl = null;
        scrubReturnFocus = null;
        playerPanel = "";
        playerStatsVisible = false;
        subtitleTiming = false;
        playerItem = item;
        playerClient = client;
        playerPosition = offset || 0;
        playerDuration = item.duration || 0;
        syncToastAt = 0;
        playerSettings = {
            offset: offset || 0, mediaIndex: mediaIndex || 0, quality: preferences.quality,
            audioId: trackOptions ? trackOptions.audioId : undefined,
            subtitleId: trackOptions ? trackOptions.subtitleId : undefined,
            overlaySubtitle: !!(trackOptions && trackOptions.cues),
            burnSubtitles: preferences.subtitleBurnIn !== "off",
            subtitleSidecar: !!(trackOptions && trackOptions.subtitleSidecar),
            paused: !!(trackOptions && trackOptions.paused),
            profile: directPlayProfile(), directPlay: preferences.directPlay
        };
        externalCues = trackOptions && trackOptions.cues || null;
        document.body.className = "playing";
        startProgressAnnouncements();
        var hud = element("section", "player-hud");
        hud.appendChild(element("h2", "", item.title || "Playing"));
        var context = [item.grandparentTitle, item.parentTitle].filter(Boolean).join(" / ");
        if (item.index) { context += (context ? " / " : "") + translate("Episode {number}", { number: item.index }); }
        if (context) { hud.appendChild(element("p", "playback-context", context)); }
        var time = element("div", "playback-time");
        var elapsed = element("span", "playback-elapsed", translate("Preparing playback..."));
        elapsed.id = "playback-time";
        time.appendChild(elapsed);
        time.appendChild(element("span", "playback-remaining", playerRemaining(playerPosition, playerDuration)));
        // TV-UIFLOWS §1: the chapter the playhead is inside reads beside the remaining-time clock.
        if (item.Chapter && item.Chapter.length) {
            time.appendChild(element("span", "playback-chapter", currentChapterTitle(playerPosition)));
        }
        hud.appendChild(time);
        var progress = element("div", "playback-progress");
        progress.id = "playback-progress";
        progress.setAttribute("role", "slider");
        progress.setAttribute("tabindex", "0");
        progress.setAttribute("aria-label", translate("Playback position"));
        progress.setAttribute("aria-valuemin", "0");
        progress.setAttribute("aria-valuemax", String(item.duration || 1));
        progress.setAttribute("aria-valuenow", String(offset || 0));
        progress.setAttribute("aria-valuetext", timeLabel(offset || 0) + " / " + timeLabel(item.duration || 0));
        var progressFill = element("div", "playback-progress-fill");
        progress.appendChild(progressFill);
        // Chapter boundaries as tick marks on the scrub track (TV-UIFLOWS §1). They sit at
        // fixed positions, so one build per playback session covers every seek and clock tick.
        (item.Chapter || []).forEach(function (chapter) {
            var start = Number(chapter.startTimeOffset);
            if (!(start > 0) || !(item.duration > 0) || start >= item.duration) { return; }
            var tick = element("span", "chapter-tick");
            tick.setAttribute("aria-hidden", "true");
            tick.style.left = (start * 100 / item.duration) + "%";
            progress.appendChild(tick);
        });
        hud.appendChild(progress);
        var tabs = element("div", "player-tabs");
        button(tabs, "Info", function () { openPlayerPanel("info"); }, false, "none");
        if (item.Chapter && item.Chapter.length) {
            button(tabs, "Chapters", function () { openPlayerPanel("chapters"); }, false, "none");
        }
        hud.appendChild(tabs);
        var subtitle = element("p", "subtitle-text");
        subtitle.id = "subtitle-text";
        applySubtitleAppearance(subtitle);
        screen.appendChild(subtitle);
        var controls = element("div", "playback-controls");
        // Owner request 2026-11-05: the 10-second scrub buttons are replaced by
        // episode stepping. Previous restarts the current episode unless the
        // playhead is still near the start; Next always advances. Second-level
        // scrubbing stays on the remote keys and the progress slider.
        var previousControl = button(controls, "Previous episode", previousTrack, false, "previous");
        previousControl.setAttribute("aria-label", translate("Previous episode"));
        var pauseControl = button(controls, "Pause / Play", togglePlayer, false, "pause");
        pauseControl.setAttribute("aria-label", translate("Pause / Play"));
        hudPauseControl = pauseControl;
        var nextControl = button(controls, "Next episode", nextTrack, false, "next-episode");
        nextControl.setAttribute("aria-label", translate("Next episode"));
        button(controls, "Subtitles", function () { openTracks("subtitle"); }, false, "subtitles");
        button(controls, "Audio", function () { openTracks("audio"); }, false, "audio");
        var moreControl = button(controls, "More", openPlaybackOptions, false, "more");
        hud.appendChild(controls);
        var skip = { skipped: {}, declined: {}, key: null, control: null };
        function updateSkip(position) {
            var marker = window.VemmSkipMarkers.markerAt(item.Marker, position, skip.skipped);
            var next = window.VemmSkipMarkers.prompt(marker);
            // UIFLOW3 A5: "Disabled" hides the marker pill entirely — no prompt and no
            // auto-jump for that marker kind; "manually" keeps the pill, "automatically"
            // also jumps (handled by autoSkipEnabledFor below).
            if (next && autoSkipModeFor(marker) === "disabled") { next = null; }
            var nextKey = next ? next.key : null;
            if (nextKey === skip.key) { return; }
            var hadFocus = skip.control && document.activeElement === skip.control;
            if (skip.control) {
                if (hudFocus === skip.control) { hudFocus = null; }
                controls.removeChild(skip.control);
                skip.control = null;
                hudSkipControl = null;
            }
            skip.key = nextKey;
            if (!next) {
                if (hadFocus) { pauseControl.focus(); }
                return;
            }
            // Opt-in auto skip, per marker kind. It stays out of the way while the viewer is
            // scrubbing or has just sought by hand, and Back inside its window hands the marker straight back.
            if (autoSkipEnabledFor(marker) && !skip.declined[next.key] &&
                    !userIsSeeking() && !playerPanel && !playerClosing &&
                    !document.hidden && !document.getElementById("up-next-panel") &&
                    !document.getElementById("player-menu")) {
                if (next.action === "finish") {
                    skip.skipped[next.key] = true;
                    setStatus("Skipping credits.");
                    finishEpisode();
                    return;
                }
                beginAutoSkip(position, next, skip);
                return;
            }
            // Raised once as the segment starts, with focus on the button, so one OK skips.
            var control = button(controls, next.label, function () {
                if (!player || player !== ownPlayer || playerClosing) { return; }
                skip.skipped[next.key] = true;
                updateSkip(next.action === "seek" ? next.target : position);
                if (next.action === "finish") { finishEpisode(); }
                else { seekToPlayer(next.target); }
            }, false, "none");
            controls.removeChild(control);
            controls.insertBefore(control, moreControl);
            control.className += " skip-marker";
            skip.control = control;
            hudSkipControl = control;
            // UIFLOW3 B7 (G27): Back dismisses the raised pill first and stays in the
            // player. The marker is remembered as declined so it never re-raises; a
            // second Back then behaves exactly as it did before this pill existed.
            control.vemmDismiss = function () {
                skip.declined[next.key] = true;
                skip.skipped[next.key] = true;
                skip.key = null;
                if (hudFocus === control) { hudFocus = null; }
                if (control.parentNode === controls) { controls.removeChild(control); }
                skip.control = null;
                hudSkipControl = null;
                if (pauseControl) { pauseControl.focus(); }
            };
            // LG's Up Next: on the final credits marker of an episode, the full-screen card counts
            // down and starts the successor unless the viewer acts.
            var upNext = null;
            if (next.action === "finish" && item.type === "episode" && preferences.nextEpisode === "countdown" &&
                    !document.hidden) {
                upNext = showUpNext({
                    seconds: 10,
                    watchCredits: function () {
                        skip.skipped[next.key] = true;
                        updateSkip(position);
                        pauseControl.focus();
                    },
                    onStart: function (chosen) {
                        skip.skipped[next.key] = true;
                        finishEpisode(true, chosen);
                    },
                    onExpire: function (chosen) {
                        skip.skipped[next.key] = true;
                        finishEpisode(true, chosen);
                    }
                });
            }
            if (!document.getElementById("player-menu")) {
                showHud();
                // The Up Next card keeps focus on its own primary choice.
                if (!upNext) { control.focus(); }
            }
        }
        if (item.type === "track") { screen.appendChild(nowPlayingPanel(item, client)); }
        screen.appendChild(hud);
        var ownPlayer;
        try {
            var adapter = window.VemmAvplay.create({
                avplay: window.webapis && window.webapis.avplay,
                onEvent: function (event) {
                    if (!player || player !== ownPlayer || playerClosing) { return; }
                    if (event.type === "time") {
                        updatePlayerClocks(event.position, event.duration || item.duration);
                        var percent = Math.min(100, Math.max(0, event.position * 100 / (event.duration || item.duration || 1)));
                        progress.setAttribute("aria-valuemax", String(event.duration || item.duration || 1));
                        progress.setAttribute("aria-valuenow", String(Math.round(event.position)));
                        progress.setAttribute("aria-valuetext", timeLabel(event.position) + " / " +
                            timeLabel(event.duration || item.duration || 0));
                        if (progressFill.style) { progressFill.style.width = percent + "%"; }
                        updateSkip(event.position);
                        if (externalCues) {
                            var externalSubtitle = document.getElementById("subtitle-text");
                            if (externalSubtitle) {
                                externalSubtitle.textContent = window.VemmSubtitles.at(externalCues,
                                    event.position - preferences.subtitleDelayMs);
                            }
                        }
                    } else if (event.type === "subtitle") {
                        if (externalCues) { return; }
                        // In Direct Play, AVPlay selects an embedded text track on its own even
                        // when the Plex session has no subtitle stream ("Subtitles off"). Drop
                        // the cue and silence AVPlay rendering; best effort on the silence call.
                        var offSelection = null;
                        try { offSelection = player && player.selection ? player.selection() : null; }
                        catch (selectionError) { offSelection = null; }
                        if (offSelection && !offSelection.subtitleId) {
                            try { player.subtitles(false); } catch (silenceError) { /* best effort */ }
                            return;
                        }
                        var text = document.getElementById("subtitle-text");
                        if (text) {
                            text.textContent = window.VemmSubtitles.clean(event.detail.text);
                            if (subtitleTimer !== null) { clearTimeout(subtitleTimer); }
                            subtitleTimer = setTimeout(function () { text.textContent = ""; }, event.detail.duration || 3000);
                        }
                    } else if (event.type === "buffering") {
                        hudBuffering = !!event.detail;
                        setStatus(event.detail ? "Buffering..." : "");
                        showHud();
                    } else if (event.type === "state") {
                        pauseControl.className = pauseControl.className.replace(/menu-icon-(pause|play)/,
                            event.state === "paused" ? "menu-icon-play" : "menu-icon-pause");
                        showHud();
                    } else if (event.type === "resume-failed") {
                        setStatus("Couldn't return to where you left off. Playing from the start.");
                        showHud();
                    } else if (event.type === "error") {
                        showPlayerError({ message: event.detail });
                    } else if (event.type === "ended") {
                        finishEpisode();
                    }
                }
            });
            ownPlayer = window.VemmPlayback.create({
                adapter: adapter, client: client, item: item, settings: playerSettings,
                onEvent: function (event) {
                    if (event.type === "direct-fallback" && player === ownPlayer) {
                        setStatus("This TV could not play the original file. Asking Plex to convert it...");
                    }
                    if (event.type === "progress-error" || event.type === "cleanup-error") {
                        if (player === ownPlayer) { setStatus(errorText(event), true); }
                    }
                    // UIF-P1 (TV-UIFLOWS §5): a passive timeline save says "Saved to Plex."
                    // quietly — at most once a minute for this playback session, so the periodic
                    // progress writes never spam the status line.
                    if (event.type === "progress-synced" && player === ownPlayer) {
                        var now = Date.now();
                        if (syncToastAt === 0 || now - syncToastAt >= 60000) {
                            syncToastAt = now;
                            setStatus("Saved to Plex.");
                        }
                    }
                }
            });
            if ((item.type === "movie" || item.type === "episode") && currentServerId &&
                    client === currentClient && client.createVideoPlayQueue) {
                var queueSettings = playerSettings;
                client.createVideoPlayQueue(currentServerId, item.ratingKey).then(function (queue) {
                    if (playerSettings === queueSettings) { queueSettings.playQueue = queue; }
                }).catch(function () { /* the queue is optional; playback and progress continue without it */ });
            }
            player = ownPlayer;
            setStatus("Asking Plex for a compatible stream...");
            player.start().then(function () {
                if (player === ownPlayer) {
                    setStatus("");
                    showHud();
                }
            }).catch(function (error) {
                if (player === ownPlayer) { showPlayerError(error); }
            });
        } catch (error) {
            document.body.className = "";
            player = null;
            showHud();
            externalCues = null;
            renderDetail(item, client);
            showPlayerError(error);
        }
        // Owner request 2026-11-05: the default selection is Pause / Play, not the
        // transport edge, so OK toggles playback the moment the player opens.
        if (pauseControl) { pauseControl.focus(); }
    }

    function togglePlayer() {
        if (!player) { return; }
        try {
            var action = player.snapshot().state === "playing" ? player.pause() : player.play();
            action.then(showHud).catch(showPlayerError);
        } catch (error) { showPlayerError(error); }
    }

    function seekPlayer(delta) {
        if (!player) { return; }
        seekToPlayer(player.snapshot().position + delta);
    }

    function seekToPlayer(target) {
        if (!player || playerClosing) { return; }
        // Any hand-driven seek takes the playhead back from a pending auto skip.
        if (!skipUndo.applying) { clearSkipUndo(); }
        var selectedPlayer = player;
        player.seek(target).then(function (position) {
            if (player !== selectedPlayer || playerClosing) { return; }
            setStatus(translate("Seek landed at {time}.", { time: timeLabel(position) }));
            showHud();
        }).catch(function (error) {
            if (player === selectedPlayer && !playerClosing) { showPlayerError(error); }
        });
    }

    // UIFLOW3 B6 (G34): PageUp/PageDown hop to the previous/next chapter start when the
    // playing item has chapters; without chapters they seek ten minutes back/forward.
    // A hop past the last chapter lands on the end; PageUp before the first start goes
    // to zero, matching how the chapter strip reads.
    function pageStepPlayer(forward) {
        var snapshot = player.snapshot();
        var position = snapshot.position || 0;
        var duration = snapshot.duration || playerDuration || 0;
        var chapters = playerItem && playerItem.Chapter;
        if (chapters && chapters.length) {
            var index;
            if (forward) {
                for (index = 0; index < chapters.length; index += 1) {
                    var start = Number(chapters[index].startTimeOffset);
                    if (isFinite(start) && start > position + 1000) { seekToPlayer(start); return; }
                }
                seekToPlayer(duration);
            } else {
                for (index = chapters.length - 1; index >= 0; index -= 1) {
                    var back = Number(chapters[index].startTimeOffset);
                    if (isFinite(back) && back < position - 1000) { seekToPlayer(back); return; }
                }
                seekToPlayer(0);
            }
            return;
        }
        seekToPlayer(Math.max(0, Math.min(duration, position + (forward ? 600000 : -600000))));
    }

    function clearSkipUndo() {
        if (skipUndo.timer !== null) { clearTimeout(skipUndo.timer); skipUndo.timer = null; }
        skipUndo.position = null;
        skipUndo.marker = null;
        skipUndo.skipped = null;
        skipUndo.declined = null;
        skipUndo.state = null;
    }

    // Back inside the undo window returns to the segment start and hands the marker back to the
    // viewer, so an unwanted auto skip never costs them the part they wanted to watch.
    function undoSkipIfPending() {
        if (skipUndo.position === null) { return false; }
        var position = skipUndo.position;
        var skipped = skipUndo.skipped;
        var declined = skipUndo.declined;
        var marker = skipUndo.marker;
        var state = skipUndo.state;
        clearSkipUndo();
        // Forgetting the last prompt lets the marker raise its manual pill again on the next tick.
        if (state) { state.key = null; }
        if (skipped && marker) { delete skipped[marker.key]; }
        // The viewer asked to stay, so this marker never auto-skips again even though the manual
        // prompt comes back; an unwanted auto skip must not repeat itself.
        if (declined && marker) { declined[marker.key] = true; }
        seekToPlayer(position);
        setStatus("Back to the start of the segment.");
        return true;
    }

    function userIsSeeking() {
        return scrubOwner !== null || scrubTimer !== null;
    }

    function beginAutoSkip(position, next, skip) {
        skip.skipped[next.key] = true;
        clearSkipUndo();
        skipUndo.position = position;
        skipUndo.marker = next;
        skipUndo.skipped = skip.skipped;
        skipUndo.declined = skip.declined;
        skipUndo.state = skip;
        skipUndo.timer = setTimeout(function () {
            skipUndo.timer = null; skipUndo.position = null; skipUndo.marker = null;
            skipUndo.skipped = null; skipUndo.declined = null; skipUndo.state = null;
        }, 3000);
        setStatus("Skipping intro. Press Back to stay.");
        skipUndo.applying = true;
        try { seekToPlayer(next.target); } finally { skipUndo.applying = false; }
    }

    function cancelScrub() {
        if (scrubTimer !== null) { clearTimeout(scrubTimer); scrubTimer = null; }
        scrubTarget = null; scrubRepeats = 0; scrubOwner = null;
        hideScrubPreview();
    }

    // Previews are asked for once, on the first scrub of an item, so a library that generates
    // none costs nothing until someone scrubs. The generation trigger is documented; the reader
    // is not, so a refused or malformed answer leaves the scrub bar alone.
    function loadScrubPreviews(item, client) {
        if (!item || !client || !client.getPreviewThumbnails || scrubPreviewItem === item) { return; }
        scrubPreviewItem = item;
        scrubPreviews = null;
        var requested = client.requestPreviewThumbnails ?
            client.requestPreviewThumbnails(item.ratingKey) : Promise.resolve();
        Promise.resolve(requested).catch(function () { return null; }).then(function () {
            return client.getPreviewThumbnails(item.ratingKey, {});
        }).then(function (result) {
            var rows = result && Array.isArray(result.thumbnails) ? result.thumbnails : [];
            scrubPreviews = { available: rows.length > 0, rows: rows };
            if (scrubTarget !== null) { showScrubPreview(scrubTarget); }
        }).catch(function () { scrubPreviews = { available: false, rows: [] }; });
    }

    function scrubPreviewFor(position) {
        if (!scrubPreviews || !scrubPreviews.available) { return null; }
        var best = null;
        scrubPreviews.rows.forEach(function (row) {
            if (row.time <= position && (!best || row.time > best.time)) { best = row; }
        });
        return best;
    }

    function scrubPreviewSource(row) {
        if (!row) { return ""; }
        if (typeof row.img === "string" &&
                /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(row.img)) {
            return row.img;
        }
        if (typeof row.url === "string" && row.url.charAt(0) === "/" &&
                playerClient && playerClient.streamUrl) {
            try { return playerClient.streamUrl(row.url, {}); } catch (error) { return ""; }
        }
        return "";
    }

    function hideScrubPreview() {
        var panel = document.getElementById("scrub-preview");
        if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
    }

    function showScrubPreview(position) {
        var bar = document.getElementById("playback-progress");
        if (!bar || !bar.parentNode) { return; }
        var source = scrubPreviewSource(scrubPreviewFor(position));
        var panel = document.getElementById("scrub-preview");
        if (!source) {
            if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
            return;
        }
        if (!panel) {
            panel = element("div", "scrub-preview");
            panel.id = "scrub-preview";
            panel.setAttribute("aria-hidden", "true");
            panel.appendChild(element("img", "scrub-preview-image"));
            panel.appendChild(element("span", "scrub-preview-time", ""));
            bar.parentNode.insertBefore(panel, bar);
        }
        var image = panel.querySelector("img");
        if (image && image.getAttribute("src") !== source) { image.setAttribute("src", source); }
        var label = panel.querySelector(".scrub-preview-time");
        if (label) { label.textContent = timeLabel(position); }
        var duration = playerItem && playerItem.duration ? playerItem.duration : 1;
        var width = bar.offsetWidth || 0;
        var hostHeight = panel.parentNode.offsetHeight || 0;
        panel.style.left = Math.max(0, Math.round((bar.offsetLeft || 0) +
            Math.min(1, Math.max(0, position / duration)) * width)) + "px";
        // The bar sits inside the HUD above the tabs, so the panel is anchored from the bottom.
        panel.style.bottom = Math.max(12, hostHeight - (bar.offsetTop || 0) + 12) + "px";
    }

    function commitScrub() {
        var target = scrubTarget;
        var owner = scrubOwner;
        cancelScrub();
        if (target !== null && player === owner && !playerClosing) { seekToPlayer(target); }
    }

    function scrubPlayer(direction) {
        var snapshot = player.snapshot();
        if (["playing", "paused"].indexOf(snapshot.state) === -1 || playerClosing) { return; }
        if (scrubOwner !== player || scrubTarget === null) {
            cancelScrub(); scrubOwner = player; scrubTarget = snapshot.position;
            loadScrubPreviews(playerItem, playerClient);
        }
        scrubRepeats += 1;
        var step = preferences.skipInterval * 1000 * Math.min(4, 1 + Math.floor((scrubRepeats - 1) / 3));
        scrubTarget = Math.max(0, Math.min(snapshot.duration || playerItem.duration || 0, scrubTarget + direction * step));
        var duration = snapshot.duration || playerItem.duration || 1;
        var progress = document.getElementById("playback-progress");
        if (progress) {
            progress.setAttribute("aria-valuemax", String(duration));
            progress.setAttribute("aria-valuenow", String(Math.round(scrubTarget)));
            progress.setAttribute("aria-valuetext", timeLabel(scrubTarget) + " / " + timeLabel(duration));
            var fill = progress.querySelector(".playback-progress-fill");
            if (fill && fill.style) { fill.style.width = Math.min(100, Math.max(0, scrubTarget * 100 / duration)) + "%"; }
        }
        setStatus(translate("Seek to {time}", { time: timeLabel(scrubTarget) }));
        showScrubPreview(scrubTarget);
        if (scrubTimer !== null) { clearTimeout(scrubTimer); }
        scrubTimer = setTimeout(commitScrub, 300);
    }

    // Screen readers need a periodic anchor while the picture carries the story. The visible
    // status line keeps its transient messages, so this cadence has its own polite live region.
    function stopProgressAnnouncements() {
        if (progressTimer !== null) { clearInterval(progressTimer); progressTimer = null; }
        var region = document.getElementById("sr-progress");
        if (region) { region.textContent = ""; }
    }

    function announceProgress() {
        var region = document.getElementById("sr-progress");
        if (!region) { return; }
        if (!player || playerClosing || !playerItem || document.hidden ||
                userIsSeeking() || playerPanel) { return; }
        var snapshot = player.snapshot();
        var duration = snapshot.duration || playerItem.duration || 0;
        if (snapshot.state !== "playing" || !duration) { return; }
        region.textContent = translate("Playing {title}: {position} of {duration}.", {
            title: playerItem.title || "Playing",
            position: timeLabel(snapshot.position),
            duration: timeLabel(duration)
        });
    }

    function startProgressAnnouncements() {
        stopProgressAnnouncements();
        if (typeof setInterval !== "function") { return; }
        progressTimer = setInterval(announceProgress, 30000);
    }

    function stopPlayer(after) {
        if (!player || playerClosing) { return Promise.resolve(); }
        playerClosing = true;
        cancelScrub();
        stopProgressAnnouncements();
        clearSkipUndo();
        subtitleSearchGeneration += 1;
        cancelHudTimer();
        closePlayerPanel();
        closeUpNext();
        var stats = document.getElementById("playback-stats");
        if (stats && stats.parentNode) { stats.parentNode.removeChild(stats); }
        var timing = document.getElementById("subtitle-timing");
        if (timing && timing.parentNode) { timing.parentNode.removeChild(timing); }
        var failure = document.getElementById("playback-error");
        if (failure && failure.parentNode) { failure.parentNode.removeChild(failure); }
        playerStatsVisible = false;
        subtitleTiming = false;
        scrubPreviews = null; scrubPreviewItem = null;
        if (subtitleTimer !== null) { clearTimeout(subtitleTimer); subtitleTimer = null; }
        var closing = player;
        var item = playerItem;
        var client = playerClient;
        var safeToLeave = true;
        return closing.stop().then(function (metadata) { item = metadata || item; }, function (error) {
            showPlayerError(error);
            safeToLeave = closing.snapshot().state === "idle";
        }).then(function () {
            if (!safeToLeave) { playerClosing = false; showHud(); return; }
            player = null;
            showHud();
            playerClosing = false;
            document.body.className = "";
            if (typeof after === "function") { after(); }
            else { renderDetail(item, client); }
            if (typeof after !== "function") { playQueue = null; resetCinemaChain(); }
        });
    }

    function openMarkers() {
        if (!player) { return; }
        cancelHudTimer();
        var menu = document.getElementById("player-menu");
        if (menu && menu.parentNode) { menu.parentNode.removeChild(menu); }
        menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Markers")));
        (playerItem.Marker || []).forEach(function (marker) {
            if (marker.type === "intro" || marker.type === "credits") {
                button(menu, marker.type === "intro" ? "Skip Intro" : "Skip Credits", function () {
                    player.seek(marker.endTimeOffset).catch(showPlayerError);
                });
            }
        });
        if (!menu.querySelector("button")) { menu.appendChild(element("p", "", translate("No markers available."))); }
        button(menu, "Close menu", closePlayerMenu);
        screen.appendChild(menu);
        var control = menu.querySelectorAll("button")[0];
        if (control) { control.focus(); }
    }

    // Restart playback at the current position with an explicit track choice. `cues` keeps an
    // app-rendered text overlay; only "Subtitles off" may send subtitleStreamID=0, because moving
    // the PMS selection off a downloaded subtitle deletes it (docs/pms-api.md section 8).
    function reloadTracks(audioId, subtitleId, cues, subtitleSidecar) {
        if (!player) { return; }
        var item = playerItem;
        var client = playerClient;
        var position = player.snapshot().position;
        var version = playerSettings.mediaIndex;
        var options = { audioId: audioId, subtitleId: subtitleId, paused: player.snapshot().state === "paused",
            subtitleSidecar: cues ? (subtitleSidecar === undefined ?
                playerSettings.subtitleSidecar : !!subtitleSidecar) : false };
        if (cues) { options.cues = cues; }
        stopPlayer(function () { startPlayer(item, client, position, version, options); });
    }

    function useTextOverlay(stream, audioId) {
        var selectedPlayer = player;
        var generation = ++subtitleSearchGeneration;
        setStatus("Loading text subtitles...");
        playerClient.subtitleText(stream.id, stream.codec).then(function (text) {
            if (player !== selectedPlayer || playerClosing || generation !== subtitleSearchGeneration) { return; }
            reloadTracks(audioId, stream.id, window.VemmSubtitles.parse(text), stream.index === undefined ||
                stream.index === null);
        }).catch(function (error) {
            if (player === selectedPlayer && !playerClosing && generation === subtitleSearchGeneration) { showPlayerError(error); }
        });
    }

    function subtitleSearchLanguages(first) {
        var seen = [];
        function add(tag) {
            var code = window.VemmSubtitleSearch.twoLetter(tag);
            if (code && seen.indexOf(code) === -1) { seen.push(code); }
        }
        add(first);
        (player.part().Stream || []).forEach(function (stream) { add(stream.languageCode || stream.languageTag); });
        add(preferences.language);
        add("en");
        return seen;
    }

    // Read-only search; picking a result is the only server write and needs an explicit OK.
    function openSubtitleSearch(language) {
        if (!player) { return; }
        cancelHudTimer();
        var search = window.VemmSubtitleSearch;
        var generation = ++subtitleSearchGeneration;
        var selectedPlayer = player;
        var ratingKey = playerItem.ratingKey;
        var audioId = player.selection().audioId;
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Search for subtitles")));
        var languages = subtitleSearchLanguages(language);
        var languageButton = button(menu, translate("Language: {language}", { language: language }), function () {
            openSubtitleSearch(languages[(languages.indexOf(language) + 1) % languages.length]);
        }, true, "settings");
        var results = group(menu, translate("Results"), "track-group");
        var note = element("p", "help-text", translate("Searching for subtitles..."));
        note.setAttribute("aria-live", "polite");
        results.appendChild(note);
        button(menu, "Back to audio and subtitles", function () { openTracks("subtitle"); });
        button(menu, "Close menu", closePlayerMenu);
        screen.appendChild(menu);
        languageButton.focus();
        function current() { return player === selectedPlayer && generation === subtitleSearchGeneration; }
        function retry() { openSubtitleSearch(language); }
        playerClient.searchSubtitles(ratingKey, language).then(function (container) {
            if (!current()) { return; }
            var hits = search.hitsOf(container);
            if (!hits.length) {
                note.textContent = translate("No subtitles found for this language.");
                return;
            }
            note.textContent = translate("Choosing a result adds it to this item on your Plex server.");
            hits.forEach(function (hit) {
                var label = [hit.title || hit.language || translate("Subtitle"), hit.provider,
                    hit.hearingImpaired ? "SDH" : "", hit.forced ? translate("Forced") : ""]
                    .filter(Boolean).join(" / ");
                var choice = button(results, label, function () { downloadSubtitle(hit); }, true);
                choice.setAttribute("aria-label", label + ", " + translate("score {score}", { score: hit.score }));
            });
        }).catch(function (error) {
            if (!current()) { return; }
            var verdict = search.failure(error);
            note.textContent = translate(verdict === "denied" ? "This Plex account cannot search for subtitles on this server." :
                verdict === "missing" ? "This item is no longer on the server." :
                verdict === "bad-language" ? "Plex cannot search subtitles in this language." :
                "The subtitle search failed. Check the connection and try again.");
            if (verdict === "transport") { button(results, "Retry", retry).focus(); }
        });
        function downloadSubtitle(hit) {
            if (!current()) { return; }
            generation = ++subtitleSearchGeneration;
            Array.prototype.forEach.call(results.querySelectorAll("button"), function (node) { node.disabled = true; });
            note.textContent = translate("Adding the subtitle to your Plex server...");
            search.download(playerClient, ratingKey, hit, { alive: current }).then(function (stream) {
                if (!current()) { return; }
                if (!stream) {
                    note.textContent = translate("Plex accepted the subtitle but has not finished adding it. Open Audio and subtitles again shortly.");
                    return;
                }
                if (["srt", "subrip", "webvtt"].indexOf(stream.codec) !== -1) {
                    useTextOverlay(stream, audioId);
                } else {
                    reloadTracks(audioId, stream.id);
                }
            }).catch(function (error) {
                if (!current()) { return; }
                var verdict = search.failure(error);
                note.textContent = translate(verdict === "denied" ? "This Plex account cannot add subtitles on this server." :
                    verdict === "missing" ? "This item is no longer on the server." :
                    "Adding the subtitle failed. Search again and pick a fresh result.");
                Array.prototype.forEach.call(results.querySelectorAll("button"), function (node) { node.disabled = false; });
                if (verdict === "transport") { button(results, "Search again", retry).focus(); }
            });
        }
    }

    // UIFLOW3 A1: the track panel doubles as a pre-play picker opened from the details
    // page: same renderer, no player, choices remembered per item for this session.
    function hasPlayableMedia(item) {
        return !!(item && item.Media && item.Media[0] && item.Media[0].Part && item.Media[0].Part[0]);
    }

    function openTracks(type, language, prePlayItem) {
        var prePlay = !!prePlayItem;
        if (!prePlay && !player) { return; }
        type = type || "subtitle";
        if (!prePlay) { cancelHudTimer(); }
        var old = document.getElementById("player-menu");
        if (old && old.parentNode) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Audio and subtitles")));
        button(menu, "Audio", function () { openTracks("audio", null, prePlayItem); }, false, "audio");
        button(menu, "Subtitles", function () { openTracks("subtitle", null, prePlayItem); }, false, "subtitles");
        var cues = prePlay ? null : externalCues;
        var current = prePlay ? (prePlayTracks[prePlayItem.ratingKey] || {}) : player.selection();
        var reload = prePlay ? function (audioId, subtitleId) {
            var choice = prePlayTracks[prePlayItem.ratingKey] || {};
            if (audioId !== undefined) { choice.audioId = audioId; }
            if (subtitleId !== undefined) { choice.subtitleId = subtitleId; }
            prePlayTracks[prePlayItem.ratingKey] = choice;
            openTracks(type, language, prePlayItem);
        } : reloadTracks;
        var part = prePlay ? prePlayItem.Media[0].Part[0] : player.part();
        var streams = (part.Stream || []).filter(function (stream) {
            return stream.streamType === (type === "audio" ? 2 : 3);
        });
        var languageNames = [];
        streams.forEach(function (stream) {
            var name = stream.language || stream.languageTag || stream.languageCode || translate("Other languages");
            if (languageNames.indexOf(name) === -1) { languageNames.push(name); }
        });
        var preferred = languageNames.filter(function (name) {
            var stream = streams.filter(function (entry) {
                return (entry.language || entry.languageTag || entry.languageCode) === name;
            })[0];
            var code = stream && (stream.languageCode || stream.languageTag || "");
            return code.toLowerCase().slice(0, 2) === preferences.language.slice(0, 2);
        })[0];
        if (language === "__other_languages") {
            var otherOptions = languageNames.filter(function (name) { return name !== preferred; });
            otherOptions.forEach(function (name) {
                button(menu, name, function () { openTracks(type, name, prePlayItem); }, false, "language");
            });
        } else if (!language) {
            if (preferred) {
                button(menu, preferred, function () { openTracks(type, preferred, prePlayItem); }, false, "language");
            } else {
                languageNames.forEach(function (name) {
                    button(menu, name, function () { openTracks(type, name, prePlayItem); }, false, "language");
                });
            }
        } else {
            var matching = streams.filter(function (stream) {
                return (stream.language || stream.languageTag || stream.languageCode || translate("Other languages")) === language;
            });
            matching.forEach(function (stream) {
                var label = stream.displayTitle || stream.language || stream.codec || String(stream.id);
                var choice = button(menu, label, function () {
                    if (type === "audio") { reload(stream.id, current.subtitleId, externalCues); return; }
                    if (preferences.subtitleBurnIn === "off" &&
                            ["srt", "subrip", "webvtt"].indexOf(stream.codec) === -1) {
                        // Picking a burned track while burn-in is off would silently do nothing.
                        setStatus(translate("Burn in subtitles is off in Settings, so this track cannot be shown."), true);
                        return;
                    }
                    reload(current.audioId, stream.id);
                });
                choice.setAttribute("aria-pressed", String(type === "audio" ?
                    String(current.audioId) === String(stream.id) :
                    !cues && String(current.subtitleId) === String(stream.id)));
                if (!prePlay && type === "subtitle" && ["srt", "subrip", "webvtt"].indexOf(stream.codec) !== -1) {
                    button(menu, translate("Text overlay / {track}", { track: label }), function () {
                        useTextOverlay(stream, current.audioId);
                    });
                }
            });
            if (type === "subtitle" && preferences.subtitleBurnIn === "off") {
                menu.appendChild(element("p", "help-text",
                    translate("Burn in subtitles is off in Settings, so embedded subtitle tracks are not shown. Use a text overlay or turn burn-in on.")));
            }
            button(menu, "Back to languages", function () { openTracks(type, null, prePlayItem); });
        }
        if (!prePlay && type === "subtitle") {
            if (playerItem.type === "movie" || playerItem.type === "episode") {
                button(menu, "Search for subtitles", function () {
                    openSubtitleSearch(window.VemmSubtitleSearch.defaultLanguage(player.part(), preferences.language));
                });
            }
            if (externalCues) { button(menu, "Subtitle timing", openSubtitleTiming); }
            var appearance = group(menu, translate("Text overlay appearance"), "track-group");
            appearance.appendChild(element("p", "help-text", translate("These settings apply only to the app-rendered SRT/WebVTT text overlay, not device-native or burned subtitles.")));
            function cycleAppearance(title, preferenceKey, values, labelForValue) {
                button(appearance, translate("{setting}: {value}", {
                    setting: translate(title), value: translate(labelForValue(preferences[preferenceKey]))
                }), function () {
                    var index = values.indexOf(preferences[preferenceKey]);
                    preferences[preferenceKey] = values[(index + 1) % values.length];
                    if (savePreferences()) {
                        refreshSubtitleAppearance();
                        openTracks("subtitle");
                    }
                }, false, "settings");
            }
            cycleAppearance("Text size", "subtitleSize", ["small", "medium", "large", "extra_large"],
                function (value) { return { small: "Small", medium: "Medium", large: "Large", extra_large: "Extra large" }[value]; });
            cycleAppearance("Text position", "subtitlePosition", ["low", "middle", "high"], function (value) { return value; });
            cycleAppearance("Text color", "subtitleColor", SUBTITLE_COLORS, colorName);
            cycleAppearance("Text background", "subtitleBackground", ["off", "on"], backgroundName);
        }
        button(menu, "Subtitles off", function () { reload(current.audioId, 0); })
            .setAttribute("aria-pressed", String(!current.subtitleId && !cues));
        var other = languageNames.filter(function (name) { return name !== preferred; });
        if (!language && preferred && other.length) {
            button(menu, "Other languages", function () { openTracks(type, "__other_languages", prePlayItem); }, false, "language");
        }
        if (!language && type === "subtitle" && !streams.length) {
            menu.appendChild(element("p", "help-text", translate("No subtitle tracks are available.")));
        }
        if (!prePlay) {
            var nativeTracks = element("div", "native-tracks");
            nativeTracks.hidden = true;
            try {
                player.tracks().forEach(function (track) {
                    if (track.type !== "AUDIO" && track.type !== "TEXT") { return; }
                    button(nativeTracks, translate("Samsung {type} track {number}", { type: translate(track.type), number: track.index }), function () {
                        try {
                            player.selectTrack(track.type, track.index);
                            if (track.type === "TEXT") { player.subtitles(true); }
                            setStatus("Samsung track selected. Verify the output on this model.");
                        } catch (error) { showPlayerError(error); }
                    });
                });
            } catch (error) { menu.appendChild(element("p", "inline-error", errorText(error))); }
            if (nativeTracks.querySelectorAll("button").length) {
                button(menu, "Device tracks", function () {
                    nativeTracks.hidden = !nativeTracks.hidden;
                }, false, "settings");
                menu.appendChild(nativeTracks);
            }
            button(menu, "Playback options", openPlaybackOptions);
            button(menu, "Close menu", closePlayerMenu);
        } else {
            // UIFLOW3 A1: the pre-play picker just closes; the choice is already remembered.
            button(menu, "Close", function () {
                var panel = document.getElementById("player-menu");
                if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
            });
        }
        screen.appendChild(menu);
        var control = menu.querySelectorAll("button")[2] || menu.querySelectorAll("button")[0];
        if (control) { control.focus(); }
    }

    function openQuality() {
        if (!player) { return; }
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Quality and media version")));
        menu.appendChild(element("p", "help-text", translate("Original source") + ": " + qualityLabel(player.quality().source)));
        function change(quality, version) {
            var item = playerItem;
            var client = playerClient;
            var position = player.snapshot().position;
            var tracks = { audioId: playerSettings.audioId, subtitleId: playerSettings.subtitleId, cues: externalCues,
                paused: player.snapshot().state === "paused" };
            preferences.quality = quality;
            stopPlayer(function () { startPlayer(item, client, position, version, tracks); });
        }
        var current = player.quality();
        var originalDirect = window.VemmPlayback && window.VemmPlayback.plan(playerItem, {
            mediaIndex: playerSettings.mediaIndex, quality: "original", profile: playerSettings.profile,
            directPlay: preferences.directPlay,
            overlaySubtitle: playerSettings.overlaySubtitle, burnSubtitles: playerSettings.burnSubtitles,
            audioId: playerSettings.audioId,
            subtitleId: playerSettings.subtitleId }).direct;
        menu.appendChild(element("p", "help-text", translate("Now playing") + ": " + modeName(current.mode) + " · " +
            qualityLabel(current.mode === "direct" ? current.source : current.stream)));
        if (preferences.directPlay === "force") {
            menu.appendChild(element("p", "help-text",
                translate("Direct play is set to Force in Settings, so the original file is always used.")));
        }
        qualityLadder().forEach(function (quality) {
            if (preferences.directPlay === "force" && quality !== "original") { return; }
            var label = quality === "original" ? translate("Original quality") + " · " + qualityLabel(current.source) + " · " +
                translate(originalDirect ? "Direct Play" : "Converts on server") : qualityName(quality);
            var row = button(menu, (playerSettings.quality === quality ? "✓ " : "") + label,
                function () { change(quality, playerSettings.mediaIndex); });
            row.setAttribute("aria-pressed", String(playerSettings.quality === quality));
        });
        (playerItem.Media || []).forEach(function (media, version) {
            if (playerItem.Media.length < 2) { return; }
            button(menu, (playerSettings.mediaIndex === version ? "✓ " : "") +
                translate("Version {number} / {quality}", { number: version + 1, quality: qualityLabel(media) }) +
                    (Number(media.proxyType) === 42 ? " · " + translate("Optimized version") : ""),
                function () { change(preferences.quality, version); })
                .setAttribute("aria-pressed", String(playerSettings.mediaIndex === version));
        });
        button(menu, "Playback options", openPlaybackOptions);
        button(menu, "Close menu", closePlayerMenu);
        screen.appendChild(menu);
        menu.querySelectorAll("button")[0].focus();
    }

    function finishEpisode(startNow, suppliedSuccessor) {
        // UIFLOW3 A2: a trailer inside a cinema chain never advances the run queue and
        // never triggers the next-episode lookup; the chain drives the next link.
        if (consumeCinemaTrailers()) { return; }
        // A run started from an album or "Play all" advances through its own queue; a single
        // item started on its own still falls through to the server's next-episode lookup.
        if (playQueue && playQueue.items().length > 1) { skipQueued(1, true); return; }
        var item = playerItem;
        var client = playerClient;
        var queue = playerSettings && playerSettings.playQueue;
        stopPlayer(function () {
            renderDetail(item, client);
            var generation = viewGeneration;
            var successor = suppliedSuccessor || queueSuccessor(queue);
            (successor ? Promise.resolve(successor) : client.nextEpisode(item)).then(function (next) {
                if (!next || player || playerItem !== item || generation !== viewGeneration) { return; }
                if (startNow === true && !document.hidden) { startNextEpisode(next, client, generation); return; }
                if (preferences.nextEpisode === "off" || document.hidden) { return; }
                // LG's post-play Up Next card replaces the inline pill that used to sit on the
                // details page: the successor's poster and title, a countdown and the choices.
                showUpNext({
                    afterPlay: true,
                    item: item,
                    client: client,
                    next: next,
                    seconds: 10,
                    onStart: function (chosen) { startNextEpisode(chosen, client, generation); },
                    onExpire: function (chosen) { startNextEpisode(chosen, client, generation); }
                });
            }).catch(showPlayerError);
        });
    }

    function startNextEpisode(next, client, generation) {
        if (!next || !next.ratingKey || !client) { return; }
        client.getMetadata(next.ratingKey).then(function (metadata) {
            if (generation === viewGeneration && !player) { startPlayer(metadata, client, 0); }
        }).catch(showPlayerError);
    }

    // The server's continuous play queue knows the next item (including across seasons);
    // Plex's next-episode lookup is the fallback when no queue was created.
    function queueSuccessor(queue) {
        if (!queue || !queue.items) { return null; }
        for (var index = 0; index < queue.items.length - 1; index += 1) {
            if (String(queue.items[index].playQueueItemID) === String(queue.itemId)) {
                var next = queue.items[index + 1];
                return next && next.ratingKey && next.type === "episode" ? next : null;
            }
        }
        return null;
    }

    function settingsChoices(title, values, current, choose) {
        retryView = null;
        visit(function renderChoices() {
            viewGeneration += 1;
            clear(screen);
            page(translate(title), "settings");
            values.forEach(function (value) {
                button(screen, value.label, function () { choose(value.value); }, value.literal).setAttribute("aria-pressed",
                    String(current === value.value));
            });
            button(screen, "Back", backView);
            restoreView = renderChoices;
            setStatus("");
            focusFirst();
        });
    }

    var accountAudio = { client: null, state: "idle", value: null, error: null };

    function accountAudioError(error) {
        return translate(error && (error.status === 401 || error.status === 403) ?
            "Sign in to this Plex profile again to edit its account preferences." :
            "Plex account preferences are unavailable.") + " " + translate("Select Retry.");
    }

    function loadAccountAudio(refresh) {
        var client = accountClient;
        accountAudio = { client: client, state: "loading", value: null, error: null };
        refresh();
        client.accountPreferences().then(function (payload) {
            if (accountAudio.client !== client) { return; }
            accountAudio.value = window.PlexAccountPreferences.parse(payload);
            accountAudio.state = "ready";
            refresh();
        }).catch(function (error) {
            if (accountAudio.client !== client) { return; }
            if (error && error.code === "cancelled") { accountAudio.state = "idle"; return; }
            accountAudio.state = "error";
            accountAudio.error = accountAudioError(error);
            refresh();
        });
    }

    function saveAccountAudio(change) {
        var client = accountClient;
        var update = window.PlexAccountPreferences.update(accountAudio.value, change);
        setStatus(translate("Saving to your Plex account…"));
        client.saveAccountPreferences(update.query).then(function () {
            if (accountAudio.client !== client) { return; }
            accountAudio.value = update.next;
            setStatus("");
            backView();
        }).catch(function (error) {
            if (accountAudio.client !== client) { return; }
            setStatus(accountAudioError(error), true);
        });
    }

    function accountAudioGroup(menu) {
        var section = group(menu, translate("Audio & subtitles"), "settings-group");
        var generation = viewGeneration;
        function refresh() {
            if (generation !== viewGeneration || !section.parentNode) { return; }
            var focused = section.contains(document.activeElement);
            renderAccountAudio(section, refresh);
            if (focused && !section.contains(document.activeElement)) {
                var first = section.querySelector("button");
                if (first) { first.focus(); }
            }
        }
        if (accountAudio.client !== accountClient || accountAudio.state === "idle") {
            loadAccountAudio(refresh);
        } else {
            renderAccountAudio(section, refresh);
        }
    }

    function renderAccountAudio(section, refresh) {
        var api = window.PlexAccountPreferences;
        while (section.childNodes.length > 1) { section.removeChild(section.lastChild); }
        section.appendChild(element("p", "help-text", translate("Language preferences synced with your Plex account.")));
        if (accountAudio.state === "loading") {
            section.appendChild(element("p", "help-text", translate("Loading your Plex account preferences…")));
            return;
        }
        if (accountAudio.state === "error") {
            section.appendChild(element("p", "inline-error", accountAudio.error));
            button(section, "Retry", function () { loadAccountAudio(refresh); }, false, "refresh");
            return;
        }
        var value = accountAudio.value;
        var subtitleModes = ["Off (manual selection)", "When audio isn't in the subtitle language", "Always"];
        var forcedModes = ["Prefer non-forced subtitles", "Prefer forced subtitles", "Only forced subtitles", "Only non-forced subtitles"];
        function languageOptions(none) {
            return [{ value: "", label: translate(none) }].concat(api.picker().map(function (language) {
                return { value: language.code, label: language.name, literal: true };
            }));
        }
        function row(title, label, open) {
            button(section, translate("{setting}: {value}", { setting: translate(title), value: label }), open, true, "settings");
        }
        row("Preferred audio language", value.audioLanguage ? api.label(value.audioLanguage) : translate("Original"), function () {
            settingsChoices("Preferred audio language", languageOptions("Original"),
                value.autoSelectAudio === false ? null : api.canonical(value.audioLanguage || ""),
                function (code) { saveAccountAudio({ audioLanguage: code }); });
        });
        if (value.autoSelectAudio === false) {
            section.appendChild(element("p", "help-text", translate("Automatic selection is off. Choosing a language enables it.")));
        }
        row("Subtitles", translate(subtitleModes[value.subtitleMode]), function () {
            settingsChoices("Subtitles", api.SUBTITLE_MODES.map(function (mode) {
                return { value: mode, label: translate(subtitleModes[mode]) };
            }), value.subtitleMode, function (mode) { saveAccountAudio({ subtitleMode: mode }); });
        });
        row("Subtitle language", value.subtitleLanguage ? api.label(value.subtitleLanguage) : translate("No preference"), function () {
            settingsChoices("Subtitle language", languageOptions("No preference"), api.canonical(value.subtitleLanguage || ""),
                function (code) { saveAccountAudio({ subtitleLanguage: code }); });
        });
        row("Forced subtitles", translate(forcedModes[value.subtitleForced]), function () {
            settingsChoices("Forced subtitles", api.FORCED_MODES.map(function (mode) {
                return { value: mode, label: translate(forcedModes[mode]) };
            }), value.subtitleForced, function (mode) { saveAccountAudio({ subtitleForced: mode }); });
        });
        section.appendChild(element("p", "help-text", translate("Saved to this Plex profile and shared with your other Plex apps. Changes may take time to affect playback; selections already made for an item still take priority.")));
    }

    function openAbout() {
        retryView = null;
        viewGeneration += 1;
        clear(screen);
        page(translate("About Vemm"), "about");
        var identity = element("section", "about-brand");
        var mark = element("img", "about-brand-mark");
        mark.src = "brand/vemm-mark.svg";
        mark.alt = "";
        identity.appendChild(mark);
        identity.appendChild(element("h2", "", product.name));
        identity.appendChild(element("p", "about-pronunciation",
            translate("Pronounced {pronunciation}, one syllable.", { pronunciation: product.pronunciation })));
        identity.appendChild(element("p", "about-tagline", translate(product.tagline)));
        screen.appendChild(identity);
        screen.appendChild(element("p", "help-text",
            translate("Vemm is an independent, unofficial Plex-compatible media player for Samsung Tizen.")));
        screen.appendChild(element("p", "help-text working-brand-status",
            translate("Vemm is a working brand. Trademark clearance and repository migration are not complete.")));
        screen.appendChild(element("p", "help-text",
            translate("Updates keep the existing Samsung application identity, saved settings and signing continuity.")));
        button(screen, "Back", backView);
        restoreView = openAbout;
        setStatus("");
        focusFirst();
    }

    function openSettings() {
        retryView = null;
        var focusedSetting = restoreView === openSettings ?
            Array.prototype.slice.call(screen.querySelectorAll("button")).indexOf(document.activeElement) : -1;
        viewGeneration += 1;
        clear(screen);
        page(translate("Settings"), "settings");
        var menu = element("section", "settings-menu");
        menu.setAttribute("aria-label", translate("Settings"));
        screen.appendChild(menu);
        var playbackSettings = group(menu, translate("Playback"), "settings-group");
        playbackSettings.appendChild(element("p", "help-text", directPlaySummary()));
        button(playbackSettings, translate("Quality: {quality}", { quality: qualityName(preferences.quality) }), function () {
            settingsChoices("Quality", qualityLadder().map(function (quality) {
                return { value: quality, label: qualityName(quality) };
            }), preferences.quality, function (quality) {
                preferences.quality = quality;
                if (savePreferences()) { backView(); }
            });
        }, false, "settings");
        preferenceChoice(playbackSettings, "Skip interval", "skipInterval", [5, 10, 15, 30, 60],
            function (seconds) { return seconds + " seconds"; });
        preferenceChoice(playbackSettings, "Next episode", "nextEpisode", ["countdown", "after_credits", "off"],
            function (value) {
                return { countdown: "Countdown during credits", after_credits: "Play after credits", off: "Off" }[value];
            });
        // UIF-P1 (TV-UIFLOWS §3): the single Auto skip row became two, one per marker kind.
        // UIFLOW3 A5: each row is three-state — Disabled hides the pill, Manually shows it
        // without jumping, Automatically jumps.
        var autoSkipModes = (window.VemmPreferences && window.VemmPreferences.autoSkipModes) ||
            ["disabled", "manually", "automatically"];
        function autoSkipChoiceLabel(value) {
            return { disabled: "Disabled", manually: "Manually", automatically: "Automatically" }[value] || value;
        }
        preferenceChoice(playbackSettings, "Skip intro", "autoSkipIntro", autoSkipModes, autoSkipChoiceLabel);
        preferenceChoice(playbackSettings, "Skip credits", "autoSkipCredits", autoSkipModes, autoSkipChoiceLabel);
        // UIFLOW3 A2: play up to two cinema trailers before a movie started from the top.
        var cinemaTrailerCounts = (window.VemmPreferences && window.VemmPreferences.cinemaTrailerCounts) ||
            ["off", "1", "2"];
        preferenceChoice(playbackSettings, "Cinema trailers", "cinemaTrailers", cinemaTrailerCounts,
            function (value) { return value === "off" ? "Off" : value; });
        // UIFLOW3 A3: hours of remote inactivity before Up Next auto-play asks first.
        var passOutModes = (window.VemmPreferences && window.VemmPreferences.passOutModes) ||
            ["never", "1", "2", "3"];
        preferenceChoice(playbackSettings, "Pass-out protection", "passOutProtection", passOutModes,
            function (value) {
                return value === "never" ? "Never" : value === "1" ? "1 hour" : value + " hours";
            });
        // UIFLOW3 A4: seconds rewound when a title starts from a saved resume position.
        var rewindOnResumeModes = (window.VemmPreferences && window.VemmPreferences.rewindOnResumeModes) ||
            ["none", "5", "10", "15", "30"];
        preferenceChoice(playbackSettings, "Rewind on resume", "rewindOnResume", rewindOnResumeModes,
            function (value) { return value === "none" ? "None" : value + " seconds"; });
        // UIF-P1 (TV-UIFLOWS §4): how long the Up Next ring runs before it starts on its own.
        var upNextCountdowns = (window.VemmPreferences && window.VemmPreferences.upNextCountdowns) ||
            ["immediate", "5", "10", "15", "30", "60"];
        preferenceChoice(playbackSettings, "Up Next countdown", "upNextCountdown", upNextCountdowns,
            function (value) { return value === "immediate" ? "Immediate" : value + " seconds"; });
        preferenceChoice(playbackSettings, "Direct play", "directPlay", ["auto", "force", "off"],
            function (value) { return { auto: "Auto", force: "Force", off: "Off" }[value]; });
        var themeMusicModes = (window.VemmPreferences && window.VemmPreferences.themeMusicModes) || ["off", "on"];
        preferenceChoice(playbackSettings, "Theme Music", "themeMusic", themeMusicModes,
            function (value) { return value === "on" ? "On" : "Off"; }, function (value) {
                // Turning the switch off silences any theme already playing; turning it on
                // restarts the theme if a show page is still open underneath Settings.
                if (value !== "on") { stopThemeMusic(); return; }
                if (lastDetailShow && !player && !playerClosing) {
                    startThemeMusic(lastDetailShow, viewClients[viewClients.length - 1]);
                }
            });
        var screenSaverModes = (window.VemmPreferences && window.VemmPreferences.screenSaverModes) || ["off", "on"];
        preferenceChoice(playbackSettings, "Screen saver", "screenSaver", screenSaverModes,
            function (value) { return value === "on" ? "On" : "Off"; }, function (value) {
                // Turning the switch off clears the black screen at once; turning it on
                // restarts the idle countdown from now.
                if (value !== "on") { hideScreensaver(); return; }
                armScreensaver();
            });
        button(playbackSettings, translate("Continue Watching: {state}", {
            state: translate(preferences.continueAction === "play" ? "Play" : "Open details")
        }), function () {
            preferences.continueAction = preferences.continueAction === "play" ? "details" : "play";
            if (savePreferences()) { openSettings(); }
        }, false, "play");
        // UIFLOW3 B1 (G12/G38): the player HUD finish-time clock and the shared format.
        var clockDisplayModes = (window.VemmPreferences && window.VemmPreferences.clockDisplayModes) || ["off", "on"];
        preferenceChoice(playbackSettings, "Show end time", "showEndTime", clockDisplayModes,
            function (value) { return value === "on" ? "On" : "Off"; });
        var clockFormats = (window.VemmPreferences && window.VemmPreferences.clockFormats) || ["24h", "12h"];
        preferenceChoice(playbackSettings, "Clock format", "clockFormat", clockFormats,
            function (value) { return value === "24h" ? "24h" : "12h"; });
        // UIFLOW3 B4 (G30/G50): how many titles the Continue Watching row shows.
        var continueWatchingSizes = (window.VemmPreferences && window.VemmPreferences.continueWatchingSizes) || [6, 12, 20];
        preferenceChoice(playbackSettings, "Continue Watching items", "continueWatchingSize",
            continueWatchingSizes, function (value) { return String(value); });
        if (accountClient && window.PlexAccountPreferences) { accountAudioGroup(menu); }
        var burnSettings = group(menu, translate("Subtitles"), "settings-group");
        burnSettings.appendChild(element("p", "help-text",
            translate("Burned subtitles are drawn into the picture by the server. Off keeps the original picture and shows only the app-rendered text overlay.")));
        preferenceChoice(burnSettings, "Burn in subtitles", "subtitleBurnIn",
            (window.VemmPreferences && window.VemmPreferences.subtitleBurnInModes) || ["off", "on"],
            function (value) { return value === "on" ? "On" : "Off"; });
        var appearanceSettings = group(menu, translate("Appearance"), "settings-group");
        appearanceSettings.appendChild(element("p", "help-text",
            translate("High contrast replaces the greyscale palette with brighter text and borders. Interface text size raises the size of on-screen text. Both stay on this TV.")));
        preferenceChoice(appearanceSettings, "High contrast", "highContrast",
            (window.VemmPreferences && window.VemmPreferences.highContrastModes) || ["off", "on"],
            function (value) { return value === "on" ? "On" : "Off"; });
        preferenceChoice(appearanceSettings, "Interface text size", "textScale",
            (window.VemmPreferences && window.VemmPreferences.textScales) || ["normal", "large", "xlarge"],
            function (value) { return value === "large" ? "Large" : value === "xlarge" ? "Extra large" : "Normal"; });
        // UIFLOW3 B1 (G12): the small topbar clock, on every screen, sharing the
        // Playback group's Clock format choice. Turning it on starts the 30s refresh
        // timer; turning it off stops it again (no perpetual timer while off).
        preferenceChoice(appearanceSettings, "Show clock", "showClock",
            (window.VemmPreferences && window.VemmPreferences.clockDisplayModes) || ["off", "on"],
            function (value) { return value === "on" ? "On" : "Off"; }, function () {
                syncTopbarClock();
                syncClockTimer();
            });
        // UIFLOW3 B2 (G37): which card checkmarks the grid shows.
        preferenceChoice(appearanceSettings, "Show watched indicators", "watchedIndicators",
            (window.VemmPreferences && window.VemmPreferences.watchedIndicatorModes) || ["all", "movies", "tv", "none"],
            function (value) {
                return { all: "Movies & TV", movies: "Movies only", tv: "TV only", none: "None" }[value];
            });
        // UIFLOW3 B3 (G39): zero out transitions and animations app-wide.
        preferenceChoice(appearanceSettings, "Reduce motion", "reduceMotion",
            (window.VemmPreferences && window.VemmPreferences.reduceMotionModes) || ["off", "on"],
            function (value) { return value === "on" ? "On" : "Off"; });
        var subtitleSettings = group(menu, translate("Text overlay appearance"), "settings-group");
        subtitleSettings.appendChild(element("p", "help-text", translate("These settings apply only to the app-rendered SRT/WebVTT text overlay, not device-native or burned subtitles.")));
        preferenceChoice(subtitleSettings, "Text size", "subtitleSize", ["small", "medium", "large", "extra_large"],
            function (value) { return { small: "Small", medium: "Medium", large: "Large", extra_large: "Extra large" }[value]; });
        preferenceChoice(subtitleSettings, "Text position", "subtitlePosition", ["low", "middle", "high"], function (value) { return value; });
        preferenceChoice(subtitleSettings, "Text color", "subtitleColor", SUBTITLE_COLORS, colorName);
        preferenceChoice(subtitleSettings, "Text background", "subtitleBackground", ["off", "on"], backgroundName);
        if (currentClient && currentServerId) {
            var librarySettings = group(menu, translate("Libraries"), "settings-group");
            button(librarySettings, "Favorite libraries", function () { visit(function () { openFavorites(false); }); });
        }
        var languages = group(menu, translate("Language"), "settings-group");
        var names = { en: "English", es: "Español", be: "Беларуская", ro: "Română (meniuri)" };
        button(languages, translate("Language") + ": " + names[preferences.language], function () {
            settingsChoices("Language", ["en", "es", "be", "ro"].map(function (language) {
                return { value: language, label: names[language] };
            }), preferences.language, function (language) {
                preferences.language = language;
                if (savePreferences()) { backView(); }
            });
        }, false, "language");
        if (preferences.language === "ro") {
            languages.appendChild(element("p", "help-text",
                translate("Romanian covers the Account and Playback options menus. Other screens use English.")));
        }
        if (accountToken || currentClient) {
            var graphicsSettings = group(menu, translate("Graphics"), "settings-group");
            var graphicsToggle = button(graphicsSettings, translate("New graphics enhancements: {state}", {
                state: translate(preferences.enhancedGraphics ? "On" : "Off")
            }), function () {
                var previous = preferences.enhancedGraphics;
                preferences.enhancedGraphics = !previous;
                if (!savePreferences()) { preferences.enhancedGraphics = previous; return; }
                graphicsFailure = false;
                if (graphics) { graphics.setEnabled(preferences.enhancedGraphics && !!currentClient); }
                openSettings();
            }, false, "settings");
            graphicsToggle.setAttribute("aria-pressed", String(preferences.enhancedGraphics));
            graphicsSettings.appendChild(element("p", "help-text", translate(
                "Optional WebGL artwork rendering. Off by default. Existing Home acceleration and AVPlay stay enabled. Unsupported features automatically use the existing renderer.")));
            graphicsSettings.appendChild(element("p", "help-text", translate(graphicsFailure ?
                "New graphics enhancements are unavailable here. Existing graphics remain active." :
                preferences.enhancedGraphics ?
                    "Support is checked when artwork loads. This setting does not force hardware video decoding or promise faster playback." :
                    "Only new graphics enhancements are off. Existing acceleration is unchanged.")));
        }
        var privacy = group(menu, translate("Privacy and data"), "settings-group");
        var storageWarning = "";
        if (accountToken && window.VemmSession) {
            var savedAccount = "";
            try { savedAccount = window.VemmSession.load(window.localStorage); }
            catch (error) { storageWarning = errorText(error); }
            var savedSignIn = savedAccount === accountToken;
            var savedLabel = translate("Stay signed in on this TV") + ": " +
                translate(savedSignIn ? "On" : "Off");
            var saveSignIn = button(privacy, savedLabel, function () {
                var shouldSave = saveSignIn.getAttribute("aria-pressed") !== "true";
                try {
                    if (shouldSave) {
                        window.VemmSession.save(window.localStorage, accountToken);
                        window.VemmSession.setEnabled(window.localStorage, true);
                    } else {
                        window.VemmSession.forget(window.localStorage);
                        window.VemmSession.setEnabled(window.localStorage, false);
                    }
                    saveSignIn.setAttribute("aria-pressed", String(shouldSave));
                    saveSignIn.textContent = translate("Stay signed in on this TV") + ": " +
                        translate(shouldSave ? "On" : "Off");
                    setStatus("");
                } catch (error) {
                    setStatus("Could not update saved sign-in. Check app storage permissions.", true);
                }
            }, true);
            saveSignIn.setAttribute("aria-pressed", String(savedSignIn));
            privacy.appendChild(element("p", "help-text",
                translate("Saved Plex credentials are stored unencrypted on this TV.")));
        }
        button(privacy, "Reset preferences", function () {
            try {
                window.VemmPreferences.reset(window.localStorage);
                if (window.VemmFavorites) { window.VemmFavorites.reset(window.localStorage); }
                if (window.VemmRecents) { window.VemmRecents.reset(window.localStorage); }
                preferences = normalizePreferences(window.VemmPreferences.load(window.localStorage));
                graphicsFailure = false;
                if (graphics) { graphics.setEnabled(false); }
                window.VemmI18n.setLanguage(preferences.language);
                openSettings();
            } catch (error) { setStatus("Could not reset preferences. Check app storage permissions.", true); }
        });
        button(privacy, "Diagnostics", function () {
            visit(function () {
                viewGeneration += 1;
                clear(screen);
                page(translate("Diagnostics"), "diagnostics");
                screen.appendChild(element("p", "help-text", translate("Sign-in is saved on this TV by default. You can turn it off in Settings. Storage is unencrypted. No analytics or crash uploads are enabled.")));
                screen.appendChild(element("p", "help-text",
                    translate("AVPlay: {state}. {profile}. Model support is not certified. Account tokens, server origins, titles and queries are not logged or uploaded.", {
                        state: translate(window.webapis && window.webapis.avplay ? "available" : "unavailable"), profile: directPlaySummary() })));
                button(screen, "Back", backView);
                focusFirst();
            });
        });
        button(privacy, "About Vemm", function () { visit(openAbout); });
        button(privacy, "Sign out", signOut);
        button(privacy, "Back", backView);
        restoreView = openSettings;
        setStatus(storageWarning, !!storageWarning);
        focusFirst();
        var controls = screen.querySelectorAll("button");
        if (focusedSetting >= 0 && controls[focusedSetting]) { controls[focusedSetting].focus(); }
    }

    function insideHidden(node) {
        for (var current = node; current; current = current.parentNode) {
            if (current !== document && current.hidden === true) { return true; }
        }
        return false;
    }

    function restoreScrubControl() {
        var controls = screen.querySelectorAll(".playback-controls button");
        var target = scrubReturnFocus;
        if (!target || !target.parentNode || target.disabled || insideHidden(target)) {
            target = controls.length > 1 ? controls[1] : controls[0];
        }
        if (target) { target.focus(); }
    }

    function moveFocus(direction, key) {
        var active = document.activeElement;
        var grouped = screen.querySelector(".grouped-menu");
        if (grouped && !grouped.hidden) {
            var groupedControls = Array.prototype.slice.call(grouped.querySelectorAll("button")).filter(function (node) {
                return !node.disabled && !insideHidden(node);
            });
            var groupedIndex = groupedControls.indexOf(active);
            var groupedNext = groupedIndex < 0 ? 0 :
                Math.max(0, Math.min(groupedControls.length - 1, groupedIndex + direction));
            if (groupedControls[groupedNext]) { groupedControls[groupedNext].focus(); }
            return;
        }
        var hud = player && screen.querySelector(".player-hud");
        var playerControls = hud && hud.querySelector(".playback-controls");
        var scrubSurface = hud && hud.querySelector(".playback-progress");
        if (playerControls && scrubSurface && !hud.hidden && key === 38 && playerControls.contains(active)) {
            // Owner report 2026-11-15: the raised Skip Intro/Credits pill floats
            // above the transport row, but UP used to jump straight to the progress
            // slider, leaving the pill unreachable by remote. UP now lands on the
            // pill first; a second UP continues to the progress slider.
            if (hudSkipControl && hud.contains(hudSkipControl) && active !== hudSkipControl) {
                scrubReturnFocus = active;
                hudSkipControl.focus();
                return;
            }
            scrubReturnFocus = active;
            scrubSurface.focus();
            return;
        }
        if (scrubSurface && !hud.hidden && key === 38 && hudSkipControl && active === hudSkipControl) {
            scrubReturnFocus = hudSkipControl;
            scrubSurface.focus();
            return;
        }
        if (scrubSurface && !hud.hidden && key === 40 && active === scrubSurface) {
            restoreScrubControl();
            return;
        }
        if (playerControls && !hud.hidden && key === 40 && hudSkipControl && active === hudSkipControl) {
            var pillReturn = hudPauseControl && hud.contains(hudPauseControl) ?
                hudPauseControl : playerControls.querySelector("button");
            if (pillReturn) { pillReturn.focus(); }
            return;
        }
        if (playerControls && !hud.hidden && key === 40 && playerControls.contains(active)) {
            var tab = screen.querySelector(".player-tabs button");
            if (tab) { tab.focus(); }
            return;
        }
        if (player && active && active.parentNode && /player-tabs/.test(active.parentNode.className || "")) {
            if (key === 38) {
                var row = screen.querySelector(".playback-controls");
                var rowButtons = row && row.querySelectorAll("button");
                if (rowButtons && rowButtons.length) { rowButtons[rowButtons.length - 1].focus(); }
                return;
            }
            if (key === 40) {
                var panel = document.getElementById(playerPanel === "chapters" ? "chapter-strip" : "player-info");
                var panelButton = panel && panel.querySelector("button");
                if (panelButton) { panelButton.focus(); }
                return;
            }
        }
        if (player && active && active.parentNode && /chapter-strip/.test(active.parentNode.className || "") && key === 38) {
            var chaptersTab = Array.prototype.filter.call(screen.querySelectorAll(".player-tabs button"), function (node) {
                return node.textContent === translate("Chapters");
            })[0];
            if (chaptersTab) { chaptersTab.focus(); return; }
        }
        var localRow = active && active.parentNode;
        // The season filter/sort row is nested inside the season bar, so its controls share
        // the bar's rows: left/right keeps moving inside the bar and Down still reaches the
        // episode row instead of dead-ending in a row of its own.
        var seasonBarRow = localRow && /(?:^| )season-tools(?: |$)/.test(localRow.className || "") &&
            localRow.parentNode && /(?:^| )season-bar(?: |$)/.test(localRow.parentNode.className || "") ?
            localRow.parentNode : null;
        if (seasonBarRow) { localRow = seasonBarRow; }
        if (key === 39 && active && /(?:^| )account-control(?: |$)/.test(active.className || "")) {
            var accountNavigation = screen.querySelector(".home-navigation");
            if (accountNavigation) { accountNavigation.querySelector("button").focus(); }
            return;
        }
        if (key === 40 && active && (seasonBarRow || (active.parentNode &&
                /(?:^| )season-bar(?: |$)/.test(active.parentNode.className || "")))) {
            var episodeRow = screen.querySelector(".episode-row");
            var episodeCards = episodeRow ? episodeRow.querySelectorAll(".media-card") : [];
            var upToHere = episodeCards.length ? episodeRow.querySelector(".episode-current") || episodeCards[0] : null;
            if (upToHere) { upToHere.focus(); }
            else if (active.chooseSeason) { active.chooseSeason(); }
            return;
        }
        if (key === 38 && active && active.parentNode &&
                /(?:^| )episode-row(?: |$)/.test(active.parentNode.className || "")) {
            var currentSeason = screen.querySelector(".season-choice-current") ||
                screen.querySelector(".season-bar .season-choice");
            if (currentSeason) { currentSeason.focus(); return; }
        }
        if ((key === 37 || key === 39) && localRow &&
                /(?:home-navigation|home-feature-actions|playback-controls|player-tabs|chapter-strip|detail-actions|season-bar|episode-row)/.test(localRow.className || "")) {
            var rowControls = Array.prototype.slice.call(localRow.querySelectorAll("button"));
            var rowIndex = rowControls.indexOf(active);
            var adjacent = rowControls[rowIndex + direction];
            if (adjacent && !adjacent.disabled) { adjacent.focus(); }
            else if (key === 37 && /home-navigation/.test(localRow.className || "")) {
                var accountControl = screen.querySelector(".account-control");
                if (accountControl && !accountControl.disabled) { accountControl.focus(); }
            }
            return;
        }
        if ((key === 38 || key === 40) && active && active.parentNode &&
                /home-navigation/.test(active.parentNode.className || "")) {
            if (key === 38) { return; }
            var featuredAction = screen.querySelector(".home-feature-primary");
            var firstCard = screen.querySelector(".media-card");
            if (featuredAction) {
                screen.className = "screen screen-home";
                if (!moveHome(0)) { screen.scrollTop = 0; }
            }
            if (featuredAction || firstCard) { (featuredAction || firstCard).focus(); return; }
        }
        if (key === 40 && active && active.parentNode &&
                /home-feature-actions/.test(active.parentNode.className || "")) {
            var cardBelow = screen.querySelector(".media-card");
            if (cardBelow) { cardBelow.focus(); return; }
        }
        if (key === 38 && active && active.parentNode &&
                /home-feature-actions/.test(active.parentNode.className || "")) {
            var homeNavigation = screen.querySelector(".home-navigation");
            if (homeNavigation) { homeNavigation.querySelector("button").focus(); return; }
        }
        if (key === 38 && active && active.vemmCard && screen.className.indexOf("screen-home") !== -1) {
            var shelves = Array.prototype.slice.call(screen.querySelectorAll(".shelf-row")).filter(function (row) {
                return row.querySelector(".media-card");
            });
            if (shelves[0] && shelves[0].contains(active)) {
                var featureAbove = screen.querySelector(".home-feature-primary");
                if (featureAbove) {
                    screen.className = "screen screen-home";
                    featureAbove.focus();
                    return;
                }
            }
        }
        if ((key === 38 || key === 40) && active && active.vemmCard &&
                screen.className.indexOf("screen-home") !== -1) {
            var homeRows = Array.prototype.slice.call(screen.querySelectorAll(".shelf-row")).filter(function (row) {
                return row.querySelector(".media-card");
            });
            var rowPosition = homeRows.indexOf(active.parentNode);
            if (rowPosition >= 0) {
                var targetRow = homeRows[rowPosition + (key === 38 ? -1 : 1)];
                if (targetRow) {
                    var sourceBounds = active.getBoundingClientRect();
                    var sourceCenter = sourceBounds.left + sourceBounds.width / 2;
                    var closest = null;
                    var distance = Infinity;
                    Array.prototype.forEach.call(targetRow.querySelectorAll(".media-card"), function (candidate) {
                        var bounds = candidate.getBoundingClientRect();
                        var delta = Math.abs(bounds.left + bounds.width / 2 - sourceCenter);
                        if (!candidate.disabled && delta < distance) { closest = candidate; distance = delta; }
                    });
                    if (closest) { closest.focus(); }
                }
                return;
            }
        }
        var menu = document.getElementById("player-menu");
        var fileInfo = screen.querySelector(".file-info-panel");
        var focusSurface = fileInfo && !fileInfo.hidden ? fileInfo : menu || screen;
        var controls = Array.prototype.slice.call(focusSurface.querySelectorAll("button, input, select")).filter(function (node) {
            return !node.disabled && !insideHidden(node);
        });
        var index = controls.indexOf(active);
        if (!controls.length) {
            return;
        }
        if (index < 0) {
            controls[0].focus();
            return;
        }
        var next = Math.max(0, Math.min(controls.length - 1, index + direction));
        if (active.getBoundingClientRect && key) {
            var source = active.getBoundingClientRect();
            var x = source.left + source.width / 2;
            var y = source.top + source.height / 2;
            var best = Infinity;
            controls.forEach(function (node, candidate) {
                if (node === active) { return; }
                var rect = node.getBoundingClientRect();
                var dx = rect.left + rect.width / 2 - x;
                var dy = rect.top + rect.height / 2 - y;
                var primary = key === 37 ? -dx : key === 39 ? dx : key === 38 ? -dy : dy;
                var secondary = key === 37 || key === 39 ? Math.abs(dy) : Math.abs(dx);
                var score = primary + secondary * 3;
                if (primary > 1 && score < best) { best = score; next = candidate; }
            });
        }
        controls[next].focus();
    }

    function onKeyDown(event) {
        var key = event.keyCode;
        var active = document.activeElement;
        // UIFLOW3 A3: every remote press marks the viewer as awake for the pass-out check.
        lastRemoteInput = Date.now();
        // UIFLOW3 A3: while the "Still watching?" overlay is up, OK answers yes and Back
        // answers no; any other press is swallowed so auto-play stays gated.
        if (stillWatchingHandle) {
            event.preventDefault();
            if (key === 13) { stillWatchingHandle.yes.click(); }
            else if ([10009, 27, 8, 461].indexOf(key) !== -1) { stillWatchingHandle.no.click(); }
            return;
        }
        // Any key press wakes the screen saver; the wake press itself is swallowed.
        if (screensaver.visible) {
            hideScreensaver();
            armScreensaver();
            if (player) { showHud(); }
            event.preventDefault();
            return;
        }
        armScreensaver();
        // Any key press restarts the idle window before the trailer offer appears.
        if (trailerPrompt.timer !== null) { armTrailerPrompt(trailerPrompt.item, trailerPrompt.client); }
        // UIF-P1 (TV-UIFLOWS §4): any press while the Up Next countdown runs cancels the
        // auto-start; the card stays up and its buttons stay usable. Back keeps its own
        // two-step cancel-then-close gesture further down.
        if (upNextHandle && upNextHandle.counting && document.getElementById("up-next-panel") &&
                [10009, 27, 8, 461].indexOf(key) === -1) {
            upNextHandle.cancel();
            setStatus("Auto-play cancelled.");
        }
        if (player && [13, 37, 38, 39, 40, 415, 19, 10252, 413, 417, 412].indexOf(key) !== -1) {
            var hud = screen.querySelector(".player-hud");
            var wasHidden = hud && hud.hidden;
            showHud();
            if (wasHidden && [13, 37, 38, 39, 40].indexOf(key) !== -1) {
                event.preventDefault();
                // Owner report 2026-11-07: a raised Skip pill must be reachable by the
                // arrows. A left/right wake key focuses the pill (and the row walk
                // continues from there); without a pill it keeps the held-scrub gesture.
                // OK still wakes onto Pause / Play (owner request 2026-11-05) so a
                // reveal-press can never activate the pill by accident.
                if ((key === 37 || key === 39) && hudSkipControl && hud.contains(hudSkipControl)) {
                    hudSkipControl.focus();
                    return;
                }
                if (key !== 37 && key !== 39) {
                    if (hudPauseControl && hud.contains(hudPauseControl)) { hudPauseControl.focus(); }
                    else { focusFirst(); }
                    return;
                }
            }
        }
        var editing = active && ((active.tagName === "INPUT" && active.type !== "checkbox") || active.tagName === "TEXTAREA");
        if (key === 9) {
            var groupedMenu = screen.querySelector(".grouped-menu");
            if (groupedMenu && !groupedMenu.hidden) {
                var tabControls = groupedMenu.querySelectorAll("button");
                var tabIndex = Array.prototype.indexOf.call(tabControls, active);
                var tabNext = (tabIndex + (event.shiftKey ? -1 : 1) + tabControls.length) % tabControls.length;
                if (tabControls[tabNext]) { event.preventDefault(); tabControls[tabNext].focus(); }
                return;
            }
        }
        if (key === 13 && event.repeat) { event.preventDefault(); return; }
        if (player && subtitleTiming && (key === 37 || key === 39)) {
            event.preventDefault();
            adjustSubtitleTiming(key === 39 ? 1 : -1, event.repeat);
            return;
        }
        if (player && subtitleTiming && key === 13) {
            event.preventDefault();
            closeSubtitleTiming();
            return;
        }
        if ((key === 10135 || key === 457) && !player && active && active.vemmCard) {
            event.preventDefault();
            openItemMenu(active);
            return;
        }
        if (key === 13 && active && active.type === "checkbox") {
            event.preventDefault();
            active.checked = !active.checked;
            return;
        }
        if (player && active && active.id === "playback-progress" && key === 13) {
            event.preventDefault();
            commitScrub();
            return;
        }
        // UIFLOW3 B6 (G34): PageUp/PageDown chapter hops (or ten-minute seeks) in the player.
        if (player && (key === 33 || key === 34)) {
            event.preventDefault();
            pageStepPlayer(key === 34);
            return;
        }
        if (key === 10009 || key === 27 || key === 8 || key === 461) {
            if (editing && key === 8) { return; }
            event.preventDefault();
            if (player && undoSkipIfPending()) { return; }
            if (player && active && active.id === "playback-progress") {
                commitScrub();
                restoreScrubControl();
                return;
            }
            if (player && subtitleTiming) { closeSubtitleTiming(); return; }
            if (player && playerPanel) {
                var activePanel = playerPanel;
                closePlayerPanel();
                var tabs = screen.querySelectorAll(".player-tabs button");
                var desired = activePanel === "chapters" ? translate("Chapters") : translate("Info");
                Array.prototype.some.call(tabs, function (tab) {
                    if (tab.textContent === desired) { tab.focus(); return true; }
                    return false;
                });
                showHud();
                return;
            }
            if (player && document.getElementById("playback-stats")) {
                togglePlayerStats();
                return;
            }
            if (document.getElementById("trailer-prompt")) {
                var trailerReturn = trailerPrompt.returnFocus;
                clearTrailerPrompt();
                if (trailerReturn && trailerReturn.focus && screen.contains(trailerReturn)) { trailerReturn.focus(); }
                else { focusFirst(); }
                return;
            }
            if (document.getElementById("up-next-panel")) {
                // Back first stops the countdown so the card stays up for an explicit choice;
                // a second Back closes it and leaves playback where it was.
                if (upNextHandle && upNextHandle.counting) {
                    upNextHandle.cancel();
                    setStatus("Auto-play cancelled.");
                } else {
                    closeUpNext();
                }
                return;
            }
            if (player && document.getElementById("playback-error")) {
                var errorBack = Array.prototype.filter.call(document.querySelectorAll("#playback-error button"), function (control) {
                    return control.textContent === translate("Back");
                })[0];
                if (errorBack) { errorBack.click(); }
                return;
            }
            // UIFLOW3 B7 (G27): a raised skip pill is dismissed first — Back closes the
            // pill and keeps playback running; the next Back walks the old path. The
            // pill only counts while the HUD (and with it the pill) is on screen.
            if (player && hudSkipControl && hudSkipControl.vemmDismiss) {
                var skipHud = screen.querySelector(".player-hud");
                if (skipHud && !skipHud.hidden && skipHud.contains(hudSkipControl)) {
                    hudSkipControl.vemmDismiss();
                    return;
                }
            }
            var menu = document.getElementById("player-menu");
            if (menu && menu.plexDismiss) { menu.plexDismiss(); return; }
            if (menu) {
                if (player && menu.querySelector("button") &&
                        Array.prototype.some.call(menu.querySelectorAll("button"), function (control) {
                            return control.textContent === translate("Playback options");
                        })) { openPlaybackOptions(); }
                else { closePlayerMenu(); }
                return;
            }
            var utilities = screen.querySelector(".home-utilities");
            if (utilities && !utilities.hidden) {
                utilities.hidden = true;
                screen.querySelector(".account-control").setAttribute("aria-expanded", "false");
                screen.querySelector(".account-control").focus();
                return;
            }
            var fileInfo = screen.querySelector(".file-info-panel");
            if (fileInfo && !fileInfo.hidden) {
                fileInfo.hidden = true;
                var detailMore = screen.querySelector('[aria-label="More"]');
                if (detailMore) { detailMore.focus(); }
                return;
            }
            var overflow = screen.querySelector(".detail-overflow");
            if (overflow && !overflow.hidden) {
                overflow.hidden = true;
                var moreControl = screen.querySelector('.detail-actions [aria-expanded]');
                moreControl.setAttribute("aria-expanded", "false");
                moreControl.focus();
                return;
            }
            backView();
            return;
        }
        if (player && [415, 19, 10252, 413, 417, 412].indexOf(key) !== -1) {
            event.preventDefault();
            if (Date.now() - lastAction < 150) { return; }
            lastAction = Date.now();
            if (key === 413) { stopPlayer(); }
            else if (key === 417 || key === 412) {
                seekPlayer(key === 417 ? preferences.skipInterval * 1000 : -preferences.skipInterval * 1000);
            }
            else if (key === 415 && player.snapshot().state !== "paused") { return; }
            else if (key === 19 && player.snapshot().state !== "playing") { return; }
            else { togglePlayer(); }
            return;
        }
        if (player && !document.getElementById("player-menu") && !playerPanel && !playerStatsVisible &&
                !subtitleTiming && !document.getElementById("up-next-panel") &&
                !document.getElementById("playback-error") && (key === 37 || key === 39)) {
            var hud = screen.querySelector(".player-hud");
            var playerControls = hud && hud.querySelector(".playback-controls");
            if (!hud || hud.hidden || !playerControls || !playerControls.contains(document.activeElement)) {
                event.preventDefault();
                scrubPlayer(key === 39 ? 1 : -1);
                return;
            }
        }
        if (editing && (key === 37 || key === 39)) {
            return;
        }
        if (key === 38) {
            event.preventDefault();
            moveFocus(-1, key);
        } else if (key === 40) {
            event.preventDefault();
            moveFocus(1, key);
        } else if (key === 37) {
            event.preventDefault();
            moveFocus(-1, key);
        } else if (key === 39) {
            event.preventDefault();
            moveFocus(1, key);
        } else if (key === 13 && active && active.vemmCard && !player) {
            // A card waits for key-up: a short press opens it, a hold opens the action menu.
            event.preventDefault();
            cancelHold();
            holdCard = active;
            holdTimer = setTimeout(function () {
                holdTimer = null;
                if (holdCard === document.activeElement) { openItemMenu(holdCard); }
                holdCard = null;
            }, 600);
        } else if (key === 13 && active && active.vemmHold && !player) {
            // Held OK on a season opens its bulk watch-state screen; a short press still
            // opens the season through the button's own click handler.
            event.preventDefault();
            cancelHold();
            holdCard = active;
            holdTimer = setTimeout(function () {
                holdTimer = null;
                if (holdCard === document.activeElement) { holdCard.vemmHold(); }
                holdCard = null;
            }, 600);
        } else if (key === 13 && active && active.tagName === "BUTTON") {
            event.preventDefault();
            active.click();
        }
    }

    function cancelHold() {
        if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
        holdCard = null;
    }

    function onKeyUp(event) {
        if ((event.keyCode === 37 || event.keyCode === 39) && scrubTarget !== null) {
            event.preventDefault(); commitScrub(); return;
        }
        if (event.keyCode !== 13 || !holdCard) { return; }
        var target = holdCard;
        var short = holdTimer !== null;
        cancelHold();
        event.preventDefault();
        if (short && target === document.activeElement) { target.click(); }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    // Samsung firmware delivers the remote BACK button as a backbutton event on some
    // models and as keyCode 461 on others; both must walk the view stack.
    document.addEventListener("backbutton", function (event) {
        if (event && event.preventDefault) { event.preventDefault(); }
        onKeyDown({ keyCode: 461, repeat: false, shiftKey: false,
            preventDefault: function () {} });
    });
    screen.addEventListener("mousemove", function () { if (player) { showHud(); } });
    screen.addEventListener("click", function () { if (player) { showHud(); } });
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            clearGraphics();
            cancelScrub();
            cancelHold();
            if (upNextHandle && upNextHandle.counting) { upNextHandle.cancel(); }
            if (player) {
                var item = playerItem;
                var client = playerClient;
                foregroundRecovery = function () {
                    openDetail(item.ratingKey, client);
                };
                stopPlayer(function () {
                    if (!document.hidden && foregroundRecovery) {
                        var recover = foregroundRecovery; foregroundRecovery = null; recover();
                    }
                });
            } else {
                var controls = Array.prototype.slice.call(screen.querySelectorAll("button, input, select"));
                suspendedView = { restore: restoreView, focus: controls.indexOf(document.activeElement), scroll: screen.scrollTop };
                viewGeneration += 1;
                cancelViewRequests();
                stopAuthorization();
                resetImages();
                if (viewCleanup) { var cleanup = viewCleanup; viewCleanup = null; cleanup(); }
            }
        } else if (foregroundRecovery && !playerClosing) {
            var recoverPlayer = foregroundRecovery; foregroundRecovery = null; recoverPlayer();
        } else if (suspendedView) {
            var previous = suspendedView; suspendedView = null;
            pendingRestore = previous;
            if (previous.restore) { previous.restore(); }
            else { addConnectForm("The app returned to the foreground. Restart pairing if needed."); }
        }
    });
    window.addEventListener("pagehide", function () {
        if (graphics) { graphics.dispose(); graphics = null; }
        stopAuthorization();
        resetImages();
        if (viewCleanup) { viewCleanup(); viewCleanup = null; }
        stopThemeMusic();
        hideScreensaver();
        if (player) { stopPlayer(function () {}); }
    });
    if (window.tizen && window.tizen.tvinputdevice) {
        try {
            ["MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop", "MediaFastForward", "MediaRewind"].forEach(function (name) {
                window.tizen.tvinputdevice.registerKey(name);
            });
            ["Tools", "Info"].forEach(function (name) {
                try { window.tizen.tvinputdevice.registerKey(name); } catch (ignore) { /* optional card-menu shortcut */ }
            });
        } catch (error) { setStatus("Some media keys could not be registered. Use on-screen playback controls.", true); }
    }
    addConnectForm("");
    // UIFLOW3 B1: the opt-in clock starts only if the preference says so; syncClockTimer
    // arms the 30-second refresh while it is on and clears it when it is off.
    syncTopbarClock();
    syncClockTimer();
    // The saver watches for the first idle window from the moment the app opens.
    armScreensaver();
    if (preferenceError) { setStatus(preferenceError, true); }
    if (window.VemmSession) {
        try {
            var savedAccount = window.VemmSession.load(window.localStorage);
            if (savedAccount) {
                accountToken = savedAccount;
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                openProfiles();
            }
        } catch (error) { setStatus(errorText(error), true); }
    }
}());
