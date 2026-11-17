import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type RoleBadgeRole = 'viewer' | 'editor' | 'admin';

interface RoleBadgeProps {
  /** Access level the labelled feature requires. */
  role: RoleBadgeRole;
  /** Override the visible label (defaults to Everyone / Editor / Admin). */
  children?: ReactNode;
  className?: string;
}

const ROLE_STYLES: Record<RoleBadgeRole, string> = {
  // Generally accessible — viewing lists and opening read-only forms.
  viewer: 'border-slate-300 bg-slate-100 text-slate-700',
  // Contribute-level — creating and editing owned resources (or any collection).
  editor: 'border-sky-300 bg-sky-100 text-sky-800',
  // Full control — editing or deleting anything, plus the sync admin page.
  admin: 'border-violet-300 bg-violet-100 text-violet-800',
};

const ROLE_LABELS: Record<RoleBadgeRole, string> = {
  viewer: 'Everyone',
  editor: 'Editor',
  admin: 'Admin',
};

/**
 * Small access-level chip for guide pages, e.g. `<RoleBadge role="editor" />`.
 *
 * Marks which role a feature needs, so readers can tell at a glance whether
 * a section applies to them. The badge is a real `border` (no `box-shadow`
 * or `ring-*`) so it prints cleanly in the PDF pipeline — see the note on
 * `.screenshot-marker-badge` in `src/app/global.css`.
 */
export function RoleBadge({ role, children, className }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 align-middle text-xs font-semibold leading-4',
        ROLE_STYLES[role],
        className,
      )}
    >
      {children ?? ROLE_LABELS[role]}
    </span>
  );
}
