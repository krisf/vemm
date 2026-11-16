(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmQueue = api; }
}(this, function () {
    "use strict";
    // The queue drives any run of playable items: an album's tracks or the episodes behind a
    // show's "Play all".
    var playable = ["track", "movie", "episode", "clip"];
    function create(items, selected, random) {
        if (!Array.isArray(items) || !items.length || items.length > 200 ||
                items.some(function (item) { return !item || playable.indexOf(item.type) === -1 || !/^[0-9]+$/.test(String(item.ratingKey)); })) {
            throw new Error("Choose a queue of 1 to 200 available items.");
        }
        var original = items.slice();
        var order = original.slice();
        var index = selected === undefined ? 0 : selected;
        if (typeof index !== "number" || index < 0 || index >= order.length || Math.floor(index) !== index) {
            throw new Error("Choose an available item in the queue.");
        }
        var repeat = "off";
        var shuffled = false;
        random = random || Math.random;
        function entryAt(position) {
            if (typeof position !== "number" || Math.floor(position) !== position ||
                    position < 0 || position >= order.length) {
                throw new Error("Choose an available item in the queue.");
            }
            return order[position];
        }
        function validateEntry(entry) {
            if (!entry || playable.indexOf(entry.type) === -1 || !/^[0-9]+$/.test(String(entry.ratingKey))) {
                throw new Error("Only playable items can join the queue.");
            }
            var key = String(entry.ratingKey);
            for (var i = 0; i < order.length; i += 1) {
                if (String(order[i].ratingKey) === key) { throw new Error("That item is already in the queue."); }
            }
            if (order.length + 1 > 200) { throw new Error("Choose a queue of 1 to 200 available items."); }
            return entry;
        }
        return {
            current: function () { return order[index]; },
            items: function () { return order.slice(); },
            position: function () { return index; },
            next: function (automatic) {
                if (automatic && repeat === "one") { return order[index]; }
                if (index + 1 >= order.length) {
                    if (repeat !== "all") { return null; }
                    index = 0;
                } else { index += 1; }
                return order[index];
            },
            previous: function () {
                if (index > 0) { index -= 1; }
                else if (repeat === "all") { index = order.length - 1; }
                return order[index];
            },
            repeat: function (mode) {
                if (["off", "one", "all"].indexOf(mode) === -1) { throw new Error("Invalid queue repeat mode."); }
                repeat = mode;
                return repeat;
            },
            shuffle: function (enabled) {
                if (typeof enabled !== "boolean") { throw new Error("Choose shuffle on or off."); }
                var current = order[index];
                shuffled = enabled;
                order = original.slice();
                if (enabled) {
                    order.splice(order.indexOf(current), 1);
                    for (var i = order.length - 1; i > 0; i -= 1) {
                        var value = random();
                        if (!(value >= 0 && value < 1)) { throw new Error("Invalid shuffle source."); }
                        var j = Math.floor(value * (i + 1));
                        var swap = order[i]; order[i] = order[j]; order[j] = swap;
                    }
                    order.unshift(current);
                }
                index = order.indexOf(current);
                return shuffled;
            },
            // UIF-P3: viewer-facing queue edits (the Play Queue panel and the card menu).
            // These stay local to this run — the server's /playQueues endpoint is not written here.
            insertNext: function (entry) {
                var checked = validateEntry(entry);
                var anchor = order[index];
                order.splice(order.indexOf(anchor) + 1, 0, checked);
                original.splice(original.indexOf(anchor) + 1, 0, checked);
                return order.length;
            },
            append: function (entry) {
                var checked = validateEntry(entry);
                order.push(checked);
                original.push(checked);
                return order.length;
            },
            removeAt: function (position) {
                var entry = entryAt(position);
                if (position === index) { throw new Error("The playing item stays in the queue."); }
                order.splice(position, 1);
                var from = original.indexOf(entry);
                if (from !== -1) { original.splice(from, 1); }
                if (position < index) { index -= 1; }
                return entry;
            },
            moveTo: function (from, to) {
                var entry = entryAt(from);
                if (typeof to !== "number" || Math.floor(to) !== to || to < 0 || to >= order.length) {
                    throw new Error("Move the item to another position in the queue.");
                }
                var current = order[index];
                order.splice(from, 1);
                order.splice(to, 0, entry);
                original.splice(original.indexOf(entry), 1);
                original.splice(original.indexOf(current) + (to > index ? 1 : 0), 0, entry);
                index = order.indexOf(current);
                return entry;
            },
            select: function (position) {
                var entry = entryAt(position);
                index = position;
                return entry;
            }
        };
    }
    return { create: create };
}));
