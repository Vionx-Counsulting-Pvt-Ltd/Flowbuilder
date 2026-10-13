export * from "./reference-mappings";

export type ExpressionField = {
  id: string;
  key?: string | null;
  label?: string | null;
  type?: string;
  sourceTableId?: string | null;
  referenceColumns?: { key: string; label: string }[];
  referenceData?: Record<string, Record<string, string | number | boolean | null>>;
};

export type ExpressionUser = {
  email?: string;
  name?: string;
  role?: string;
};

export type ExpressionContext = {
  fields: ExpressionField[];
  values: Record<string, unknown>;
  user?: ExpressionUser;
  now?: Date;
};

export type ExpressionFieldDefinition = ExpressionField & {
  initialValueExpression?: string | null;
  appFormula?: string | null;
  showIf?: string | null;
  requiredIf?: string | null;
  validIf?: string | null;
};

export type ExpressionFunction = {
  name: string;
  signature: string;
  description: string;
  example: string;
};

export const expressionFunctions: ExpressionFunction[] = [
  { name: "IF", signature: "IF(condition, value_if_true, value_if_false)", description: "Choose a value based on a condition.", example: 'IF([Amount] > 1000, "Review", "Standard")' },
  { name: "IFS", signature: "IFS(condition, value, ...)", description: "Return the value for the first true condition.", example: 'IFS([Amount] > 5000, "High", [Amount] > 1000, "Medium", "Low")' },
  { name: "SWITCH", signature: "SWITCH(value, case, result, ..., default)", description: "Match one value against several cases.", example: 'SWITCH([Type], "Travel", 2000, "Equipment", 5000, 0)' },
  { name: "AND", signature: "AND(condition, condition, ...)", description: "True only when every condition is true.", example: 'AND([Amount] > 0, [Department] = "Finance")' },
  { name: "OR", signature: "OR(condition, condition, ...)", description: "True when any condition is true.", example: 'OR([Priority] = "Urgent", [Amount] > 5000)' },
  { name: "NOT", signature: "NOT(condition)", description: "Reverse a true/false value.", example: "NOT(ISBLANK([Email]))" },
  { name: "ISBLANK", signature: "ISBLANK(value)", description: "Check whether a value is empty.", example: "ISBLANK([Notes])" },
  { name: "ISNOTBLANK", signature: "ISNOTBLANK(value)", description: "Check whether a value is not empty.", example: "ISNOTBLANK([Manager])" },
  { name: "IN", signature: "IN(value, list)", description: "Check whether a value is in a list.", example: 'IN([Department], LIST("Finance", "People"))' },
  { name: "CONTAINS", signature: "CONTAINS(text_or_list, value)", description: "Find text or a value inside a list.", example: 'CONTAINS([Tags], "Urgent")' },
  { name: "LIST", signature: "LIST(value, ...)", description: "Create a list of values.", example: 'LIST("Finance", "People", "Legal")' },
  { name: "COUNT", signature: "COUNT(list)", description: "Count values in a list.", example: "COUNT([Reviewers])" },
  { name: "ANY", signature: "ANY(list)", description: "Return the first value in a list.", example: "ANY([Reviewers])" },
  { name: "INDEX", signature: "INDEX(list, position)", description: "Get one value from a list (positions start at 1).", example: "INDEX([Reviewers], 1)" },
  { name: "UNIQUE", signature: "UNIQUE(list)", description: "Remove repeated values from a list.", example: "UNIQUE([Tags])" },
  { name: "INTERSECT", signature: "INTERSECT(list1, list2)", description: "Return values present in both lists.", example: 'INTERSECT([Selected teams], LIST("Finance", "People"))' },
  { name: "SORT", signature: "SORT(list, [descending])", description: "Return a sorted copy of a list.", example: "SORT([Scores], TRUE)" },
  { name: "TOP", signature: "TOP(list, how_many)", description: "Return the first requested values from a list.", example: "TOP(SORT([Scores], TRUE), 3)" },
  { name: "SPLIT", signature: "SPLIT(text, delimiter)", description: "Split text into a list.", example: 'SPLIT([Emails], ",")' },
  { name: "CONCATENATE", signature: "CONCATENATE(value, ...)", description: "Join values into text.", example: 'CONCATENATE([First name], " ", [Last name])' },
  { name: "DOMAINOF", signature: "DOMAINOF(email)", description: "Extract the domain from an email address.", example: "DOMAINOF([Work email])" },
  { name: "ENCODEURL", signature: "ENCODEURL(text)", description: "Encode text for use in a URL.", example: 'ENCODEURL([Search terms])' },
  { name: "FIND", signature: "FIND(search_for, text_to_search)", description: "Return the 1-based position of text, or 0 if it is absent.", example: 'FIND("@", [Email])' },
  { name: "INITIALS", signature: "INITIALS(text)", description: "Return the first letter of each word.", example: "INITIALS([Requester])" },
  { name: "MID", signature: "MID(text, begin_at, length)", description: "Return a section of text using a 1-based start position.", example: "MID([Reference], 4, 6)" },
  { name: "SUBSTITUTE", signature: "SUBSTITUTE(text, search_for, replace_with)", description: "Replace every occurrence of a text fragment.", example: 'SUBSTITUTE([Phone], "-", "")' },
  { name: "TEXT", signature: "TEXT(value)", description: "Convert a value to text.", example: 'TEXT([Amount])' },
  { name: "NUMBER", signature: "NUMBER(value)", description: "Convert a value to a number.", example: "NUMBER([Quantity])" },
  { name: "DECIMAL", signature: "DECIMAL(value)", description: "Convert a value to a decimal number.", example: "DECIMAL([Rate])" },
  { name: "ROUND", signature: "ROUND(number, digits)", description: "Round a number.", example: "ROUND([Amount], 2)" },
  { name: "AVERAGE", signature: "AVERAGE(list)", description: "Return the arithmetic mean of a list of numbers.", example: "AVERAGE([Scores])" },
  { name: "CEILING", signature: "CEILING(number)", description: "Round a number up to the nearest integer.", example: "CEILING([Amount])" },
  { name: "FLOOR", signature: "FLOOR(number)", description: "Round a number down to the nearest integer.", example: "FLOOR([Amount])" },
  { name: "LN", signature: "LN(number)", description: "Return the natural logarithm of a positive number.", example: "LN([Amount])" },
  { name: "LOG", signature: "LOG(number, [base])", description: "Return a logarithm using the specified base, or base 10.", example: "LOG([Amount], 2)" },
  { name: "LOG2", signature: "LOG2(number)", description: "Return the base-2 logarithm of a positive number.", example: "LOG2([Amount])" },
  { name: "LOG10", signature: "LOG10(number)", description: "Return the base-10 logarithm of a positive number.", example: "LOG10([Amount])" },
  { name: "MOD", signature: "MOD(dividend, divisor)", description: "Return the remainder with the dividend's sign.", example: "MOD([Minutes], 60)" },
  { name: "POWER", signature: "POWER(number, exponent)", description: "Raise a number to a power.", example: "POWER([Quantity], 2)" },
  { name: "SQRT", signature: "SQRT(number)", description: "Return the square root of a non-negative number.", example: "SQRT([Area])" },
  { name: "ABS", signature: "ABS(number)", description: "Return the absolute value.", example: "ABS([Balance])" },
  { name: "SUM", signature: "SUM(list)", description: "Add the numbers in a list.", example: "SUM([Line totals])" },
  { name: "MIN", signature: "MIN(list)", description: "Return the smallest number in a list.", example: "MIN(LIST([Estimate], 1000))" },
  { name: "MAX", signature: "MAX(list)", description: "Return the largest number in a list.", example: "MAX(LIST([Estimate], 1000))" },
  { name: "TODAY", signature: "TODAY()", description: "Return today's date.", example: "TODAY()" },
  { name: "NOW", signature: "NOW()", description: "Return the current date and time.", example: "NOW()" },
  { name: "DATE", signature: "DATE(value)", description: "Convert a value to a date.", example: "DATE([Submitted at])" },
  { name: "DATETIME", signature: "DATETIME(value)", description: "Convert a value to a date and time.", example: "DATETIME([Start date])" },
  { name: "TIME", signature: "TIME(value)", description: "Convert a value to a time.", example: "TIME([Start date])" },
  { name: "YEAR", signature: "YEAR(date)", description: "Get the year from a date.", example: "YEAR([Start date])" },
  { name: "MONTH", signature: "MONTH(date)", description: "Get the month number from a date.", example: "MONTH([Start date])" },
  { name: "DAY", signature: "DAY(date)", description: "Get the day of the month.", example: "DAY([Start date])" },
  { name: "LOWER", signature: "LOWER(text)", description: "Convert text to lowercase.", example: "LOWER([Email])" },
  { name: "UPPER", signature: "UPPER(text)", description: "Convert text to uppercase.", example: "UPPER([Country code])" },
  { name: "TRIM", signature: "TRIM(text)", description: "Remove whitespace around text.", example: "TRIM([Name])" },
  { name: "LEN", signature: "LEN(text)", description: "Count characters in text.", example: "LEN([Notes])" },
  { name: "LEFT", signature: "LEFT(text, count)", description: "Get characters from the start of text.", example: "LEFT([Code], 3)" },
  { name: "RIGHT", signature: "RIGHT(text, count)", description: "Get characters from the end of text.", example: "RIGHT([Code], 4)" },
  { name: "STARTSWITH", signature: "STARTSWITH(text, prefix)", description: "Check whether text starts with a value.", example: 'STARTSWITH([Email], "finance")' },
  { name: "ENDSWITH", signature: "ENDSWITH(text, suffix)", description: "Check whether text ends with a value.", example: 'ENDSWITH([Email], "@example.com")' },
  { name: "USEREMAIL", signature: "USEREMAIL()", description: "Return the signed-in user's email.", example: "USEREMAIL()" },
  { name: "USERNAME", signature: "USERNAME()", description: "Return the signed-in user's name.", example: "USERNAME()" },
  { name: "USERROLE", signature: "USERROLE()", description: "Return the signed-in user's workspace role.", example: "USERROLE()" },
  { name: "LATLONG", signature: "LATLONG(latitude, longitude)", description: "Create a latitude/longitude value.", example: "LATLONG(6.9271, 79.8612)" },
  { name: "LAT", signature: "LAT(location)", description: "Get the latitude from a location value.", example: "LAT([Office location])" },
  { name: "LONG", signature: "LONG(location)", description: "Get the longitude from a location value.", example: "LONG([Office location])" },
];

type TokenKind = "number" | "string" | "reference" | "identifier" | "operator" | "punctuation" | "eof";
type Token = { kind: TokenKind; value: string; offset: number };
type Node =
  | { kind: "literal"; value: unknown }
  | { kind: "reference"; name: string }
  | { kind: "dereference"; name: string; column: string }
  | { kind: "array"; values: Node[] }
  | { kind: "unary"; operator: string; value: Node }
  | { kind: "binary"; operator: string; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] };

const MAX_SOURCE_LENGTH = 4096;
const MAX_TOKENS = 512;
const MAX_NESTING = 40;
const supportedFunctions = new Map(expressionFunctions.map((item) => [item.name, item]));

export class ExpressionError extends Error {
  constructor(message: string, public readonly position?: number) {
    super(message);
    this.name = "ExpressionError";
  }
}

function tokenize(source: string): Token[] {
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new ExpressionError(`Expressions must be no longer than ${MAX_SOURCE_LENGTH} characters.`);
  }
  const tokens: Token[] = [];
  let index = 0;
  const add = (kind: TokenKind, value: string, offset: number) => {
    tokens.push({ kind, value, offset });
    if (tokens.length > MAX_TOKENS) throw new ExpressionError("This expression has too many parts.", offset);
  };

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const start = index;
    if (char === "[") {
      const end = source.indexOf("]", index + 1);
      if (end < 0) throw new ExpressionError("Close this field reference with ].", start);
      const name = source.slice(index + 1, end).trim();
      if (!name) throw new ExpressionError("A field reference cannot be empty.", start);
      add("reference", name, start);
      index = end + 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const current = source[index];
        if (current === "\\") {
          const escaped = source[index + 1];
          if (escaped === undefined) break;
          const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
          value += escapes[escaped] ?? escaped;
          index += 2;
        } else if (current === quote) {
          if (source[index + 1] === quote && quote === '"') {
            value += quote;
            index += 2;
          } else {
            index += 1;
            closed = true;
            break;
          }
        } else {
          value += current;
          index += 1;
        }
      }
      if (!closed) throw new ExpressionError("Close this text value with a matching quote.", start);
      add("string", value, start);
      continue;
    }
    const number = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      add("number", number[0], start);
      index += number[0].length;
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      add("identifier", identifier[0], start);
      index += identifier[0].length;
      continue;
    }
    const operator = ["<=", ">=", "<>", "!=", "=="].find((candidate) => source.startsWith(candidate, index));
    if (operator) {
      add("operator", operator, start);
      index += operator.length;
      continue;
    }
    if ("=<>+-*/&".includes(char)) {
      add("operator", char, start);
      index += 1;
      continue;
    }
    if ("(),{}.".includes(char)) {
      add("punctuation", char, start);
      index += 1;
      continue;
    }
    throw new ExpressionError(`Unexpected character “${char}”.`, start);
  }
  tokens.push({ kind: "eof", value: "", offset: source.length });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private current(): Token {
    return this.tokens[this.index];
  }

  private take(): Token {
    const token = this.current();
    this.index += 1;
    return token;
  }

  private is(kind: TokenKind, value?: string): boolean {
    const token = this.current();
    return token.kind === kind && (value === undefined || token.value.toUpperCase() === value.toUpperCase());
  }

  private match(kind: TokenKind, value?: string): boolean {
    if (!this.is(kind, value)) return false;
    this.take();
    return true;
  }

  private expect(kind: TokenKind, value?: string): Token {
    if (!this.is(kind, value)) {
      const expected = value ? `“${value}”` : kind;
      throw new ExpressionError(`Expected ${expected}.`, this.current().offset);
    }
    return this.take();
  }

  parse(): Node {
    if (this.is("eof")) throw new ExpressionError("Enter an expression.");
    const value = this.parseOr(0);
    if (!this.is("eof")) throw new ExpressionError(`Unexpected “${this.current().value}”.`, this.current().offset);
    return value;
  }

  private parseOr(depth: number): Node {
    let left = this.parseAnd(depth);
    while (this.match("identifier", "OR")) left = { kind: "binary", operator: "OR", left, right: this.parseAnd(depth) };
    return left;
  }

  private parseAnd(depth: number): Node {
    let left = this.parseComparison(depth);
    while (this.match("identifier", "AND")) left = { kind: "binary", operator: "AND", left, right: this.parseComparison(depth) };
    return left;
  }

  private parseComparison(depth: number): Node {
    let left = this.parseAdditive(depth);
    while (
      this.is("operator") ||
      this.is("identifier", "IN") ||
      this.is("identifier", "CONTAINS")
    ) {
      const token = this.current();
      if (token.kind === "operator" && !["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(token.value)) break;
      const operator = this.take().value.toUpperCase();
      left = { kind: "binary", operator, left, right: this.parseAdditive(depth) };
    }
    return left;
  }

  private parseAdditive(depth: number): Node {
    let left = this.parseMultiplicative(depth);
    while (this.is("operator", "+") || this.is("operator", "-") || this.is("operator", "&")) {
      const operator = this.take().value;
      left = { kind: "binary", operator, left, right: this.parseMultiplicative(depth) };
    }
    return left;
  }

  private parseMultiplicative(depth: number): Node {
    let left = this.parseUnary(depth);
    while (this.is("operator", "*") || this.is("operator", "/")) {
      const operator = this.take().value;
      left = { kind: "binary", operator, left, right: this.parseUnary(depth) };
    }
    return left;
  }

  private parseUnary(depth: number): Node {
    if (depth > MAX_NESTING) throw new ExpressionError("This expression is nested too deeply.", this.current().offset);
    if (this.match("identifier", "NOT")) return { kind: "unary", operator: "NOT", value: this.parseUnary(depth + 1) };
    if (this.match("operator", "-")) return { kind: "unary", operator: "-", value: this.parseUnary(depth + 1) };
    if (this.match("operator", "+")) return { kind: "unary", operator: "+", value: this.parseUnary(depth + 1) };
    return this.parsePrimary(depth);
  }

  private parsePrimary(depth: number): Node {
    if (depth > MAX_NESTING) throw new ExpressionError("This expression is nested too deeply.", this.current().offset);
    if (this.is("number")) return { kind: "literal", value: Number(this.take().value) };
    if (this.is("string")) return { kind: "literal", value: this.take().value };
    if (this.is("reference")) {
      const name = this.take().value;
      if (this.match("punctuation", ".")) {
        if (!this.is("reference")) throw new ExpressionError("Use a table column in brackets after the dot, like [Branch].[Region].", this.current().offset);
        return { kind: "dereference", name, column: this.take().value };
      }
      return { kind: "reference", name };
    }
    if (this.match("punctuation", "(")) {
      const value = this.parseOr(depth + 1);
      this.expect("punctuation", ")");
      return value;
    }
    if (this.match("punctuation", "{")) {
      const values: Node[] = [];
      if (!this.is("punctuation", "}")) {
        do values.push(this.parseOr(depth + 1)); while (this.match("punctuation", ","));
      }
      this.expect("punctuation", "}");
      return { kind: "array", values };
    }
    if (this.is("identifier")) {
      const name = this.take().value;
      const upper = name.toUpperCase();
      if (this.match("punctuation", "(")) {
        const args: Node[] = [];
        if (!this.is("punctuation", ")")) {
          do args.push(this.parseOr(depth + 1)); while (this.match("punctuation", ","));
        }
        this.expect("punctuation", ")");
        return { kind: "call", name: upper, args };
      }
      if (upper === "TRUE") return { kind: "literal", value: true };
      if (upper === "FALSE") return { kind: "literal", value: false };
      if (upper === "BLANK" || upper === "NULL") return { kind: "literal", value: null };
      throw new ExpressionError(`Put a field name in brackets, like [${name}].`, this.tokens[this.index - 1].offset);
    }
    throw new ExpressionError("Expected a value, field name, or function.", this.current().offset);
  }
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  if (node.kind === "array") node.values.forEach((value) => walk(value, visit));
  if (node.kind === "unary") walk(node.value, visit);
  if (node.kind === "binary") {
    walk(node.left, visit);
    walk(node.right, visit);
  }
  if (node.kind === "call") node.args.forEach((value) => walk(value, visit));
}

function arityError(name: string, count: number): string | null {
  const exact: Record<string, number[]> = {
    IF: [3], NOT: [1], ISBLANK: [1], ISNOTBLANK: [1], IN: [2], CONTAINS: [2],
    COUNT: [1], ANY: [1], INDEX: [2], UNIQUE: [1], INTERSECT: [2], TOP: [2], SPLIT: [2], TEXT: [1],
    DOMAINOF: [1], ENCODEURL: [1], FIND: [2], INITIALS: [1], MID: [3], SUBSTITUTE: [3],
    NUMBER: [1], DECIMAL: [1], ABS: [1], AVERAGE: [1], CEILING: [1], FLOOR: [1],
    LN: [1], LOG2: [1], LOG10: [1], MOD: [2], POWER: [2], SQRT: [1],
    SUM: [1], MIN: [1], MAX: [1],
    TODAY: [0], NOW: [0], DATE: [1], DATETIME: [1], TIME: [1],
    YEAR: [1], MONTH: [1], DAY: [1], LOWER: [1], UPPER: [1], TRIM: [1],
    LEN: [1], LAT: [1], LONG: [1], USEREMAIL: [0], USERNAME: [0], USERROLE: [0],
  };
  const ranged: Record<string, [number, number]> = {
    AND: [2, 64], OR: [2, 64], IFS: [2, 64], SWITCH: [3, 64], LIST: [0, 64],
    CONCATENATE: [1, 64], ROUND: [1, 2], LOG: [1, 2], SORT: [1, 2], LEFT: [1, 2], RIGHT: [1, 2],
    STARTSWITH: [2, 2], ENDSWITH: [2, 2], LATLONG: [2, 2],
  };
  if (exact[name]) return exact[name].includes(count) ? null : `${name} expects ${exact[name].join(" or ")} argument${exact[name].length === 1 && exact[name][0] === 1 ? "" : "s"}.`;
  if (ranged[name]) {
    const [min, max] = ranged[name];
    return count >= min && count <= max ? null : `${name} expects ${min} to ${max} arguments.`;
  }
  if (name === "IFS" && count % 2 === 1) return "IFS expects condition/value pairs, with an optional default value.";
  if (name === "SWITCH" && count < 3) return "SWITCH expects a value followed by case/result pairs.";
  return null;
}

function parseAndValidate(source: string, fields?: ExpressionField[]): { ast: Node; references: string[] } {
  const ast = new Parser(tokenize(source)).parse();
  const references: string[] = [];
  walk(ast, (node) => {
    if (node.kind === "reference" || node.kind === "dereference") references.push(node.name);
    if (node.kind === "dereference" && fields) resolveDereferenceColumn(node.name, node.column, fields);
    if (node.kind === "call") {
      if (!supportedFunctions.has(node.name)) throw new ExpressionError(`The function ${node.name} is not supported.`);
      const error = arityError(node.name, node.args.length);
      if (error) throw new ExpressionError(error);
    }
  });
  const uniqueReferences = [...new Set(references)];
  if (fields) {
    const names = new Set(fields.flatMap((field) => [field.id, field.key, field.label].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLocaleLowerCase())));
      const unknown = uniqueReferences.find((name) => !names.has(name.toLocaleLowerCase()) && name.toUpperCase() !== "_THIS");
    if (unknown) throw new ExpressionError(`No field matches [${unknown}].`);
  }
  return { ast, references: uniqueReferences };
}

export function validateExpression(source: string, fields?: ExpressionField[]): { valid: true; references: string[] } | { valid: false; error: string } {
  try {
    return { valid: true, references: parseAndValidate(source, fields).references };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Invalid expression." };
  }
}

export function getExpressionReferences(source: string): string[] {
  return parseAndValidate(source).references;
}

export function getExpressionDereferences(source: string): { field: string; column: string }[] {
  const { ast } = parseAndValidate(source);
  const result: { field: string; column: string }[] = [];
  walk(ast, node => { if (node.kind === "dereference") result.push({ field: node.name, column: node.column }); });
  return result;
}

/** Drafts may contain unfinished formulas; validation reports these separately. */
export function getFormDereferences(fields: ExpressionFieldDefinition[]): { field: string; column: string }[] {
  return fields.flatMap(field => [field.appFormula, field.initialValueExpression, field.showIf, field.requiredIf, field.validIf].flatMap(source => {
    if (!source?.trim()) return [];
    try { return getExpressionDereferences(source); } catch { return []; }
  }));
}

function resolveDereferenceColumn(name: string, columnName: string, fields: ExpressionField[]) {
  const field = fields.find(candidate => [candidate.id, candidate.key, candidate.label].some(value => value?.trim().toLocaleLowerCase() === name.toLocaleLowerCase()));
  if (!field) throw new ExpressionError(`No field matches [${name}].`);
  if (!field.sourceTableId || !["select", "enum", "ref", "lookup", "radio"].includes(field.type || "")) throw new ExpressionError(`[${name}] must be a single-selection field linked to a table.`);
  const column = field.referenceColumns?.find(candidate => [candidate.key, candidate.label].some(value => value.trim().toLocaleLowerCase() === columnName.toLocaleLowerCase()));
  if (!column) throw new ExpressionError(`No linked table column matches [${name}].[${columnName}].`);
  return { field, column };
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function truthy(value: unknown): boolean {
  return value === true || (value !== false && value !== null && value !== undefined && value !== "" && value !== 0);
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function numeric(value: unknown, name: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new ExpressionError(`${name} needs a number.`);
  return result;
}

function dateValue(value: unknown, name: string): Date {
  const date = value instanceof Date ? value : new Date(text(value));
  if (!Number.isFinite(date.valueOf())) throw new ExpressionError(`${name} needs a valid date or time.`);
  return date;
}

function equal(left: unknown, right: unknown): boolean {
  if (typeof left === "number" || typeof right === "number") {
    const a = Number(left);
    const b = Number(right);
    if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  }
  if (typeof left === "boolean" || typeof right === "boolean") return truthy(left) === truthy(right);
  return text(left).toLocaleLowerCase() === text(right).toLocaleLowerCase();
}

function resolveReference(name: string, context: ExpressionContext): unknown {
  if (name.toUpperCase() === "_THIS") return context.values._THIS;
  const normalized = name.toLocaleLowerCase();
  const field = context.fields.find((candidate) =>
    [candidate.id, candidate.key, candidate.label]
      .some((value) => Boolean(value) && value!.trim().toLocaleLowerCase() === normalized),
  );
  if (!field) throw new ExpressionError(`No field matches [${name}].`);
  return context.values[field.id];
}

function evaluateNode(node: Node, context: ExpressionContext, depth = 0): unknown {
  if (depth > MAX_NESTING) throw new ExpressionError("This expression is nested too deeply.");
  if (node.kind === "literal") return node.value;
  if (node.kind === "reference") return resolveReference(node.name, context);
  if (node.kind === "dereference") {
    const { field, column } = resolveDereferenceColumn(node.name, node.column, context.fields);
    const selected = context.values[field.id];
    if (isBlank(selected)) return null;
    if (typeof selected !== "string" || !field.referenceData || !Object.prototype.hasOwnProperty.call(field.referenceData, selected)) throw new ExpressionError(`Choose an available table row for [${node.name}].`);
    const row = field.referenceData[selected];
    if (!Object.prototype.hasOwnProperty.call(row, column.key)) throw new ExpressionError(`The column [${node.column}] is not available to this form.`);
    return row[column.key];
  }
  if (node.kind === "array") return node.values.map((value) => evaluateNode(value, context, depth + 1));
  if (node.kind === "unary") {
    const value = evaluateNode(node.value, context, depth + 1);
    if (node.operator === "NOT") return !truthy(value);
    return node.operator === "-" ? -numeric(value, "Unary minus") : numeric(value, "Unary plus");
  }
  if (node.kind === "binary") {
    if (node.operator === "AND") {
      return truthy(evaluateNode(node.left, context, depth + 1)) && truthy(evaluateNode(node.right, context, depth + 1));
    }
    if (node.operator === "OR") {
      return truthy(evaluateNode(node.left, context, depth + 1)) || truthy(evaluateNode(node.right, context, depth + 1));
    }
    const left = evaluateNode(node.left, context, depth + 1);
    const right = evaluateNode(node.right, context, depth + 1);
    switch (node.operator) {
      case "=":
      case "==": return equal(left, right);
      case "!=":
      case "<>": return !equal(left, right);
      case ">": return typeof left === "string" && typeof right === "string" ? left > right : numeric(left, ">") > numeric(right, ">");
      case ">=": return typeof left === "string" && typeof right === "string" ? left >= right : numeric(left, ">=") >= numeric(right, ">=");
      case "<": return typeof left === "string" && typeof right === "string" ? left < right : numeric(left, "<") < numeric(right, "<");
      case "<=": return typeof left === "string" && typeof right === "string" ? left <= right : numeric(left, "<=") <= numeric(right, "<=");
      case "IN": return Array.isArray(right) ? right.some((item) => equal(left, item)) : text(right).split(",").some((item) => equal(left, item.trim()));
      case "CONTAINS": return Array.isArray(left) ? left.some((item) => equal(item, right)) : text(left).toLocaleLowerCase().includes(text(right).toLocaleLowerCase());
      case "&": return `${text(left)}${text(right)}`;
      case "+": return numeric(left, "+") + numeric(right, "+");
      case "-": return numeric(left, "-") - numeric(right, "-");
      case "*": return numeric(left, "*") * numeric(right, "*");
      case "/": {
        const divisor = numeric(right, "/");
        if (divisor === 0) throw new ExpressionError("Division by zero is not allowed.");
        return numeric(left, "/") / divisor;
      }
      default: throw new ExpressionError(`The operator ${node.operator} is not supported.`);
    }
  }

  const name = node.name;
  const arg = (index: number) => evaluateNode(node.args[index], context, depth + 1);
  if (name === "IF") return truthy(arg(0)) ? arg(1) : arg(2);
  if (name === "AND") {
    for (const item of node.args) if (!truthy(evaluateNode(item, context, depth + 1))) return false;
    return true;
  }
  if (name === "OR") {
    for (const item of node.args) if (truthy(evaluateNode(item, context, depth + 1))) return true;
    return false;
  }
  if (name === "NOT") return !truthy(arg(0));
  if (name === "IFS") {
    const pairEnd = node.args.length % 2 === 1 ? node.args.length - 1 : node.args.length;
    for (let index = 0; index < pairEnd; index += 2) if (truthy(evaluateNode(node.args[index], context, depth + 1))) return evaluateNode(node.args[index + 1], context, depth + 1);
    return node.args.length % 2 === 1 ? arg(node.args.length - 1) : null;
  }
  if (name === "SWITCH") {
    const match = arg(0);
    const pairEnd = node.args.length % 2 === 0 ? node.args.length - 1 : node.args.length;
    for (let index = 1; index < pairEnd; index += 2) if (equal(match, evaluateNode(node.args[index], context, depth + 1))) return evaluateNode(node.args[index + 1], context, depth + 1);
    return node.args.length % 2 === 0 ? arg(node.args.length - 1) : null;
  }
  const args = node.args.map((item) => evaluateNode(item, context, depth + 1));
  const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [value];
  const finiteResult = (value: number, functionName: string): number => {
    if (!Number.isFinite(value)) throw new ExpressionError(`${functionName} needs a result within the supported numeric range.`);
    return value;
  };
  const now = context.now ?? new Date();
  switch (name) {
    case "ISBLANK": return isBlank(args[0]);
    case "ISNOTBLANK": return !isBlank(args[0]);
    case "IN": return list(args[1]).some((item) => equal(args[0], item));
    case "CONTAINS": return Array.isArray(args[0]) ? args[0].some((item) => equal(item, args[1])) : text(args[0]).toLocaleLowerCase().includes(text(args[1]).toLocaleLowerCase());
    case "LIST": return args;
    case "COUNT": return list(args[0]).length;
    case "ANY": return list(args[0])[0] ?? null;
    case "INDEX": {
      const index = Math.trunc(numeric(args[1], "INDEX")) - 1;
      return list(args[0])[index] ?? null;
    }
    case "UNIQUE": return [...new Map(list(args[0]).map((value) => [text(value).toLocaleLowerCase(), value])).values()];
    case "INTERSECT": {
      const second = list(args[1]);
      return [...new Map(list(args[0])
        .filter((value) => second.some((candidate) => equal(value, candidate)))
        .map((value) => [text(value).toLocaleLowerCase(), value])).values()];
    }
    case "SORT": {
      const descending = truthy(args[1] ?? false);
      return [...list(args[0])].sort((left, right) => {
        let order = 0;
        if (typeof left === "number" && typeof right === "number") order = left - right;
        else order = text(left).localeCompare(text(right), undefined, { sensitivity: "base", numeric: true });
        return descending ? -order : order;
      });
    }
    case "TOP": return list(args[0]).slice(0, Math.max(0, Math.trunc(numeric(args[1], "TOP"))));
    case "SPLIT": return text(args[0]).split(text(args[1])).map((value) => value.trim()).filter(Boolean);
    case "CONCATENATE": return args.map(text).join("");
    case "DOMAINOF": {
      const email = text(args[0]).trim();
      const at = email.lastIndexOf("@");
      return at < 0 ? "" : email.slice(at + 1);
    }
    case "ENCODEURL": return encodeURIComponent(text(args[0]));
    case "FIND": {
      const position = text(args[1]).indexOf(text(args[0]));
      return position < 0 ? 0 : position + 1;
    }
    case "INITIALS": return text(args[0]).trim().split(/\s+/).filter(Boolean).map((word) => Array.from(word)[0]).join("");
    case "MID": {
      const source = text(args[0]);
      const start = Math.max(0, Math.trunc(numeric(args[1], "MID")) - 1);
      const length = Math.max(0, Math.trunc(numeric(args[2], "MID")));
      return Array.from(source).slice(start, start + length).join("");
    }
    case "SUBSTITUTE": {
      const search = text(args[1]);
      if (!search) throw new ExpressionError("SUBSTITUTE needs a non-empty search value.");
      return text(args[0]).split(search).join(text(args[2]));
    }
    case "TEXT": return text(args[0]);
    case "NUMBER":
    case "DECIMAL": return numeric(args[0], name);
    case "ROUND": {
      const scale = 10 ** (args[1] === undefined ? 0 : Math.trunc(numeric(args[1], "ROUND")));
      return Math.round(numeric(args[0], "ROUND") * scale) / scale;
    }
    case "AVERAGE": {
      const values = list(args[0]);
      if (!values.length) throw new ExpressionError("AVERAGE needs at least one number.");
      return finiteResult(values.reduce<number>((sum, value) => sum + numeric(value, "AVERAGE"), 0) / values.length, "AVERAGE");
    }
    case "CEILING": return Math.ceil(numeric(args[0], "CEILING"));
    case "FLOOR": return Math.floor(numeric(args[0], "FLOOR"));
    case "LN": return finiteResult(Math.log(numeric(args[0], "LN")), "LN");
    case "LOG":
      return finiteResult(Math.log(numeric(args[0], "LOG")) / Math.log(args[1] === undefined ? 10 : numeric(args[1], "LOG")), "LOG");
    case "LOG2": return finiteResult(Math.log2(numeric(args[0], "LOG2")), "LOG2");
    case "LOG10": return finiteResult(Math.log10(numeric(args[0], "LOG10")), "LOG10");
    case "MOD": {
      const dividend = numeric(args[0], "MOD");
      const divisor = numeric(args[1], "MOD");
      return divisor === 0 ? 0 : dividend % divisor;
    }
    case "POWER": return finiteResult(numeric(args[0], "POWER") ** numeric(args[1], "POWER"), "POWER");
    case "SQRT": return finiteResult(Math.sqrt(numeric(args[0], "SQRT")), "SQRT");
    case "ABS": return Math.abs(numeric(args[0], "ABS"));
    case "SUM": return list(args[0]).reduce<number>((sum, value) => sum + numeric(value, "SUM"), 0);
    case "MIN": return Math.min(...list(args[0]).map((value) => numeric(value, "MIN")));
    case "MAX": return Math.max(...list(args[0]).map((value) => numeric(value, "MAX")));
    case "TODAY": return now.toISOString().slice(0, 10);
    case "NOW": return now.toISOString();
    case "DATE": return dateValue(args[0], "DATE").toISOString().slice(0, 10);
    case "DATETIME": return dateValue(args[0], "DATETIME").toISOString();
    case "TIME": return dateValue(args[0], "TIME").toISOString().slice(11, 19);
    case "YEAR": return dateValue(args[0], "YEAR").getUTCFullYear();
    case "MONTH": return dateValue(args[0], "MONTH").getUTCMonth() + 1;
    case "DAY": return dateValue(args[0], "DAY").getUTCDate();
    case "LOWER": return text(args[0]).toLocaleLowerCase();
    case "UPPER": return text(args[0]).toLocaleUpperCase();
    case "TRIM": return text(args[0]).trim();
    case "LEN": return text(args[0]).length;
    case "LEFT": return text(args[0]).slice(0, Math.max(0, Math.trunc(numeric(args[1] ?? 1, "LEFT"))));
    case "RIGHT": return text(args[0]).slice(-Math.max(0, Math.trunc(numeric(args[1] ?? 1, "RIGHT"))));
    case "STARTSWITH": return text(args[0]).toLocaleLowerCase().startsWith(text(args[1]).toLocaleLowerCase());
    case "ENDSWITH": return text(args[0]).toLocaleLowerCase().endsWith(text(args[1]).toLocaleLowerCase());
    case "USEREMAIL": return context.user?.email ?? "";
    case "USERNAME": return context.user?.name ?? "";
    case "USERROLE": return context.user?.role ?? "";
    case "LATLONG": {
      const latitude = numeric(args[0], "LATLONG");
      const longitude = numeric(args[1], "LATLONG");
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new ExpressionError("LATLONG coordinates are outside the valid range.");
      }
      return { latitude, longitude };
    }
    case "LAT":
    case "LONG": {
      const location = args[0];
      const pair = Array.isArray(location)
        ? location
        : location && typeof location === "object"
          ? [
              (location as { latitude?: unknown; lat?: unknown }).latitude ?? (location as { lat?: unknown }).lat,
              (location as { longitude?: unknown; lon?: unknown }).longitude ?? (location as { lon?: unknown }).lon,
            ]
          : text(location).split(",").map((part) => part.trim());
      if (pair.length !== 2) throw new ExpressionError(`${name} needs a latitude/longitude value.`);
      return numeric(pair[name === "LAT" ? 0 : 1], name);
    }
    default: throw new ExpressionError(`The function ${name} is not supported.`);
  }
}

export function evaluateExpression(source: string, context: ExpressionContext): unknown {
  const { ast } = parseAndValidate(source, context.fields);
  return evaluateNode(ast, context);
}

export function expressionIsTrue(source: string, context: ExpressionContext): boolean {
  return truthy(evaluateExpression(source, context));
}

export function expressionIsBlank(value: unknown): boolean {
  return isBlank(value);
}

export function computeFormExpressions(
  fields: ExpressionFieldDefinition[],
  submittedValues: Record<string, unknown>,
  user?: ExpressionUser,
  now?: Date,
): Record<string, unknown> {
  const values = { ...submittedValues };
  const formulaFields = fields.filter((field) => field.appFormula?.trim() || field.initialValueExpression?.trim());
  const byName = new Map<string, ExpressionFieldDefinition>();
  for (const field of fields) {
    for (const name of [field.id, field.key, field.label]) {
      if (name?.trim()) byName.set(name.trim().toLocaleLowerCase(), field);
    }
  }
  const formulaIds = new Set(formulaFields.map((field) => field.id));
  const dependencies = new Map<string, Set<string>>();
  for (const field of formulaFields) {
    const expression = field.appFormula?.trim() ? field.appFormula : field.initialValueExpression!;
    const refs = getExpressionReferences(expression);
    dependencies.set(
      field.id,
      new Set(
        refs
          .map((reference) => byName.get(reference.toLocaleLowerCase())?.id)
          .filter((id): id is string => Boolean(id && formulaIds.has(id))),
      ),
    );
  }
  const ordered: ExpressionFieldDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const fieldById = new Map(formulaFields.map((field) => [field.id, field]));
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new ExpressionError("Computed fields cannot depend on each other in a loop.");
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    const field = fieldById.get(id);
    if (field) ordered.push(field);
  };
  formulaFields.forEach((field) => visit(field.id));

  const context = { fields, values, user, now };
  for (const field of ordered) {
    if (field.appFormula?.trim()) {
      values[field.id] = evaluateExpression(field.appFormula, context);
    } else if ((values[field.id] === undefined || values[field.id] === null) && field.initialValueExpression?.trim()) {
      values[field.id] = evaluateExpression(field.initialValueExpression, context);
    }
  }
  return values;
}
