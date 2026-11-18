import React, { useEffect, useState } from 'react';
import { Image, Platform } from 'react-native';
import { localVideoUri } from '../data/video-source';
export function MediaThumbnail({ uri }: { uri: string }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let disposed = false;
    let resolved: string | undefined;
    void localVideoUri(uri).then((value) => {
      resolved = value;
      if (!disposed) setSource(value);
    });
    return () => {
      disposed = true;
      if (Platform.OS === 'web' && resolved) URL.revokeObjectURL(resolved);
    };
  }, [uri]);
  return source ? (
    <Image
      accessible
      accessibilityLabel="Set video preview"
      source={{ uri: source }}
      style={{ width: 160, height: 90, borderRadius: 8 }}
    />
  ) : null;
}
