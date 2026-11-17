import * as DocumentPicker from 'expo-document-picker';
import { parseActivityFile } from '../../packages/core/activities';
import type { AppState } from '../../packages/core/model';
export async function chooseActivities() {
  const r = await DocumentPicker.getDocumentAsync({
    type: [
      'application/json',
      'application/xml',
      'text/xml',
      'application/gpx+xml',
      'application/vnd.garmin.tcx+xml',
      'application/octet-stream',
    ],
    copyToCacheDirectory: true,
  });
  if (r.canceled) return [];
  const file = r.assets[0];
  if ((file.size ?? 0) > 5 * 1024 * 1024)
    throw new Error('Activity files must be smaller than 5 MiB.');
  const text = await (await fetch(file.uri)).text();
  return parseActivityFile(text, file.name);
}
export async function exportNotebook(state: AppState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
