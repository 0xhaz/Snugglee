import type { ReactNode } from "react";

/**
 * Shared shell for the legal pages.
 *
 * Kept plain and readable rather than dense. App Review reads these against
 * what the app actually does, and a parent deciding whether to record their
 * voice deserves to understand it without a lawyer.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-sm text-[#8F9AC6]">Last updated {updated}</p>
      <div className="mt-12 space-y-10">{children}</div>
    </div>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-bold text-white">{heading}</h2>
      <div className="space-y-3 leading-relaxed text-[#B8C0E0]">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#9AA5D1]" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}
