// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

const OS_NAME = (() => {
  if (navigator.userAgent.includes("Mac")) return "macos";
  if (navigator.userAgent.includes("Windows")) return "windows";
  if (navigator.userAgent.includes("Linux")) return "linux";
  return "unknown";
})();

let currentZoom = 1;
const listeners = new Set<(zoom: number) => void>();

const MAX_ZOOM_LEVEL = 10;
const MIN_ZOOM_LEVEL = 0.2;
const ZOOM_STEP = 0.2;

const clamp = (value: number) =>
  Math.min(Math.max(value, MIN_ZOOM_LEVEL), MAX_ZOOM_LEVEL);

const applyZoom = (next: number) => {
  currentZoom = clamp(Math.round(next * 10) / 10);
  void window.api.setZoomFactor(currentZoom);
  for (const cb of listeners) cb(currentZoom);
};

export function zoomIn() {
  applyZoom(currentZoom + ZOOM_STEP);
}

export function zoomOut() {
  applyZoom(currentZoom - ZOOM_STEP);
}

export function resetZoom() {
  applyZoom(1);
}

window.addEventListener("keydown", (event) => {
  if (!(OS_NAME === "macos" ? event.metaKey : event.ctrlKey)) return;

  if (event.key === "-") zoomOut();
  else if (event.key === "=" || event.key === "+") zoomIn();
  else if (event.key === "0") resetZoom();
  else return;

  event.preventDefault();
});

export function getWebviewZoom() {
  return currentZoom;
}

export function onWebviewZoomChange(cb: (zoom: number) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
