"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.resolve(__dirname, "../..");
var config = fs.readFileSync(path.join(root, "samsung/Vemm/config.xml"), "utf8");
var build = fs.readFileSync(path.join(root, "samsung/build.py"), "utf8");
var install = fs.readFileSync(path.join(root, "samsung/install.py"), "utf8");

// Upstream ships as VemmTvApp0; this build must stay VemmFixApp because the authoring
// certificate differs (the TV rejects an in-place identity swap) and the official app was
// uninstalled. The minter that actually ships artifacts is samsung/build-fix.py; upstream
// samsung/build.py and samsung/install.py are kept verbatim for reference only, so
// identity consistency is asserted across the files that produce real builds.
assert(config.includes('id="VemmFixApp.Vemm" package="VemmFixApp"'),
    "the shipped manifest carries the side-by-side identity");
var minter = fs.readFileSync(path.join(root, "samsung/build-fix.py"), "utf8");
assert(minter.includes('PACKAGE_ID = "VemmFixApp"'),
    "the shipping minter builds under the same side-by-side package id");
assert(!/PlxNative0/.test(config + minter),
    "no development-era package id survives in shipping files");

console.log("Vemm side-by-side application/package identity is consistent: passed");
