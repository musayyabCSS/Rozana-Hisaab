interface FileTransferIconProps {
  size?: number;
  className?: string;
}

// Import/export icon: a page with a folded corner and two opposite arrows,
// drawn in the same 24px stroke style as the lucide icons beside it.
export function FileTransferIcon({ size = 24, className }: FileTransferIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 2h12a2 2 0 0 1 2 2v11l-7 7H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      <path d="M20 15h-5a2 2 0 0 0-2 2v5" />
      <path d="M8 7h8" />
      <path d="m13.5 4.5 2.5 2.5-2.5 2.5" />
      <path d="M16 12H8" />
      <path d="m10.5 9.5-2.5 2.5 2.5 2.5" />
    </svg>
  );
}
