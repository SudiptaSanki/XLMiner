/**
 * XLMiner — Content Script
 *
 * Injected into Google Sheets pages.
 * Adds a floating "Extract with XLMiner" button for quick access.
 * Also detects sheet metadata (tabs, gids) from the page DOM.
 */

(() => {
  'use strict';

  // Only run on spreadsheet pages
  if (!window.location.href.includes('/spreadsheets/d/')) return;

  // Wait for the page to be ready
  const inject = () => {
    // Check if already injected
    if (document.getElementById('xlminer-fab')) return;

    // Create floating action button
    const fab = document.createElement('div');
    fab.id = 'xlminer-fab';
    fab.innerHTML = `
      <div class="xlminer-fab-btn" title="Extract with XLMiner">
        <span class="xlminer-fab-icon">⛏️</span>
        <span class="xlminer-fab-label">XLMiner</span>
      </div>
    `;
    document.body.appendChild(fab);

    // Click handler — open extension popup or send message
    fab.querySelector('.xlminer-fab-btn').addEventListener('click', () => {
      // Send the current URL to the extension popup
      chrome.runtime.sendMessage({
        action: 'openPopup',
        url: window.location.href,
        sheets: detectSheetsFromPage(),
      });
    });

    // Detect sheet tabs from page
    function detectSheetsFromPage() {
      const sheets = [];
      const tabElements = document.querySelectorAll('.docs-sheet-tab .docs-sheet-tab-name, [class*="sheet-tab"] [class*="name"]');

      tabElements.forEach((el, idx) => {
        const name = el.textContent.trim();
        if (name) {
          // Try to get gid from parent element's data attributes or nearby links
          const parent = el.closest('[data-id]');
          const gid = parent ? parent.getAttribute('data-id') : String(idx);
          sheets.push({ name, gid });
        }
      });

      return sheets;
    }
  };

  // Run after DOM is stable
  if (document.readyState === 'complete') {
    setTimeout(inject, 1500);
  } else {
    window.addEventListener('load', () => setTimeout(inject, 1500));
  }
})();
