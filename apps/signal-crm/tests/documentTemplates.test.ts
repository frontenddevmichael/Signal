import { describe, expect, it } from "vitest";
import {
  DOC_TEMPLATES,
  docTitle,
  isDocComplete,
  renderDocBody,
} from "../src/lib/documentTemplates";

const FULL: Record<string, string> = {
  clientName: "Acme Co.",
  projectName: "Website redesign",
  scope: "Design and build a 5-page marketing site.",
  timeline: "4 weeks",
  fee: "4,500",
  currency: "USD",
  startDate: "2026-09-01",
};

describe("documentTemplates", () => {
  it("exposes proposal and contract templates with the required fields", () => {
    expect(Object.keys(DOC_TEMPLATES).sort()).toEqual(["contract", "proposal"]);
    const proposal = DOC_TEMPLATES.proposal.fields.map((f) => f.key);
    expect(proposal).toContain("clientName");
    expect(proposal).toContain("fee");
    expect(proposal).toContain("currency");
    const contract = DOC_TEMPLATES.contract.fields.map((f) => f.key);
    expect(contract).toContain("startDate");
  });

  it("isDocComplete requires every field", () => {
    expect(isDocComplete("proposal", FULL)).toBe(true);
    expect(isDocComplete("proposal", { ...FULL, fee: "" })).toBe(false);
    expect(isDocComplete("contract", FULL)).toBe(true);
    expect(isDocComplete("contract", { ...FULL, startDate: "  " })).toBe(false);
  });

  it("renders a proposal body with the filled values", () => {
    const body = renderDocBody("proposal", FULL);
    expect(body).toContain("Proposal — Acme Co.");
    expect(body).toContain("Project: Website redesign");
    expect(body).toContain("4,500 USD");
    expect(body).toContain("4 weeks from acceptance");
    expect(body).toContain("valid for 30 days");
  });

  it("renders a contract body with payment/ownership terms", () => {
    const body = renderDocBody("contract", FULL);
    expect(body).toContain("Contract — Acme Co.");
    expect(body).toContain("4,500 USD for the completed scope");
    expect(body).toContain("begins on 2026-09-01");
    expect(body).toContain("transfer to Acme Co.");
  });

  it("builds a human title from type and client", () => {
    expect(docTitle("proposal", FULL)).toBe("Proposal — Acme Co.");
    expect(docTitle("contract", { ...FULL, clientName: "" })).toBe("Contract — Untitled client");
  });

  it("handles empty values without crashing", () => {
    expect(renderDocBody("proposal", {}).length).toBeGreaterThan(0);
    expect(renderDocBody("contract", {})).toContain("Contract — ");
  });
});
