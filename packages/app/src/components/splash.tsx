export function Splash({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M60 80H20V40H60V80Z" fill="currentColor" opacity={0.35} />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="currentColor" />
    </svg>
  );
}
