/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountDeletion from "../accountDeletion.js";
import type * as apiKeys from "../apiKeys.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as backfillQueue from "../backfillQueue.js";
import type * as backup from "../backup.js";
import type * as calendar from "../calendar.js";
import type * as calendarLogic from "../calendarLogic.js";
import type * as contacts from "../contacts.js";
import type * as customFields from "../customFields.js";
import type * as email from "../email.js";
import type * as github from "../github.js";
import type * as githubActions from "../githubActions.js";
import type * as githubClient from "../githubClient.js";
import type * as githubLogic from "../githubLogic.js";
import type * as githubWebhook from "../githubWebhook.js";
import type * as gmailClient from "../gmailClient.js";
import type * as gmailConnect from "../gmailConnect.js";
import type * as gmailLogic from "../gmailLogic.js";
import type * as gmailReply from "../gmailReply.js";
import type * as gmailSend from "../gmailSend.js";
import type * as gmailSetup from "../gmailSetup.js";
import type * as http from "../http.js";
import type * as inboundEmail from "../inboundEmail.js";
import type * as inboundMutations from "../inboundMutations.js";
import type * as invoiceLogic from "../invoiceLogic.js";
import type * as invoicePdf from "../invoicePdf.js";
import type * as invoices from "../invoices.js";
import type * as meetings from "../meetings.js";
import type * as mergeLogic from "../mergeLogic.js";
import type * as notes from "../notes.js";
import type * as nudgeLogic from "../nudgeLogic.js";
import type * as nudges from "../nudges.js";
import type * as paymentLogic from "../paymentLogic.js";
import type * as paymentWebhook from "../paymentWebhook.js";
import type * as paymentsClient from "../paymentsClient.js";
import type * as portal from "../portal.js";
import type * as portalLogic from "../portalLogic.js";
import type * as projects from "../projects.js";
import type * as push from "../push.js";
import type * as pushLogic from "../pushLogic.js";
import type * as pushSender from "../pushSender.js";
import type * as reconciliation from "../reconciliation.js";
import type * as sanitizeHtml from "../sanitizeHtml.js";
import type * as sessions from "../sessions.js";
import type * as shell from "../shell.js";
import type * as timeline from "../timeline.js";
import type * as tokenCrypto from "../tokenCrypto.js";
import type * as triage from "../triage.js";
import type * as undoLogic from "../undoLogic.js";
import type * as users from "../users.js";
import type * as webhooks from "../webhooks.js";
import type * as whatsappLogic from "../whatsappLogic.js";
import type * as whatsappMutations from "../whatsappMutations.js";
import type * as whatsappWebhook from "../whatsappWebhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountDeletion: typeof accountDeletion;
  apiKeys: typeof apiKeys;
  audit: typeof audit;
  auth: typeof auth;
  backfillQueue: typeof backfillQueue;
  backup: typeof backup;
  calendar: typeof calendar;
  calendarLogic: typeof calendarLogic;
  contacts: typeof contacts;
  customFields: typeof customFields;
  email: typeof email;
  github: typeof github;
  githubActions: typeof githubActions;
  githubClient: typeof githubClient;
  githubLogic: typeof githubLogic;
  githubWebhook: typeof githubWebhook;
  gmailClient: typeof gmailClient;
  gmailConnect: typeof gmailConnect;
  gmailLogic: typeof gmailLogic;
  gmailReply: typeof gmailReply;
  gmailSend: typeof gmailSend;
  gmailSetup: typeof gmailSetup;
  http: typeof http;
  inboundEmail: typeof inboundEmail;
  inboundMutations: typeof inboundMutations;
  invoiceLogic: typeof invoiceLogic;
  invoicePdf: typeof invoicePdf;
  invoices: typeof invoices;
  meetings: typeof meetings;
  mergeLogic: typeof mergeLogic;
  notes: typeof notes;
  nudgeLogic: typeof nudgeLogic;
  nudges: typeof nudges;
  paymentLogic: typeof paymentLogic;
  paymentWebhook: typeof paymentWebhook;
  paymentsClient: typeof paymentsClient;
  portal: typeof portal;
  portalLogic: typeof portalLogic;
  projects: typeof projects;
  push: typeof push;
  pushLogic: typeof pushLogic;
  pushSender: typeof pushSender;
  reconciliation: typeof reconciliation;
  sanitizeHtml: typeof sanitizeHtml;
  sessions: typeof sessions;
  shell: typeof shell;
  timeline: typeof timeline;
  tokenCrypto: typeof tokenCrypto;
  triage: typeof triage;
  undoLogic: typeof undoLogic;
  users: typeof users;
  webhooks: typeof webhooks;
  whatsappLogic: typeof whatsappLogic;
  whatsappMutations: typeof whatsappMutations;
  whatsappWebhook: typeof whatsappWebhook;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
