/**
 * Hepsiburada "Ask the Seller" types (`saticiya-sor-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `saticiya-sor-entegrasyonu` v1.0.
 *
 * Six endpoints — list / get / create / answer / reject / count-by-status
 * for buyer questions posted on product pages.
 */

/**
 * Query parameters for `questions.list()`.
 *
 * The Ask-the-Seller API pages with `page`/`size` and filters creation dates
 * with `minCreatedAt`/`maxCreatedAt` (verified on SIT 2026-08-30).
 */
export interface ListQuestionsParams {
  /** Filter by status (`WaitingForAnswer`, `Answered`, `Reported`, …). */
  status?: string;
  /** @deprecated Alias of {@link minCreatedAt}. */
  beginDate?: string;
  /** @deprecated Alias of {@link maxCreatedAt}. */
  endDate?: string;
  /** @deprecated Alias of {@link page}. */
  offset?: number;
  /** @deprecated Alias of {@link size}. */
  limit?: number;
  /** Zero-based page number. */
  page?: number;
  /** Page size. */
  size?: number;
  /** ISO date-time — questions created at/after this instant. */
  minCreatedAt?: string;
  /** ISO date-time — questions created at/before this instant. */
  maxCreatedAt?: string;
}

/**
 * Body for `questions.create()` — the spec's `CreateIssueViewModel` ("Soru
 * Oluşturma", a SIT test-question generator).
 */
export type CreateQuestionInput = {
  /** How many test questions to create. */
  issueCount?: number;
} & Record<string, unknown>;

/**
 * Body for `questions.answer()`. The spec defines this endpoint as
 * `multipart/form-data` with PascalCase part names.
 */
export type AnswerQuestionInput = {
  /** Answer text — required, at most 2000 characters per spec. */
  Answer?: string;
  /** Same as `Answer` (sent as the `Answer` part). */
  answer?: string;
  /** Files to send along with the answer (`Blob` / `File`). */
  Files?: unknown[];
} & Record<string, unknown>;

/** Body for `questions.reject()` — the spec's `RejectIssueViewModel`. */
export type RejectQuestionInput = {
  /** Why the question is being rejected — at most 2000 characters per spec. */
  rejectReason?: string;
  /** Id of the conversation the rejection relates to, if any. */
  rejectConversationId?: string;
} & Record<string, unknown>;

/** The product a question is about (spec `ProductViewModel`). */
export interface QuestionProduct {
  sku?: string;
  name?: string;
  imageUrl?: string;
  stockCode?: string;
}

/** One message in a question thread (spec `ConversationViewModel`). */
export interface QuestionConversation {
  id?: string;
  /** Message text. */
  content?: string;
  /** Who wrote the message (customer or merchant side), as Hepsiburada labels it. */
  from?: string;
  type?: string;
  createdAt?: string;
  lastModifiedAt?: string;
  isMessageSeen?: boolean;
  rejectReason?: string;
}

/** Topic of a question (spec `SubjectViewModel`). */
export interface QuestionSubject {
  id?: string;
  description?: string;
}

/**
 * One question (spec `IssueViewModel`). Field names follow the documented response, verified
 * against a live SIT list on 2026-10-10.
 */
export interface Question {
  id?: string;
  /** Issue number — the identifier `questions.get()` takes (as a string). */
  issueNumber?: number;
  status?: string;
  subject?: QuestionSubject;
  /** Text of the latest message in the thread. */
  lastContent?: string;
  /** The full thread: the customer's question and any answers. */
  conversations?: QuestionConversation[];
  product?: QuestionProduct;
  customerId?: string;
  orderNumber?: string;
  lineItemId?: string;
  createdAt?: string;
  lastModifiedAt?: string;
  /** Deadline for answering. */
  expireDate?: string;
  didCustomerSeeTheMessage?: boolean;
  /**
   * @deprecated Hepsiburada sends no `number` field. Filled from `issueNumber` (as a string) for
   * compatibility — use `issueNumber`.
   */
  number?: string;
  /**
   * @deprecated Hepsiburada sends no `text` field, so this is never set. Read the question from
   * `conversations` (or `lastContent` for the latest message).
   */
  text?: string;
  /**
   * @deprecated Hepsiburada sends no `answer` field, so this is never set. Answers are messages
   * in `conversations`.
   */
  answer?: string;
  /** @deprecated Hepsiburada sends no `productSku` field. Filled from `product.sku` — use that. */
  productSku?: string;
  /** @deprecated Hepsiburada sends no `createdDate` field. Filled from `createdAt` — use that. */
  createdDate?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** Per-status count summary returned by `questions.getCountByStatus()`. */
export interface QuestionCountSummary {
  totalCount?: number;
  byStatus?: Record<string, number>;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}
