/**
 * XLMiner — Background Service Worker (Chrome Extension)
 *
 * Handles:
 *   1. Cross-origin requests to Google Sheets endpoints (CORS-free).
 *   2. Opening the extension popup when clicked from the content-script overlay.
 */

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetch') {
    handleFetch(message.url, message.responseType || 'text')
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'getActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] || null });
    });
    return true;
  }

  // Content script overlay click → open the extension popup
  if (message.action === 'openPopup') {
    // chrome.action.openPopup() is available in Chrome 127+ with MV3
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().catch(() => {
        // Fallback: if openPopup is not supported, badge the icon to attract attention
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#ffffff' });
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
      });
    } else {
      // Older Chrome: flash the badge as a visual cue to click the toolbar icon
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ffffff' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
    }
    sendResponse({ ok: true });
    return false;
  }
});

/**
 * Fetch a URL directly from the service worker (no CORS restrictions).
 */
async function handleFetch(url, responseType) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include', // Send cookies for authenticated access
      redirect: 'follow',
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }

    let data;
    if (responseType === 'blob' || responseType === 'arraybuffer') {
      const buffer = await response.arrayBuffer();
      // Convert to base64 for message passing (can't send ArrayBuffer through messaging)
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      data = btoa(binary);
      return { ok: true, data, status: response.status, isBase64: true };
    } else {
      data = await response.text();
      return { ok: true, data, status: response.status, isBase64: false };
    }
  } catch (err) {
    return { ok: false, error: err.message, status: 0 };
  }
}
