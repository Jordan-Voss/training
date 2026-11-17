import type {
  Exercise,
  ParsedPrescription,
  PrescriptionVersion,
  SourceCell,
  SourceMapping,
  TrainingDay,
} from './model';
export type Cell = {
  formattedValue?: string;
  userEnteredValue?: {
    stringValue?: string;
    numberValue?: number;
    boolValue?: boolean;
    formulaValue?: string;
  };
  effectiveValue?: { stringValue?: string; numberValue?: number; boolValue?: boolean };
  effectiveFormat?: { numberFormat?: { type?: string; pattern?: string } };
  userEnteredFormat?: { numberFormat?: { type?: string; pattern?: string } };
  dataValidation?: unknown;
  note?: string;
  hyperlink?: string;
};
export type Grid = { startRow?: number; startColumn?: number; rowData?: { values?: Cell[] }[] };
export type Sheet = {
  properties: {
    sheetId: number;
    title: string;
    hidden?: boolean;
    gridProperties?: { rowCount: number; columnCount: number };
  };
  data?: Grid[];
};
export type Workbook = {
  spreadsheetId: string;
  properties: { title: string; locale?: string; timeZone?: string };
  sheets: Sheet[];
};
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export const ATHLETE_MARKER = '\n\n—— Training athlete notes ——\n';
export function parsePrescription(original: string): ParsedPrescription {
  const text = original
    .trim()
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/\s/g, '');
  if (!text) return { review: 'No prescription supplied.' };
  let m = text.match(/^(?:(\d+)(?:-(\d+))?x)?(\d+)(?:-(\d+))?(s|sec|m|min)?$/);
  if (m) {
    const [, sets, setsMax, count, countMax, unit] = m;
    const result: ParsedPrescription = {
      ...(sets ? { sets: Number(sets) } : {}),
      ...(setsMax ? { setsMax: Number(setsMax) } : {}),
    };
    if (unit === 's' || unit === 'sec' || unit === 'min') {
      result.durationSeconds = Number(count) * (unit === 'min' ? 60 : 1);
      if (countMax) result.durationMaxSeconds = Number(countMax) * (unit === 'min' ? 60 : 1);
    } else if (unit === 'm') {
      result.distanceMetres = Number(count);
      if (countMax) result.review = 'Distance range retained for review.';
    } else {
      result.reps = Number(count);
      if (countMax) result.repsMax = Number(countMax);
    }
    if (
      (result.setsMax !== undefined && result.setsMax < result.sets!) ||
      (result.repsMax !== undefined && result.repsMax < result.reps!)
    )
      return { review: 'Range order needs review.' };
    return result;
  }
  m = text.match(/^(?:(\d+)(?:-(\d+))?x)?amrap$/);
  if (m)
    return {
      amrap: true,
      ...(m[1] ? { sets: Number(m[1]) } : {}),
      ...(m[2] ? { setsMax: Number(m[2]) } : {}),
    };
  return {
    review: 'Original prescription retained. Confirm its structure before using numeric targets.',
  };
}
export function cellText(cell?: Cell) {
  return (
    cell?.formattedValue ??
    cell?.effectiveValue?.stringValue ??
    cell?.userEnteredValue?.stringValue ??
    (cell?.effectiveValue?.numberValue ?? cell?.userEnteredValue?.numberValue)?.toString() ??
    ''
  );
}
export function provenance(cell: Cell, a1: string): SourceCell {
  return {
    a1,
    display: cellText(cell),
    raw:
      cell.userEnteredValue?.stringValue ??
      cell.userEnteredValue?.numberValue ??
      cell.userEnteredValue?.boolValue,
    formula: cell.userEnteredValue?.formulaValue,
    numberFormat: cell.effectiveFormat?.numberFormat ?? cell.userEnteredFormat?.numberFormat,
    validation: cell.dataValidation,
    note: cell.note,
  };
}
export function flatten(sheet: Sheet): Map<number, Cell[]> {
  const rows = new Map<number, Cell[]>();
  for (const g of sheet.data ?? [])
    for (const [i, r] of (g.rowData ?? []).entries()) {
      const out = rows.get((g.startRow ?? 0) + i + 1) ?? [];
      for (const [j, c] of (r.values ?? []).entries()) out[(g.startColumn ?? 0) + j] = c;
      rows.set((g.startRow ?? 0) + i + 1, out);
    }
  return rows;
}
export async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export function coachInputText(sheet: Sheet) {
  // Excludes athlete top-set results F, completion L and formula-derived back-off H.
  // Notes before the application's explicit marker remain coach-owned, even if mixed legacy results.
  return JSON.stringify(
    [...flatten(sheet)].map(([row, cells]) => ({
      row,
      cells: [1, 2, 3, 4, 6, 8, 9, 10].map((col) => {
        const c = cells[col];
        return {
          col,
          input:
            c?.userEnteredValue?.formulaValue ??
            (col === 10
              ? cellText(c).split(ATHLETE_MARKER)[0]
              : (c?.userEnteredValue ?? cellText(c))),
          format: c?.effectiveFormat?.numberFormat,
          validation: c?.dataValidation,
        };
      }),
      header: row <= 4 ? cells.map((c) => c.userEnteredValue ?? cellText(c)) : undefined,
    })),
  );
}
export async function importSheet(
  workbook: Workbook,
  sheetId: number,
  context: {
    blockId: string;
    versionId: string;
    generation: string;
    round: number;
    now: string;
    allowHidden?: boolean;
  },
): Promise<PrescriptionVersion> {
  const sheet = workbook.sheets.find((s) => s.properties.sheetId === sheetId);
  if (!sheet) throw new Error('Selected sheet no longer exists.');
  if (sheet.properties.hidden && !context.allowHidden)
    throw new Error('Hidden sources require an explicit reviewed mapping.');
  const rows = flatten(sheet);
  const days: TrainingDay[] = [];
  let current: TrainingDay | undefined;
  for (const [row, cells] of rows) {
    const label = cellText(cells[1]).trim();
    const day = label.match(/^DAY\s+(\d+)$/i);
    if (day) {
      current = {
        id: `sheet-${sheetId}-day-${day[1]}`,
        day: Number(day[1]),
        title: `Day ${day[1]}`,
        sport: 'strength',
        exercises: [],
      };
      days.push(current);
      continue;
    }
    const name = cellText(cells[2]).trim();
    if (!current || !name || name === 'EXERCISE' || !/^[A-Z]\d?$/.test(label)) continue;
    const prescription = cellText(cells[3]);
    const notes = cellText(cells[10]);
    const rpe = cellText(cells[4]);
    const fraction =
      cells[6]?.effectiveValue?.numberValue ?? cells[6]?.userEnteredValue?.numberValue;
    const formula = cells[7]?.userEnteredValue?.formulaValue;
    const increment = formula?.match(/MROUND\([^,]+,\s*([\d.]+)\s*\)/i)?.[1];
    const back = cellText(cells[8]);
    const review: string[] = [];
    if (
      (cells[4]?.effectiveFormat?.numberFormat ?? cells[4]?.userEnteredFormat?.numberFormat)
        ?.type === 'DATE'
    )
      review.push('RPE is stored as a date; displayed text is preserved for review.');
    if (name.includes('/'))
      review.push('Exercise choice or complex is ambiguous. No complex components inferred.');
    if (notes)
      review.push(
        'Source notes may mix coach instructions and legacy athlete results. Original text preserved.',
      );
    if (fraction !== undefined && back && (!increment || !formula))
      review.push('Back-off rounding rule is unverified; calculation disabled.');
    const exercise: Exercise = {
      id: `sheet-${sheetId}-row-${row}`,
      name,
      order: label,
      sport: /rower|cardio/i.test(name) ? 'rowing' : 'strength',
      prescription,
      parsed: parsePrescription(prescription),
      rpe: rpe || undefined,
      coachNotes: notes.split(ATHLETE_MARKER)[0] || undefined,
      review: review.join(' ') || undefined,
      backoff:
        fraction !== undefined && fraction > 0 && fraction <= 1 && back && increment
          ? {
              fraction,
              increment: Number(increment),
              prescription: back,
              parsed: parsePrescription(back),
              formula,
            }
          : undefined,
      source: {
        workbookId: workbook.spreadsheetId,
        sheetId,
        row,
        cells: cells.map((c, col) => provenance(c ?? {}, `${String.fromCharCode(65 + col)}${row}`)),
        legacyTopWeight: cells[5]?.effectiveValue?.numberValue,
        legacyNotes: notes || undefined,
      },
    };
    current.exercises.push(exercise);
  }
  if (!days.length)
    throw new Error('No verified numbered training days found in the selected range.');
  const fingerprint = await sha256(coachInputText(sheet));
  return {
    id: context.versionId,
    blockId: context.blockId,
    title: workbook.properties.title,
    acceptedAt: context.now,
    digest: fingerprint,
    origin: 'sheets',
    days,
    source: {
      workbookId: workbook.spreadsheetId,
      sheetId,
      title: sheet.properties.title,
      range: `A1:N${sheet.properties.gridProperties?.rowCount ?? 166}`,
      fingerprint,
      generation: context.generation,
      round: context.round,
      verified: false,
      writebackEnabled: false,
    },
  };
}
export type SheetWrite = {
  id: string;
  blockId: string;
  round: number;
  sessionId: string;
  mapping: SourceMapping;
  row: number;
  exerciseName: string;
  expectedTop: string;
  expectedNotes: string;
  top?: number;
  notes?: string;
};
export type Destination = {
  mapping: SourceMapping;
  coachFingerprint: string;
  exerciseName: string;
  top: Cell;
  notes: Cell;
};
export function planWrite(
  job: SheetWrite,
  destination: Destination,
): { top?: number; notes?: string; alreadyApplied: boolean } {
  const m = destination.mapping;
  if (!job.mapping.verified || !job.mapping.writebackEnabled || !m.verified || !m.writebackEnabled)
    throw new Error('Writeback is not enabled for this reviewed mapping.');
  if (
    job.blockId !== m.generation ||
    job.mapping.generation !== m.generation ||
    job.round !== m.round ||
    job.mapping.sheetId !== m.sheetId ||
    job.mapping.workbookId !== m.workbookId ||
    job.mapping.fingerprint !== destination.coachFingerprint ||
    destination.exerciseName !== job.exerciseName
  )
    throw new Error('Stale destination. Result held for reconciliation.');
  if (
    destination.top.userEnteredValue?.formulaValue ||
    destination.notes.userEnteredValue?.formulaValue
  )
    throw new Error('Formula destination is protected.');
  const desiredNotes = job.notes
    ? `${job.expectedNotes.split(ATHLETE_MARKER)[0]}${ATHLETE_MARKER}Round ${job.round} · ${job.sessionId}\n${job.notes}`
    : undefined;
  const top = cellText(destination.top);
  const notes = cellText(destination.notes);
  const desiredTop = job.top === undefined ? undefined : String(job.top);
  const topNumeric =
    destination.top.effectiveValue?.numberValue ?? destination.top.userEnteredValue?.numberValue;
  const topApplied = desiredTop === undefined || topNumeric === job.top;
  const notesApplied = desiredNotes === undefined || notes === desiredNotes;
  if (topApplied && notesApplied) return { alreadyApplied: true };
  if (
    desiredTop !== undefined &&
    top.trim() &&
    !notes.includes(`Round ${job.round} · ${job.sessionId}\n`)
  )
    throw new Error(
      'An existing result conflicts with this session. Result held for reconciliation.',
    );
  if ((!topApplied && top !== job.expectedTop) || (!notesApplied && notes !== job.expectedNotes))
    throw new Error('A human changed the destination. Result held for reconciliation.');
  return { top: job.top, notes: desiredNotes, alreadyApplied: false };
}
