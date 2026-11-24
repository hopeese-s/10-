// ============================================================
// lineTheme.js — one visual language for every LINE Flex message
//
// Every Flex message passes through applyLineTheme() right before it is
// sent (sendLineReply / sendLinePush), so all ~35 bubbles share the same
// look without each builder repeating colours:
//   • warm dark header, small eyebrow line, white title
//   • paper body with white cards and hairline borders
//   • three hues only: terracotta accent, red for urgent, green for done
//   • no leading emoji in titles, labels or buttons
// Builders can also use the `ui` helpers below to lay out new messages.
// ============================================================
'use strict';

const C = {
  header: '#2A1F18',
  eyebrow: '#E9B48F',
  headerSub: '#CDBFB2',
  paper: '#FAF7F3',
  card: '#FFFFFF',
  line: '#EDE6DE',
  ink: '#221C15',
  muted: '#6E6358',
  faint: '#A79C90',
  accent: '#B4521A',
  accentSoft: '#FBEFE7',
  danger: '#B3261E',
  dangerSoft: '#FCEEEC',
  success: '#2F7D4F',
  successSoft: '#EDF6F0'
};

// ─── colour helpers ───────────────────────────────────────────
function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}

function hsl(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

// Which of the three hues a saturated colour belongs to
function hueRole(hex) {
  const c = hsl(hex);
  if (!c) return 'accent';
  if (c.h < 14 || c.h >= 335) return 'danger';
  if (c.h >= 85 && c.h < 175) return 'success';
  return 'accent';
}

function isLight(hex) { const c = hsl(hex); return !!c && c.l >= 0.86; }
function isNeutral(hex) { const c = hsl(hex); return !!c && (c.s < 0.35 || c.l <= 0.3); }

// Colour is reserved for bold labels; regular text stays ink/muted so cards read calmly
function textColor(hex, bold) {
  const c = hsl(hex);
  if (!c) return C.ink;
  if (c.l >= 0.9) return hex;                 // white / near-white text sits on a dark fill: keep
  if (isNeutral(hex)) return c.l < 0.32 ? C.ink : c.l < 0.62 ? C.muted : C.faint;
  if (!bold) return C.muted;
  return C[hueRole(hex)];
}

// ─── emoji ────────────────────────────────────────────────────
const LEADING_EMOJI = /^(?:[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}][\u{FE0F}\u{200D}\u{20E3}\p{Extended_Pictographic}]*\s*)+/u;
function stripLeadingEmoji(str) {
  if (typeof str !== 'string') return str;
  const out = str.replace(LEADING_EMOJI, '');
  return out.trim() ? out : str; // never blank out an emoji-only label
}

// ─── theme pass ───────────────────────────────────────────────
function themeText(node, zone) {
  if (typeof node.text === 'string') node.text = stripLeadingEmoji(node.text);
  if (Array.isArray(node.contents)) node.contents.forEach(sp => { if (sp && typeof sp.text === 'string') sp.text = stripLeadingEmoji(sp.text); });
  if (zone === 'header') return; // header text colours are set by themeHeader
  if (node.color) node.color = textColor(node.color, node.weight === 'bold');
  else node.color = C.ink;
}

function themeNode(node, zone, insideFill) {
  if (!node || typeof node !== 'object') return;
  switch (node.type) {
    case 'text':
      themeText(node, zone);
      if (insideFill && node.color && !isLight(node.color)) node.color = '#FFFFFF';
      return;
    case 'separator':
      node.color = zone === 'header' ? '#4A3B30' : C.line;
      return;
    case 'button': {
      if (node.action && typeof node.action.label === 'string') node.action.label = stripLeadingEmoji(node.action.label);
      // one button colour everywhere; secondary buttons stay neutral grey
      if (node.style === 'primary' || node.style === 'link') node.color = C.accent;
      return;
    }
    case 'box': {
      let fill = insideFill;
      if (node.backgroundColor && zone !== 'header') {
        const bg = node.backgroundColor;
        if (isLight(bg) || isNeutral(bg) && hsl(bg) && hsl(bg).l > 0.7) {
          // tinted info boxes become white cards with a hairline border
          node.backgroundColor = C.card;
          if (!node.borderWidth) { node.borderWidth = '1px'; node.borderColor = C.line; }
          else node.borderColor = C.line;
          if (!node.cornerRadius || /^(xs|sm|md)$/.test(node.cornerRadius)) node.cornerRadius = '12px';
        } else {
          // solid fills (badges, chips) keep their meaning in one of three hues
          node.backgroundColor = isNeutral(bg) ? C.ink : C[hueRole(bg)];
          fill = true;
        }
      } else if (node.borderColor) {
        node.borderColor = C.line;
      }
      (node.contents || []).forEach(c => themeNode(c, zone, fill));
      return;
    }
    default:
      return;
  }
}

function themeHeader(header) {
  header.backgroundColor = C.header;
  if (!header.paddingAll || parseInt(header.paddingAll, 10) < 18) header.paddingAll = '20px';
  let first = true;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'text') {
      themeText(n, 'header');
      const small = !n.size || /^(xxs|xs|sm)$/.test(n.size);
      if (first && n.size === 'xxs') n.color = C.eyebrow;
      else if (small && n.weight !== 'bold') n.color = C.headerSub;
      else n.color = '#FFFFFF';
      if (!small) n.wrap = true;
      first = false;
      return;
    }
    if (n.type === 'box') {
      if (n.backgroundColor) n.backgroundColor = '#3A2C23';
      (n.contents || []).forEach(walk);
      return;
    }
    themeNode(n, 'header', false);
  };
  (header.contents || []).forEach(walk);
}

const THEMED = new WeakSet();

// Bubbles built with ui.bubble / markThemed carry the house header colour already
const HOUSE_HEADERS = new Set([C.header, '#2B1A18']);

function themeBubble(b) {
  if (!b || b.type !== 'bubble' || THEMED.has(b)) return;
  if (b.header && HOUSE_HEADERS.has(b.header.backgroundColor)) return;
  if (b.header) themeHeader(b.header);
  if (b.body) {
    if (!b.body.backgroundColor || isLight(b.body.backgroundColor)) b.body.backgroundColor = C.paper;
    (b.body.contents || []).forEach(c => themeNode(c, 'body', false));
  }
  if (b.footer) {
    b.footer.backgroundColor = C.paper;
    if (!b.footer.paddingAll) b.footer.paddingAll = '12px';
    if (!b.footer.spacing) b.footer.spacing = 'sm';
    (b.footer.contents || []).forEach(c => themeNode(c, 'footer', false));
    b.styles = b.styles || {};
    b.styles.footer = { ...(b.styles.footer || {}), separator: true, separatorColor: C.line };
  }
  THEMED.add(b);
}

function applyLineTheme(message) {
  if (!message || message.type !== 'flex' || !message.contents) return message;
  const c = message.contents;
  if (c.type === 'carousel') (c.contents || []).forEach(themeBubble);
  else themeBubble(c);
  return message;
}

// ─── layout helpers for hand-built messages ───────────────────
// "Room 320" / "Lab SC" already name the place; otherwise prefix with ห้อง
function roomLabel(room) {
  if (!room) return '';
  return /^(room|lab|ห้อง|online|ออนไลน์)/i.test(String(room).trim()) ? String(room) : `ห้อง ${room}`;
}

const ui = {
  C,
  roomLabel,
  bubble({ eyebrow, title, subtitle, body, footer, size = 'mega' }) {
    const b = {
      type: 'bubble',
      size,
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.header, paddingAll: '20px', paddingBottom: '18px',
        contents: [
          ...(eyebrow ? [{ type: 'text', text: eyebrow, size: 'xxs', weight: 'bold', color: C.eyebrow }] : []),
          { type: 'text', text: title, size: 'xl', weight: 'bold', color: '#FFFFFF', wrap: true, margin: eyebrow ? 'sm' : 'none' },
          ...(subtitle ? [{ type: 'text', text: subtitle, size: 'xs', color: C.headerSub, wrap: true, margin: 'sm' }] : [])
        ]
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '14px', backgroundColor: C.paper, contents: body },
      ...(footer && footer.length ? {
        footer: { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px', backgroundColor: C.paper, contents: footer },
        styles: { footer: { separator: true, separatorColor: C.line } }
      } : {})
    };
    THEMED.add(b);
    return b;
  },
  label(text, margin = 'lg') {
    return { type: 'text', text, size: 'xxs', weight: 'bold', color: C.muted, margin };
  },
  card(contents, { margin = 'sm', tone = 'plain', layout = 'vertical', spacing } = {}) {
    const bg = tone === 'accent' ? C.accentSoft : tone === 'danger' ? C.dangerSoft : tone === 'success' ? C.successSoft : C.card;
    const border = tone === 'accent' ? '#F1D3BF' : tone === 'danger' ? '#F4C9C4' : tone === 'success' ? '#CBE5D4' : C.line;
    return { type: 'box', layout, margin, paddingAll: '12px', cornerRadius: '12px', backgroundColor: bg, borderWidth: '1px', borderColor: border, ...(spacing ? { spacing } : {}), contents };
  },
  // time column + title/subtitle; used for schedules and agendas
  timeRow({ start, end, title, sub, tone = 'plain', tag }, margin = 'sm') {
    const strong = tone === 'danger' ? C.danger : tone === 'accent' ? C.accent : C.ink;
    return ui.card([
      {
        type: 'box', layout: 'vertical', width: '50px', flex: 0, contents: [
          { type: 'text', text: start || '-', size: 'sm', weight: 'bold', color: strong },
          ...(end ? [{ type: 'text', text: end, size: 'xxs', color: C.faint, margin: 'xs' }] : [])
        ]
      },
      {
        type: 'box', layout: 'vertical', flex: 1, contents: [
          ...(tag ? [{ type: 'text', text: tag, size: 'xxs', weight: 'bold', color: strong }] : []),
          { type: 'text', text: title || '-', size: 'sm', weight: 'bold', color: C.ink, wrap: true, margin: tag ? 'xs' : 'none' },
          ...(sub ? [{ type: 'text', text: sub, size: 'xs', color: tone === 'danger' ? C.danger : C.muted, wrap: true, margin: 'xs' }] : [])
        ]
      }
    ], { margin, tone, layout: 'horizontal', spacing: 'md' });
  },
  kv(key, value, { strong = false, margin = 'sm' } = {}) {
    return {
      type: 'box', layout: 'horizontal', margin, contents: [
        { type: 'text', text: key, size: 'xs', color: C.muted, flex: 2 },
        { type: 'text', text: value, size: 'xs', weight: strong ? 'bold' : 'regular', color: strong ? C.accent : C.ink, flex: 5, wrap: true, align: 'end' }
      ]
    };
  },
  stat(label, value, tone) {
    return {
      type: 'box', layout: 'vertical', flex: 1, paddingAll: '10px', cornerRadius: '12px', backgroundColor: C.card, borderWidth: '1px', borderColor: C.line,
      contents: [
        { type: 'text', text: label, size: 'xxs', color: C.muted },
        { type: 'text', text: String(value), size: 'xl', weight: 'bold', color: tone ? C[tone] : C.ink, margin: 'xs' }
      ]
    };
  },
  note(text, margin = 'lg') {
    return { type: 'text', text, size: 'xs', color: C.muted, wrap: true, margin };
  },
  empty(text, margin = 'sm') {
    return ui.card([{ type: 'text', text, size: 'sm', color: C.muted, wrap: true, align: 'center' }], { margin });
  },
  msgButton(label, text, primary = false) {
    return primary
      ? { type: 'button', action: { type: 'message', label, text }, style: 'primary', color: C.accent, height: 'sm' }
      : { type: 'button', action: { type: 'message', label, text }, style: 'secondary', height: 'sm' };
  },
  uriButton(label, uri, primary = false) {
    return primary
      ? { type: 'button', action: { type: 'uri', label, uri }, style: 'primary', color: C.accent, height: 'sm' }
      : { type: 'button', action: { type: 'uri', label, uri }, style: 'secondary', height: 'sm' };
  }
};

function markThemed(bubble) { if (bubble && typeof bubble === 'object') THEMED.add(bubble); return bubble; }

module.exports = { applyLineTheme, markThemed, stripLeadingEmoji, ui, LINE_COLORS: C };
