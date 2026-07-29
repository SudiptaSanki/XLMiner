/**
 * XLMiner — Excel Builder Module
 *
 * Uses ExcelJS to generate .xlsx files from extracted data + formatting.
 * Handles: cell values, typed data, fonts, fills, borders, merges, col widths.
 */

const XLExcelBuilder = (() => {
  'use strict';

  /**
   * Build an Excel workbook from extraction results.
   * @param {Object} extractionResult - Result from XLExtractor.extract()
   * @param {string} sheetName - Name for the worksheet
   * @returns {Promise<Blob>} The generated .xlsx file as a Blob
   */
  async function build(extractionResult, sheetName = 'Sheet1') {
    // If we got a direct blob (Strategy 1), return it as-is
    if (extractionResult.type === 'blob') {
      return extractionResult.data;
    }

    const { rows, formatting } = extractionResult;
    if (!rows || rows.length === 0) {
      throw new Error('No data to export.');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'XLMiner';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(sheetName, {
      properties: { defaultColWidth: 15 },
    });

    // ── Apply Column Widths ──
    if (formatting?.colWidths) {
      formatting.colWidths.forEach((width, idx) => {
        if (width) {
          // Convert px to Excel character width (approx: px / 7.5)
          worksheet.getColumn(idx + 1).width = Math.max(Math.round(width / 7.5), 8);
        }
      });
    }

    // ── Populate Cells ──
    rows.forEach((row, rowIdx) => {
      const excelRow = worksheet.getRow(rowIdx + 1);

      row.forEach((cellValue, colIdx) => {
        const cell = excelRow.getCell(colIdx + 1);

        // Detect and set typed value
        const typed = XLFormatter.detectDataType(cellValue);
        switch (typed.type) {
          case 'number':
          case 'currency':
            cell.value = typed.value;
            if (typed.type === 'currency') {
              cell.numFmt = '$#,##0.00';
            }
            break;
          case 'percentage':
            cell.value = typed.value;
            cell.numFmt = '0.00%';
            break;
          case 'date':
            cell.value = typed.value;
            cell.numFmt = 'yyyy-mm-dd';
            break;
          case 'boolean':
            cell.value = typed.value;
            break;
          default:
            cell.value = typed.value;
            break;
        }

        // Apply formatting if available
        if (formatting?.cells) {
          const cellFmt = formatting.cells[`${rowIdx}-${colIdx}`];
          if (cellFmt) {
            applyCellFormatting(cell, cellFmt);
          }
        }
      });

      excelRow.commit();
    });

    // ── Apply Merged Cells ──
    if (formatting?.merges) {
      formatting.merges.forEach(merge => {
        try {
          worksheet.mergeCells(
            merge.startRow + 1,
            merge.startCol + 1,
            merge.endRow + 1,
            merge.endCol + 1
          );
        } catch (e) {
          // Skip invalid merges (overlapping, etc.)
          console.warn('Skipping invalid merge:', merge, e.message);
        }
      });
    }

    // ── Auto-fit columns that don't have explicit widths ──
    autoFitColumns(worksheet, rows, formatting?.colWidths);

    // ── Generate file ──
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /**
   * Build a multi-sheet workbook from multiple extraction results.
   * @param {Array<{name: string, result: Object}>} sheets
   * @returns {Promise<Blob>}
   */
  async function buildMultiSheet(sheets) {
    // Check if any sheet is a direct blob — if so, return the first one
    const blobSheet = sheets.find(s => s.result.type === 'blob');
    if (blobSheet) {
      return blobSheet.result.data;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'XLMiner';
    workbook.created = new Date();

    for (const sheet of sheets) {
      const { rows, formatting } = sheet.result;
      if (!rows || rows.length === 0) continue;

      const worksheet = workbook.addWorksheet(sheet.name, {
        properties: { defaultColWidth: 15 },
      });

      // Apply column widths
      if (formatting?.colWidths) {
        formatting.colWidths.forEach((width, idx) => {
          if (width) {
            worksheet.getColumn(idx + 1).width = Math.max(Math.round(width / 7.5), 8);
          }
        });
      }

      // Populate cells
      rows.forEach((row, rowIdx) => {
        const excelRow = worksheet.getRow(rowIdx + 1);
        row.forEach((cellValue, colIdx) => {
          const cell = excelRow.getCell(colIdx + 1);
          const typed = XLFormatter.detectDataType(cellValue);

          switch (typed.type) {
            case 'number':
            case 'currency':
              cell.value = typed.value;
              if (typed.type === 'currency') cell.numFmt = '$#,##0.00';
              break;
            case 'percentage':
              cell.value = typed.value;
              cell.numFmt = '0.00%';
              break;
            case 'date':
              cell.value = typed.value;
              cell.numFmt = 'yyyy-mm-dd';
              break;
            case 'boolean':
              cell.value = typed.value;
              break;
            default:
              cell.value = typed.value;
          }

          if (formatting?.cells) {
            const cellFmt = formatting.cells[`${rowIdx}-${colIdx}`];
            if (cellFmt) applyCellFormatting(cell, cellFmt);
          }
        });
        excelRow.commit();
      });

      // Merges
      if (formatting?.merges) {
        formatting.merges.forEach(merge => {
          try {
            worksheet.mergeCells(
              merge.startRow + 1, merge.startCol + 1,
              merge.endRow + 1, merge.endCol + 1
            );
          } catch (e) {
            console.warn('Skipping merge:', e.message);
          }
        });
      }

      autoFitColumns(worksheet, rows, formatting?.colWidths);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /**
   * Apply formatting to a single ExcelJS cell.
   */
  function applyCellFormatting(cell, fmt) {
    // Font
    const font = {};
    let hasFont = false;

    if (fmt.bold) { font.bold = true; hasFont = true; }
    if (fmt.italic) { font.italic = true; hasFont = true; }
    if (fmt.underline) { font.underline = true; hasFont = true; }
    if (fmt.strikethrough) { font.strike = true; hasFont = true; }
    if (fmt.fontColor) {
      font.color = { argb: fmt.fontColor };
      hasFont = true;
    }
    if (fmt.fontSize) {
      font.size = fmt.fontSize;
      hasFont = true;
    }
    if (fmt.fontFamily) {
      font.name = fmt.fontFamily;
      hasFont = true;
    }

    if (hasFont) {
      cell.font = font;
    }

    // Fill (background color)
    if (fmt.bgColor) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fmt.bgColor },
      };
    }

    // Alignment
    const alignment = {};
    let hasAlignment = false;

    if (fmt.alignment) {
      alignment.horizontal = fmt.alignment;
      hasAlignment = true;
    }
    if (fmt.verticalAlignment) {
      const vaMap = { top: 'top', middle: 'middle', bottom: 'bottom' };
      alignment.vertical = vaMap[fmt.verticalAlignment] || 'bottom';
      hasAlignment = true;
    }
    if (fmt.wrapText) {
      alignment.wrapText = true;
      hasAlignment = true;
    }

    if (hasAlignment) {
      cell.alignment = alignment;
    }

    // Borders
    if (fmt.borders) {
      const border = {};
      ['top', 'right', 'bottom', 'left'].forEach(side => {
        if (fmt.borders[side]) {
          border[side] = {
            style: fmt.borders[side].style || 'thin',
            color: { argb: fmt.borders[side].color || 'FF000000' },
          };
        }
      });
      cell.border = border;
    }

    // Header styling (bold + slightly larger + bottom border)
    if (fmt.isHeader) {
      cell.font = {
        ...cell.font,
        bold: true,
        size: cell.font?.size || 11,
      };
      cell.border = {
        ...cell.border,
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
      };
    }
  }

  /**
   * Auto-fit column widths based on content.
   */
  function autoFitColumns(worksheet, rows, existingWidths) {
    if (!rows || rows.length === 0) return;

    const maxCols = Math.max(...rows.map(r => r.length));

    for (let colIdx = 0; colIdx < maxCols; colIdx++) {
      // Skip if already has an explicit width
      if (existingWidths && existingWidths[colIdx]) continue;

      let maxLen = 8; // Minimum width
      rows.forEach(row => {
        const val = row[colIdx];
        if (val) {
          const len = String(val).length;
          maxLen = Math.max(maxLen, Math.min(len + 2, 50)); // Cap at 50
        }
      });

      worksheet.getColumn(colIdx + 1).width = maxLen;
    }
  }

  /**
   * Get file size in a human-readable format.
   */
  function formatFileSize(blob) {
    const bytes = blob.size;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /**
   * Trigger a browser download for a Blob.
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── Public API ──
  return {
    build,
    buildMultiSheet,
    downloadBlob,
    formatFileSize,
  };
})();
