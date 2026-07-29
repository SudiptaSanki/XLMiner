/**
 * XLMiner — Main App Controller
 *
 * Orchestrates the UI: handles user input, runs the extraction pipeline,
 * renders progress logs, data preview, and triggers download.
 */

(() => {
  'use strict';

  // ── DOM Elements ──
  const els = {
    sheetUrl: document.getElementById('sheetUrl'),
    extractBtn: document.getElementById('extractBtn'),
    errorBanner: document.getElementById('errorBanner'),
    errorMessage: document.getElementById('errorMessage'),

    sheetTabsCard: document.getElementById('sheetTabsCard'),
    sheetTabs: document.getElementById('sheetTabs'),

    progressCard: document.getElementById('progressCard'),
    progressBar: document.getElementById('progressBar'),
    logList: document.getElementById('logList'),

    previewCard: document.getElementById('previewCard'),
    previewTable: document.getElementById('previewTable'),
    previewStats: document.getElementById('previewStats'),

    downloadCard: document.getElementById('downloadCard'),
    downloadBtn: document.getElementById('downloadBtn'),
    downloadMeta: document.getElementById('downloadMeta'),
  };

  // ── State ──
  let state = {
    isExtracting: false,
    extractionResult: null,
    generatedBlob: null,
    detectedSheets: [],
    selectedGid: null,
    spreadsheetId: null,
  };

  // ── Initialize ──
  function init() {
    els.extractBtn.addEventListener('click', handleExtract);
    els.downloadBtn.addEventListener('click', handleDownload);

    // Allow Enter key on input
    els.sheetUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleExtract();
    });

    // Paste handler — auto-extract on paste
    els.sheetUrl.addEventListener('paste', () => {
      setTimeout(() => {
        if (els.sheetUrl.value.includes('docs.google.com/spreadsheets')) {
          els.sheetUrl.classList.add('pasted');
          setTimeout(() => els.sheetUrl.classList.remove('pasted'), 300);
        }
      }, 50);
    });

    // Auto-detect URL from active tab (Chrome Extension mode)
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url && tab.url.includes('docs.google.com/spreadsheets')) {
          els.sheetUrl.value = tab.url;
          els.sheetUrl.style.color = 'var(--accent-emerald-light)';
        }
      });
    }

    // Focus input on load
    els.sheetUrl.focus();
  }

  // ── Main Extract Handler ──
  async function handleExtract() {
    if (state.isExtracting) return;

    const url = els.sheetUrl.value.trim();
    // In extension mode, no proxy needed (background worker handles CORS)
    const proxyBase = '';

    // Validate
    try {
      const parsed = XLExtractor.parseUrl(url);
      state.spreadsheetId = parsed.spreadsheetId;
      state.selectedGid = parsed.gid;
    } catch (err) {
      showError(err.message);
      return;
    }

    // Reset UI
    hideError();
    resetResults();
    setExtracting(true);
    showSection(els.progressCard);

    try {
      // Step 1: Detect sheets
      addLog('working', 'Scanning for sheet tabs...');
      const sheets = await XLExtractor.detectSheets(state.spreadsheetId, proxyBase, addLog);
      state.detectedSheets = sheets;

      if (sheets.length > 1) {
        renderSheetTabs(sheets);
        showSection(els.sheetTabsCard);
      }

      updateProgress(15);

      // Step 2: Extract data
      addLog('working', 'Running extraction pipeline...');
      const result = await XLExtractor.extract(
        url,
        proxyBase,
        state.selectedGid,
        addLog,
        updateProgress
      );

      state.extractionResult = result;

      // Step 3: Build Excel
      addLog('working', 'Building Excel file...');
      updateProgress(85);

      const sheetName = state.detectedSheets.find(s => s.gid === state.selectedGid)?.name || 'Sheet1';
      const blob = await XLExcelBuilder.build(result, sheetName);
      state.generatedBlob = blob;

      updateProgress(95);

      // Step 4: Show preview
      if (result.type === 'parsed' && result.rows) {
        renderPreview(result.rows);
        showSection(els.previewCard);
      }

      // Step 5: Show download
      addLog('success', `Extraction complete — file size: ${XLExcelBuilder.formatFileSize(blob)}`);
      els.downloadMeta.textContent = `${XLExcelBuilder.formatFileSize(blob)} • ${result.rows?.length || '?'} rows • Source: ${result.source || 'direct export'}`;
      showSection(els.downloadCard);
      updateProgress(100);

    } catch (err) {
      addLog('error', err.message);
      showError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  // ── Download Handler ──
  function handleDownload() {
    if (!state.generatedBlob) return;

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `XLMiner_${state.spreadsheetId?.slice(0, 8) || 'export'}_${timestamp}.xlsx`;

    XLExcelBuilder.downloadBlob(state.generatedBlob, filename);

    addLog('success', `Downloaded: ${filename}`);
  }

  // ── Sheet Tab Selection ──
  function renderSheetTabs(sheets) {
    els.sheetTabs.innerHTML = '';

    sheets.forEach((sheet, idx) => {
      const tab = document.createElement('button');
      tab.className = `sheet-tab ${idx === 0 ? 'active' : ''}`;
      tab.textContent = sheet.name;
      tab.dataset.gid = sheet.gid;

      tab.addEventListener('click', () => {
        // Deactivate all
        els.sheetTabs.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.selectedGid = sheet.gid;
      });

      els.sheetTabs.appendChild(tab);
    });
  }

  // ── Preview Rendering ──
  function renderPreview(rows) {
    const maxPreviewRows = 50;
    const displayRows = rows.slice(0, maxPreviewRows);
    const totalRows = rows.length;
    const totalCols = Math.max(...rows.map(r => r.length));

    els.previewStats.textContent = `${totalRows} rows × ${totalCols} cols${totalRows > maxPreviewRows ? ` (showing first ${maxPreviewRows})` : ''}`;

    let html = '<thead><tr>';
    html += '<th class="row-num">#</th>';

    // Column headers (A, B, C, ... AA, AB, etc.)
    for (let c = 0; c < totalCols; c++) {
      html += `<th>${getColumnLetter(c)}</th>`;
    }
    html += '</tr></thead><tbody>';

    displayRows.forEach((row, idx) => {
      html += '<tr>';
      html += `<td class="row-num">${idx + 1}</td>`;
      for (let c = 0; c < totalCols; c++) {
        const val = row[c] !== undefined ? escapeHtml(String(row[c])) : '';
        html += `<td title="${val}">${val}</td>`;
      }
      html += '</tr>';
    });

    if (totalRows > maxPreviewRows) {
      html += `<tr><td colspan="${totalCols + 1}" style="text-align:center;color:var(--text-muted);padding:12px;">… ${totalRows - maxPreviewRows} more rows not shown</td></tr>`;
    }

    html += '</tbody>';
    els.previewTable.innerHTML = html;
  }

  // ── Logging ──
  function addLog(level, message) {
    const li = document.createElement('li');
    li.className = `log-entry log-entry--${level}`;
    li.innerHTML = `
      <span class="log-entry__bullet"></span>
      <span>${escapeHtml(message)}</span>
    `;

    els.logList.appendChild(li);

    // Scroll to bottom
    li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Progress Bar ──
  function updateProgress(percent) {
    els.progressBar.style.width = `${Math.min(percent, 100)}%`;
  }

  // ── UI Helpers ──
  function setExtracting(isExtracting) {
    state.isExtracting = isExtracting;
    els.extractBtn.disabled = isExtracting;
    els.extractBtn.classList.toggle('btn-extract--loading', isExtracting);
    els.sheetUrl.disabled = isExtracting;
  }

  function showError(message) {
    els.errorMessage.textContent = message;
    els.errorBanner.classList.add('visible');
  }

  function hideError() {
    els.errorBanner.classList.remove('visible');
  }

  function showSection(el) {
    el.classList.add('visible');
  }

  function hideSection(el) {
    el.classList.remove('visible');
  }

  function resetResults() {
    state.extractionResult = null;
    state.generatedBlob = null;

    els.logList.innerHTML = '';
    els.previewTable.innerHTML = '';
    updateProgress(0);

    hideSection(els.progressCard);
    hideSection(els.previewCard);
    hideSection(els.downloadCard);
    hideSection(els.sheetTabsCard);
  }

  // ── Utility ──
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getColumnLetter(index) {
    let result = '';
    let n = index;
    while (n >= 0) {
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26) - 1;
    }
    return result;
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
