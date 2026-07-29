/**
 * XLMiner — Extractor Module
 * 
 * Handles Google Sheets URL parsing and multi-strategy data extraction.
 * Strategies (in order of attempt):
 *   1. Direct export (/export?format=xlsx)
 *   2. GViz CSV + HTML (/gviz/tq)
 *   3. HTML View (/htmlview)
 *   4. Preview mode (/preview)
 */

const XLExtractor = (() => {
  'use strict';

  // ── URL Patterns ──

  const SHEET_URL_REGEX = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
  const GID_REGEX = /[#&?]gid=(\d+)/;

  /**
   * Parse a Google Sheets URL to extract the spreadsheet ID and gid.
   * @param {string} url - The Google Sheets URL
   * @returns {{ spreadsheetId: string, gid: string|null }} Parsed components
   * @throws {Error} If the URL is not a valid Google Sheets URL
   */
  function parseUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Please enter a Google Sheets URL.');
    }

    const trimmed = url.trim();

    const idMatch = trimmed.match(SHEET_URL_REGEX);
    if (!idMatch) {
      throw new Error(
        'Invalid Google Sheets URL. Expected format:\nhttps://docs.google.com/spreadsheets/d/SPREADSHEET_ID/...'
      );
    }

    const spreadsheetId = idMatch[1];
    const gidMatch = trimmed.match(GID_REGEX);
    const gid = gidMatch ? gidMatch[1] : '0';

    return { spreadsheetId, gid };
  }

  /**
   * Build various Google Sheets endpoint URLs.
   */
  function buildUrls(spreadsheetId) {
    const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    return {
      export: (format, gid) => `${base}/export?format=${format}&gid=${gid}`,
      gvizCsv: (gid) => `${base}/gviz/tq?tqx=out:csv&gid=${gid}`,
      gvizHtml: (gid) => `${base}/gviz/tq?tqx=out:html&gid=${gid}`,
      htmlView: () => `${base}/htmlview`,
      preview: () => `${base}/preview`,
      pubHtml: () => `${base}/pubhtml`,
    };
  }

  /**
   * Check if we're running as a Chrome Extension.
   */
  function isExtension() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
  }

  /**
   * Fetch a URL — uses Chrome Extension background worker if available,
   * otherwise falls back to CORS proxy or direct fetch.
   * @param {string} targetUrl - The URL to fetch
   * @param {string} proxyBase - The CORS proxy base URL (ignored in extension mode)
   * @param {string} [responseType='text'] - Expected response type ('text', 'blob', 'arraybuffer')
   * @returns {Promise<{ok: boolean, data: any, status: number}>}
   */
  async function proxiedFetch(targetUrl, proxyBase, responseType = 'text') {
    // Extension mode: route through background service worker (no CORS issues)
    if (isExtension()) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'fetch', url: targetUrl, responseType },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, data: null, status: 0, error: chrome.runtime.lastError.message });
              return;
            }

            if (!response || !response.ok) {
              resolve({ ok: false, data: null, status: response?.status || 0, error: response?.error });
              return;
            }

            let data = response.data;

            // Convert base64 back to Blob for binary responses
            if (response.isBase64 && (responseType === 'blob' || responseType === 'arraybuffer')) {
              const binary = atob(data);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              if (responseType === 'blob') {
                data = new Blob([bytes]);
              } else {
                data = bytes.buffer;
              }
            }

            resolve({ ok: true, data, status: response.status });
          }
        );
      });
    }

    // Standalone mode: use CORS proxy
    const fetchUrl = proxyBase
      ? proxyBase + encodeURIComponent(targetUrl)
      : targetUrl;

    try {
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (!response.ok) {
        return { ok: false, data: null, status: response.status };
      }

      let data;
      if (responseType === 'blob') {
        data = await response.blob();
      } else if (responseType === 'arraybuffer') {
        data = await response.arrayBuffer();
      } else {
        data = await response.text();
      }

      return { ok: true, data, status: response.status };
    } catch (err) {
      return { ok: false, data: null, status: 0, error: err.message };
    }
  }

  /**
   * Strategy 1: Try direct xlsx export.
   * This works when the owner hasn't disabled downloads.
   */
  async function tryDirectExport(spreadsheetId, gid, proxyBase, onLog) {
    onLog('info', 'Attempting direct .xlsx export...');

    const urls = buildUrls(spreadsheetId);
    const url = urls.export('xlsx', gid);
    const result = await proxiedFetch(url, proxyBase, 'blob');

    if (result.ok && result.data && result.data.size > 500) {
      // Verify it's actually an xlsx (starts with PK zip signature)
      const header = await result.data.slice(0, 4).arrayBuffer();
      const sig = new Uint8Array(header);
      if (sig[0] === 0x50 && sig[1] === 0x4B) {
        onLog('success', 'Direct export successful! File obtained as native .xlsx');
        return { type: 'blob', data: result.data };
      }
    }

    onLog('warning', 'Direct export blocked or unavailable. Trying alternative methods...');
    return null;
  }

  /**
   * Strategy 2: GViz API — get CSV data + HTML for formatting.
   */
  async function tryGvizExtraction(spreadsheetId, gid, proxyBase, onLog) {
    onLog('info', 'Attempting GViz API extraction (CSV + HTML)...');

    const urls = buildUrls(spreadsheetId);

    // Fetch CSV data
    const csvResult = await proxiedFetch(urls.gvizCsv(gid), proxyBase, 'text');
    if (!csvResult.ok || !csvResult.data || csvResult.data.length < 5) {
      onLog('warning', 'GViz CSV endpoint failed.');
      return null;
    }

    onLog('success', `GViz CSV data received (${(csvResult.data.length / 1024).toFixed(1)} KB)`);

    // Parse CSV
    const rows = parseCSV(csvResult.data);
    if (!rows || rows.length === 0) {
      onLog('warning', 'CSV parsing returned no data.');
      return null;
    }

    onLog('info', `Parsed ${rows.length} rows × ${rows[0]?.length || 0} columns from CSV`);

    // Try to get HTML version for formatting hints
    let formatting = null;
    const htmlResult = await proxiedFetch(urls.gvizHtml(gid), proxyBase, 'text');
    if (htmlResult.ok && htmlResult.data) {
      onLog('info', 'GViz HTML received — extracting formatting...');
      formatting = XLFormatter.parseGvizHtml(htmlResult.data);
      if (formatting) {
        onLog('success', 'Cell formatting extracted successfully');
      }
    }

    return {
      type: 'parsed',
      rows,
      formatting,
      source: 'gviz',
    };
  }

  /**
   * Strategy 3: Parse /htmlview for data + styles.
   */
  async function tryHtmlView(spreadsheetId, gid, proxyBase, onLog) {
    onLog('info', 'Attempting HTML view extraction...');

    const urls = buildUrls(spreadsheetId);
    const result = await proxiedFetch(urls.htmlView(), proxyBase, 'text');

    if (!result.ok || !result.data) {
      onLog('warning', 'HTML view endpoint failed.');
      return null;
    }

    onLog('info', `HTML view received (${(result.data.length / 1024).toFixed(1)} KB) — parsing tables...`);

    const extracted = XLFormatter.parseHtmlView(result.data, gid);
    if (!extracted || !extracted.rows || extracted.rows.length === 0) {
      onLog('warning', 'No table data found in HTML view.');
      return null;
    }

    onLog('success', `Extracted ${extracted.rows.length} rows from HTML view`);

    return {
      type: 'parsed',
      rows: extracted.rows,
      formatting: extracted.formatting,
      sheets: extracted.sheets,
      source: 'htmlview',
    };
  }

  /**
   * Strategy 4: Parse /preview (pubhtml).
   */
  async function tryPreview(spreadsheetId, gid, proxyBase, onLog) {
    onLog('info', 'Attempting preview/pubhtml extraction...');

    const urls = buildUrls(spreadsheetId);

    // Try pubhtml first (tends to have cleaner HTML)
    let result = await proxiedFetch(urls.pubHtml(), proxyBase, 'text');
    if (!result.ok || !result.data) {
      result = await proxiedFetch(urls.preview(), proxyBase, 'text');
    }

    if (!result.ok || !result.data) {
      onLog('error', 'Preview endpoint also failed.');
      return null;
    }

    onLog('info', `Preview HTML received (${(result.data.length / 1024).toFixed(1)} KB) — parsing...`);

    const extracted = XLFormatter.parseHtmlView(result.data, gid);
    if (!extracted || !extracted.rows || extracted.rows.length === 0) {
      onLog('error', 'No table data found in preview. The sheet may be fully private.');
      return null;
    }

    onLog('success', `Extracted ${extracted.rows.length} rows from preview`);

    return {
      type: 'parsed',
      rows: extracted.rows,
      formatting: extracted.formatting,
      sheets: extracted.sheets,
      source: 'preview',
    };
  }

  /**
   * Detect all sheet tabs from an HTML response.
   */
  async function detectSheets(spreadsheetId, proxyBase, onLog) {
    onLog('info', 'Detecting sheet tabs...');

    const urls = buildUrls(spreadsheetId);

    // Try htmlview first — it usually lists all tabs
    let html = null;
    const result = await proxiedFetch(urls.htmlView(), proxyBase, 'text');
    if (result.ok && result.data) {
      html = result.data;
    } else {
      const pubResult = await proxiedFetch(urls.pubHtml(), proxyBase, 'text');
      if (pubResult.ok && pubResult.data) {
        html = pubResult.data;
      }
    }

    if (!html) {
      onLog('info', 'Could not detect sheet tabs — will extract default sheet (gid=0)');
      return [{ name: 'Sheet1', gid: '0' }];
    }

    // Parse sheet tab links from HTML
    const sheets = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Pattern 1: Tab links in the navigation (pubhtml/htmlview)
    const tabLinks = doc.querySelectorAll('ul#sheet-menu li a, [id*="sheet-button"]');
    tabLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const gidMatch = href.match(/gid=(\d+)/);
      const name = link.textContent.trim();
      if (gidMatch && name) {
        sheets.push({ name, gid: gidMatch[1] });
      }
    });

    // Pattern 2: Sheet menu items
    if (sheets.length === 0) {
      const menuItems = doc.querySelectorAll('[id^="sheet-menu"] li');
      menuItems.forEach((item) => {
        const link = item.querySelector('a');
        if (link) {
          const href = link.getAttribute('href') || '';
          const gidMatch = href.match(/gid=(\d+)/);
          const name = link.textContent.trim();
          if (name) {
            sheets.push({ name, gid: gidMatch ? gidMatch[1] : '0' });
          }
        }
      });
    }

    // Pattern 3: Look for sheet names in the raw HTML
    if (sheets.length === 0) {
      const sheetPattern = /gid[=:](\d+)[^>]*>([^<]+)</g;
      let match;
      const seen = new Set();
      while ((match = sheetPattern.exec(html)) !== null) {
        const gid = match[1];
        const name = match[2].trim();
        if (name && !seen.has(gid) && name.length < 100) {
          sheets.push({ name, gid });
          seen.add(gid);
        }
      }
    }

    if (sheets.length === 0) {
      sheets.push({ name: 'Sheet1', gid: '0' });
    }

    onLog('success', `Found ${sheets.length} sheet tab(s): ${sheets.map(s => s.name).join(', ')}`);
    return sheets;
  }

  /**
   * Main extraction pipeline — tries each strategy in order.
   * @param {string} url - Google Sheets URL
   * @param {string} proxyBase - CORS proxy base URL
   * @param {string|null} targetGid - Specific gid to extract (null = from URL or default)
   * @param {Function} onLog - Callback (level, message)
   * @param {Function} onProgress - Callback (percent 0-100)
   * @returns {Promise<Object>} Extraction result
   */
  async function extract(url, proxyBase, targetGid, onLog, onProgress) {
    const { spreadsheetId, gid: urlGid } = parseUrl(url);
    const gid = targetGid || urlGid || '0';

    onLog('info', `Spreadsheet ID: ${spreadsheetId}`);
    onLog('info', `Target sheet gid: ${gid}`);
    onProgress(5);

    // Strategy 1: Direct Export
    onProgress(10);
    const directResult = await tryDirectExport(spreadsheetId, gid, proxyBase, onLog);
    if (directResult) {
      onProgress(100);
      return directResult;
    }

    // Strategy 2: GViz API
    onProgress(30);
    const gvizResult = await tryGvizExtraction(spreadsheetId, gid, proxyBase, onLog);
    if (gvizResult) {
      onProgress(80);
      return gvizResult;
    }

    // Strategy 3: HTML View
    onProgress(50);
    const htmlResult = await tryHtmlView(spreadsheetId, gid, proxyBase, onLog);
    if (htmlResult) {
      onProgress(80);
      return htmlResult;
    }

    // Strategy 4: Preview
    onProgress(70);
    const previewResult = await tryPreview(spreadsheetId, gid, proxyBase, onLog);
    if (previewResult) {
      onProgress(80);
      return previewResult;
    }

    throw new Error(
      'All extraction strategies failed. The sheet may be fully private (not shared with "Anyone with the link").'
    );
  }

  // ── CSV Parser ──

  /**
   * Parse CSV text into a 2D array of strings.
   * Handles quoted fields with commas and newlines.
   */
  function parseCSV(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    let row = [];
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            current += '"';
            i += 2;
            continue;
          } else {
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          current += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === ',') {
          row.push(current);
          current = '';
          i++;
        } else if (ch === '\n' || (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n')) {
          row.push(current);
          current = '';
          rows.push(row);
          row = [];
          i += (ch === '\r') ? 2 : 1;
        } else if (ch === '\r') {
          row.push(current);
          current = '';
          rows.push(row);
          row = [];
          i++;
        } else {
          current += ch;
          i++;
        }
      }
    }

    // Handle last field
    if (current || row.length > 0) {
      row.push(current);
      rows.push(row);
    }

    // Remove trailing empty rows
    while (rows.length > 0 && rows[rows.length - 1].every(cell => cell === '')) {
      rows.pop();
    }

    return rows;
  }

  // ── Public API ──
  return {
    parseUrl,
    extract,
    detectSheets,
    proxiedFetch,
    buildUrls,
    parseCSV,
  };
})();
