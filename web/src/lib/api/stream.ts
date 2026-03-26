// web/src/lib/api/stream.ts

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export function getStreamUrl(fileId: string): string {
  const token = localStorage.getItem('milmil-token') ?? '';
  return `${API_URL}/api/v1/stream/${fileId}/direct?token=${encodeURIComponent(token)}`;
}

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const types: Record<string, string> = {
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    ts: 'video/mp2t',
    flv: 'video/x-flv',
  };
  return types[ext] ?? 'video/mp4';
}

export interface DanmakuComment {
  text: string;
  time: number;
  mode: 'rtl' | 'top' | 'bottom';
  style: {
    fontSize: string;
    color: string;
    opacity: number;
  };
}

export function parseDandanplayComments(
  comments: { p: string; m: string }[],
  fontSize: number = 20,
  opacity: number = 1
): DanmakuComment[] {
  const modeMap: Record<string, 'rtl' | 'top' | 'bottom'> = {
    '1': 'rtl',
    '4': 'bottom',
    '5': 'top',
    '6': 'rtl',
  };
  return comments.map(({ p, m }) => {
    const parts = p.split(',');
    const time = parseFloat(parts[0] ?? '0');
    const type = parts[1] ?? '1';
    const colorInt = parseInt(parts[2] ?? '16777215', 10);
    return {
      text: m,
      time,
      mode: modeMap[type] ?? 'rtl',
      style: {
        fontSize: `${fontSize}px`,
        color: `#${colorInt.toString(16).padStart(6, '0')}`,
        opacity,
      },
    };
  });
}
