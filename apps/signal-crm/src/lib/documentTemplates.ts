/**
 * §documents — template engine for generated proposals/contracts. PURE logic:
 * no React, no Convex, no network — fully unit-testable. The New document
 * flow fills a field set, renders the body here, and stores the result in the
 * documents table as plain-text paragraphs (one per line).
 *
 * Templates are deliberately minimal prose — a real document a freelancer
 * would send, not a wall of boilerplate. Field sets are small and the copy is
 * honest about scope/terms placeholders the freelancer owns.
 */

export type DocType = "proposal" | "contract";

export interface DocField {
  key: string;
  label: string;
  placeholder: string;
}

export interface DocTemplate {
  type: DocType;
  label: string;
  /** The one-line summary shown in the picker. */
  blurb: string;
  fields: DocField[];
}

export const DOC_TEMPLATES: Record<DocType, DocTemplate> = {
  proposal: {
    type: "proposal",
    label: "Proposal",
    blurb: "Scope, timeline, and fee — what you'll do and what it costs.",
    fields: [
      { key: "clientName", label: "Client name", placeholder: "Acme Co." },
      { key: "projectName", label: "Project", placeholder: "Website redesign" },
      { key: "scope", label: "Scope", placeholder: "Design and build a 5-page marketing site…" },
      { key: "timeline", label: "Timeline", placeholder: "4 weeks" },
      { key: "fee", label: "Fee", placeholder: "4,500" },
      { key: "currency", label: "Currency", placeholder: "USD" },
    ],
  },
  contract: {
    type: "contract",
    label: "Contract",
    blurb: "The working agreement — engagement, payment, and ownership terms.",
    fields: [
      { key: "clientName", label: "Client name", placeholder: "Acme Co." },
      { key: "projectName", label: "Project", placeholder: "Website redesign" },
      { key: "scope", label: "Scope", placeholder: "Design and build a 5-page marketing site…" },
      { key: "fee", label: "Fee", placeholder: "4,500" },
      { key: "currency", label: "Currency", placeholder: "USD" },
      { key: "startDate", label: "Start date", placeholder: "2026-09-01" },
    ],
  },
};

export type DocValues = Record<string, string>;

/** Whether every required field has a value (used to enable the create button). */
export function isDocComplete(type: DocType, values: DocValues): boolean {
  return DOC_TEMPLATES[type].fields.every((f) => (values[f.key] ?? "").trim().length > 0);
}

/** Renders a filled template to plain-text paragraphs — one per line. */
export function renderDocBody(type: DocType, values: DocValues): string {
  const v = (k: string) => (values[k] ?? "").trim();
  const client = v("clientName");
  const project = v("projectName");
  const fee = v("fee");
  const currency = v("currency");

  if (type === "proposal") {
    return [
      `Proposal — ${client}`,
      "",
      `Project: ${project}`,
      "",
      `Scope`,
      v("scope"),
      "",
      `Timeline`,
      `${v("timeline")} from acceptance of this proposal.`,
      "",
      `Fee`,
      `${fee} ${currency}, payable on acceptance.`,
      "",
      `This proposal is valid for 30 days.`,
    ].join("\n");
  }

  return [
    `Contract — ${client}`,
    "",
    `This agreement is between the freelancer and ${client} for the project: ${project}.`,
    "",
    `Scope of work`,
    v("scope"),
    "",
    `Payment`,
    `The client agrees to pay ${fee} ${currency} for the completed scope.`,
    "",
    `Term`,
    `Work begins on ${v("startDate")} and continues until the scope is delivered.`,
    "",
    `Ownership`,
    `Upon full payment, all deliverables transfer to ${client}.`,
    "",
    `This contract is governed by the parties' applicable law.`,
  ].join("\n");
}

/** Human title for the document row — "Proposal — Acme Co." style. */
export function docTitle(type: DocType, values: DocValues): string {
  const client = (values.clientName ?? "").trim() || "Untitled client";
  const label = DOC_TEMPLATES[type].label;
  return `${label} — ${client}`;
}
