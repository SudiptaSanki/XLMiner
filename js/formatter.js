/**
 * XLMiner — Formatter Module
 *
 * Parses HTML from Google Sheets endpoints to extract:
 *   - Cell data (text values)
 *   - Cell formatting (background, font color, weight, style, size, family)
 *   - Merged cell ranges (colspan / rowspan)
 *   - Column widths
 */

const XLFormatter = (() => {
  'use strict';

  /**
   * Parse GViz HTML output (/gviz/tq?tqx=out:html).
   * Returns a formatting map keyed by "row-col".
   */
  function parseGvizHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const table = doc.querySelector('table');
    if (!table) return null;

    const formatting = {};
    const trs = table.querySelectorAll('tr');

    trs.forEach((tr, rowIdx) => {
      const cells = tr.querySelectorAll('td, th');
      cells.forEach((cell, colIdx) => {
        const style = extractCellStyle(cell);
        if (style && Object.keys(style).length > 0) {
          formatting[`${rowIdx}-${colIdx}`] = style;
        }
      });
    });

    return Object.keys(formatting).length > 0 ? formatting : null;
  }

  /**
   * Parse a full HTML view (/htmlview or /pubhtml or /preview) response.
   * Returns { rows, formatting, sheets }.
   */
  function parseHtmlView(html, targetGid) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Detect available sheets from the menu
    const sheets = detectSheetsFromDoc(doc);

    // Find the right table for the target gid
    const tables = doc.querySelectorAll('table');
    if (!tables || tables.length === 0) return null;

    // Try to match the target gid to a specific table
    let targetTable = null;

    // In pubhtml, tables are often inside divs with id like "sheets-viewport"
    // and each sheet div has an id containing the gid
    if (targetGid) {
      // Look for a container div referencing this gid
      const sheetDiv = doc.querySelector(`[id*="${targetGid}"]`);
      if (sheetDiv) {
        targetTable = sheetDiv.querySelector('table') || sheetDiv.closest('table');
      }
    }

    // Fallback: use the largest table (most likely the data table, skip nav tables)
    if (!targetTable) {
      let maxCells = 0;
      tables.forEach(t => {
        const cellCount = t.querySelectorAll('td, th').length;
        if (cellCount > maxCells) {
          maxCells = cellCount;
          targetTable = t;
        }
      });
    }

    if (!targetTable) return null;

    return parseTable(targetTable, sheets);
  }

  /**
   * Parse a single HTML <table> element into rows + formatting.
   */
  function parseTable(table, sheets) {
    const rows = [];
    const formatting = {};
    const merges = [];
    const colWidths = [];

    // Extract column widths from <col> elements or <colgroup>
    const cols = table.querySelectorAll('col');
    cols.forEach((col, idx) => {
      const w = col.style.width || col.getAttribute('width');
      if (w) {
        colWidths[idx] = parseDimension(w);
      }
    });

    const trs = table.querySelectorAll('tr');
    let rowIndex = 0;

    trs.forEach(tr => {
      const row = [];
      const cells = tr.querySelectorAll('td, th');

      // Skip rows that are clearly navigation/header chrome
      if (cells.length === 1 && cells[0].querySelector('a, ul, li')) return;

      let colIndex = 0;

      cells.forEach(cell => {
        // Skip cells that are part of a merge (already covered)
        while (row[colIndex] !== undefined) {
          colIndex++;
        }

        const text = getCellText(cell);
        const style = extractCellStyle(cell);
        const isHeader = cell.tagName === 'TH';

        // Handle merged cells
        const colspan = parseInt(cell.getAttribute('colspan')) || 1;
        const rowspan = parseInt(cell.getAttribute('rowspan')) || 1;

        if (colspan > 1 || rowspan > 1) {
          merges.push({
            startRow: rowIndex,
            startCol: colIndex,
            endRow: rowIndex + rowspan - 1,
            endCol: colIndex + colspan - 1,
          });
        }

        // Store value
        row[colIndex] = text;

        // Store formatting
        if (style && Object.keys(style).length > 0) {
          style.isHeader = isHeader;
          formatting[`${rowIndex}-${colIndex}`] = style;
        }

        // Fill merged cell slots with empty strings
        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            if (r === 0 && c === 0) continue;
            const key = `merge-${rowIndex + r}-${colIndex + c}`;
            // Mark these positions as occupied
          }
        }

        colIndex += colspan;
      });

      if (row.length > 0) {
        rows.push(row);
        rowIndex++;
      }
    });

    // Normalize rows to same length
    const maxCols = Math.max(...rows.map(r => r.length), 0);
    rows.forEach(row => {
      while (row.length < maxCols) {
        row.push('');
      }
      // Replace undefined with empty string
      for (let i = 0; i < row.length; i++) {
        if (row[i] === undefined) row[i] = '';
      }
    });

    return {
      rows,
      formatting: {
        cells: formatting,
        merges,
        colWidths,
      },
      sheets,
    };
  }

  /**
   * Extract text content from a cell, handling nested elements.
   */
  function getCellText(cell) {
    // Get text content, preserving line breaks from <br> tags
    const clone = cell.cloneNode(true);

    // Replace <br> with newline markers
    clone.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });

    return (clone.textContent || '').trim();
  }

  /**
   * Extract styling information from a cell element.
   */
  function extractCellStyle(cell) {
    const style = {};
    const cs = cell.style;
    const computed = cell.getAttribute('style') || '';

    // Background color
    const bg = cs.backgroundColor || extractStyleProp(computed, 'background-color') || extractStyleProp(computed, 'background');
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'white' && bg !== '#ffffff' && bg !== 'rgb(255, 255, 255)') {
      style.bgColor = normalizeColor(bg);
    }

    // Font color
    const color = cs.color || extractStyleProp(computed, 'color');
    if (color && color !== 'rgb(0, 0, 0)' && color !== '#000000' && color !== 'black') {
      style.fontColor = normalizeColor(color);
    }

    // Font weight (bold)
    const fw = cs.fontWeight || extractStyleProp(computed, 'font-weight');
    if (fw === 'bold' || fw === '700' || fw === '800' || fw === '900' || parseInt(fw) >= 600) {
      style.bold = true;
    }

    // Font style (italic)
    const fs = cs.fontStyle || extractStyleProp(computed, 'font-style');
    if (fs === 'italic') {
      style.italic = true;
    }

    // Text decoration (underline, strikethrough)
    const td = cs.textDecoration || extractStyleProp(computed, 'text-decoration');
    if (td) {
      if (td.includes('underline')) style.underline = true;
      if (td.includes('line-through')) style.strikethrough = true;
    }

    // Font size
    const fontSize = cs.fontSize || extractStyleProp(computed, 'font-size');
    if (fontSize) {
      const pt = parseFontSize(fontSize);
      if (pt && pt !== 10 && pt !== 11) { // Skip default sizes
        style.fontSize = pt;
      }
    }

    // Font family
    const ff = cs.fontFamily || extractStyleProp(computed, 'font-family');
    if (ff) {
      const cleaned = ff.replace(/['"]/g, '').split(',')[0].trim();
      if (cleaned && cleaned !== 'Arial' && cleaned !== 'sans-serif') {
        style.fontFamily = cleaned;
      }
    }

    // Text alignment
    const ta = cs.textAlign || extractStyleProp(computed, 'text-align');
    if (ta && ta !== 'start' && ta !== 'left') {
      style.alignment = ta; // 'center', 'right', 'justify'
    }

    // Vertical alignment
    const va = cs.verticalAlign || extractStyleProp(computed, 'vertical-align');
    if (va && va !== 'bottom' && va !== 'baseline') {
      style.verticalAlignment = va;
    }

    // Text wrapping
    const ws = cs.whiteSpace || extractStyleProp(computed, 'white-space');
    if (ws === 'normal' || ws === 'pre-wrap') {
      style.wrapText = true;
    }

    // Borders
    const borders = extractBorders(cell);
    if (borders) {
      style.borders = borders;
    }

    return style;
  }

  /**
   * Extract border styles from a cell.
   */
  function extractBorders(cell) {
    const cs = cell.style;
    const borders = {};
    let hasBorder = false;

    ['top', 'right', 'bottom', 'left'].forEach(side => {
      const width = cs[`border${capitalize(side)}Width`];
      const style = cs[`border${capitalize(side)}Style`];
      const color = cs[`border${capitalize(side)}Color`];

      if (width && style && style !== 'none') {
        borders[side] = {
          style: mapBorderStyle(style),
          color: normalizeColor(color) || 'FF000000',
        };
        hasBorder = true;
      }
    });

    return hasBorder ? borders : null;
  }

  /**
   * Map CSS border style to Excel border style name.
   */
  function mapBorderStyle(cssBorder) {
    const map = {
      'solid': 'thin',
      'double': 'double',
      'dashed': 'dashed',
      'dotted': 'dotted',
      'groove': 'thin',
      'ridge': 'thin',
      'inset': 'thin',
      'outset': 'thin',
    };
    return map[cssBorder] || 'thin';
  }

  /**
   * Extract a specific CSS property value from an inline style string.
   */
  function extractStyleProp(styleStr, propName) {
    const regex = new RegExp(`${propName}\\s*:\\s*([^;]+)`, 'i');
    const match = styleStr.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Normalize a CSS color value to ARGB hex (FF + RRGGBB).
   */
  function normalizeColor(colorStr) {
    if (!colorStr) return null;

    const trimmed = colorStr.trim().toLowerCase();

    // Already hex
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        return 'FF' + hex.split('').map(c => c + c).join('');
      }
      if (hex.length === 6) {
        return 'FF' + hex.toUpperCase();
      }
      if (hex.length === 8) {
        return hex.toUpperCase();
      }
      return 'FF' + hex.padEnd(6, '0').toUpperCase();
    }

    // rgb() or rgba()
    const rgbMatch = trimmed.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return ('FF' + r + g + b).toUpperCase();
    }

    // Named colors (common ones)
    const namedColors = {
      'red': 'FFFF0000', 'green': 'FF008000', 'blue': 'FF0000FF',
      'yellow': 'FFFFFF00', 'orange': 'FFFFA500', 'purple': 'FF800080',
      'white': 'FFFFFFFF', 'black': 'FF000000', 'gray': 'FF808080',
      'grey': 'FF808080', 'cyan': 'FF00FFFF', 'magenta': 'FFFF00FF',
      'pink': 'FFFFC0CB', 'brown': 'FFA52A2A', 'navy': 'FF000080',
      'teal': 'FF008080', 'maroon': 'FF800000', 'olive': 'FF808000',
      'lime': 'FF00FF00', 'aqua': 'FF00FFFF', 'silver': 'FFC0C0C0',
      'gold': 'FFFFD700', 'indigo': 'FF4B0082', 'coral': 'FFFF7F50',
    };

    return namedColors[trimmed] || null;
  }

  /**
   * Convert CSS font-size to Excel point size.
   */
  function parseFontSize(sizeStr) {
    if (!sizeStr) return null;

    const pxMatch = sizeStr.match(/([\d.]+)px/);
    if (pxMatch) {
      return Math.round(parseFloat(pxMatch[1]) * 0.75); // px to pt
    }

    const ptMatch = sizeStr.match(/([\d.]+)pt/);
    if (ptMatch) {
      return Math.round(parseFloat(ptMatch[1]));
    }

    const emMatch = sizeStr.match(/([\d.]+)em/);
    if (emMatch) {
      return Math.round(parseFloat(emMatch[1]) * 11); // Assume base 11pt
    }

    return null;
  }

  /**
   * Parse a CSS dimension to a number (for column widths).
   */
  function parseDimension(dimStr) {
    if (!dimStr) return null;
    const num = parseFloat(dimStr);
    return isNaN(num) ? null : num;
  }

  /**
   * Capitalize the first letter of a string.
   */
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Detect sheet tab names from a parsed HTML document.
   */
  function detectSheetsFromDoc(doc) {
    const sheets = [];

    // Look for sheet menu
    const menuItems = doc.querySelectorAll('#sheet-menu li a, [id*="sheet-button"] a');
    menuItems.forEach(link => {
      const name = link.textContent.trim();
      const href = link.getAttribute('href') || '';
      const gidMatch = href.match(/gid=(\d+)/);
      if (name) {
        sheets.push({ name, gid: gidMatch ? gidMatch[1] : '0' });
      }
    });

    return sheets;
  }

  /**
   * Detect the data type of a cell value and return a typed value.
   */
  function detectDataType(value) {
    if (value === null || value === undefined || value === '') {
      return { type: 'empty', value: '' };
    }

    const trimmed = String(value).trim();

    // Check for number (including negative and decimals)
    if (/^-?[\d,]+\.?\d*$/.test(trimmed)) {
      const num = parseFloat(trimmed.replace(/,/g, ''));
      if (!isNaN(num)) {
        return { type: 'number', value: num };
      }
    }

    // Check for percentage
    if (/^-?[\d.]+%$/.test(trimmed)) {
      const pct = parseFloat(trimmed) / 100;
      if (!isNaN(pct)) {
        return { type: 'percentage', value: pct };
      }
    }

    // Check for currency (common symbols)
    const currencyMatch = trimmed.match(/^[$€£¥₹]?\s*-?[\d,]+\.?\d*\s*[$€£¥₹]?$/);
    if (currencyMatch) {
      const num = parseFloat(trimmed.replace(/[^0-9.-]/g, ''));
      if (!isNaN(num)) {
        return { type: 'currency', value: num };
      }
    }

    // Check for date patterns
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(trimmed) ||
        /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(trimmed)) {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return { type: 'date', value: date };
      }
    }

    // Boolean
    if (trimmed.toLowerCase() === 'true') return { type: 'boolean', value: true };
    if (trimmed.toLowerCase() === 'false') return { type: 'boolean', value: false };

    // Default: string
    return { type: 'string', value: trimmed };
  }

  // ── Public API ──
  return {
    parseGvizHtml,
    parseHtmlView,
    parseTable,
    extractCellStyle,
    normalizeColor,
    detectDataType,
  };
})();
