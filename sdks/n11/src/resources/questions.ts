import {
  NotFoundError,
  TokenBucketRateLimiter,
  ValidationError,
  type CursorPage,
} from '@lonca/core';
import type { N11Transport } from '../transport.js';
import { asArray, asObject, type XmlNode, type XmlObject } from '../soap/xml.js';
import { assign, nextPage, pageCursor, paging, soapDate, text } from '../soap/values.js';
import type { ListN11QuestionsParams, N11Question, N11QuestionDetail } from '../types/question.js';

const SERVICE = 'productService';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/** Documented answer length limit. */
const MAX_ANSWER_LENGTH = 2048;

function images(node: XmlNode | undefined): string[] {
  return asArray(asObject(node).image).filter(
    (x): x is string => typeof x === 'string' && x !== '',
  );
}

function normalizeQuestion(node: XmlNode): N11Question {
  const q = asObject(node);
  return assign<N11Question>(
    { id: text(q.id) ?? '', images: images(q.images), raw: q as Record<string, unknown> },
    {
      productId: text(q.productId),
      productTitle: text(q.productTitle),
      subject: text(q.questionSubject),
      question: text(q.question),
      answer: text(q.answer),
    },
  );
}

function normalizeDetail(id: string, q: XmlObject): N11QuestionDetail {
  return assign<N11QuestionDetail>(
    { id, images: images(q.images), raw: q as Record<string, unknown> },
    {
      productId: text(q.productId),
      productTitle: text(q.productTitle),
      subject: text(q.questionSubject),
      question: text(q.question),
      answer: text(q.answer),
      fullName: text(q.fullName),
      email: text(q.email),
      productStatus: text(q.productStatus),
      status: text(q.status),
      questionDate: text(q.questionDate),
      answeredDate: text(q.answeredDate),
      sellerExpose: text(q.sellerExpose),
      buyerExpose: text(q.buyerExpose),
    },
  );
}

/**
 * Product questions (SOAP `ProductService`).
 *
 * Source: developer.n11.com → "Ürün Soru-Cevap Servisi" and
 * `api.n11.com/ws/productService.wsdl`. Reads verified against prod on
 * 2026-10-10; `answer` on n11's test store on 2026-10-13.
 *
 * Rate limit: n11 allows listing questions **once per minute**; the default
 * limiter enforces that for this client. Inject a shared limiter when several
 * clients use the same key.
 */
export class QuestionsResource {
  private readonly listLimiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: N11Transport,
    listLimiter?: TokenBucketRateLimiter,
  ) {
    this.listLimiter =
      listLimiter ?? new TokenBucketRateLimiter({ capacity: 1, intervalMs: 60_000 });
  }

  /**
   * List questions asked in a date window (`GetProductQuestionList`). n11
   * requires `startDate`, `endDate` and paging; `status` defaults to `OPEN`.
   */
  async list(params: ListN11QuestionsParams): Promise<CursorPage<N11Question>> {
    const page = pageCursor(params.cursor, 'questions');
    const size = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const response = await this.transport.soap({
      service: SERVICE,
      operation: 'GetProductQuestionList',
      fields: {
        productQuestionSearch: {
          productId: params.productId,
          buyerEmail: params.buyerEmail,
          subject: params.subject,
          status: params.status,
          startDate: soapDate(params.startDate),
          endDate: soapDate(params.endDate),
        },
        pagingData: { currentPage: page, pageSize: size },
      },
      rateLimiter: this.listLimiter,
    });
    const rows = asArray(asObject(response.productQuestions).productQuestion);
    const result: CursorPage<N11Question> = { items: rows.map(normalizeQuestion) };
    const next = nextPage(page, rows.length, paging(response.pagingData));
    if (next !== undefined) result.nextCursor = next;
    return result;
  }

  /**
   * One question with the buyer's details (`GetProductQuestionDetail`). n11
   * answers an unknown id with `result: success` and no question; that is
   * thrown as `NotFoundError`.
   */
  async get(questionId: string | number): Promise<N11QuestionDetail> {
    const id = String(questionId);
    const response = await this.transport.soap({
      service: SERVICE,
      operation: 'GetProductQuestionDetail',
      fields: { productQuestionId: id },
    });
    const question = asObject(response.productQuestion);
    if (Object.keys(question).length === 0) {
      throw new NotFoundError({ message: 'n11 question not found', status: 200 });
    }
    return normalizeDetail(id, question);
  }

  /**
   * Answer a question (`SaveProductAnswer`). A question can be answered once;
   * it then becomes `CLOSED`. A second answer fails with
   * `SELLER_API.productQuestion.alreadyAnswered` (`ValidationError`), an
   * unknown id with `SELLER_API.productQuestion.notFound` (`NotFoundError`).
   *
   * @throws {ValidationError} when `answer` is empty or longer than 2048
   *   characters (checked before sending).
   */
  async answer(questionId: string | number, answer: string): Promise<void> {
    if (answer.trim().length === 0 || answer.length > MAX_ANSWER_LENGTH) {
      throw new ValidationError({
        message: `questions.answer: answer must be 1 to ${MAX_ANSWER_LENGTH} characters`,
      });
    }
    await this.transport.soap({
      service: SERVICE,
      operation: 'SaveProductAnswer',
      fields: { productQuestionId: String(questionId), answer },
      idempotent: false,
    });
  }
}
