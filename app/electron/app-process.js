const {
  app,
  protocol,
  BrowserWindow,
  session,
  ipcMain,
  Menu,
} = require("electron");
const {
  default: installExtension,
  REDUX_DEVTOOLS,
  REACT_DEVELOPER_TOOLS,
} = require("electron-devtools-installer");
const SecureElectronLicenseKeys = require("secure-electron-license-keys");
const Protocol = require("./protocol");
const MenuBuilder = require("./menu");
const i18nextBackend = require("i18next-electron-fs-backend");
const i18nextMainBackend = require("../localization/i18n.mainconfig");
const Store = require("secure-electron-store").default;
const ContextMenu = require("secure-electron-context-menu").default;
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const isDev = process.env.NODE_ENV === "development";
const config = require("../config");
const port = config.port; // From .env; needs to match webpack.development.js and package.json
const selfHost = `http://localhost:${port}`;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;
let menuBuilder;

async function createWindow() {
  console.log("ENV variables loaded:", config.test ? "\u2705" : "\u274C");
  // If you'd like to set up auto-updating for your app,
  // I'd recommend looking at https://github.com/iffy/electron-updater-example
  // to use the method most suitable for you.
  // eg. autoUpdater.checkForUpdatesAndNotify();

  if (!isDev) {
    // Needs to happen before creating/loading the browser window;
    // protocol is only used in prod
    protocol.registerBufferProtocol(
      Protocol.scheme,
      Protocol.requestHandler
    ); /* eng-disable PROTOCOL_HANDLER_JS_CHECK */
  }

  const store = new Store({
    path: app.getPath("userData"),
  });

  // Use saved config values for configuring your
  // BrowserWindow, for instance.
  // NOTE - this config is not passcode protected
  // and stores plaintext values
  //let savedConfig = store.mainInitialStore(fs);

  // Create the browser window.
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Application is currently initializing...",
    webPreferences: {
      devTools: isDev,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      enableRemoteModule: false,
      additionalArguments: [`storePath:${app.getPath("userData")}`],
      preload: path.join(__dirname, "preload.js"),
      /* eng-disable PRELOAD_JS_CHECK */
      disableBlinkFeatures: "Auxclick",
    },
  });

  // Sets up main.js bindings for our i18next backend
  i18nextBackend.mainBindings(ipcMain, win, fs);

  // Sets up main.js bindings for our electron store;
  // callback is optional and allows you to use store in main process
  const callback = function (success, initialStore) {
    console.log(
      `${!success ? "Un-s" : "S"}uccessfully retrieved store in main process.`
    );
    console.log(initialStore); // {"key1": "value1", ... }
  };

  store.mainBindings(ipcMain, win, fs, callback);

  // Sets up bindings for our custom context menu
  ContextMenu.mainBindings(ipcMain, win, Menu, isDev, {
    loudAlertTemplate: [
      {
        id: "loudAlert",
        label: "AN ALERT!",
      },
    ],
    softAlertTemplate: [
      {
        id: "softAlert",
        label: "Soft alert",
      },
    ],
  });

  // Setup bindings for offline license verification
  SecureElectronLicenseKeys.mainBindings(ipcMain, win, fs, crypto, {
    root: process.cwd(),
    version: app.getVersion(),
  });

  // Load app
  if (isDev) {
    win.loadURL(selfHost);
  } else {
    win.loadURL(`${Protocol.scheme}://rse/index.html`);
  }

  win.webContents.on("did-finish-load", () => {
    win.setTitle(
      `Getting started with secure-electron-template (v${app.getVersion()})`
    );
  });

  // Only do these things when in development
  if (isDev) {
    // Errors are thrown if the dev tools are opened
    // before the DOM is ready
    win.webContents.once("dom-ready", async () => {
      await installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS])
        .then((name) => console.log(`Added Extension: ${name}`))
        .catch((err) => console.log("An error occurred: ", err))
        .finally(() => {
          require("electron-debug")(); // https://github.com/sindresorhus/electron-debug
          win.webContents.openDevTools();
        });
    });
  }

  // Emitted when the window is closed.
  win.on("closed", () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null;
  });

  // https://electronjs.org/docs/tutorial/security#4-handle-session-permission-requests-from-remote-content
  const ses = session;
  const partition = "default";
  ses
    .fromPartition(
      partition
    ) /* eng-disable PERMISSION_REQUEST_HANDLER_JS_CHECK */
    .setPermissionRequestHandler((webContents, permission, permCallback) => {
      const allowedPermissions = []; // Full list here: https://developer.chrome.com/extensions/declare_permissions#manifest

      if (allowedPermissions.includes(permission)) {
        permCallback(true); // Approve permission request
      } else {
        console.error(
          `The application tried to request permission for '${permission}'. This permission was not whitelisted and has been blocked.`
        );

        permCallback(false); // Deny
      }
    });

  // https://electronjs.org/docs/tutorial/security#1-only-load-secure-content;
  // The below code can only run when a scheme and host are defined, I thought
  // we could use this over _all_ urls
  // ses.fromPartition(partition).webRequest.onBeforeRequest({urls:["http://localhost./*"]}, (listener) => {
  //   if (listener.url.indexOf("http://") >= 0) {
  //     listener.callback({
  //       cancel: true
  //     });
  //   }
  // });

  menuBuilder = MenuBuilder(win, app.name);

  // Set up necessary bindings to update the menu items
  // based on the current language selected
  i18nextMainBackend.on("loaded", (loaded) => {
    i18nextMainBackend.changeLanguage("en");
    i18nextMainBackend.off("loaded");
  });

  i18nextMainBackend.on("languageChanged", (lng) => {
    menuBuilder.buildMenu(i18nextMainBackend);
  });
}

// Needs to be called before app is ready;
// gives our scheme access to load relative files,
// as well as local storage, cookies, etc.
// https://electronjs.org/docs/api/protocol#protocolregisterschemesasprivilegedcustomschemes
protocol.registerSchemesAsPrivileged([
  {
    scheme: Protocol.scheme,
    privileges: {
      standard: true,
      secure: true,
    },
  },
]);

module.exports = { createWindow, selfHost, win };
