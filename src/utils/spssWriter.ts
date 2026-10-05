/**
 * SPSS System File (.sav) binary writer.
 * Format reference: GNU PSPP system file documentation and IBM SPSS format specification.
 * Writes uncompressed SPSS system files readable by IBM SPSS Statistics 22+.
 */

const enc = new TextEncoder();
const SPSS_SYSMIS = -Number.MAX_VALUE; // System-missing: -DBL_MAX

// ─── Byte writer ────────────────────────────────────────────────────────────

class SavWriter {
  private chunks: Uint8Array[] = [];
  private len = 0;

  append(data: Uint8Array): void {
    this.chunks.push(data);
    this.len += data.length;
  }

  i32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true);
    this.append(b);
  }

  f64(v: number): void {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    this.append(b);
  }

  /** Write exactly `len` bytes: encode `s` as UTF-8, pad/truncate to `len` with spaces. */
  str(s: string, len: number): void {
    const b = new Uint8Array(len).fill(0x20);
    const coded = enc.encode(s);
    b.set(coded.subarray(0, len));
    this.append(b);
  }

  zeros(n: number): void {
    this.append(new Uint8Array(n));
  }

  build(): Uint8Array {
    const out = new Uint8Array(this.len);
    let p = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, p);
      p += chunk.length;
    }
    return out;
  }
}

// ─── Variable name sanitization ──────────────────────────────────────────────

/**
 * Returns a sanitized pair: `short` (≤8 chars, uppercase, SPSS-safe for the file record)
 * and `full` (sanitized long name for the type-13 extended-names record).
 * Guarantees uniqueness via `usedNames`.
 */
export function sanitizeSpssVarName(
  name: string,
  index: number,
  usedNames: Set<string>,
): { short: string; full: string } {
  // Remove diacritics, replace invalid chars, collapse underscores
  const cleaned = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+/, '');

  const full =
    (cleaned && /^[A-Za-z]/.test(cleaned) ? cleaned : `V${cleaned}`)
      .substring(0, 64) || `VAR${String(index + 1).padStart(3, '0')}`;

  let base = full.toUpperCase().substring(0, 8);
  if (!/^[A-Z]/.test(base)) base = `V${base}`.substring(0, 8);

  let short = base;
  if (usedNames.has(short)) {
    for (let s = 2; s < 10000; s++) {
      const suf = String(s);
      const candidate = `${base.substring(0, 8 - suf.length)}${suf}`;
      if (!usedNames.has(candidate)) {
        short = candidate;
        break;
      }
    }
  }
  usedNames.add(short);
  return { short, full };
}

// ─── Type inference ───────────────────────────────────────────────────────────

interface SpssTypeInfo {
  isString: boolean;
  /** For strings: byte width (multiple of 8, 8–120). For numerics: 0. */
  stringWidth: number;
  /** SPSS format type code: 5=F (numeric), 1=A (string). */
  formatType: number;
  /** Decimal places for numeric variables. */
  formatDecimals: number;
}

function inferSpssType(header: string, values: (string | number)[]): SpssTypeInfo {
  // Explicitly numeric column name patterns
  const numericPattern =
    /^(score_|nivel_|IEXPAC|Morisky|EQ5D_vas|edad|visit_number|n_|weight_|height_|bmi|waist_|ldl_|hdl_|non_hdl_|fasting_|hba1c_|score2_|framingham_|diet_|adverse_|chronic_|delta_|polypharmacy$|active_medications_count$|linked_to_cmo_level$|systolic_|diastolic_|heart_rate$|is_active$|high_risk_medication_present$|n_intervenciones$)/;

  if (numericPattern.test(header)) {
    const hasDecimals = values.some((v) => {
      const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
      return Number.isFinite(n) && n !== Math.floor(n);
    });
    return { isString: false, stringWidth: 0, formatType: 5, formatDecimals: hasDecimals ? 2 : 0 };
  }

  // Heuristic: if all non-empty values parse as finite numbers, treat as numeric
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '');
  const allNumeric =
    nonEmpty.length > 0 &&
    nonEmpty.every((v) => {
      if (typeof v === 'number') return Number.isFinite(v);
      const s = String(v).trim();
      return s !== '' && !isNaN(Number(s));
    });

  if (allNumeric) {
    const hasDecimals = nonEmpty.some((v) => {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) && n !== Math.floor(n);
    });
    return { isString: false, stringWidth: 0, formatType: 5, formatDecimals: hasDecimals ? 2 : 0 };
  }

  // String variable: determine width from actual data
  const maxBytes = Math.max(8, ...nonEmpty.map((v) => enc.encode(String(v)).length));
  const capped = Math.min(120, maxBytes);
  const stringWidth = Math.ceil(capped / 8) * 8; // round up to 8-byte boundary
  return { isString: true, stringWidth, formatType: 1, formatDecimals: 0 };
}

// ─── Variable spec ────────────────────────────────────────────────────────────

interface SpssVar {
  shortName: string;
  fullName: string;
  label: string;
  isString: boolean;
  stringWidth: number;
  formatType: number;
  formatWidth: number;
  formatDecimals: number;
  valueLabels: Record<string, string>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a binary SPSS System File (.sav) from row data.
 *
 * @param headers     Ordered column names matching keys in `rows`.
 * @param varLabels   Human-readable variable labels keyed by column name.
 * @param valLabels   Value label maps: `{ colName: { '0': 'No', '1': 'Sí' } }`.
 * @param rows        Data rows (values already normalized: string | number).
 * @param fileLabel   Up to 64-character file description label.
 */
export function buildSavFile(
  headers: string[],
  varLabels: Record<string, string>,
  valLabels: Record<string, Record<string, string>>,
  rows: Record<string, string | number>[],
  fileLabel: string,
): Uint8Array {
  const usedNames = new Set<string>();

  // Build variable specs
  const vars: SpssVar[] = headers.map((h, idx) => {
    const { short, full } = sanitizeSpssVarName(h, idx, usedNames);
    const colValues = rows.map((r) => r[h]);
    const typeInfo = inferSpssType(h, colValues);

    return {
      shortName: short,
      fullName: full,
      label: (varLabels[h] ?? h).substring(0, 255),
      isString: typeInfo.isString,
      stringWidth: typeInfo.stringWidth,
      formatType: typeInfo.formatType,
      formatWidth: typeInfo.isString ? typeInfo.stringWidth : 8,
      formatDecimals: typeInfo.formatDecimals,
      valueLabels: valLabels[h] ?? {},
    };
  });

  // Total 8-byte OBS per case (for file header and data layout)
  const nomCaseSize = vars.reduce(
    (sum, v) => sum + (v.isString ? Math.ceil(v.stringWidth / 8) : 1),
    0,
  );

  const w = new SavWriter();

  // ══ Record 1: File Header (176 bytes) ══════════════════════════════════════
  const now = new Date();
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dateStr = `${String(now.getDate()).padStart(2, '0')} ${MON[now.getMonth()]} ${String(now.getFullYear()).slice(-2)}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  w.str('$FL2', 4);                                               // magic
  w.str('@(#) IBM SPSS STATISTICS 64-bit SAV Data File', 60);    // product name
  w.i32(2);                                                        // layout code
  w.i32(nomCaseSize);                                              // OBS per case
  w.i32(0);                                                        // compression: none
  w.i32(0);                                                        // weight index: none
  w.i32(rows.length);                                              // n_cases
  w.f64(100.0);                                                    // bias
  w.str(dateStr, 9);                                               // creation date
  w.str(timeStr, 8);                                               // creation time
  w.str(fileLabel.substring(0, 64), 64);                          // file label
  w.zeros(3);                                                      // padding

  // ══ Records 2: Variable records ════════════════════════════════════════════
  // fileVarIndex tracks the 1-based position of each variable in the file
  // (including continuation records), needed for value-label index records.
  const fileVarIndex = new Map<string, number>(); // shortName → 1-based idx
  let fvi = 1;

  for (const v of vars) {
    fileVarIndex.set(v.shortName, fvi);

    const packFmt = (v.formatType << 16) | (v.formatWidth << 8) | v.formatDecimals;
    const labelBytes = enc.encode(v.label);
    const hasLabel = labelBytes.length > 0 ? 1 : 0;

    w.i32(2);                                  // rec_type = 2
    w.i32(v.isString ? v.stringWidth : 0);    // type_code (0=numeric, N=string width)
    w.i32(hasLabel);                           // has_var_label
    w.i32(0);                                  // n_missing_values
    w.i32(packFmt);                            // print format
    w.i32(packFmt);                            // write format
    w.str(v.shortName.padEnd(8, ' '), 8);     // name (right-padded to 8 bytes)
    fvi++;

    if (hasLabel) {
      // label_len (int32) + label text padded to 4-byte boundary with spaces
      const padLen = Math.ceil(labelBytes.length / 4) * 4;
      const block = new Uint8Array(4 + padLen).fill(0x20);
      new DataView(block.buffer).setInt32(0, labelBytes.length, true);
      block.set(labelBytes, 4);
      w.append(block);
    }

    // Continuation records for wide strings (one per additional 8-byte segment)
    if (v.isString) {
      const nCont = Math.ceil(v.stringWidth / 8) - 1;
      for (let ci = 0; ci < nCont; ci++) {
        w.i32(2);       // rec_type = 2
        w.i32(-1);      // type_code = -1 (continuation)
        w.i32(0);       // no label
        w.i32(0);       // no missing
        w.i32(packFmt); // print format (same as parent)
        w.i32(packFmt); // write format
        w.str('        ', 8); // blank name
        fvi++;
      }
    }
  }

  // ══ Records 3+4: Value labels ═══════════════════════════════════════════════
  for (const v of vars) {
    const entries = Object.entries(v.valueLabels);
    if (entries.length === 0) continue;

    const idx = fileVarIndex.get(v.shortName);
    if (idx === undefined) continue;

    // Record type 3: value labels
    w.i32(3);
    w.i32(entries.length);
    for (const [rawVal, label] of entries) {
      // 8-byte value slot
      if (v.isString) {
        w.str(rawVal, 8);
      } else {
        const numVal = parseFloat(rawVal);
        w.f64(Number.isFinite(numVal) ? numVal : SPSS_SYSMIS);
      }
      // 1-byte length + label text, padded to 8-byte boundary with spaces
      const lblBytes = enc.encode(label.substring(0, 60));
      const totalPad = Math.ceil((1 + lblBytes.length) / 8) * 8;
      const block = new Uint8Array(totalPad).fill(0x20);
      block[0] = lblBytes.length;
      block.set(lblBytes, 1);
      w.append(block);
    }

    // Record type 4: variable index for the preceding value labels
    w.i32(4);
    w.i32(1);
    w.i32(idx);
  }

  // ══ Record 7 subtype 3: Machine integer info ════════════════════════════════
  w.i32(7); w.i32(3); w.i32(4); w.i32(8);
  w.i32(21);    // version_major
  w.i32(0);     // version_minor
  w.i32(0);     // version_revision
  w.i32(-1);    // machine_code (unknown)
  w.i32(1);     // floating_point = IEEE 754
  w.i32(0);     // compression = none
  w.i32(2);     // endianness = 2 (little-endian)
  w.i32(65001); // character_code = UTF-8

  // ══ Record 7 subtype 4: Machine float info ══════════════════════════════════
  w.i32(7); w.i32(4); w.i32(8); w.i32(3);
  w.f64(SPSS_SYSMIS);       // system-missing sentinel
  w.f64(Number.MAX_VALUE);  // highest value (used in MISSING ranges)
  w.f64(-Number.MAX_VALUE); // lowest value (same as SYSMIS in practice)

  // ══ Record 7 subtype 11: Variable display parameters ═══════════════════════
  // One triplet (measure, width, alignment) per actual variable (not continuations).
  w.i32(7); w.i32(11); w.i32(4); w.i32(vars.length * 3);
  for (const v of vars) {
    w.i32(v.isString ? 1 : 3); // measure: 1=nominal, 3=scale
    w.i32(v.formatWidth);      // display width
    w.i32(v.isString ? 0 : 1); // alignment: 0=left, 1=right
  }

  // ══ Record 7 subtype 13: Long variable names ════════════════════════════════
  // Required whenever any full name differs from its 8-char short name.
  const longNamePairs = vars
    .filter((v) => v.fullName !== v.shortName)
    .map((v) => `${v.shortName}=${v.fullName}`);

  if (longNamePairs.length > 0) {
    const content = enc.encode(longNamePairs.join('\t'));
    w.i32(7); w.i32(13); w.i32(1); w.i32(content.length);
    w.append(content);
  }

  // ══ Record 999: End of headers ══════════════════════════════════════════════
  w.i32(999);
  w.i32(0);

  // ══ Data records (uncompressed) ═════════════════════════════════════════════
  for (const row of rows) {
    for (let vi = 0; vi < vars.length; vi++) {
      const v = vars[vi];
      const raw = row[headers[vi]];

      if (v.isString) {
        // Write string padded to stringWidth bytes (= obsCount × 8 bytes)
        const obsCount = Math.ceil(v.stringWidth / 8);
        const totalBytes = obsCount * 8;
        const strData = new Uint8Array(totalBytes).fill(0x20);
        if (raw !== null && raw !== undefined && raw !== '') {
          const coded = enc.encode(String(raw));
          strData.set(coded.subarray(0, Math.min(coded.length, v.stringWidth)));
        }
        w.append(strData);
      } else {
        // Write 8-byte IEEE 754 double, SYSMIS for missing/invalid
        if (raw === null || raw === undefined || raw === '') {
          w.f64(SPSS_SYSMIS);
        } else {
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
          w.f64(Number.isFinite(num) ? num : SPSS_SYSMIS);
        }
      }
    }
  }

  return w.build();
}
