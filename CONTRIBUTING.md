# Contributing to XLMiner

Thank you for considering contributing to **XLMiner**! This is an open-source project built for the community, and every contribution — whether it's code, documentation, bug reports, or ideas — is valued.

---

## Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/<your-username>/XLMiner.git
cd XLMiner
```

### 2. Load the Extension Locally

1. Open **Google Chrome** and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked** and select the cloned `XLMiner` folder.
4. The XLMiner icon will appear in your toolbar — ready for testing.

### 3. Make Your Changes

- Create a new branch for your feature or fix:
  ```bash
  git checkout -b feature/your-feature-name
  ```
- Edit the relevant files. The project has no build step — changes are reflected immediately after reloading the extension in `chrome://extensions/`.

### 4. Test

- Open any Google Sheets document in Chrome.
- Click the XLMiner toolbar icon to test the popup behavior.
- Verify the floating overlay on the spreadsheet page (if enabled).
- Test extraction on both publicly shared and view-only sheets.

### 5. Submit a Pull Request

```bash
git add .
git commit -m "feat: describe your change"
git push origin feature/your-feature-name
```

Then open a Pull Request against the `main` branch on [github.com/SudiptaSanki/XLMiner](https://github.com/SudiptaSanki/XLMiner).

---

## What You Can Work On

We welcome contributions across all areas of the project:

### Code & Features
- **Extraction Engine Improvements**: Better handling of protected sheets, edge cases in HTML parsing, large workbook support.
- **Formatting Fidelity**: Improve cell style preservation — conditional formatting, hyperlinks, comments, number formats.
- **Multi-Sheet Export**: Download all tabs into a single multi-sheet `.xlsx` workbook.
- **Formula Reconstruction**: Parse and reconstruct formulas from Google Sheets.
- **Chart & Image Export**: Extract embedded charts and images.

### Browser Compatibility
- **Firefox Port**: Adapt the extension for Firefox using WebExtensions APIs.
- **Edge Support**: Verify and fix any Edge-specific issues.
- **Safari Web Extension**: Port to Safari's Web Extension format.

### UI/UX
- **Accessibility**: Improve keyboard navigation, screen reader support, and ARIA labels.
- **Theming**: Add light mode or user-customizable themes.
- **Animations**: Enhance micro-interactions and transition polish.
- **Localization**: Add multi-language support for the popup and overlay.

### Documentation
- **Guides**: Write usage guides, tutorials, or video walkthroughs.
- **API Documentation**: Document the internal extraction strategies and data flow.
- **Examples**: Add example spreadsheets for testing various edge cases.

### Testing & QA
- **Automated Testing**: Set up unit tests for the extraction pipeline and formatters.
- **Manual Test Cases**: Document and expand the set of test spreadsheets.
- **Performance Profiling**: Identify and fix bottlenecks for very large sheets.

---

## Project Structure

```
XLMiner/
├── manifest.json          # Chrome Extension manifest (MV3)
├── index.html             # Extension popup UI
├── css/
│   ├── styles.css         # Popup theme (pure black glassmorphism)
│   └── content-inject.css # Styles injected into Google Sheets pages
├── js/
│   ├── app.js             # Popup controller & UI logic
│   ├── background.js      # Service worker (CORS-free fetching)
│   ├── content.js         # Content script (overlay button + permission prompt)
│   ├── extractor.js       # 4-strategy extraction pipeline
│   ├── formatter.js       # HTML → cell style parser
│   ├── excelBuilder.js    # ExcelJS-based .xlsx generator
│   └── exceljs.min.js     # Bundled ExcelJS library
├── assets/
│   ├── logo.png           # Project logo (transparent)
│   ├── icon128.png        # Extension icon 128px
│   ├── icon48.png         # Extension icon 48px
│   ├── icon32.png         # Extension icon 32px
│   └── icon16.png         # Extension icon 16px
├── server/                # Optional CORS proxy (for standalone web use)
├── CONTRIBUTING.md        # This file
├── LICENSE                # MIT License
└── README.md              # Project documentation
```

---

## Code Guidelines

- **No build tools required** — the project runs directly as an unpacked Chrome extension.
- **Vanilla JavaScript only** — no frameworks, no TypeScript, no bundlers.
- **Keep the UI monochrome** — follow the existing pure black + white design language.
- **Preserve comments and docstrings** — don't remove existing documentation unless replacing it with something better.
- **Test your changes** before submitting — at minimum, verify extraction works on a public Google Sheet.

---

## Reporting Issues

Found a bug or have a feature request? Open an issue at:
**[github.com/SudiptaSanki/XLMiner/issues](https://github.com/SudiptaSanki/XLMiner/issues)**

Please include:
- Chrome version and OS
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)

---

## Code of Conduct

Be respectful, constructive, and kind. We're all here to learn and build together.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
