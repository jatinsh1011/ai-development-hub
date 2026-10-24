/**
 * aidevkit's mark: three building blocks in place and a fourth one dropping in (it snaps into place
 * when the brand link is hovered). `eyes` adds the peeking mascot face used once on the page.
 */
export function BlocksMark({ className, eyes = false, title }: { className?: string; eyes?: boolean; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect x="3" y="23.5" width="15" height="15" rx="4" fill="#1a3fae" />
      <rect x="3" y="21" width="15" height="15" rx="4" fill="#2878ef" />
      <rect x="21" y="23.5" width="15" height="15" rx="4" fill="#b8226a" />
      <rect x="21" y="21" width="15" height="15" rx="4" fill="#ed438b" />
      <rect x="3" y="5.5" width="15" height="15" rx="4" fill="#bd5f12" />
      <rect x="3" y="3" width="15" height="15" rx="4" fill="#f58220" />
      <g className="float" transform="translate(24.5 -1.5) rotate(14 7.5 7.5)">
        <rect x="0" y="2.5" width="15" height="15" rx="4" fill="#e8b866" />
        <rect x="0" y="0" width="15" height="15" rx="4" fill="#ffd392" />
        {eyes && (
          <>
            <circle cx="5" cy="7" r="2.3" fill="#fff" /><circle cx="10.5" cy="7" r="2.3" fill="#fff" />
            <circle cx="5.6" cy="7.3" r="1.1" fill="#242422" /><circle cx="11.1" cy="7.3" r="1.1" fill="#242422" />
          </>
        )}
      </g>
    </svg>
  );
}
