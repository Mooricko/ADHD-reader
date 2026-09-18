import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Server-side URL extraction plugin for Vite dev & preview servers.
 * Bypasses browser CORS restrictions by fetching articles directly on the server
 * with desktop browser User-Agent headers.
 */
export function urlExtractPlugin(): Plugin {
  const handleRequest = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const reqUrl = req.url || '';
    if (!reqUrl.startsWith('/api/extract-url')) {
      return next();
    }

    // Set CORS headers so client can call this smoothly
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      const parsedUrl = new URL(reqUrl, 'http://localhost:3000');
      let targetUrl = parsedUrl.searchParams.get('url');

      // If POST, check body for url if not in query params
      if (!targetUrl && req.method === 'POST') {
        const body = await new Promise<string>((resolve) => {
          let data = '';
          req.on('data', (chunk) => { data += chunk; });
          req.on('end', () => resolve(data));
        });
        try {
          const json = JSON.parse(body);
          targetUrl = json.url;
        } catch {
          // ignore json parse error
        }
      }

      if (!targetUrl) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing "url" parameter.' }));
        return;
      }

      // Ensure scheme
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      // Attempt 1: Direct server fetch with desktop headers
      let response: Response | null = null;
      try {
        response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
        });
      } catch (fetchErr: any) {
        // Direct fetch failed or timed out
      }

      if (response && response.ok) {
        clearTimeout(timeoutId);
        const contentType = response.headers.get('content-type') || '';
        const html = await response.text();

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: true,
            html,
            url: response.url || targetUrl,
            contentType,
          })
        );
        return;
      }

      // Attempt 2: If direct fetch failed or gave 403/anti-bot, try Jina reader
      try {
        const jinaController = new AbortController();
        const jinaTimeout = setTimeout(() => jinaController.abort(), 8000);

        const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
          signal: jinaController.signal,
          headers: {
            'Accept': 'text/plain',
            'User-Agent': 'ADHDReader/1.0',
          },
        });
        clearTimeout(jinaTimeout);

        if (jinaRes.ok) {
          const markdown = await jinaRes.text();
          if (markdown && markdown.length > 50) {
            clearTimeout(timeoutId);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: true,
                markdown,
                url: targetUrl,
              })
            );
            return;
          }
        }
      } catch {
        // Jina fallback failed
      }

      clearTimeout(timeoutId);

      // If both failed, return 422 with status details
      res.statusCode = 422;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            "Couldn't extract readable text from this page. The website may block remote scrapers, require login, or be behind a paywall.",
          targetUrl,
          statusCode: response?.status,
        })
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: err?.message || 'Server error while extracting URL',
        })
      );
    }
  };

  return {
    name: 'vite-plugin-url-extract',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handleRequest);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handleRequest);
    },
  };
}
