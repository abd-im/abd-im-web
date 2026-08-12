const MEDIA_MAX_WIDTH = 280;
const MEDIA_MAX_HEIGHT = 260;

export const getMediaPreviewSize = (
  sourceWidth: number,
  sourceHeight: number,
  fallbackWidth = 280,
  fallbackHeight = 158,
) => {
  const width = sourceWidth > 0 ? sourceWidth : fallbackWidth;
  const height = sourceHeight > 0 ? sourceHeight : fallbackHeight;
  const scale = Math.min(1, MEDIA_MAX_WIDTH / width, MEDIA_MAX_HEIGHT / height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};
