import { getMedia, putMedia } from '../storage/persistence.web';
import type { ImagePickerAsset } from 'expo-image-picker';
export async function preserveVideo(id: string, asset: ImagePickerAsset) {
  const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  await putMedia(id, blob);
  return { uri: id, bytes: blob.size };
}
export async function videoSource(uri: string): Promise<Blob> {
  const blob = await getMedia(uri);
  if (!blob) throw new Error('The local video is missing. Select it again.');
  return blob;
}
export async function localVideoUri(uri: string) {
  return URL.createObjectURL(await videoSource(uri));
}
export async function prepareVideo(uri: string, id: string, _compress: boolean) {
  const blob = await videoSource(uri);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(blob);
  let thumbnailUri: string | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Video preview unavailable'));
      video.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth, 480);
    canvas.height = Math.round((canvas.width * video.videoHeight) / video.videoWidth);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumb = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.7),
    );
    if (thumb) {
      thumbnailUri = `${id}-thumb`;
      await putMedia(thumbnailUri, thumb);
    }
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
  return { uri, bytes: blob.size, thumbnailUri, mime: undefined };
}
