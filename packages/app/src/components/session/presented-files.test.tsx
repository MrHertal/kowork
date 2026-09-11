// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { PlatformProvider, type Platform } from "@/contexts/platform";
import { PresentedFiles, type PresentedFile } from "./presented-files";

vi.mock("@/contexts/server", () => ({
  useServer: () => ({ isLocal: false, current: undefined }),
}));

const platform: Platform = {
  platform: "web",
  openLink: () => undefined,
  back: () => undefined,
  forward: () => undefined,
  restart: () => Promise.resolve(),
  notify: () => Promise.resolve(),
};

function renderFiles(files: PresentedFile[]) {
  render(
    <PlatformProvider value={platform}>
      <PresentedFiles files={files} />
    </PlatformProvider>,
  );
}

describe("PresentedFiles", () => {
  test("renders image files with their normalized format labels", () => {
    renderFiles([
      {
        path: "/tmp/poster.PNG",
        filename: "poster.PNG",
        mime: "image/png",
        size: 3,
      },
      {
        path: "/tmp/photo.jpg",
        filename: "photo.jpg",
        mime: "image/jpeg",
        size: 3,
      },
      {
        path: "/tmp/scan.tif",
        filename: "scan.tif",
        mime: "image/tiff",
        size: 3,
      },
    ]);

    expect(screen.getByText("PNG")).toBeInTheDocument();
    expect(screen.getByText("JPEG")).toBeInTheDocument();
    expect(screen.getByText("TIFF")).toBeInTheDocument();
    expect(screen.queryByText("Word document")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open" }),
    ).not.toBeInTheDocument();
  });

  test("recognizes a supported image extension when MIME metadata is generic", () => {
    renderFiles([
      {
        path: "/tmp/icon.ico",
        filename: "icon.ico",
        mime: "application/octet-stream",
        size: 3,
      },
    ]);

    expect(screen.getByText("ICO")).toBeInTheDocument();
    expect(screen.queryByText("Word document")).not.toBeInTheDocument();
  });
});
