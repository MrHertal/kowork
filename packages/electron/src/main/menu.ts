// @opencode-ref: opencode/packages/desktop/src/main/menu.ts
import { Menu, app, shell } from "electron";

import { UPDATER_ENABLED } from "./constants";
import { createMainWindow } from "./windows";

type Deps = {
  trigger: (id: string) => void;
  checkForUpdates: () => void;
  reload: () => void;
  relaunch: () => void;
};

export function createMenu(deps: Deps) {
  if (process.platform !== "darwin") {
    // Remove Electron's default menu on Windows/Linux; its zoom accelerators
    // would otherwise fight the webview-zoom keydown handler.
    Menu.setApplicationMenu(null);
    return;
  }

  // Dev tools stay out of production builds; the app-menu "Reload" remains as
  // the user-facing recovery hatch.
  const devItems: Electron.MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Kowork",
      submenu: [
        { role: "about" },
        {
          label: "Check for Updates...",
          enabled: UPDATER_ENABLED,
          click: () => deps.checkForUpdates(),
        },
        {
          label: "Reload",
          click: () => deps.reload(),
        },
        {
          label: "Restart",
          click: () => deps.relaunch(),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New",
          accelerator: "Cmd+N",
          click: () => deps.trigger("session.new"),
        },
        {
          label: "New Window",
          accelerator: "Cmd+Shift+N",
          click: () => createMainWindow({ updaterEnabled: UPDATER_ENABLED }),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Sidebar",
          accelerator: "Cmd+B",
          registerAccelerator: false,
          click: () => deps.trigger("sidebar.toggle"),
        },
        { type: "separator" },
        ...devItems,
        {
          label: "Actual Size",
          accelerator: "CmdOrCtrl+0",
          registerAccelerator: false,
          click: () => deps.trigger("view.zoomReset"),
        },
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Plus",
          registerAccelerator: false,
          click: () => deps.trigger("view.zoomIn"),
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          registerAccelerator: false,
          click: () => deps.trigger("view.zoomOut"),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Go",
      submenu: [
        {
          label: "Back",
          accelerator: "Cmd+[",
          click: () => deps.trigger("common.goBack"),
        },
        {
          label: "Forward",
          accelerator: "Cmd+]",
          click: () => deps.trigger("common.goForward"),
        },
      ],
    },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        {
          label: "Kowork Documentation",
          click: () => shell.openExternal("https://github.com/MrHertal/kowork"),
        },
        { type: "separator" },
        {
          label: "Share Feedback",
          click: () =>
            shell.openExternal("https://github.com/MrHertal/kowork/issues"),
        },
        {
          label: "Report a Bug",
          click: () =>
            shell.openExternal("https://github.com/MrHertal/kowork/issues/new"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
