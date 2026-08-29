# News proxy worker

`news-proxy.js` is a small [Cloudflare Worker](https://workers.cloudflare.com/)
that the Companies page calls to get **real article links** (not just a
search page) for the companies and industry topics you follow. It's free —
no API key, no credit card, and Cloudflare's free plan covers far more
requests than a personal tool like this will ever use.

It works by proxying Google News' public RSS search feed
(`https://news.google.com/rss/search?q=...`), which is meant for
syndication, and re-serving the parsed results as JSON with CORS headers so
the browser is allowed to read them (the raw feed doesn't send CORS headers,
so the page can't fetch it directly).

This is an unofficial feed, not an official Google API — treat it as
best-effort. It's fine for one person's own use; it isn't something to point
a lot of traffic at.

## Deploy it (about 5 minutes, no CLI needed)

1. Go to <https://dash.cloudflare.com> and sign up (free; no card required
   for the Workers free plan).
2. In the sidebar, open **Workers & Pages** -> **Create** -> **Create
   Worker**.
3. Give it any name (e.g. `job-search-news-proxy`) and click **Deploy** to
   scaffold it.
4. Click **Edit code**, delete the placeholder code, and paste in the full
   contents of [`news-proxy.js`](./news-proxy.js).
5. Click **Deploy** again.
6. Copy the URL Cloudflare gives you — it looks like
   `https://job-search-news-proxy.<your-subdomain>.workers.dev`.
7. Open `companies.js` in this repo and set:
   ```js
   const NEWS_API_ENDPOINT = "https://job-search-news-proxy.<your-subdomain>.workers.dev";
   ```
8. Commit and push. The Companies page will now show real article links.

If you skip this setup, the page still works — it falls back to a plain
"Search for news" link instead of specific articles.

## Optional: deploy from the command line instead

If you'd rather manage this from the repo with the `wrangler` CLI:

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler init --from-dash false   # or write your own wrangler.toml
wrangler deploy news-proxy.js
```

Wrangler will print the deployed URL — use that for `NEWS_API_ENDPOINT` as
above.

## Keeping it within the free tier

Cloudflare Workers' free plan includes 100,000 requests/day, which is far
more than a personal job-search tool run by one person will use — you don't
need to do anything to stay within it.
