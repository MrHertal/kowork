// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ErrorAlert } from "./error-alert";

describe("ErrorAlert", () => {
  it("renders nothing without an error text", () => {
    const { container } = render(<ErrorAlert text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a custom title when provided", () => {
    render(<ErrorAlert title="Update failed" text="details" />);
    expect(screen.getByRole("button")).toHaveTextContent("Update failed");
  });

  it("falls back to the localized generic title", () => {
    render(<ErrorAlert text="details" />);
    expect(screen.getByRole("button")).toHaveTextContent(
      "Something went wrong",
    );
  });

  it("reveals the error details when expanded", async () => {
    const user = userEvent.setup();
    render(<ErrorAlert text="connection refused" />);
    expect(screen.queryByText("connection refused")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("connection refused")).toBeInTheDocument();
  });
});
