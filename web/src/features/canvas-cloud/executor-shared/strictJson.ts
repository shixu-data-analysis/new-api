export interface StrictJsonLimits {
  maxBytes: number;
  maxDepth: number;
  maxKeys: number;
  maxArrayItems: number;
  maxStringLength: number;
}

export const ADAPTER_PROFILE_JSON_LIMITS: StrictJsonLimits = {
  maxBytes: 2 * 1024 * 1024,
  maxDepth: 64,
  maxKeys: 100_000,
  maxArrayItems: 100_000,
  maxStringLength: 512 * 1024,
};

interface ParseCounters {
  keys: number;
  arrayItems: number;
}

class StrictJsonScanner {
  private index = 0;
  private readonly counters: ParseCounters = { keys: 0, arrayItems: 0 };

  constructor(private readonly source: string, private readonly limits: StrictJsonLimits) {}

  scan() {
    this.skipWhitespace();
    this.scanValue(0);
    this.skipWhitespace();
    if (this.index !== this.source.length) throw this.error("Unexpected trailing JSON content");
  }

  private scanValue(depth: number) {
    if (depth > this.limits.maxDepth) throw this.error(`JSON exceeds maximum depth ${this.limits.maxDepth}`);
    const character = this.source[this.index];
    if (character === "{") return this.scanObject(depth);
    if (character === "[") return this.scanArray(depth);
    if (character === '"') {
      this.scanString();
      return;
    }
    if (character === "t") return this.scanLiteral("true");
    if (character === "f") return this.scanLiteral("false");
    if (character === "n") return this.scanLiteral("null");
    if (character === "-" || character && character >= "0" && character <= "9") return this.scanNumber();
    throw this.error("Expected a JSON value");
  }

  private scanObject(depth: number) {
    this.index += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return;
    }
    while (this.index < this.source.length) {
      if (this.source[this.index] !== '"') throw this.error("Expected an object key");
      const key = this.scanString();
      const normalizedKey = key.normalize("NFC");
      if (keys.has(normalizedKey)) throw this.error(`Duplicate JSON key: ${key}`);
      if (normalizedKey === "__proto__" || normalizedKey === "prototype" || normalizedKey === "constructor") {
        throw this.error(`Unsafe JSON key: ${key}`);
      }
      keys.add(normalizedKey);
      this.counters.keys += 1;
      if (this.counters.keys > this.limits.maxKeys) throw this.error(`JSON exceeds ${this.limits.maxKeys} object keys`);
      this.skipWhitespace();
      if (this.source[this.index] !== ":") throw this.error("Expected ':' after an object key");
      this.index += 1;
      this.skipWhitespace();
      this.scanValue(depth + 1);
      this.skipWhitespace();
      if (this.source[this.index] === "}") {
        this.index += 1;
        return;
      }
      if (this.source[this.index] !== ",") throw this.error("Expected ',' or '}' in an object");
      this.index += 1;
      this.skipWhitespace();
    }
    throw this.error("Unterminated object");
  }

  private scanArray(depth: number) {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return;
    }
    while (this.index < this.source.length) {
      this.counters.arrayItems += 1;
      if (this.counters.arrayItems > this.limits.maxArrayItems) {
        throw this.error(`JSON exceeds ${this.limits.maxArrayItems} array items`);
      }
      this.scanValue(depth + 1);
      this.skipWhitespace();
      if (this.source[this.index] === "]") {
        this.index += 1;
        return;
      }
      if (this.source[this.index] !== ",") throw this.error("Expected ',' or ']' in an array");
      this.index += 1;
      this.skipWhitespace();
    }
    throw this.error("Unterminated array");
  }

  private scanString() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code === 0x22) {
        this.index += 1;
        const raw = this.source.slice(start, this.index);
        const value = JSON.parse(raw) as string;
        if ([...value].length > this.limits.maxStringLength) {
          throw this.error(`JSON string exceeds ${this.limits.maxStringLength} code points`);
        }
        assertValidUnicode(value);
        return value;
      }
      if (code === 0x5c) {
        this.index += 1;
        const escape = this.source[this.index];
        if (!escape || !'"\\/bfnrtu'.includes(escape)) throw this.error("Invalid JSON escape sequence");
        if (escape === "u") {
          const hex = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw this.error("Invalid JSON Unicode escape");
          this.index += 4;
        }
      } else if (code < 0x20) {
        throw this.error("Unescaped control character in JSON string");
      }
      this.index += 1;
    }
    throw this.error("Unterminated string");
  }

  private scanLiteral(literal: string) {
    if (this.source.slice(this.index, this.index + literal.length) !== literal) throw this.error(`Invalid JSON literal`);
    this.index += literal.length;
  }

  private scanNumber() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.index));
    if (!match) throw this.error("Invalid JSON number");
    this.index += match[0].length;
  }

  private skipWhitespace() {
    while (this.index < this.source.length && /[\t\n\r ]/.test(this.source[this.index]!)) this.index += 1;
  }

  private error(message: string) {
    return new Error(`${message} at byte ${UTF8.encode(this.source.slice(0, this.index)).byteLength}`);
  }
}

// UTF-8 bytes through TextEncoder, which Node and browsers share, so the admin page parses with this same code.
const UTF8 = new TextEncoder();

export function parseStrictJson(input: Uint8Array | string, limits: StrictJsonLimits = ADAPTER_PROFILE_JSON_LIMITS): unknown {
  const buffer = typeof input === "string" ? UTF8.encode(input) : input;
  if (buffer.byteLength > limits.maxBytes) throw new Error(`JSON exceeds ${limits.maxBytes} bytes`);
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
  if (source.startsWith("\uFEFF")) throw new Error("JSON must not contain a UTF-8 BOM");
  if (source.includes("\0")) throw new Error("JSON must not contain NUL characters");
  new StrictJsonScanner(source, limits).scan();
  const value = JSON.parse(source) as unknown;
  assertNoInvisibleIdentifierCharacters(value);
  return value;
}

function assertValidUnicode(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("JSON contains an unpaired high surrogate");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("JSON contains an unpaired low surrogate");
    }
  }
}

function assertNoInvisibleIdentifierCharacters(value: unknown) {
  const stack: unknown[] = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/u.test(key)) {
        throw new Error(`JSON key contains an invisible or bidi control character: ${JSON.stringify(key)}`);
      }
      stack.push(child);
    }
  }
}
