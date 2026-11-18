import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { parseActivityFile } from '../../packages/core/activities';
import type { AppState } from '../../packages/core/model';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
export async function chooseActivities() {
  const r = await DocumentPicker.getDocumentAsync({
    type: ['public.json', 'public.xml', 'public.data'],
    copyToCacheDirectory: true,
  });
  if (r.canceled) return [];
  const file = r.assets[0];
  if ((file.size ?? 0) > 5 * 1024 * 1024)
    throw new Error('Activity files must be smaller than 5 MiB.');
  return parseActivityFile(await new File(file.uri).text(), file.name, (value) =>
    digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  );
}
export async function exportNotebook(state: AppState) {
  const file = new File(Paths.cache, `training-${Date.now()}.json`);
  await file.write(JSON.stringify(state, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
}
