import { LANGUAGES } from '../../utils/languages';

interface LanguageSelectProps {
  value: string;
  onChange: (language: string) => void;
  disabled?: boolean;
}

/** Solid elevated control — never a translucent dropdown. */
export function LanguageSelect({ value, onChange, disabled }: LanguageSelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        aria-label="Language"
        onChange={(event) => onChange(event.target.value)}
        className="h-7 appearance-none rounded-[6px] border border-line bg-elevated py-0 pl-2.5 pr-7 text-[12px] text-ink outline-none transition-colors hover:border-line-strong focus:border-cyan disabled:cursor-not-allowed disabled:opacity-45"
      >
        {LANGUAGES.map((language) => (
          <option key={language.id} value={language.id}>
            {language.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-ink-muted"
      >
        ▼
      </span>
    </div>
  );
}
