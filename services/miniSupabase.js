// ============================================================
// miniSupabase.js — tiny PostgREST client for the queries server.js uses
//
// Replaces @supabase/supabase-js (auth, realtime, storage, functions… none of
// which this server uses). Talks to the same REST endpoint with the same
// headers, and returns the same { data, error } shape:
//
//   supabase.from(t).select(cols).eq(c, v).in(c, [..]).order(c, { ascending }).limit(n)
//   supabase.from(t).insert(row | rows)
//   supabase.from(t).upsert(row | rows, { onConflict })
//   supabase.from(t).delete().eq(c, v) / .in(c, [..])
//
// Builders are real promises (await, .then, .catch all work).
// ============================================================
'use strict';

// PostgREST list values: quote only values containing reserved characters
// (same rule supabase-js uses)
const quote = v => {
  const s = String(v);
  return /[,()]/.test(s) ? `"${s}"` : s;
};

class Query {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.method = 'GET';
    this.params = [];
    this.body = undefined;
    this.prefer = [];
  }

  select(columns = '*') { this.params.push(['select', columns.replace(/\s+/g, '')]); return this; }
  eq(col, val) { this.params.push([col, `eq.${val}`]); return this; }
  neq(col, val) { this.params.push([col, `neq.${val}`]); return this; }
  in(col, vals) { this.params.push([col, `in.(${(vals || []).map(quote).join(',')})`]); return this; }
  order(col, { ascending = true } = {}) { this.params.push(['order', `${col}.${ascending ? 'asc' : 'desc'}`]); return this; }
  limit(n) { this.params.push(['limit', String(n)]); return this; }

  insert(rows) {
    this.method = 'POST';
    this.body = rows;
    return this;
  }

  upsert(rows, { onConflict } = {}) {
    this.method = 'POST';
    this.body = rows;
    this.prefer.push('resolution=merge-duplicates');
    if (onConflict) this.params.push(['on_conflict', onConflict]);
    return this;
  }

  delete() { this.method = 'DELETE'; return this; }

  url() {
    const qs = new URLSearchParams(this.params).toString();
    return `${this.client.url}/rest/v1/${encodeURIComponent(this.table)}${qs ? '?' + qs : ''}`;
  }

  async _exec() {
    const headers = {
      apikey: this.client.key,
      Authorization: `Bearer ${this.client.key}`,
      Accept: 'application/json'
    };
    if (this.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.prefer.length) headers.Prefer = this.prefer.join(',');
    try {
      const res = await fetch(this.url(), {
        method: this.method,
        headers,
        body: this.body === undefined ? undefined : JSON.stringify(this.body),
        signal: AbortSignal.timeout(this.client.timeoutMs)
      });
      const text = await res.text();
      let json = null;
      if (text) { try { json = JSON.parse(text); } catch (_) { json = null; } }
      if (!res.ok) {
        const message = (json && (json.message || json.error_description || json.error)) || text || `HTTP ${res.status}`;
        return { data: null, error: { message, code: json && json.code, details: json && json.details, hint: json && json.hint }, status: res.status };
      }
      return { data: this.method === 'GET' ? (json || []) : null, error: null, status: res.status };
    } catch (e) {
      return { data: null, error: { message: e.message || String(e) }, status: 0 };
    }
  }

  then(onFulfilled, onRejected) { return this._exec().then(onFulfilled, onRejected); }
  catch(onRejected) { return this._exec().catch(onRejected); }
  finally(fn) { return this._exec().finally(fn); }
}

function createClient(url, key, { timeoutMs = 15000 } = {}) {
  const client = { url: String(url).replace(/\/+$/, ''), key, timeoutMs };
  return { from: table => new Query(client, table) };
}

module.exports = { createClient };
