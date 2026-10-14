import { TokenBucketRateLimiter, ValidationError, type MutationResult } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  AnswerQuestionInput,
  CreateQuestionInput,
  ListQuestionsParams,
  Question,
  QuestionConversation,
  QuestionCountSummary,
  QuestionProduct,
  RejectQuestionInput,
} from '../types/question.js';

const SERVICE = 'asktoseller' as const;
const BASE_PATH = '/api/v1.0/issues';

/**
 * Hepsiburada "Ask the Seller" (`saticiya-sor-entegrasyonu`).
 *
 * **Service base URL**: `api-asktoseller-merchant[-sit].hepsiburada.com`
 * (per the portal spec — routing through `oms-external` returns 401 because
 * the routes don't exist there; verified on SIT 2026-08-30, where the
 * rerouted calls answer 200). 6-endpoint surface — list / get / create /
 * answer / reject / count.
 *
 * Every endpoint requires the merchant id in a `merchantId` **header**
 * (missing it yields 401); the SDK sends it automatically.
 */
export class QuestionsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  /**
   * List questions with optional status / date filtering. Pages with the
   * API's `page`/`size` parameters (the legacy `offset`/`limit` params are
   * kept as aliases).
   */
  async list(params: ListQuestionsParams = {}): Promise<Question[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: BASE_PATH,
      query: {
        status: params.status,
        minCreatedAt: params.minCreatedAt ?? params.beginDate,
        maxCreatedAt: params.maxCreatedAt ?? params.endDate,
        page: params.page ?? params.offset,
        size: params.size ?? params.limit,
      },
      headers: this.merchantHeader(),
      rateLimiter: this.limiter,
    });
    return unwrapQuestionList(data).map(normalizeQuestion);
  }

  /** Get a single question by its issue number. */
  async get(number: string): Promise<Question> {
    if (!number) {
      throw new ValidationError({ message: 'questions.get: number is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/${encodeURIComponent(number)}`,
      headers: this.merchantHeader(),
      rateLimiter: this.limiter,
    });
    return normalizeQuestion(data);
  }

  /** Per-status question counts. */
  async getCountByStatus(): Promise<QuestionCountSummary> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/count`,
      headers: this.merchantHeader(),
      rateLimiter: this.limiter,
    });
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const out: QuestionCountSummary = { raw: obj };
    if (typeof obj.totalCount === 'number') out.totalCount = obj.totalCount;
    if (obj.byStatus && typeof obj.byStatus === 'object') {
      out.byStatus = obj.byStatus as Record<string, number>;
    } else {
      // The live API answers a flat per-status map, e.g.
      // `{ waitingForAnswer: 1, answered: 2, reported: 0 }` (verified on SIT
      // 2026-08-30) — surface it as `byStatus`.
      const counts: Record<string, number> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'number') counts[key] = value;
      }
      if (Object.keys(counts).length > 0) out.byStatus = counts;
    }
    return out;
  }

  /**
   * Create a new buyer question. SIT-only: Hepsiburada exposes it so
   * integrators can seed test data (the buyer normally creates questions).
   *
   * Resolves to a `MutationResult`. The spec documents the `201` body as a
   * bare `number[]` without naming the elements, so it is left on `raw`
   * rather than modelled as a field.
   */
  async create(input: CreateQuestionInput): Promise<MutationResult> {
    this.assertInput(input, 'questions.create');
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: BASE_PATH,
        body: input,
        headers: this.merchantHeader(),
        rateLimiter: this.limiter,
      }),
    };
  }

  /**
   * Answer a question. Resolves to a `MutationResult` (`201`, the new
   * conversation id as a bare string on `raw`).
   *
   * Sent as `multipart/form-data` with the parts `Answer` and `Files`, as the
   * spec documents; a JSON body is refused with `422` "Bu alan geçersizdir"
   * (verified on SIT, 2026-10-14).
   *
   * @throws {ValidationError} when `Answer` is empty or longer than 2000
   *   characters, or a `Files` entry is not a `Blob` / `File` (checked before
   *   sending).
   */
  async answer(number: string, input: AnswerQuestionInput): Promise<MutationResult> {
    if (!number) {
      throw new ValidationError({ message: 'questions.answer: number is required' });
    }
    this.assertInput(input, 'questions.answer');
    // `answer` (lower case) is accepted too: earlier docs showed it.
    const { Answer, answer: lower, Files: files, ...rest } = input;
    const answer = Answer ?? lower;
    if (typeof answer !== 'string' || answer.trim() === '' || answer.length > 2000) {
      throw new ValidationError({
        message: 'questions.answer: Answer must be 1-2000 characters',
      });
    }
    const body = new FormData();
    body.append('Answer', answer);
    for (const file of files ?? []) {
      if (!(file instanceof Blob)) {
        throw new ValidationError({
          message: 'questions.answer: every Files entry must be a Blob or File',
        });
      }
      body.append('Files', file);
    }
    // Any other part the caller adds goes along as text.
    for (const [name, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null) body.append(name, String(value));
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/${encodeURIComponent(number)}/answer`,
        body,
        headers: this.merchantHeader(),
        rateLimiter: this.limiter,
      }),
    };
  }

  /** Reject a question (mark as inappropriate / spam). Resolves to a `MutationResult` (`201`, bare string on `raw`). */
  async reject(number: string, input: RejectQuestionInput): Promise<MutationResult> {
    if (!number) {
      throw new ValidationError({ message: 'questions.reject: number is required' });
    }
    this.assertInput(input, 'questions.reject');
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/${encodeURIComponent(number)}/reject`,
        body: input,
        headers: this.merchantHeader(),
        rateLimiter: this.limiter,
      }),
    };
  }

  private assertInput(input: unknown, methodLabel: string): void {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: `${methodLabel}: input is required` });
    }
  }

  /**
   * The Ask-the-Seller API authenticates the merchant with a required
   * `merchantId` header on every endpoint (401 without it).
   */
  private merchantHeader(): Record<string, string> {
    return { merchantId: this.transport.merchantId };
  }
}

function unwrapQuestionList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.issues)) return obj.issues;
  return [];
}

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : undefined;

function copyStrings<T extends object>(
  from: Row,
  to: T,
  keys: readonly (keyof T & string)[],
): void {
  for (const key of keys) {
    if (typeof from[key] === 'string') (to as Row)[key] = from[key];
  }
}

function normalizeConversation(row: Row): QuestionConversation {
  const out: QuestionConversation = {};
  copyStrings(row, out, [
    'id',
    'content',
    'from',
    'type',
    'createdAt',
    'lastModifiedAt',
    'rejectReason',
  ]);
  if (typeof row.isMessageSeen === 'boolean') out.isMessageSeen = row.isMessageSeen;
  return out;
}

/**
 * Map one `IssueViewModel`. The deprecated pre-1.2 fields (`number`, `productSku`,
 * `createdDate`) are back-filled from their documented equivalents; `text` / `answer` have no
 * single equivalent (the thread is `conversations`) and are only copied if a response carries them.
 */
function normalizeQuestion(row: unknown): Question {
  const r = asRow(row) ?? {};
  const out: Question = { raw: r };
  copyStrings(r, out, [
    'id',
    'status',
    'lastContent',
    'customerId',
    'orderNumber',
    'lineItemId',
    'createdAt',
    'lastModifiedAt',
    'expireDate',
  ]);
  if (typeof r.issueNumber === 'number') out.issueNumber = r.issueNumber;
  if (typeof r.didCustomerSeeTheMessage === 'boolean') {
    out.didCustomerSeeTheMessage = r.didCustomerSeeTheMessage;
  }
  const subject = asRow(r.subject);
  if (subject) {
    out.subject = {};
    copyStrings(subject, out.subject, ['id', 'description']);
  }
  const product = asRow(r.product);
  if (product) {
    const p: QuestionProduct = {};
    copyStrings(product, p, ['sku', 'name', 'imageUrl', 'stockCode']);
    out.product = p;
  }
  if (Array.isArray(r.conversations)) {
    out.conversations = r.conversations.flatMap((c) => {
      const conversation = asRow(c);
      return conversation ? [normalizeConversation(conversation)] : [];
    });
  }

  // Deprecated fields.
  if (typeof r.number === 'string') out.number = r.number;
  else if (out.issueNumber !== undefined) out.number = String(out.issueNumber);
  if (typeof r.text === 'string') out.text = r.text;
  if (typeof r.answer === 'string') out.answer = r.answer;
  if (typeof r.productSku === 'string') out.productSku = r.productSku;
  else if (out.product?.sku !== undefined) out.productSku = out.product.sku;
  if (typeof r.createdDate === 'string') out.createdDate = r.createdDate;
  else if (out.createdAt !== undefined) out.createdDate = out.createdAt;
  return out;
}
