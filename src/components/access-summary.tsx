import type { ReactNode } from 'react';
import { RoleBadge, type RoleBadgeRole } from './role-badge';

/**
 * Borderless role summary used at the bottom of guide pages, e.g.
 *
 * ```mdx
 * <AccessSummary>
 *   <AccessRow roles="viewer">Browse the list and open any row read-only.</AccessRow>
 *   <AccessRow roles={['editor', 'admin']}>Upload new records (`resources.editor`).</AccessRow>
 * </AccessSummary>
 * ```
 *
 * Rows render as a two-column grid: chips in the first column (aligned across
 * rows), the description in the second. There are deliberately no borders or
 * bullets — and descriptions must not repeat the role name already shown on
 * the chip. Name the concrete role (`` `resources.editor` ``) where it helps,
 * but never start the text with "Everyone/Editors/Admins".
 */
export function AccessSummary({ children }: { children: ReactNode }) {
  return <div className="my-4 flex flex-col gap-3">{children}</div>;
}

interface AccessRowProps {
  /** One role (`roles="editor"`) or several (`roles={['editor', 'admin']}`). */
  roles: RoleBadgeRole | RoleBadgeRole[] | string;
  children: ReactNode;
}

function toRoleList(roles: AccessRowProps['roles']): RoleBadgeRole[] {
  const list = Array.isArray(roles) ? roles : String(roles).split(/[\s,]+/);
  return list.filter((r): r is RoleBadgeRole => r === 'viewer' || r === 'editor' || r === 'admin');
}

export function AccessRow({ roles, children }: AccessRowProps) {
  const list = toRoleList(roles);
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4">
      <span className="flex min-w-24 flex-wrap gap-1.5 pt-0.5">
        {list.map((role) => (
          <RoleBadge key={role} role={role} />
        ))}
      </span>
      <span className="text-sm leading-6 text-fd-muted-foreground [&_a]:text-fd-foreground">
        {children}
      </span>
    </div>
  );
}
