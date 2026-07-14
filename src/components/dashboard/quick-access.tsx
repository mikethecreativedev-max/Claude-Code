import Link from "next/link";

export type QuickAccessLink = { href: string; label: string; description: string };

export function QuickAccess({ links }: { links: QuickAccessLink[] }) {
  if (links.length === 0) return null;

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-500 hover:bg-brand-50"
          >
            <p className="text-sm font-medium text-slate-900">{link.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{link.description}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
