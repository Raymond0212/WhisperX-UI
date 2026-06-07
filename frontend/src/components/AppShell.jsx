import React from "react";
import { AudioLines, BriefcaseBusiness, Library, Moon, Settings, Sun, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  { id: "library", label: "Library", icon: Library },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "speakers", label: "Speakers", icon: UsersRound },
];

export function AppShell({
  activeSection,
  children,
  isBackendAvailable,
  onOpenSettings,
  onSelectSection,
  onToggleTheme,
  resolvedTheme,
  sidebar,
}) {
  return (
    <div className="vault-shell">
      <SectionRail
        activeSection={activeSection}
        onOpenSettings={onOpenSettings}
        onSelectSection={onSelectSection}
        onToggleTheme={onToggleTheme}
        resolvedTheme={resolvedTheme}
      />
      <div className="secondary-sidebar">{sidebar}</div>
      <section className="main-pane">
        {!isBackendAvailable && (
          <div className="backend-warning" role="alert">
            Backend service is unavailable. Start backend at <code>http://127.0.0.1:8000</code>.
          </div>
        )}
        {children}
      </section>
    </div>
  );
}

function SectionRail({ activeSection, onOpenSettings, onSelectSection, onToggleTheme, resolvedTheme }) {
  return (
    <aside className="section-rail" aria-label="Section vault">
      <div className="rail-brand" aria-hidden="true">
        <AudioLines />
      </div>
      <nav className="rail-nav" aria-label="Primary sections">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <Button
              key={section.id}
              type="button"
              variant={isActive ? "default" : "ghost"}
              className="rail-button"
              aria-current={isActive ? "page" : undefined}
              aria-label={section.label}
              title={section.label}
              onClick={() => {
                onSelectSection(section.id);
              }}
            >
              <Icon aria-hidden="true" />
              <span>{section.label}</span>
            </Button>
          );
        })}
      </nav>
      <div className="rail-settings">
        <ThemeToggleButton onToggleTheme={onToggleTheme} resolvedTheme={resolvedTheme} />
        <Button
          type="button"
          variant="ghost"
          className="rail-button"
          aria-label="Open settings"
          title="Open settings"
          onClick={onOpenSettings}
        >
          <Settings aria-hidden="true" />
          <span>Settings</span>
        </Button>
      </div>
    </aside>
  );
}

function ThemeToggleButton({ onToggleTheme, resolvedTheme }) {
  const isDark = resolvedTheme === "dark";
  const Icon = isDark ? Sun : Moon;

  return (
    <Button
      type="button"
      variant="ghost"
      className="rail-button"
      aria-label="Toggle theme"
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={onToggleTheme}
    >
      <Icon aria-hidden="true" />
      <span>Theme</span>
    </Button>
  );
}
