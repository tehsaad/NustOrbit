export function OrbitMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="5" className="fill-primary" />
      <ellipse cx="16" cy="16" rx="13" ry="6.5" transform="rotate(-28 16 16)" className="fill-none stroke-primary/60" strokeWidth="1.6" />
      <circle cx="27" cy="10.5" r="2" className="fill-foreground" />
    </svg>
  );
}
