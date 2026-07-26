"use client";

import { PanelLeftClose } from "lucide-react";
import Logo from "@/app/logo";
import BrandName from "@/app/brand-name";
import { IconButton } from "@/components/ui/icon-button";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import LogoutButton from "./logout-button";
import WorkspaceNav from "./workspace-nav";
import AdminLink from "./admin-link";
import InstallAppButton from "./install-app-button";
import { useT } from "@/lib/i18n/context";
import { chatCopy } from "@/lib/i18n/chat";

// First sidebar (M3 navigation drawer): everything that is NOT a chat session
// -- branding, the sectioned navigator (Workspaces now, room for more), and
// the account footer. Sections are uniform (SectionHeader + body) so adding a
// future one is additive, not a restructure.
export default function NavSidebar({
  email,
  onSelect,
  onCollapse,
}: {
  email: string;
  onSelect?: () => void;
  onCollapse?: () => void;
}) {
  const t = useT(chatCopy);
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        <Logo size={32} />
        <BrandName className="min-w-0 flex-1 truncate font-display text-base font-semibold text-fg" />
        {onCollapse && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t.nav.collapseWorkspaces}
            title={t.nav.collapse}
            onClick={onCollapse}
            className="hidden md:inline-flex"
          >
            <PanelLeftClose size={18} aria-hidden />
          </IconButton>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceNav onSelect={onSelect} />
      </div>

      <div className="flex flex-col gap-0.5 border-t border-brand/20 px-2 py-2">
        <AdminLink />
        <InstallAppButton />
      </div>

      {/* The account footer is the one piece of chrome present on every /chat
          and /admin view, so the language toggle lives here. */}
      <div className="flex items-center justify-between gap-2 border-t border-brand/20 px-4 py-3">
        <span className="min-w-0 truncate text-sm text-fg-muted" title={email}>
          {email}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitcher />
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
