import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { Upload } from 'tus-js-client';
import type { TrainingStore } from '../../packages/core/store';
import { localVideoUri, prepareVideo, preserveVideo, videoSource } from './video-source';
import { supabase } from './supabase';
const active = new Set<string>();
export async function selectVideo(
  store: TrainingStore,
  sessionId: string,
  setId: string,
  capture = false,
) {
  if (capture) {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    if (!result.granted) throw new Error('Camera permission is needed to record a set.');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    allowsEditing: false,
    videoMaxDuration: 180,
    videoQuality:
      store.getSnapshot().settings.compression === 'medium'
        ? ImagePicker.UIImagePickerControllerQualityType.Medium
        : ImagePicker.UIImagePickerControllerQualityType.High,
  };
  const result = capture
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync({
        ...options,
        allowsMultipleSelection: true,
        selectionLimit: 5,
      });
  if (result.canceled) return;
  for (const asset of result.assets) {
    const id = randomUUID();
    const file = await preserveVideo(id, asset);
    await store.update((s) => ({
      ...s,
      media: [
        ...s.media,
        {
          id,
          sessionId,
          setId,
          uri: file.uri,
          bytes: file.bytes,
          mime: asset.mimeType ?? 'video/mp4',
          duration: asset.duration ?? undefined,
          status: 'pending',
          progress: 0,
        },
      ],
    }));
  }
}
export async function processUploads(store: TrainingStore, userId: string) {
  if (!supabase || store.getSnapshot().scope !== userId) return;
  for (let media of store
    .getSnapshot()
    .media.filter((m) => m.status !== 'uploaded' && m.status !== 'error')) {
    if (
      active.has(media.id) ||
      store.getSnapshot().outbox.some((o) => o.sessionId === media.sessionId)
    )
      continue;
    active.add(media.id);
    const update = (patch: Partial<typeof media>) =>
      store.update((s) => ({
        ...s,
        media: s.media.map((m) => (m.id === media.id ? { ...m, ...patch } : m)),
      }));
    try {
      if (!media.compressionApplied && !media.uploadUrl) {
        const prepared = await prepareVideo(
          media.uri,
          media.id,
          store.getSnapshot().settings.compression === 'medium',
        );
        const patch = { ...prepared, mime: prepared.mime ?? media.mime, compressionApplied: true };
        await update(patch);
        media = { ...media, ...patch };
      }
      if (media.bytes > 50 * 1024 * 1024)
        throw new Error(
          'The prepared video exceeds the current 50 MiB limit. Trim it or choose medium compression.',
        );
      const { data } = await supabase.auth.getSession();
      if (!data.session) break;
      const path =
        media.objectPath ??
        `${userId}/${media.sessionId}/${media.setId}/${media.id}.${media.mime === 'video/mp4' ? 'mp4' : 'mov'}`;
      await update({ objectPath: path, status: 'uploading' });
      const { error: metadataError } = await supabase.from('training_media').upsert(
        {
          id: media.id,
          user_id: userId,
          session_id: media.sessionId,
          set_id: media.setId,
          object_path: path,
          mime_type: media.mime,
          bytes: media.bytes,
          status: 'pending',
        },
        { onConflict: 'id' },
      );
      if (metadataError) throw metadataError;
      const source = await videoSource(media.uri);
      await new Promise<void>((resolve, reject) => {
        let lastProgress = 0;
        const upload = new Upload(source, {
          endpoint: `${process.env.EXPO_PUBLIC_SUPABASE_URL!.replace('.supabase.co', '.storage.supabase.co')}/storage/v1/upload/resumable`,
          uploadUrl: media.uploadUrl,
          headers: {
            authorization: `Bearer ${data.session!.access_token}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          },
          metadata: {
            bucketName: 'training-videos',
            objectName: path,
            contentType: media.mime,
            cacheControl: '3600',
          },
          chunkSize: 6 * 1024 * 1024,
          retryDelays: [0, 1000, 3000, 5000],
          storeFingerprintForResuming: false,
          removeFingerprintOnSuccess: true,
          onBeforeRequest: async () => {
            if (upload.url && upload.url !== media.uploadUrl) {
              await update({ uploadUrl: upload.url });
              media = { ...media, uploadUrl: upload.url };
            }
          },
          onProgress: (sent, total) => {
            const progress = Math.floor((sent / total) * 100);
            if (progress - lastProgress >= 10) {
              lastProgress = progress;
              void update({ progress }).catch(() => undefined);
            }
          },
          onError: reject,
          onSuccess: () => resolve(),
        });
        upload.start();
      });
      const { error } = await supabase
        .from('training_media')
        .update({ status: 'uploaded' })
        .eq('id', media.id);
      if (error) throw error;
      await update({ status: 'uploaded', progress: 100, error: undefined });
    } catch {
      await update({
        status: 'error',
        error: 'Upload interrupted. Your local video is kept. Tap Retry video.',
      });
    } finally {
      active.delete(media.id);
    }
  }
}
export async function retryVideo(store: TrainingStore, id: string) {
  await store.update((s) => ({
    ...s,
    media: s.media.map((m) => (m.id === id ? { ...m, status: 'pending', error: undefined } : m)),
  }));
}
export async function resolveVideoUri(media: import('../../packages/core/model').PendingVideo) {
  if (media.uri) {
    try {
      return await localVideoUri(media.uri);
    } catch {
      /* Fall through to the private cloud object after a device restore. */
    }
  }
  if (media.status !== 'uploaded' || !media.objectPath || !supabase)
    throw new Error('This video is still waiting for its original device upload.');
  const { data, error } = await supabase.storage
    .from('training-videos')
    .createSignedUrl(media.objectPath, 60);
  if (error) throw error;
  return data.signedUrl;
}
