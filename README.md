<p align="center">
  <img src="assets/logo.png" alt="XLMiner Logo" width="96">
</p>

<h1 align="center">XLMiner</h1>

<p align="center">
  <strong>Extract and download any Google Sheet as a formatted Excel file — even when download permissions are blocked.</strong>
</p>

<p align="center">
  <a href="https://github.com/SudiptaSanki/XLMiner/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-white.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/SudiptaSanki/XLMiner/stargazers"><img src="https://img.shields.io/badge/PRs-welcome-white.svg?style=flat-square" alt="PRs Welcome"></a>
  <img src="https://img.shields.io/badge/Chrome_Extension-Manifest_V3-white.svg?style=flat-square" alt="Manifest V3">
</p>

---

## Overview

**XLMiner** is a lightweight, open-source Chrome Extension designed to bypass spreadsheet download restrictions set by document owners. It reconstructs a faithful `.xlsx` Excel file directly in your browser, preserving cell data, fonts, colors, merged cells, borders, and column dimensions.

Everything runs 100% locally on your machine — no private spreadsheet data ever touches external servers.

---

## Key Features

- **Bypass Download Restrictions**: Extract spreadsheet data even when "Download, print, and copy" options are disabled by the owner.
- **Full Formatting Preservation**: Retains cell background fills, font weights, italic styles, text decorations, font sizes, text alignments, borders, and merged ranges.
- **Multi-Tab Support**: Detects and extracts data across multiple sheet tabs within a workbook.
- **Client-Side & Private**: Built using Manifest V3 background service workers for seamless CORS-free extraction directly within your browser session.
- **Pure Black Glassmorphism UI**: Minimalist, high-contrast monochrome aesthetic.

---

## How It Works

XLMiner utilizes a cascading 4-strategy extraction engine to retrieve data from available public/view endpoints:

1. **Direct Export** (`/export?format=xlsx`) — Attempts direct binary download.
2. **GViz Engine** (`/gviz/tq?tqx=out:csv` + HTML) — Extracts raw CSV data paired with HTML structure.
3. **HTML View** (`/htmlview`) — Parses rendered tables with inline CSS styling metadata.
4. **Preview Mode** (`/preview` & `/pubhtml`) — Fallback extraction from web-published preview views.

The extracted structural and formatting data is then assembled into a native `.xlsx` workbook client-side using ExcelJS.

---

## Installation & Setup

1. Clone or download this repository:
   ```bash
   git clone https://github.com/SudiptaSanki/XLMiner.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `XLMiner` project folder.
5. Pin XLMiner to your extension toolbar for quick access.

---

## 🤝 Join the Journey — Inviting Contributors!

XLMiner is an open-source project created to make data accessible to everyone who has legitimate viewing permissions. **We warmly invite developers, designers, and open-source enthusiasts of all skill levels to join us in building and improving XLMiner!**

### How You Can Contribute:
- **Feature Enhancements**: Advanced formula reconstruction, cell comment extraction, or chart parsing.
- **UI/UX Refinements**: Polishing interactions, micro-animations, or accessibility.
- **Browser Compatibility**: Porting to Firefox (WebExtensions) or Safari.
- **Bug Fixes & Optimizations**: Improving HTML parsing speed and edge-case handling for large workbooks.

Check out open issues or submit a pull request directly at **[github.com/SudiptaSanki/XLMiner](https://github.com/SudiptaSanki/XLMiner)**. Every contribution matters!

---

## ⚖️ Legal Disclaimer

XLMiner is created strictly for retrieving spreadsheet data that you already have explicit authorization to view. Please respect document owners' privacy and copyright policies. This tool is not intended for circumventing security boundaries for unauthorized access.

---

## 📄 License

Distributed under the [MIT License](https://github.com/SudiptaSanki/XLMiner/blob/main/LICENSE). Built with ❤️ by [Sudipta Sanki](https://github.com/SudiptaSanki) and open-source contributors.
