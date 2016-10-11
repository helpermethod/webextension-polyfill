"use strict";

const fs = require("fs");
const {createInstrumenter} = require("istanbul-lib-instrument");
const {jsdom, createVirtualConsole} = require("jsdom");

var virtualConsole = createVirtualConsole().sendTo(console);

// Path to the browser-polyfill script, relative to the current work dir
// where mocha is executed.
const BROWSER_POLYFILL_PATH = "./dist/browser-polyfill.js";

// Create the jsdom window used to run the tests
const testDOMWindow = jsdom({virtualConsole}).defaultView;
global.window = testDOMWindow;

function setupTestDOMWindow(chromeObject) {
  return new Promise((resolve, reject) => {
    const window = testDOMWindow;

    // Inject the fake chrome object used as a fixture for the particular
    // browser-polyfill test scenario.
    window.chrome = chromeObject;

    // Set the browser property to undefined.
    // TODO: change into `delete window.browser` once tmpvar/jsdom#1622 has been fixed.
    window.browser = undefined;

    const scriptEl = window.document.createElement("script");

    if (process.env.COVERAGE == "y") {
      // If the code coverage is enabled, instrument the code on the fly
      // before executing it in the jsdom window.
      const inst = createInstrumenter({
        compact: false, esModules: false, produceSourceMap: false,
      });
      const scriptContent = fs.readFileSync(BROWSER_POLYFILL_PATH, "utf-8");
      scriptEl.textContent = inst.instrumentSync(scriptContent, BROWSER_POLYFILL_PATH);
    } else {
      scriptEl.src = BROWSER_POLYFILL_PATH;
    }

    let onLoad;
    let onLoadError;
    let onError;

    let cleanLoadListeners = () => {
      scriptEl.removeEventListener("load", onLoad);
      scriptEl.removeEventListener("error", onLoadError);

      window.removeEventListener("error", onError);
    };

    onLoad = () => { cleanLoadListeners(); resolve(window); };
    onLoadError = () => {
      cleanLoadListeners();
      reject(new Error(`Error loading script: ${BROWSER_POLYFILL_PATH}`));
    };
    onError = (err) => { cleanLoadListeners(); reject(err); };

    // Listen to any uncaught errors.
    window.addEventListener("error", onError);
    scriptEl.addEventListener("error", onLoadError);

    scriptEl.addEventListener("load", onLoad);

    window.document.body.appendChild(scriptEl);
  });
}

// Copy the code coverage of the browser-polyfill script from the jsdom window
// to the nodejs global, where nyc expects to find the code coverage data to
// render in the reports.
after(() => {
  if (global.window && process.env.COVERAGE == "y") {
    global.__coverage__ = global.window.__coverage__;
  }
});

module.exports = {
  BROWSER_POLYFILL_PATH,
  setupTestDOMWindow,
};
