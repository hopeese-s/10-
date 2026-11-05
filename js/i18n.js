// ============================================================
// i18n.js — Thai / English language switch (default: English)
//
// The app's source strings are Thai. In English mode this layer
// translates everything that reaches the page: static HTML, views the
// app renders later, toasts, placeholders, tooltips, aria-labels and
// alert/confirm/prompt dialogs. It uses the Thai → English dictionary
// in i18n-dict.js. It never touches what people type (input values,
// textareas), so their data is stored exactly as written.
//
// Switching language saves the choice and reloads the page.
// ============================================================
(function () {
  'use strict';

  const KEY = 'sd-lang';
  let lang = 'en';
  try { lang = localStorage.getItem(KEY) === 'th' ? 'th' : 'en'; } catch (_) {}

  const DICT = window.I18N_DICT || {};
  const THAI = /[฀-๿]/;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-tip'];

  document.documentElement.lang = lang;

  // One alternation of every key, longest first, that only matches whole
  // Thai phrases: a key may not start or end in the middle of a Thai word.
  let matcher = null;
  function buildMatcher() {
    const keys = Object.keys(DICT).filter(k => k && THAI.test(k)).sort((a, b) => b.length - a.length);
    if (!keys.length) return null;
    const esc = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('(?<![\\u0E00-\\u0E7F])(?:' + esc.join('|') + ')(?![\\u0E00-\\u0E7F])', 'g');
  }

  function translate(str) {
    if (lang !== 'en' || !str || !THAI.test(str)) return str;
    const trimmed = str.trim();
    if (Object.prototype.hasOwnProperty.call(DICT, trimmed)) {
      const lead = str.match(/^\s*/)[0], tail = str.match(/\s*$/)[0];
      return lead + DICT[trimmed] + tail;
    }
    if (!matcher) matcher = buildMatcher();
    if (!matcher) return str;
    return str.replace(matcher, m => DICT[m]);
  }

  function skip(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (SKIP_TAGS.has(n.tagName) || n.isContentEditable || n.hasAttribute('data-no-i18n')) return true;
    }
    return false;
  }

  function translateAttrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && THAI.test(v)) {
        const t = translate(v);
        if (t !== v) el.setAttribute(a, t);
      }
    }
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
      const v = el.value;
      if (v && THAI.test(v)) el.value = translate(v);
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      if (THAI.test(root.nodeValue) && !skip(root.parentElement)) {
        const t = translate(root.nodeValue);
        if (t !== root.nodeValue) root.nodeValue = t;
      }
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (root.tagName === 'TEXTAREA') { translateAttrs(root); return; }  // placeholder yes, typed text no
      if (skip(root)) return;
      translateAttrs(root);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) {
          if (n.tagName === 'TEXTAREA') { translateAttrs(n); return NodeFilter.FILTER_REJECT; }
          return SKIP_TAGS.has(n.tagName) || n.hasAttribute('data-no-i18n') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
        return THAI.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 1) translateAttrs(n);
      else {
        const t = translate(n.nodeValue);
        if (t !== n.nodeValue) n.nodeValue = t;
      }
    }
  }

  function start() {
    document.querySelectorAll('.lang-label').forEach(el => { el.textContent = lang === 'en' ? 'TH' : 'EN'; });
    if (lang !== 'en') return;
    document.title = translate(document.title);
    translateTree(document.body);
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach(translateTree);
        else if (m.type === 'characterData') translateTree(m.target);
        else if (m.type === 'attributes' && !m.target.closest('[data-no-i18n]')) translateAttrs(m.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // Native dialogs don't go through the DOM
  if (lang === 'en') {
    const wrap = fn => fn && function (msg, ...rest) { return fn.call(window, translate(String(msg ?? '')), ...rest); };
    window.alert = wrap(window.alert);
    window.confirm = wrap(window.confirm);
    window.prompt = wrap(window.prompt);
  }

  // Runs before app.js's DOMContentLoaded handler (this script loads first),
  // so the static page is English before the first paint.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.I18N = {
    get lang() { return lang; },
    /** Locale for dates and numbers */
    locale() { return lang === 'en' ? 'en-GB' : 'th-TH'; },
    /** Pick a string per language where code builds text from parts */
    L(th, en) { return lang === 'en' ? en : th; },
    t: translate,
    setLang(next) {
      if (next !== 'th' && next !== 'en') return;
      try { localStorage.setItem(KEY, next); } catch (_) {}
      location.reload();
    },
    toggle() { this.setLang(lang === 'en' ? 'th' : 'en'); }
  };
})();
