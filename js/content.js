/**
 * XLMiner — Content Script
 *
 * - Injected into Google Sheets pages.
 * - Shows a floating "XLMiner" button if enabled in the extension settings.
 * - Clicking the button opens the extension popup via chrome.action API.
 */

(() => {
  'use strict';

  // Only run on spreadsheet pages
  if (!window.location.href.includes('/spreadsheets/d/')) return;

  const STORAGE_KEY_OVERLAY = 'xlminer_overlay_enabled';

  /**
   * Check stored preference and either ask, inject, or skip.
   */
  function boot() {
    chrome.storage.local.get([STORAGE_KEY_OVERLAY], (data) => {
      // Default is OFF — only inject if explicitly enabled by the user
      if (data[STORAGE_KEY_OVERLAY] === true) {
        injectOverlay();
      }
    });
  }



  /**
   * Inject the floating action button onto the page.
   */
  function injectOverlay() {
    if (document.getElementById('xlminer-fab')) return;

    const fab = document.createElement('div');
    fab.id = 'xlminer-fab';
    fab.innerHTML = `
      <div class="xlminer-fab-btn" title="Extract with XLMiner">
        <span class="xlminer-fab-label">XLMiner</span>
      </div>
      <button class="xlminer-fab-close" title="Hide overlay">✕</button>
    `;
    document.body.appendChild(fab);

    // Click handler — clicking the button opens the extension popup
    fab.querySelector('.xlminer-fab-btn').addEventListener('click', () => {
      // MV3 cannot programmatically open the popup from content scripts.
      // Instead, send a message to the background to trigger the popup via action API.
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });

    // Close / toggle off handler
    fab.querySelector('.xlminer-fab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.storage.local.set({ [STORAGE_KEY_OVERLAY]: false });
      fab.remove();
    });
  }

  // ── Boot ──
  if (document.readyState === 'complete') {
    setTimeout(boot, 1200);
  } else {
    window.addEventListener('load', () => setTimeout(boot, 1200));
  }
})();
