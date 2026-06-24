// A small Todoist-style filter query language. Examples:
//   (p1 | p2) & @work & 7 days
//   overdue & !@waiting
//   #Home & no date
//
// Grammar (precedence low→high): OR (`|`), AND (`&`), NOT (`!`), atom / `( … )`.
// `compile()` turns the AST into a parameterised SQL predicate over the `tasks`
// table, given maps that resolve @label / #project names to ids.

export type FilterNode =
  | { t: 'and'; l: FilterNode; r: FilterNode }
  | { t: 'or'; l: FilterNode; r: FilterNode }
  | { t: 'not'; e: FilterNode }
  | { t: 'priority'; n: number }
  | { t: 'label'; name: string }
  | { t: 'project'; name: string }
  | { t: 'overdue' }
  | { t: 'today' }
  | { t: 'noDate' }
  | { t: 'noLabels' }
  | { t: 'dueWithin'; days: number };

type Token =
  | { k: '(' | ')' | '&' | '|' | '!' }
  | { k: 'atom'; node: FilterNode };

class FilterError extends Error {}

function tokenize(input: string): Token[] {
  const s = input.trim();
  const tokens: Token[] = [];
  let i = 0;
  const rest = () => s.slice(i);

  while (i < s.length) {
    const ch = s[i]!;
    if (ch === ' ') { i++; continue; }
    if (ch === '(' || ch === ')' || ch === '&' || ch === '!') {
      tokens.push({ k: ch });
      i++;
      continue;
    }
    if (ch === '|' || ch === ',') { tokens.push({ k: '|' }); i++; continue; }

    // Multi-word and prefixed atoms (longest match first).
    let m: RegExpMatchArray | null;
    if ((m = rest().match(/^p([1-4])\b/i))) {
      tokens.push({ k: 'atom', node: { t: 'priority', n: parseInt(m[1]!, 10) } });
    } else if ((m = rest().match(/^@([\p{L}\p{N}_-]+)/u))) {
      tokens.push({ k: 'atom', node: { t: 'label', name: m[1]! } });
    } else if ((m = rest().match(/^#([\p{L}\p{N}_-]+)/u))) {
      tokens.push({ k: 'atom', node: { t: 'project', name: m[1]! } });
    } else if ((m = rest().match(/^overdue\b/i))) {
      tokens.push({ k: 'atom', node: { t: 'overdue' } });
    } else if ((m = rest().match(/^today\b/i))) {
      tokens.push({ k: 'atom', node: { t: 'today' } });
    } else if ((m = rest().match(/^no\s+(?:due\s+)?date\b/i))) {
      tokens.push({ k: 'atom', node: { t: 'noDate' } });
    } else if ((m = rest().match(/^no\s+labels?\b/i))) {
      tokens.push({ k: 'atom', node: { t: 'noLabels' } });
    } else if ((m = rest().match(/^(?:next\s+)?(\d+)\s+days?\b/i))) {
      tokens.push({ k: 'atom', node: { t: 'dueWithin', days: parseInt(m[1]!, 10) } });
    } else {
      throw new FilterError(`Unexpected token near "${rest().slice(0, 12)}"`);
    }
    i += m[0].length;
  }
  return tokens;
}

/** Recursive-descent parser with the precedence OR < AND < NOT < primary. */
function parseTokens(tokens: Token[]): FilterNode {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parseOr(): FilterNode {
    let node = parseAnd();
    while (peek()?.k === '|') {
      eat();
      node = { t: 'or', l: node, r: parseAnd() };
    }
    return node;
  }
  function parseAnd(): FilterNode {
    let node = parseNot();
    while (peek()?.k === '&') {
      eat();
      node = { t: 'and', l: node, r: parseNot() };
    }
    return node;
  }
  function parseNot(): FilterNode {
    if (peek()?.k === '!') {
      eat();
      return { t: 'not', e: parseNot() };
    }
    return parsePrimary();
  }
  function parsePrimary(): FilterNode {
    const tok = peek();
    if (!tok) throw new FilterError('Unexpected end of filter');
    if (tok.k === '(') {
      eat();
      const inner = parseOr();
      if (peek()?.k !== ')') throw new FilterError('Missing closing parenthesis');
      eat();
      return inner;
    }
    if (tok.k === 'atom') {
      eat();
      return tok.node;
    }
    throw new FilterError(`Unexpected "${tok.k}"`);
  }

  const node = parseOr();
  if (pos !== tokens.length) throw new FilterError('Trailing tokens in filter');
  return node;
}

export function parseFilter(input: string): FilterNode {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new FilterError('Empty filter');
  return parseTokens(tokens);
}

/** Names referenced by the AST, so the caller can resolve them to ids. */
export function referencedNames(node: FilterNode): { labels: string[]; projects: string[] } {
  const labels = new Set<string>();
  const projects = new Set<string>();
  const walk = (n: FilterNode): void => {
    switch (n.t) {
      case 'and': case 'or': walk(n.l); walk(n.r); break;
      case 'not': walk(n.e); break;
      case 'label': labels.add(n.name); break;
      case 'project': projects.add(n.name); break;
      default: break;
    }
  };
  walk(node);
  return { labels: [...labels], projects: [...projects] };
}

export interface CompileContext {
  /** lower-case label name → id. Missing names compile to a false predicate. */
  labelIds: Map<string, string>;
  projectIds: Map<string, string>;
}

export interface CompiledFilter {
  sql: string;
  params: unknown[];
}

/** Compile the AST to a SQL predicate (params are 1-based via the offset). */
export function compileFilter(
  node: FilterNode,
  ctx: CompileContext,
  startIndex = 1,
): CompiledFilter {
  const params: unknown[] = [];
  const ph = (val: unknown): string => {
    params.push(val);
    return `$${startIndex + params.length - 1}`;
  };

  const emit = (n: FilterNode): string => {
    switch (n.t) {
      case 'and': return `(${emit(n.l)} AND ${emit(n.r)})`;
      case 'or': return `(${emit(n.l)} OR ${emit(n.r)})`;
      case 'not': return `(NOT ${emit(n.e)})`;
      case 'priority': return `priority = ${ph(n.n)}`;
      case 'overdue': return `(due_date < now() AND status NOT IN ('done','cancelled'))`;
      case 'today': return `due_date::date = current_date`;
      case 'noDate': return `due_date IS NULL`;
      case 'noLabels': return `id NOT IN (SELECT task_id FROM task_labels)`;
      case 'dueWithin':
        return `(due_date >= now() AND due_date < now() + (${ph(n.days)} || ' days')::interval)`;
      case 'label': {
        const id = ctx.labelIds.get(n.name.toLowerCase());
        if (!id) return 'false';
        return `id IN (SELECT task_id FROM task_labels WHERE label_id = ${ph(id)})`;
      }
      case 'project': {
        const id = ctx.projectIds.get(n.name.toLowerCase());
        if (!id) return 'false';
        return `project_id = ${ph(id)}`;
      }
    }
  };

  return { sql: emit(node), params };
}

export { FilterError };
