import { Link } from "react-router-dom";

// Bodies carry mention tokens `@[Display Name](player:<id>)`. Everything is rendered as React nodes (never HTML).
const TOKEN = /@\[([^\]\n]{1,60})\]\(player:([A-Za-z0-9_-]{1,64})\)/g;
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
const COMBINED = new RegExp(`${TOKEN.source}|${URL_RE.source}`, "g");

export const MAX_BODY = 4000;
export const nameOf = (p) => (p ? p.display_name || p.username : "");

/** Plain-text view of a body ("@Name" instead of tokens). */
export const plainText = (body) => String(body || "").replace(TOKEN, "@$1");

/** Body with tokens -> editable text plus the mentions it contained ({id, name}). */
export function tokensToPlain(body, people = {}) {
  const mentions = [];
  const text = String(body || "").replace(TOKEN, (_, stored, id) => {
    const name = nameOf(people[id]) || stored;
    if (!mentions.some((m) => m.id === id)) mentions.push({ id, name });
    return `@${name}`;
  });
  return { text, mentions };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Editable text + chosen mentions -> wire body: each "@Name" the person picked becomes a token. */
export function toWire(text, mentions) {
  let out = text;
  const list = [...mentions].sort((a, b) => b.name.length - a.name.length);
  for (const m of list) {
    const safe = m.name.replace(/[[\]\n]/g, "");
    out = out.replace(new RegExp(`@${esc(m.name)}(?![\\p{L}\\p{N}_])`, "gu"), `@[${safe}](player:${m.id})`);
  }
  return out;
}

function trimUrl(raw) {
  let url = raw;
  let tail = "";
  while (/[.,;:!?)\]}]$/.test(url)) {
    if (url.endsWith(")") && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length) break;
    tail = url.slice(-1) + tail;
    url = url.slice(0, -1);
  }
  return [url, tail];
}

/** Render a body as nodes: mention tokens -> profile links (current display name), http(s) URLs -> safe links. */
export function RenderBody({ body, people = {}, className = "" }) {
  const nodes = [];
  const src = String(body || "");
  let last = 0;
  let k = 0;
  for (const m of src.matchAll(COMBINED)) {
    if (m.index > last) nodes.push(src.slice(last, m.index));
    if (m[2]) {
      const p = people[m[2]];
      nodes.push(
        p ? (
          <Link
            key={k++}
            to={`/players/${encodeURIComponent(p.username)}`}
            className="font-semibold text-brand underline-offset-2 hover:underline"
          >
            @{nameOf(p)}
          </Link>
        ) : (
          <span key={k++} className="font-semibold text-muted-foreground">
            @{m[1]}
          </span>
        ),
      );
    } else {
      const [url, tail] = trimUrl(m[0]);
      let ok = false;
      try {
        ok = ["http:", "https:"].includes(new URL(url).protocol);
      } catch {
        ok = false;
      }
      nodes.push(
        ok ? (
          <a key={k++} href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline underline-offset-2 hover:opacity-80">
            {url}
          </a>
        ) : (
          url
        ),
      );
      if (tail) nodes.push(tail);
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) nodes.push(src.slice(last));
  return <span className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`}>{nodes}</span>;
}
