import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const PRESETS = [
  { value: '0', label: msg`scanInterval.disabled` },
  { value: '30', label: msg`scanInterval.30min` },
  { value: '60', label: msg`scanInterval.1h` },
  { value: '360', label: msg`scanInterval.6h` },
  { value: '720', label: msg`scanInterval.12h` },
  { value: '1440', label: msg`scanInterval.daily` },
  { value: '10080', label: msg`scanInterval.weekly` },
] as const;

const PRESET_VALUES: Set<string> = new Set(PRESETS.map((p) => p.value));

interface ScanIntervalSelectProps {
  value: number;
  onChange: (minutes: number) => void;
  className?: string;
}

export function ScanIntervalSelect({ value, onChange, className }: ScanIntervalSelectProps) {
  const { i18n } = useLingui();

  // Map the current value to the closest preset, or show the raw value
  const strValue = String(value);
  const displayValue = PRESET_VALUES.has(strValue) ? strValue : '60';

  return (
    <Select
      value={displayValue}
      onValueChange={(v) => onChange(Number(v))}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRESETS.map((preset) => (
          <SelectItem key={preset.value} value={preset.value}>
            {i18n._(preset.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
