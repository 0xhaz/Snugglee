import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="flex items-center gap-2.5">
        <MoonMark />
        <span className="text-xl font-bold tracking-tight text-white">
          Snugglee
        </span>
      </Link>
      <Link
        href="#how"
        className="text-sm text-[#B8C0E0] transition-colors hover:text-white"
      >
        How it works
      </Link>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative z-20 mt-auto border-t border-white/10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <MoonMark />
          <span className="text-sm text-[#B8C0E0]">
            © {new Date().getFullYear()} Snugglee
          </span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#B8C0E0]">
          <Link href="/privacy" className="transition-colors hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-white">
            Terms
          </Link>
          <a
            href="mailto:hello@snugglee.app"
            className="transition-colors hover:text-white"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}

/** The moon-and-cloud mark, inline so it needs no request and scales cleanly. */
function MoonMark() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="16" cy="16" r="15" fill="#42426E" />
      <path
        d="M20.5 9.5a7 7 0 1 0 4.2 12.6A8 8 0 0 1 20.5 9.5Z"
        fill="#F2D18F"
      />
      <ellipse cx="13" cy="21" rx="7.5" ry="4.5" fill="#9AA5D1" />
      <ellipse cx="19" cy="22" rx="5" ry="3.2" fill="#9AA5D1" />
    </svg>
  );
}
