export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  source: 'embedded' | 'external' | 'drag-drop' | 'online';
  format: 'vtt' | 'ass' | 'ssa' | 'srt';
  isSDH?: boolean;
  url?: string;
  content?: string; // for drag-drop or inline loaded content
}

export interface SubtitleCue {
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
  // ASS-specific fields (optional)
  style?: Record<string, string>;
  position?: { x: number; y: number };
  layer?: number;
}

export interface SubtitleStyleConfig {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  strokeWidth: number;
  strokeColor: string;
  shadowType: 'none' | 'outline' | 'drop-shadow' | 'raised' | 'depressed';
  position: 'top' | 'center' | 'bottom';
  positionOffset: number;
  safeMargin: number;
  fadeAnimation: boolean;
  respectAssStyle: boolean;
}
