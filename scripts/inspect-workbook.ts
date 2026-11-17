import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { importSheet, type Workbook } from '../packages/core/sheets';
// Private staging only. Never commit the workbook dump or resulting candidate.
async function main() {
  const source = JSON.parse(await readFile('.local/workbook-inspection.json', 'utf8')) as Workbook;
  const blockId = randomUUID();
  const version = await importSheet(source, 0, {
    blockId,
    versionId: randomUUID(),
    generation: blockId,
    round: 1,
    now: new Date().toISOString(),
  });
  await writeFile('.local/candidate.json', JSON.stringify(version));
  console.log(
    JSON.stringify({
      sessions: version.days.length,
      exercises: version.days.reduce((n, d) => n + d.exercises.length, 0),
      reviewItems: version.days.flatMap((d) => d.exercises).filter((e) => e.review).length,
      writeback: version.source?.writebackEnabled,
    }),
  );
}
void main();
