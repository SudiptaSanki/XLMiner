/**
 * XLMiner — Content Script
 *
 * Injected into Google Sheets pages.
 * - On first visit: asks user permission before showing the overlay.
 * - Shows a floating "XLMiner" button with a toggle to hide it.
 * - Clicking the button opens the extension popup via chrome.action API.
 */

(() => {
  'use strict';

  // Only run on spreadsheet pages
  if (!window.location.href.includes('/spreadsheets/d/')) return;

  const STORAGE_KEY_OVERLAY = 'xlminer_overlay_enabled';
  const STORAGE_KEY_ASKED = 'xlminer_overlay_asked';

  /**
   * Check stored preference and either ask, inject, or skip.
   */
  function boot() {
    chrome.storage.local.get([STORAGE_KEY_OVERLAY, STORAGE_KEY_ASKED], (data) => {
      const asked = data[STORAGE_KEY_ASKED];
      const enabled = data[STORAGE_KEY_OVERLAY];

      if (!asked) {
        // First time — ask permission
        askPermission();
      } else if (enabled === true) {
        injectOverlay();
      }
      // else: user turned it off, do nothing
    });
  }

  /**
   * Show a permission prompt asking if the user wants the overlay.
   */
  function askPermission() {
    // Don't ask more than once per page load
    if (document.getElementById('xlminer-permission-prompt')) return;

    const prompt = document.createElement('div');
    prompt.id = 'xlminer-permission-prompt';
    prompt.innerHTML = `
      <div class="xlminer-prompt-card">
        <div class="xlminer-prompt-header">
          <strong>XLMiner</strong>
        </div>
        <div class="xlminer-prompt-body">
          Show a quick-access button on spreadsheet pages?
        </div>
        <div class="xlminer-prompt-actions">
          <button class="xlminer-prompt-btn xlminer-prompt-yes">Enable</button>
          <button class="xlminer-prompt-btn xlminer-prompt-no">No thanks</button>
        </div>
      </div>
    `;
    document.body.appendChild(prompt);

    prompt.querySelector('.xlminer-prompt-yes').addEventListener('click', () => {
      chrome.storage.local.set({
        [STORAGE_KEY_OVERLAY]: true,
        [STORAGE_KEY_ASKED]: true,
      });
      prompt.remove();
      injectOverlay();
    });

    prompt.querySelector('.xlminer-prompt-no').addEventListener('click', () => {
      chrome.storage.local.set({
        [STORAGE_KEY_OVERLAY]: false,
        [STORAGE_KEY_ASKED]: true,
      });
      prompt.remove();
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
