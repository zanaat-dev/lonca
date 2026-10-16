import { moneyFromMajor, TRY, type Money } from '@lonca/core';
import { asObject, asText, type XmlNode } from './xml.js';

/**
 * Format a date the way n11's SOAP filters expect it: `DD/MM/YYYY`, on the
 * Turkish calendar day (Europe/Istanbul). Strings pass through unchanged.
 */
export function soapDate(value: Date | string | undefined): string | undefined {
  if (value === undefined || typeof value === 'string') return value;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(value);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

/**
 * Format a date as `YYYY-MM-DD` on the Turkish calendar day, for the services
 * that take ISO days (`SettlementService`). Strings pass through unchanged.
 */
export function isoDay(value: Date | string): string;
export function isoDay(value: Date | string | undefined): string | undefined;
export function isoDay(value: Date | string | undefined): string | undefined {
  const day = soapDate(value);
  if (day === undefined || typeof value === 'string') return day;
  const [dd, mm, yyyy] = day.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

/** Non-empty text of a child element. */
export function text(node: XmlNode | undefined): string | undefined {
  return asText(node);
}

/** A numeric child element (SOAP sends every number as text). */
export function num(node: XmlNode | undefined): number | undefined {
  const raw = asText(node);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** A decimal amount in Turkish lira (the SOAP services send no currency). */
export function money(node: XmlNode | undefined): Money | undefined {
  const value = num(node);
  return value === undefined ? undefined : moneyFromMajor(value, TRY);
}

/** `pagingData` of a SOAP list response. */
export interface SoapPaging {
  currentPage?: number;
  pageSize?: number;
  totalCount?: number;
  pageCount?: number;
}

export function paging(node: XmlNode | undefined): SoapPaging {
  const p = asObject(node);
  const out: SoapPaging = {};
  const currentPage = num(p.currentPage);
  if (currentPage !== undefined) out.currentPage = currentPage;
  const pageSize = num(p.pageSize);
  if (pageSize !== undefined) out.pageSize = pageSize;
  const totalCount = num(p.totalCount);
  if (totalCount !== undefined) out.totalCount = totalCount;
  const pageCount = num(p.pageCount);
  if (pageCount !== undefined) out.pageCount = pageCount;
  return out;
}

/** Next page index, or `undefined` when `page` was the last one. */
export function nextPage(page: number, rows: number, info: SoapPaging): string | undefined {
  if (rows === 0) return undefined;
  if (info.pageCount !== undefined && page + 1 >= info.pageCount) return undefined;
  return String(page + 1);
}

/** Parse a 0-based page cursor. */
export function pageCursor(cursor: string | undefined, what: string): number {
  if (cursor === undefined) return 0;
  const page = Number(cursor);
  if (!Number.isInteger(page) || page < 0) {
    throw new TypeError(`n11 ${what} cursor must be a non-negative page index, got "${cursor}"`);
  }
  return page;
}

/** Copy the defined entries of `source` onto `target`. */
export function assign<T extends object>(target: T, source: Partial<Record<keyof T, unknown>>): T {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  }
  return target;
}
