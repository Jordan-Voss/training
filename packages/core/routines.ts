import type { Exercise, PrescriptionVersion, TrainingDay } from './model';
import { flatten, parsePrescription, provenance, sha256, cellText, type Workbook } from './sheets';
export async function importRoutines(
  workbook: Workbook,
  sheetId: number,
  versionId: string,
  now: string,
): Promise<PrescriptionVersion> {
  const sheet = workbook.sheets.find(
    (s) => s.properties.sheetId === sheetId && !s.properties.hidden,
  );
  if (!sheet) throw new Error('Choose a visible verified routine tab.');
  const rows = flatten(sheet);
  const days: TrainingDay[] = [];
  const make = (
    name: string,
    prescription: string,
    row: number,
    col: number,
    kind: 'warmup' | 'working',
  ): Exercise => ({
    id: `routine-${sheetId}-${row}-${col}-${name}`,
    name,
    order: '',
    sport: 'plyometrics',
    prescription,
    defaultSetKind: kind,
    parsed: parsePrescription(prescription),
    source: {
      workbookId: workbook.spreadsheetId,
      sheetId,
      row,
      cells: (rows.get(row) ?? []).map((cell, i) =>
        provenance(cell, `${String.fromCharCode(65 + i)}${row}`),
      ),
    },
    demoUrl: rows.get(row)?.[col]?.hyperlink,
  });
  const warmup: TrainingDay = {
    id: `routine-${sheetId}-warmup`,
    day: 0,
    title: 'Rugby warm-up',
    sport: 'plyometrics',
    exercises: [],
  };
  for (let row = 1; row <= 7; row++) {
    const cells = rows.get(row);
    const name = cellText(cells?.[0]);
    if (!name) continue;
    const prescription = cellText(cells?.[1]);
    const e = make(name, prescription, row, 0, 'warmup');
    if (/each side/i.test(prescription))
      e.review =
        'Reps are per side in the original text. Record each side explicitly; contacts are not inferred.';
    e.order = String.fromCharCode(65 + warmup.exercises.length);
    warmup.exercises.push(e);
  }
  if (warmup.exercises.length) days.push(warmup);
  for (const [headerRow, contentRow] of [
    [12, 13],
    [15, 16],
  ])
    for (let col = 0; col < 5; col++) {
      const title = cellText(rows.get(headerRow)?.[col]);
      const text = cellText(rows.get(contentRow)?.[col]);
      if (!/^Plyo session \d+$/.test(title) || !text) continue;
      const exercises = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, i) => {
          const match = line.match(/^([\d]+(?:-[\d]+)?x[\d]+(?:-[\d]+)?(?:m|s)?)\s+(.+)$/i);
          const e = make(match?.[2] ?? line, match?.[1] ?? line, contentRow, col, 'working');
          e.order = String.fromCharCode(65 + i);
          if (!match || (/countermovement jump/i.test(e.name) && /m$/.test(e.prescription))) {
            e.parsed = {
              review:
                'Ambiguous prescription retained verbatim. Confirm reps, distance and measurement before using targets.',
            };
            e.review = e.parsed.review;
          }
          return e;
        });
      days.push({
        id: `routine-${sheetId}-${headerRow}-${col}`,
        day: 0,
        title,
        sport: 'plyometrics',
        exercises,
      });
    }
  if (!days.length) throw new Error('This routine layout needs review.');
  return {
    id: versionId,
    blockId: versionId,
    title: sheet.properties.title,
    kind: 'routines',
    acceptedAt: now,
    digest: await sha256(JSON.stringify(sheet)),
    origin: 'sheets',
    days,
  };
}
