/**
 * News proxy — Cloudflare Worker
 *
 * Free, no API key required. It proxies Google News' public RSS search feed
 * (https://news.google.com/rss/search?q=...), which is meant for syndication,
 * and returns real article links (title, publisher link, source, date) as
 * JSON, with CORS enabled so the static site can call it from the browser.
 *
 * A worker is needed at all because the RSS feed doesn't send CORS headers,
 * so browsers block a direct fetch from the page — this proxy fetches it
 * server-side (no CORS restriction there) and re-serves it with headers that
 * do allow the browser to read it.
 *
 * This isn't an official/supported Google API: it's an unofficial feed. It
 * can go stale or get rate-limited under heavy use, so this is meant for a
 * personal, low-volume tool, not a public product with many simultaneous users.
 *
 * Deploy (no CLI needed):
 *   1. Sign up at https://dash.cloudflare.com (free, no card required).
 *   2. Workers & Pages -> Create -> Create Worker.
 *   3. Paste this file's contents into the editor, replacing the default code.
 *   4. Deploy. Copy the workers.dev URL it gives you.
 *   5. Paste that URL into NEWS_API_ENDPOINT at the top of companies.js.
 *
 * (See ../worker/README.md for the full walkthrough and the wrangler-CLI
 * alternative if you'd rather deploy from the repo.)
 */

// Leave as "*" for a personal project with no sensitive data; tighten to your
// site's exact origin (e.g. "https://you.github.io") if you want to restrict
// who can call this worker.
const ALLOWED_ORIGIN = "*";

const MAX_ARTICLES = 6;

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") || "").trim();

    if (!query) {
      return jsonResponse({ error: "Missing 'q' query parameter" }, 400);
    }

    const feedUrl =
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
      `&hl=en-GB&gl=GB&ceid=GB:en`;

    let xml;
    try {
      const feedResponse = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PersonalNewsProxy/1.0)" },
      });
      if (!feedResponse.ok) {
        return jsonResponse({ error: `Upstream feed returned ${feedResponse.status}` }, 502);
      }
      xml = await feedResponse.text();
    } catch (e) {
      return jsonResponse({ error: "Failed to reach the news feed" }, 502);
    }

    const articles = parseRssItems(xml).slice(0, MAX_ARTICLES);
    return jsonResponse({ query, articles });
  },
};

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const source = extractTag(block, "source");
    if (title && link) {
      items.push({
        title: decodeEntities(title),
        link: link.trim(),
        source: source ? decodeEntities(source) : null,
        publishedAt: pubDate || null,
      });
    }
  }
  return items;
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return null;
  return m[1]
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
