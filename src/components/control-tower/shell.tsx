"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "./icons";
import { NovaSidebarAssistant } from "./nova-assistant";

const SIDEBAR_STORAGE_KEY = "workshop-flow-sidebar-open";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): boolean {
  try {
    const item = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return item === null ? true : item === "true";
  } catch {
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

export function AppShell({
  children,
  status = "loaded",
  view = "tower",
  onNavigate,
}: {
  children: ReactNode;
  status?: "loaded" | "loading" | "error";
  view?: string;
  onNavigate?: (view: string) => void;
}) {
  const sidebarOpen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleSidebar = (open: boolean) => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
      window.dispatchEvent(new Event("storage"));
    } catch {
      // Ignore storage errors
    }
  };

  const handleNavClick = (targetView: string) => (e: React.MouseEvent) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(targetView);
    }
  };

  const statusText =
    status === "loaded"
      ? "Workshop records loaded"
      : status === "loading"
      ? "Loading workshop records"
      : "Workshop data unavailable";

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside
        id="app-sidebar"
        className={`sidebar ${sidebarOpen ? "open" : "closed"}`}
        aria-label="Workshop sidebar navigation"
      >
        <div className="sidebar-header">
          <Link
            href="/"
            onClick={handleNavClick("tower")}
            className="brand"
            aria-label="Workshop Flow Intelligence home"
          >
            <span className="brand-mark">
              <Icon name="star" />
            </span>
            <span>
              NOVA <span className="brand-sub">AI Assistant</span>
            </span>
          </Link>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => toggleSidebar(false)}
            aria-label="Close sidebar"
            title="Close sidebar"
            aria-controls="app-sidebar"
          >
            <Icon name="chevronLeft" />
          </button>
        </div>

        <nav aria-label="Main navigation" className="main-nav">
          <Link
            href="/"
            onClick={handleNavClick("tower")}
            prefetch={false}
            className={view === "tower" ? "nav-item active" : "nav-item"}
            aria-current={view === "tower" ? "page" : undefined}
          >
            <Icon name="tower" />
            Control Tower
          </Link>
          <Link
            href="/?view=cases"
            onClick={handleNavClick("cases")}
            prefetch={false}
            className={view === "cases" ? "nav-item active" : "nav-item"}
            aria-current={view === "cases" ? "page" : undefined}
          >
            <Icon name="cases" />
            Work Orders
          </Link>
          <Link
            href="/?view=evidence"
            onClick={handleNavClick("evidence")}
            prefetch={false}
            className={view === "evidence" ? "nav-item active" : "nav-item"}
            aria-current={view === "evidence" ? "page" : undefined}
          >
            <Icon name="evidence" />
            Evidence
          </Link>
          <Link
            href="/?view=simulation"
            onClick={handleNavClick("simulation")}
            prefetch={false}
            className={view === "simulation" ? "nav-item active" : "nav-item"}
            aria-current={view === "simulation" ? "page" : undefined}
          >
            <Icon name="star" />
            Live Pipeline
          </Link>
          <Link
            href="/?view=knowledge"
            onClick={handleNavClick("knowledge")}
            prefetch={false}
            className={view === "knowledge" ? "nav-item active" : "nav-item"}
            aria-current={view === "knowledge" ? "page" : undefined}
          >
            <Icon name="knowledge" />
            Knowledge
          </Link>
        </nav>

        <NovaSidebarAssistant />

        <div className="sidebar-footer">
          Local workshop workspace<span>Deterministic assessments</span>
        </div>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <div className="topbar-left">
            {!sidebarOpen && (
              <button
                type="button"
                className="sidebar-open-btn"
                onClick={() => toggleSidebar(true)}
                aria-label="Open sidebar"
                title="Open sidebar"
                aria-controls="app-sidebar"
              >
                <Icon name="sidebar" />
              </button>
            )}
            <span className="workspace-name">Workshop operations</span>
          </div>
          <div className={`system-status ${status}`}>
            <span className="status-dot" />
            {statusText}
          </div>
        </header>

        <main id="main-content" className="main-content">
          {children}
        </main>

        <footer className="page-footer">
          Workshop Flow Intelligence<span>Evidence assessments · No workflow changes</span>
        </footer>
      </div>
    </div>
  );
}
