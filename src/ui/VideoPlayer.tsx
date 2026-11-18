import React from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
export function VideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      nativeControls
      style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 8 }}
      contentFit="contain"
    />
  );
}
