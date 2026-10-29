(function installProcessShim(scope) {
  "use strict";

  function noop() {}

  scope.__AVG_PROCESS__ = {
    nextTick: function nextTick(callback) {
      var args = Array.prototype.slice.call(arguments, 1);
      queueMicrotask(function runNextTick() {
        callback.apply(null, args);
      });
    },
    title: "browser",
    browser: true,
    env: {},
    argv: [],
    version: "",
    versions: {},
    platform: "browser",
    on: noop,
    addListener: noop,
    once: noop,
    off: noop,
    removeListener: noop,
    removeAllListeners: noop,
    emit: noop,
    cwd: function cwd() {
      return "/";
    },
    chdir: function chdir() {
      throw new Error("process.chdir is not supported in browsers");
    },
    umask: function umask() {
      return 0;
    },
  };
})(globalThis);
