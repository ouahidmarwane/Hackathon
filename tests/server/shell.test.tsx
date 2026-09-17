import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "@/components/control-tower/shell";

describe("AppShell sidebar and layout", () => {
  it("renders the sidebar header with brand and close toggle button", () => {
    const markup = renderToStaticMarkup(
      <AppShell view="tower">
        <div id="test-content">Workbench content</div>
      </AppShell>
    );

    expect(markup).toContain("app-shell");
    expect(markup).toContain("sidebar-open");
    expect(markup).toContain("sidebar-header");
    expect(markup).toContain("sidebar-toggle");
    expect(markup).toContain('aria-label="Close sidebar"');
    expect(markup).toContain('aria-controls="app-sidebar"');
    expect(markup).toContain("NOVA");
    expect(markup).toContain("AI Assistant");
    expect(markup).toContain("Workshop operations");
    expect(markup).toContain("Workbench content");
  });

  it("renders primary navigation links with active state", () => {
    const markup = renderToStaticMarkup(
      <AppShell view="cases">
        <div>Content</div>
      </AppShell>
    );

    expect(markup).toContain("Control Tower");
    expect(markup).toContain("Work Orders");
    expect(markup).toContain("Evidence");
    expect(markup).not.toContain("Activity");
    expect(markup).toContain("Knowledge");
    // View is cases, so Cases link should have aria-current="page"
    expect(markup).toContain('href="/?view=cases"');
    expect(markup).toContain('aria-current="page"');
  });

  it("preserves system status indicators", () => {
    const loaded = renderToStaticMarkup(<AppShell status="loaded"><div>Content</div></AppShell>);
    expect(loaded).toContain("Workshop records loaded");

    const loading = renderToStaticMarkup(<AppShell status="loading"><div>Content</div></AppShell>);
    expect(loading).toContain("Loading workshop records");

    const error = renderToStaticMarkup(<AppShell status="error"><div>Content</div></AppShell>);
    expect(error).toContain("Workshop data unavailable");
  });
});

