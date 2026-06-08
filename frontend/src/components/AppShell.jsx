import React from "react";
import { AudioLines, BriefcaseBusiness, Library, Moon, Settings, Sun, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "../api.js";

const SECTIONS = [
  { id: "library", label: "Library", icon: Library },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "speakers", label: "Speakers", icon: UsersRound },
];

export function AppShell({
  activeSection,
  children,
  isBackendAvailable,
  isMobileLibraryOpen = false,
  isMobileViewport = false,
  onCloseMainPane,
  onOpenSettings,
  onSelectSection,
  onToggleTheme,
  resolvedTheme,
  sidebar,
}) {
  const [swipeOffset, setSwipeOffset] = React.useState(0);
  const swipeStateRef = React.useRef(null);
  const backendOrigin = API_BASE || window.location.origin;

  React.useEffect(() => {
    if (!isMobileLibraryOpen) {
      swipeStateRef.current = null;
      setSwipeOffset(0);
    }
  }, [isMobileLibraryOpen]);

  const isDraggingPane = swipeOffset > 0;

  function resetSwipe() {
    swipeStateRef.current = null;
    setSwipeOffset(0);
  }

  function handleTouchStart(event) {
    if (!isMobileViewport || !isMobileLibraryOpen || event.touches.length !== 1) return;
    if (shouldIgnoreSwipeStart(event.target, event.currentTarget)) return;
    const touch = event.touches[0];
    swipeStateRef.current = {
      identifier: touch.identifier,
      engaged: false,
      startX: touch.clientX,
      startY: touch.clientY,
    };
  }

  function handleTouchMove(event) {
    const swipeState = swipeStateRef.current;
    if (!swipeState) return;
    const touch = Array.from(event.touches).find((item) => item.identifier === swipeState.identifier);
    if (!touch) return;
    const deltaX = touch.clientX - swipeState.startX;
    const deltaY = touch.clientY - swipeState.startY;

    if (!swipeState.engaged) {
      if (deltaX <= 0) {
        resetSwipe();
        return;
      }
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        resetSwipe();
        return;
      }
      swipeState.engaged = true;
    }

    event.preventDefault();
    setSwipeOffset(Math.max(0, Math.min(deltaX, window.innerWidth || 480)));
  }

  function handleTouchEnd() {
    const threshold = Math.min(120, Math.max(72, (window.innerWidth || 412) * 0.22));
    const shouldClose = swipeOffset >= threshold;
    resetSwipe();
    if (shouldClose) {
      onCloseMainPane?.();
    }
  }

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
      <section
        className={`main-pane ${isDraggingPane ? "is-gesture-dragging" : ""}`}
        style={{ "--mobile-pane-offset": `${swipeOffset}px` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetSwipe}
      >
        {!isBackendAvailable && (
          <div className="backend-warning" role="alert">
            Backend service is unavailable. Start backend at <code>{backendOrigin}</code>.
          </div>
        )}
        {children}
      </section>
    </div>
  );
}

function shouldIgnoreSwipeStart(target, container) {
  if (!(target instanceof Element) || !(container instanceof Element)) return false;
  if (target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='slider'], [data-swipe-ignore='true']")) {
    return true;
  }

  let current = target;
  while (current && current !== container) {
    const style = window.getComputedStyle(current);
    if (current.scrollWidth > current.clientWidth + 1 && /(auto|scroll)/.test(style.overflowX)) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
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
