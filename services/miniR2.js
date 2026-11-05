// ============================================================
// miniR2.js — tiny Cloudflare R2 / S3 client (PutObject + GetObject)
//
// Replaces @aws-sdk/client-s3, which costs ~22 MB of RAM to load and
// ~33 MB after the first request. This file signs requests with AWS
// Signature V4 (UNSIGNED-PAYLOAD, which R2 supports) using Node's crypto and
// streams bodies over https — no buffering of uploads or downloads.
//
// It mirrors the small part of the SDK the server uses:
//   const client = new S3Client({ endpoint, region, credentials })
//   await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType, ContentLength }))
//   const r = await client.send(new GetObjectCommand({ Bucket, Key }))
//   r.Body.pipe(res) / for await (const c of r.Body) / await r.Body.transformToByteArray()
// ============================================================
'use strict';

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { Readable } = require('stream');

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();
const sha256hex = data => crypto.createHash('sha256').update(data, 'utf8').digest('hex');

// RFC 3986 encoding per path segment, as S3 expects
const encodeKey = key => String(key).split('/').map(seg =>
  encodeURIComponent(seg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
).join('/');

class PutObjectCommand { constructor(input) { this.input = input; this.method = 'PUT'; } }
class GetObjectCommand { constructor(input) { this.input = input; this.method = 'GET'; } }

class S3Client {
  constructor({ endpoint, region = 'auto', credentials }) {
    this.endpoint = new URL(endpoint);
    this.region = region;
    this.accessKeyId = credentials.accessKeyId;
    this.secretAccessKey = credentials.secretAccessKey;
  }

  /** Build the signed request (exposed for tests). `now` is a Date. */
  sign(method, bucket, key, extraHeaders = {}, now = new Date()) {
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const host = this.endpoint.host;
    const path = `/${encodeKey(bucket)}/${encodeKey(key)}`;

    const headers = {
      host,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': amzDate,
      ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), String(v).trim()]))
    };
    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map(n => `${n}:${headers[n]}\n`).join('');
    const signedHeaders = names.join(';');
    const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
    let k = hmac('AWS4' + this.secretAccessKey, dateStamp);
    k = hmac(k, this.region);
    k = hmac(k, 's3');
    k = hmac(k, 'aws4_request');
    const signature = crypto.createHmac('sha256', k).update(stringToSign, 'utf8').digest('hex');

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { path, headers };
  }

  _request(method, bucket, key, extraHeaders, body) {
    const { path, headers } = this.sign(method, bucket, key, extraHeaders);
    const lib = this.endpoint.protocol === 'http:' ? http : https;
    return new Promise((resolve, reject) => {
      const req = lib.request({
        method,
        protocol: this.endpoint.protocol,
        hostname: this.endpoint.hostname,
        port: this.endpoint.port || undefined,
        path,
        headers,
        timeout: 60000
      }, res => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res);
        let text = '';
        res.setEncoding('utf8');
        res.on('data', c => { if (text.length < 2000) text += c; });
        res.on('end', () => {
          const code = (text.match(/<Code>([^<]+)<\/Code>/) || [])[1];
          const msg = (text.match(/<Message>([^<]+)<\/Message>/) || [])[1];
          const err = new Error(`R2 ${method} ${key} failed: ${res.statusCode}${code ? ' ' + code : ''}${msg ? ' – ' + msg : ''}`);
          err.$metadata = { httpStatusCode: res.statusCode };
          err.name = code || 'R2Error';
          reject(err);
        });
      });
      req.on('timeout', () => req.destroy(new Error('R2 request timed out')));
      req.on('error', reject);
      if (body == null) return req.end();
      if (body instanceof Readable || typeof body.pipe === 'function') {
        body.on('error', e => req.destroy(e));
        body.pipe(req);
      } else {
        req.end(body);
      }
    });
  }

  async send(cmd) {
    const { Bucket, Key } = cmd.input;
    if (cmd instanceof PutObjectCommand) {
      const { Body, ContentType, ContentLength } = cmd.input;
      const extra = {};
      if (ContentType) extra['content-type'] = ContentType;
      let len = ContentLength;
      if (len == null && (Buffer.isBuffer(Body) || typeof Body === 'string')) len = Buffer.byteLength(Body);
      if (len == null) throw new Error('PutObject with a stream body needs ContentLength');
      extra['content-length'] = len;
      const res = await this._request('PUT', Bucket, Key, extra, Body);
      res.resume();
      return { ETag: res.headers.etag, $metadata: { httpStatusCode: res.statusCode } };
    }
    if (cmd instanceof GetObjectCommand) {
      const res = await this._request('GET', Bucket, Key, {}, null);
      res.transformToByteArray = async () => {
        const chunks = [];
        for await (const c of res) chunks.push(c);
        return new Uint8Array(Buffer.concat(chunks));
      };
      return {
        Body: res,
        ContentType: res.headers['content-type'],
        ContentLength: res.headers['content-length'] ? Number(res.headers['content-length']) : undefined,
        ETag: res.headers.etag,
        $metadata: { httpStatusCode: res.statusCode }
      };
    }
    throw new Error('miniR2: unsupported command');
  }
}

module.exports = { S3Client, PutObjectCommand, GetObjectCommand };
