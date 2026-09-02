/**
 * In-memory stand-in for the supabase-js query surface the app uses.
 *
 * It mirrors PostgREST semantics closely enough that lib/ and route handlers
 * run unchanged: chainable filters, `.single()` / `.maybeSingle()` cardinality
 * errors, `insert().select()`, upsert on a conflict target, exact counts,
 * unique-violation code 23505, embedded relations in `select('*, order_items(*)')`
 * and `!inner` joins with dotted filters (`.eq('orders.org_id', id)`), RPCs,
 * and a storage API with buckets.
 *
 * What it deliberately does not do: prove RLS. Every read here behaves like the
 * service role. Access boundaries are tested against a real database in the
 * `integration` project.
 */

import { randomUUID } from 'node:crypto';

export type Row = Record<string, unknown>;
export type PgError = { code?: string; message: string; details?: string; hint?: string };
export type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export type QueryResult<T = unknown> = {
  data: T;
  error: PgError | null;
  count: number | null;
  status: number;
  statusText: string;
};

type Filter = (row: Row, db: FakeSupabase, table: string) => boolean;
type Relation = { parent: string; child: string; fk: string };
type Failure = { table: string; op?: Op; error: PgError };
type StorageObject = { bytes: Uint8Array; contentType?: string };

export const PGRST116: PgError = {
  code: 'PGRST116',
  message: 'JSON object requested, multiple (or no) rows returned',
};

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function likeToRegex(pattern: string, flags = ''): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, flags);
}

/** Split a select list on top-level commas only. */
function splitSelect(cols: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of cols) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

type SelectPart =
  | { kind: 'all' }
  | { kind: 'column'; column: string; alias: string }
  | { kind: 'embed'; name: string; alias: string; inner: boolean; cols: string };

function parseSelect(cols: string): SelectPart[] {
  return splitSelect(cols.replace(/\s+/g, '')).map((part) => {
    if (part === '*') return { kind: 'all' };
    const embed = part.match(/^(?:([\w]+):)?([\w]+)(!inner|!left)?\((.*)\)$/);
    if (embed) {
      return {
        kind: 'embed',
        alias: embed[1] ?? embed[2],
        name: embed[2],
        inner: embed[3] === '!inner',
        cols: embed[4] || '*',
      };
    }
    const [lhs] = part.split('::');
    const aliased = lhs.match(/^([\w]+):([\w]+)$/);
    if (aliased) return { kind: 'column', alias: aliased[1], column: aliased[2] };
    return { kind: 'column', alias: lhs, column: lhs };
  });
}

class Query<T = unknown> implements PromiseLike<QueryResult<T>> {
  private op: Op = 'select';
  private filters: Filter[] = [];
  private selectCols = '*';
  private returning = false;
  private countMode: 'exact' | null = null;
  private head = false;
  private orderBy: Array<{ col: string; asc: boolean; nullsFirst?: boolean }> = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private mode: 'many' | 'single' | 'maybeSingle' = 'many';
  private payload: Row | Row[] | null = null;
  private onConflict: string[] = ['id'];

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  // ---- verbs ----

  select(cols = '*', opts: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean } = {}) {
    if (this.op === 'select') this.selectCols = cols;
    else {
      this.returning = true;
      this.selectCols = cols;
    }
    if (opts.count) this.countMode = 'exact';
    if (opts.head) this.head = true;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }

  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert';
    this.payload = rows;
    if (opts.onConflict) this.onConflict = opts.onConflict.split(',').map((s) => s.trim());
    return this;
  }

  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  // ---- filters ----

  private where(col: string, pred: (value: unknown) => boolean) {
    if (col.includes('.')) {
      const [embed, field] = col.split('.', 2);
      this.filters.push((row, db, table) => {
        const rel = db.findRelation(table, embed);
        if (!rel) throw new Error(`[fake-supabase] no relation between ${table} and ${embed}`);
        if (rel.parent === table) {
          return db.rows(rel.child).some((c) => c[rel.fk] === row.id && pred(c[field]));
        }
        const parent = db.rows(rel.parent).find((p) => p.id === row[rel.fk]);
        return parent !== undefined && pred(parent[field]);
      });
    } else {
      this.filters.push((row) => pred(row[col]));
    }
    return this;
  }

  eq(col: string, value: unknown) {
    return this.where(col, (v) => v === value);
  }
  neq(col: string, value: unknown) {
    return this.where(col, (v) => v !== value);
  }
  gt(col: string, value: unknown) {
    return this.where(col, (v) => compare(v, value) > 0 && v !== null && v !== undefined);
  }
  gte(col: string, value: unknown) {
    return this.where(col, (v) => v !== null && v !== undefined && compare(v, value) >= 0);
  }
  lt(col: string, value: unknown) {
    return this.where(col, (v) => v !== null && v !== undefined && compare(v, value) < 0);
  }
  lte(col: string, value: unknown) {
    return this.where(col, (v) => v !== null && v !== undefined && compare(v, value) <= 0);
  }
  in(col: string, values: unknown[]) {
    return this.where(col, (v) => values.includes(v));
  }
  is(col: string, value: null | boolean) {
    return this.where(col, (v) => (value === null ? v === null || v === undefined : v === value));
  }
  like(col: string, pattern: string) {
    const re = likeToRegex(pattern);
    return this.where(col, (v) => typeof v === 'string' && re.test(v));
  }
  ilike(col: string, pattern: string) {
    const re = likeToRegex(pattern, 'i');
    return this.where(col, (v) => typeof v === 'string' && re.test(v));
  }
  match(query: Row) {
    for (const [k, v] of Object.entries(query)) this.eq(k, v);
    return this;
  }
  overlaps(col: string, values: unknown[]) {
    return this.where(col, (v) => Array.isArray(v) && v.some((x) => values.includes(x)));
  }
  contains(col: string, values: unknown) {
    return this.where(col, (v) => {
      if (Array.isArray(v) && Array.isArray(values)) return values.every((x) => v.includes(x));
      if (v && typeof v === 'object' && values && typeof values === 'object') {
        return Object.entries(values as Row).every(([k, x]) => (v as Row)[k] === x);
      }
      return false;
    });
  }
  not(col: string, operator: string, value: unknown) {
    const positive = new Query(this.db, this.table).filter(col, operator, value) as Query;
    const pred = positive.filters[0];
    this.filters.push((row, db, table) => !pred(row, db, table));
    return this;
  }
  or(expression: string) {
    const clauses = expression.split(',').map((c) => {
      const [col, op, ...rest] = c.split('.');
      const raw = rest.join('.');
      const value =
        raw === 'null'
          ? null
          : raw === 'true'
            ? true
            : raw === 'false'
              ? false
              : /^-?\d+(\.\d+)?$/.test(raw)
                ? Number(raw)
                : raw;
      const q = new Query(this.db, this.table).filter(col, op, value) as Query;
      return q.filters[0];
    });
    this.filters.push((row, db, table) => clauses.some((f) => f(row, db, table)));
    return this;
  }
  filter(col: string, operator: string, value: unknown) {
    switch (operator) {
      case 'eq':
        return this.eq(col, value);
      case 'neq':
        return this.neq(col, value);
      case 'gt':
        return this.gt(col, value);
      case 'gte':
        return this.gte(col, value);
      case 'lt':
        return this.lt(col, value);
      case 'lte':
        return this.lte(col, value);
      case 'is':
        return this.is(col, value as null | boolean);
      case 'in': {
        const list =
          typeof value === 'string'
            ? value.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
            : (value as unknown[]);
        return this.in(col, list);
      }
      case 'like':
        return this.like(col, String(value));
      case 'ilike':
        return this.ilike(col, String(value));
      default:
        throw new Error(`[fake-supabase] unsupported filter operator "${operator}"`);
    }
  }

  // ---- modifiers ----

  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orderBy.push({ col, asc: opts.ascending ?? true, nullsFirst: opts.nullsFirst });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  single() {
    this.mode = 'single';
    return this as unknown as Query<T>;
  }
  maybeSingle() {
    this.mode = 'maybeSingle';
    return this as unknown as Query<T>;
  }
  throwOnError() {
    return this;
  }

  // ---- execution ----

  then<R1 = QueryResult<T>, R2 = never>(
    onFulfilled?: ((value: QueryResult<T>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onFulfilled ?? undefined, onRejected ?? undefined);
  }

  private fail(error: PgError, status = 400): QueryResult<T> {
    return { data: null as T, error, count: null, status, statusText: 'Bad Request' };
  }

  private execute(): QueryResult<T> {
    this.db.log.push({ table: this.table, op: this.op });
    const injected = this.db.takeFailure(this.table, this.op);
    if (injected) return this.fail(injected);

    switch (this.op) {
      case 'select':
        return this.runSelect();
      case 'insert':
        return this.runInsert(false);
      case 'upsert':
        return this.runInsert(true);
      case 'update':
        return this.runUpdate();
      case 'delete':
        return this.runDelete();
    }
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((f) => f(row, this.db, this.table)));
  }

  private finish(rows: Row[], count: number | null): QueryResult<T> {
    const projected = this.head ? null : rows.map((r) => this.project(r));
    const shaped = projected?.filter((r) => r !== null) ?? null;

    if (this.mode === 'single') {
      if (!shaped || shaped.length !== 1) return { ...this.fail(PGRST116, 406), count };
      return { data: shaped[0] as T, error: null, count, status: 200, statusText: 'OK' };
    }
    if (this.mode === 'maybeSingle') {
      if (shaped && shaped.length > 1) return { ...this.fail(PGRST116, 406), count };
      return { data: (shaped?.[0] ?? null) as T, error: null, count, status: 200, statusText: 'OK' };
    }
    return { data: shaped as T, error: null, count, status: 200, statusText: 'OK' };
  }

  private runSelect(): QueryResult<T> {
    let rows = this.matching();
    const count = this.countMode ? rows.length : null;

    for (const o of [...this.orderBy].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[o.col];
        const bv = b[o.col];
        const aNull = av === null || av === undefined;
        const bNull = bv === null || bv === undefined;
        if (aNull && bNull) return 0;
        if (aNull) return o.nullsFirst ? -1 : 1;
        if (bNull) return o.nullsFirst ? 1 : -1;
        const c = compare(av, bv);
        return o.asc ? c : -c;
      });
    }

    if (this.rangeFrom !== null) {
      if (this.rangeFrom > 0 && this.rangeFrom >= rows.length) {
        return this.fail({ code: 'PGRST103', message: 'Requested range not satisfiable' }, 416);
      }
      rows = rows.slice(this.rangeFrom, (this.rangeTo ?? rows.length - 1) + 1);
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);

    return this.finish(rows, count);
  }

  private runInsert(upsert: boolean): QueryResult<T> {
    const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]) as Row[];
    const table = this.db.rows(this.table);
    const written: Row[] = [];

    for (const raw of incoming) {
      const row: Row = { ...raw };
      const existing = upsert ? table.find((r) => this.onConflict.every((c) => r[c] === row[c])) : undefined;

      if (existing) {
        Object.assign(existing, row);
        written.push(existing);
        continue;
      }

      if (row.id === undefined) row.id = randomUUID();
      const now = new Date().toISOString();
      if (row.created_at === undefined) row.created_at = now;
      if (row.updated_at === undefined) row.updated_at = now;

      const violated = this.db.uniqueViolation(this.table, row, table);
      if (violated) {
        return this.fail(
          {
            code: '23505',
            message: `duplicate key value violates unique constraint "${this.table}_${violated.join('_')}_key"`,
          },
          409,
        );
      }
      table.push(row);
      written.push(row);
    }

    if (!this.returning) return { data: null as T, error: null, count: null, status: 201, statusText: 'Created' };
    return this.finish(written, null);
  }

  private runUpdate(): QueryResult<T> {
    const rows = this.matching();
    for (const row of rows) Object.assign(row, this.payload as Row);
    if (!this.returning) return { data: null as T, error: null, count: null, status: 204, statusText: 'No Content' };
    return this.finish(rows, null);
  }

  private runDelete(): QueryResult<T> {
    const doomed = new Set(this.matching());
    const table = this.db.rows(this.table);
    const kept = table.filter((r) => !doomed.has(r));
    table.length = 0;
    table.push(...kept);
    if (!this.returning) return { data: null as T, error: null, count: null, status: 204, statusText: 'No Content' };
    return this.finish([...doomed], null);
  }

  // ---- projection + embeds ----

  private project(row: Row, cols = this.selectCols, table = this.table): Row | null {
    const parts = parseSelect(cols);
    if (parts.length === 1 && parts[0].kind === 'all') return { ...row };

    const out: Row = {};
    for (const part of parts) {
      if (part.kind === 'all') Object.assign(out, row);
      else if (part.kind === 'column') out[part.alias] = row[part.column];
      else {
        const rel = this.db.findRelation(table, part.name);
        if (!rel) throw new Error(`[fake-supabase] select embeds "${part.name}" but no relation is registered for ${table}`);
        if (rel.parent === table) {
          const children = this.db
            .rows(rel.child)
            .filter((c) => c[rel.fk] === row.id)
            .map((c) => this.project(c, part.cols, rel.child))
            .filter((c): c is Row => c !== null);
          if (part.inner && children.length === 0) return null;
          out[part.alias] = children;
        } else {
          const parent = this.db.rows(rel.parent).find((p) => p.id === row[rel.fk]);
          if (part.inner && !parent) return null;
          out[part.alias] = parent ? this.project(parent, part.cols, rel.parent) : null;
        }
      }
    }
    return out;
  }
}

class RpcQuery<T = unknown> implements PromiseLike<QueryResult<T>> {
  private mode: 'many' | 'single' = 'many';
  constructor(
    private readonly db: FakeSupabase,
    private readonly name: string,
    private readonly args: Row,
  ) {}
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'single';
    return this;
  }
  then<R1 = QueryResult<T>, R2 = never>(
    onFulfilled?: ((value: QueryResult<T>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(async (): Promise<QueryResult<T>> => {
        const fn = this.db.rpcs.get(this.name);
        if (!fn) throw new Error(`[fake-supabase] rpc "${this.name}" is not registered — db.rpc('${this.name}', fn)`);
        this.db.log.push({ table: `rpc:${this.name}`, op: 'select' });
        const injected = this.db.takeFailure(`rpc:${this.name}`);
        if (injected) return { data: null as T, error: injected, count: null, status: 400, statusText: 'Bad Request' };
        let data = await fn(this.args);
        if (this.mode === 'single' && Array.isArray(data)) data = data[0] ?? null;
        return { data: data as T, error: null, count: null, status: 200, statusText: 'OK' };
      })
      .then(onFulfilled ?? undefined, onRejected ?? undefined);
  }
}

export class FakeSupabase {
  private tables = new Map<string, Row[]>();
  private relations: Relation[] = [];
  private uniques = new Map<string, string[][]>();
  private failures: Failure[] = [];
  private storageFailures: Array<{ op: string; error: { message: string } }> = [];
  readonly buckets = new Map<string, Map<string, StorageObject>>();
  readonly rpcs = new Map<string, (args: Row) => unknown>();
  /** Every statement executed, in order — assert on what a handler touched. */
  readonly log: Array<{ table: string; op: Op }> = [];
  readonly signedUrls: Array<{ bucket: string; path: string; expiresIn: number; options?: Row }> = [];

  reset() {
    this.tables.clear();
    this.relations = [];
    this.uniques.clear();
    this.failures = [];
    this.storageFailures = [];
    this.buckets.clear();
    this.rpcs.clear();
    this.log.length = 0;
    this.signedUrls.length = 0;
  }

  /** Append rows. Missing ids are filled in so seeded rows can be joined. */
  seed(table: string, rows: Row[]): Row[] {
    const list = this.rows(table);
    const added = rows.map((r) => ({ id: randomUUID(), ...r }));
    list.push(...added);
    return added;
  }

  rows(table: string): Row[] {
    let list = this.tables.get(table);
    if (!list) {
      list = [];
      this.tables.set(table, list);
    }
    return list;
  }

  /** `child.fk` points at `parent.id`. Enables `parent(*)`, `child(*)` embeds and dotted filters. */
  relation(parent: string, child: string, fk: string) {
    this.relations.push({ parent, child, fk });
    return this;
  }

  findRelation(table: string, other: string): Relation | undefined {
    return this.relations.find(
      (r) => (r.parent === table && r.child === other) || (r.child === table && r.parent === other),
    );
  }

  /** Declare a unique constraint; inserts that violate it get code 23505. */
  unique(table: string, cols: string[]) {
    const list = this.uniques.get(table) ?? [];
    list.push(cols);
    this.uniques.set(table, list);
    return this;
  }

  uniqueViolation(table: string, row: Row, existing: Row[]): string[] | null {
    for (const cols of this.uniques.get(table) ?? []) {
      if (cols.some((c) => row[c] === undefined || row[c] === null)) continue;
      if (existing.some((r) => cols.every((c) => r[c] === row[c]))) return cols;
    }
    return null;
  }

  rpc(name: string, fn: (args: Row) => unknown) {
    this.rpcs.set(name, fn);
    return this;
  }

  /** The next statement on `table` (optionally only `op`) returns this error instead of running. */
  failNext(table: string, op: Op | undefined, error: PgError | string) {
    this.failures.push({ table, op, error: typeof error === 'string' ? { message: error } : error });
    return this;
  }

  takeFailure(table: string, op?: Op): PgError | null {
    const i = this.failures.findIndex((f) => f.table === table && (!f.op || !op || f.op === op));
    if (i === -1) return null;
    return this.failures.splice(i, 1)[0].error;
  }

  failNextStorage(op: 'upload' | 'createSignedUrl' | 'remove' | 'download', message: string) {
    this.storageFailures.push({ op, error: { message } });
    return this;
  }

  private takeStorageFailure(op: string) {
    const i = this.storageFailures.findIndex((f) => f.op === op);
    if (i === -1) return null;
    return this.storageFailures.splice(i, 1)[0].error;
  }

  bucket(name: string): Map<string, StorageObject> {
    let b = this.buckets.get(name);
    if (!b) {
      b = new Map();
      this.buckets.set(name, b);
    }
    return b;
  }

  /** The object the app hands to supabase-js callers. */
  client() {
    const db = this;
    return {
      from: (table: string) => new Query(db, table),
      rpc: (name: string, args: Row = {}) => new RpcQuery(db, name, args),
      storage: {
        from: (bucketName: string) => ({
          async upload(
            path: string,
            body: Uint8Array | ArrayBuffer | Blob | string,
            opts: { contentType?: string; upsert?: boolean } = {},
          ) {
            const injected = db.takeStorageFailure('upload');
            if (injected) return { data: null, error: injected };
            const bucket = db.bucket(bucketName);
            if (bucket.has(path) && !opts.upsert) {
              return { data: null, error: { message: 'The resource already exists' } };
            }
            let bytes: Uint8Array;
            if (body instanceof Uint8Array) bytes = body;
            else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
            else if (typeof body === 'string') bytes = new TextEncoder().encode(body);
            else bytes = new Uint8Array(await body.arrayBuffer());
            bucket.set(path, { bytes, contentType: opts.contentType });
            return { data: { path, id: randomUUID(), fullPath: `${bucketName}/${path}` }, error: null };
          },
          async createSignedUrl(path: string, expiresIn: number, options?: Row) {
            const injected = db.takeStorageFailure('createSignedUrl');
            if (injected) return { data: null, error: injected };
            if (!db.bucket(bucketName).has(path)) return { data: null, error: { message: 'Object not found' } };
            db.signedUrls.push({ bucket: bucketName, path, expiresIn, options });
            const qs = new URLSearchParams({ token: 'fake', expires: String(expiresIn) });
            const download = options?.download;
            if (download) qs.set('download', typeof download === 'string' ? download : '');
            return { data: { signedUrl: `https://fake.storage/${bucketName}/${path}?${qs}` }, error: null };
          },
          async remove(paths: string[]) {
            const injected = db.takeStorageFailure('remove');
            if (injected) return { data: null, error: injected };
            const bucket = db.bucket(bucketName);
            const removed = paths.filter((p) => bucket.delete(p)).map((p) => ({ name: p }));
            return { data: removed, error: null };
          },
          async download(path: string) {
            const injected = db.takeStorageFailure('download');
            if (injected) return { data: null, error: injected };
            const obj = db.bucket(bucketName).get(path);
            if (!obj) return { data: null, error: { message: 'Object not found' } };
            return { data: new Blob([obj.bytes as BlobPart], { type: obj.contentType }), error: null };
          },
        }),
      },
    };
  }
}

export type FakeClient = ReturnType<FakeSupabase['client']>;
