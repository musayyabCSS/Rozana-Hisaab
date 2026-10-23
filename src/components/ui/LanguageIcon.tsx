interface LanguageIconProps {
  size?: number;
  className?: string;
}

// English/Urdu switch icon in the same layout as lucide's "Languages" icon,
// with an Urdu letter in place of the Chinese character.
export function LanguageIcon({ size = 24, className }: LanguageIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <text
        x="7"
        y="12.5"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fontFamily="'Noto Sans Arabic', 'Noto Nastaliq Urdu', sans-serif"
        direction="rtl"
      >
        ع
      </text>
      <text
        x="17"
        y="22"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        A
      </text>
    </svg>
  );
}
