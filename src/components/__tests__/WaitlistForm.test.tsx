import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WaitlistForm } from "../WaitlistForm";

async function submit(email?: string) {
  if (email !== undefined) {
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  }
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "Notify Me" }).closest("form")!);
  });
}

describe("WaitlistForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pre-fills a signed-in user's email", () => {
    render(<WaitlistForm nextYear={2027} defaultEmail="fan@example.com" />);
    expect(screen.getByLabelText("Email address")).toHaveValue("fan@example.com");
  });

  it("posts the email and shows the success state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<WaitlistForm nextYear={2027} />);
    await submit("fan@example.com");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/waitlist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "fan@example.com" }),
      })
    );
    expect(screen.getByText("YOU'RE IN!")).toBeInTheDocument();
    expect(screen.getByText("We'll email you when 2027 brackets open.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows an error and keeps the form when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<WaitlistForm nextYear={2027} />);
    await submit("fan@example.com");

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
    expect(screen.getByRole("button", { name: "Notify Me" })).toBeInTheDocument();
  });

  it("shows the error state when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<WaitlistForm nextYear={2027} />);
    await submit("fan@example.com");

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does nothing on submit with an empty email", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<WaitlistForm nextYear={2027} />);
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
