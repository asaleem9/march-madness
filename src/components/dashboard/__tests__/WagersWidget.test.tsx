import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WagersWidget, otherPartyName, wagerResult, type WagerRow } from "../WagersWidget";

const me = "user-me";
const base: WagerRow = {
  id: "w1",
  stakes: "Loser buys tacos",
  status: "pending",
  challenger_id: "user-them",
  opponent_id: me,
  winner_id: null,
  challenger: { display_name: "Alex" },
  opponent: { display_name: "Me" },
};

describe("wager helpers", () => {
  it("names the other party regardless of which side I'm on", () => {
    expect(otherPartyName(base, me)).toBe("Alex");
    expect(otherPartyName({ ...base, challenger_id: me, opponent_id: "x", opponent: { display_name: "Sam" } }, me)).toBe("Sam");
    expect(otherPartyName({ ...base, challenger: null }, me)).toBe("Unknown");
  });

  it("derives won / lost / tie only for resolved wagers", () => {
    expect(wagerResult(base, me)).toBeNull();
    expect(wagerResult({ ...base, status: "resolved", winner_id: me }, me)).toBe("won");
    expect(wagerResult({ ...base, status: "resolved", winner_id: "user-them" }, me)).toBe("lost");
    expect(wagerResult({ ...base, status: "resolved", winner_id: null }, me)).toBe("tie");
  });
});

describe("WagersWidget", () => {
  it("shows a Respond badge linking to the pending tab when I'm the opponent", () => {
    render(
      <WagersWidget
        wagers={[base]}
        userId={me}
        wagerDeadline="2027-03-18T16:00:00Z"
        pastWagerDeadline={false}
        showResults={false}
      />
    );
    expect(screen.getByText("vs Alex")).toBeInTheDocument();
    const respond = screen.getByRole("link", { name: "Respond" });
    expect(respond).toHaveAttribute("href", "/wagers?tab=pending");
    expect(screen.getByRole("link", { name: "Respond to wagers" })).toHaveAttribute(
      "href",
      "/wagers?tab=pending"
    );
    expect(screen.getByText(/Wagers close .*Mar 18.*EDT/)).toBeInTheDocument();
  });

  it("shows AWAITING (not Respond) when I'm the challenger", () => {
    render(
      <WagersWidget
        wagers={[{ ...base, challenger_id: me, opponent_id: "user-them" }]}
        userId={me}
        wagerDeadline={null}
        pastWagerDeadline={false}
        showResults={false}
      />
    );
    expect(screen.queryByRole("link", { name: "Respond" })).toBeNull();
    expect(screen.getByText("AWAITING")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage wagers" })).toHaveAttribute("href", "/wagers");
  });

  it("renders results after the tournament", () => {
    render(
      <WagersWidget
        wagers={[
          { ...base, id: "a", status: "resolved", winner_id: me },
          { ...base, id: "b", status: "resolved", winner_id: null },
        ]}
        userId={me}
        wagerDeadline="2027-03-18T16:00:00Z"
        pastWagerDeadline
        showResults
      />
    );
    expect(screen.getByText("WAGER RESULTS")).toBeInTheDocument();
    expect(screen.getByText("WON")).toBeInTheDocument();
    expect(screen.getByText("TIE")).toBeInTheDocument();
    expect(screen.queryByText(/Wagers close/)).toBeNull();
  });
});
