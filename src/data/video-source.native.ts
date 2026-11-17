import { File, Paths } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Video, createVideoThumbnail } from 'react-native-compressor';
export async function preserveVideo(id: string, asset: ImagePickerAsset) {
  const file = new File(asset.uri);
  const target = new File(
    Paths.document,
    `training-${id}.${asset.mimeType === 'video/mp4' ? 'mp4' : 'mov'}`,
  );
  file.copy(target);
  return { uri: target.uri, bytes: target.size };
}
export async function videoSource(uri: string) {
  const file = new File(uri);
  if (!file.exists) throw new Error('The local video is missing. Select it again.');
  return file;
}
export async function localVideoUri(uri: string) {
  return uri;
}
export async function prepareVideo(uri: string, id: string, compress: boolean) {
  const output = compress
    ? await Video.compress(uri, { compressionMethod: 'auto', maxSize: 1280 })
    : uri;
  const file = new File(output);
  let target = file;
  if (output !== uri) {
    target = new File(Paths.document, `training-${id}-compressed.mp4`);
    file.copy(target);
  }
  let thumbnailUri: string | undefined;
  try {
    const thumbnail = await createVideoThumbnail(target.uri);
    const thumb = new File(Paths.document, `training-${id}-thumb.jpg`);
    new File(thumbnail.path).copy(thumb);
    thumbnailUri = thumb.uri;
  } catch {
    /* A thumbnail failure must not discard the original set video. */
  }
  return {
    uri: target.uri,
    bytes: target.size,
    thumbnailUri,
    mime: compress ? 'video/mp4' : undefined,
  };
}
