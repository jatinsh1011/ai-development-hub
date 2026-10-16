export function Mark({ size = 20 }: { size?: number }) {
  // Four blocks, one displaced: "building blocks".
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
      <rect x="11" y="1" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="1" y="11" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11" y="11" width="8" height="8" rx="1.5" fill="currentColor" opacity=".35" />
    </svg>
  );
}
