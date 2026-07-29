/**
 * XLMiner — Optional CORS Proxy Server
 *
 * A lightweight Express server that proxies requests to Google Sheets
 * endpoints, bypassing CORS restrictions for the client-side app.
 *
 * Usage:
 *   cd server && npm install && npm start
 *
 * Then set the proxy URL in XLMiner to: http://localhost:8787/proxy?url=
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 8787;

// ── Middleware ──

app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
}));

// Rate limiting: 60 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// ── Health Check ──
app.get('/', (req, res) => {
  res.json({
    service: 'XLMiner CORS Proxy',
    status: 'running',
    usage: 'GET /proxy?url=<encoded_url>',
  });
});

// ── Proxy Endpoint ──
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing "url" query parameter.' });
  }

  // Only allow Google Docs URLs
  try {
    const parsed = new URL(targetUrl);
    if (!parsed.hostname.endsWith('google.com') && !parsed.hostname.endsWith('googleapis.com')) {
      return res.status(403).json({ error: 'Only Google Sheets URLs are allowed.' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL.' });
  }

  try {
    const proxyResponse = await fetchUrl(targetUrl);

    // Forward content-type
    if (proxyResponse.headers['content-type']) {
      res.setHeader('Content-Type', proxyResponse.headers['content-type']);
    }

    // Forward content-disposition for file downloads
    if (proxyResponse.headers['content-disposition']) {
      res.setHeader('Content-Disposition', proxyResponse.headers['content-disposition']);
    }

    res.status(proxyResponse.statusCode);

    // Stream the response
    proxyResponse.pipe(res);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch the target URL.', detail: err.message });
  }
});

/**
 * Fetch a URL using native Node.js http/https, following redirects.
 */
function fetchUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects.'));
    }

    const lib = url.startsWith('https') ? https : http;

    const request = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 30000,
    }, (response) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        const redirectUrl = new URL(response.headers.location, url).toString();
        return resolve(fetchUrl(redirectUrl, maxRedirects - 1));
      }

      resolve(response);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timed out.'));
    });
  });
}

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n  ⛏️  XLMiner CORS Proxy running at http://localhost:${PORT}`);
  console.log(`  📋 Set proxy URL in XLMiner to: http://localhost:${PORT}/proxy?url=\n`);
});
