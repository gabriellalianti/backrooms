import type { ParsedOrder, ParsedOrderItem } from "./types";

export class OrderParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderParseError";
  }
}

export function normaliseEmailText(input: string): string {
  return input
    .replace(/\\\s*\r?\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x20;|&#32;|&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function requiredMatch(text: string, pattern: RegExp, field: string): string {
  const value = text.match(pattern)?.[1]?.trim();
  if (!value) throw new OrderParseError(`Missing ${field}`);
  return value;
}

function parseDate(value: string): string {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new OrderParseError(`Invalid Date Added: ${value}`);

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new OrderParseError(`Invalid Date Added: ${value}`);
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function parseMoney(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new OrderParseError(`Invalid price: ${value}`);
  return Math.round(number * 100);
}

function parseProductLine(line: string): ParsedOrderItem {
  const match = line.match(/^(\d+)x\s+(.+?)\s+\$([0-9]+(?:\.[0-9]{1,2})?)$/i);
  if (!match) throw new OrderParseError(`Invalid product line: ${line}`);
  return {
    quantity: Number(match[1]),
    rawName: match[2].replace(/\s+/g, " ").trim(),
    lineTotalCents: parseMoney(match[3]),
  };
}

export function parseOrderEmail(input: string): ParsedOrder {
  const text = normaliseEmailText(input);
  const lines = text.split("\n");
  const productsIndex = lines.findIndex((line) => /^Products$/i.test(line));
  const totalsIndex = lines.findIndex((line, index) => index > productsIndex && /^Totals$/i.test(line));

  if (productsIndex < 0 || totalsIndex < 0 || totalsIndex <= productsIndex + 1) {
    throw new OrderParseError("Missing or empty Products section");
  }

  const id = requiredMatch(text, /^Order ID:\s*(\d+)$/im, "Order ID");
  const dateAdded = parseDate(requiredMatch(text, /^Date Added:\s*(.+)$/im, "Date Added"));
  const sourceStatus = requiredMatch(text, /^Order Status:\s*(.+)$/im, "Order Status");
  const items = lines.slice(productsIndex + 1, totalsIndex).map(parseProductLine);

  const commentsMarker = lines.findIndex((line) => /^The comments for your order are:$/i.test(line));
  const comments = commentsMarker >= 0 ? lines.slice(commentsMarker + 1).join("\n").trim() || null : null;

  return { id, dateAdded, sourceStatus, comments, items };
}

