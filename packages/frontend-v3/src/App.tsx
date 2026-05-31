import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell/AppShell";
import { LeftRail } from "./components/LeftRail/LeftRail";
import { MainCanvas } from "./components/MainCanvas/MainCanvas";
import { PlaceholderSurface } from "./components/PlaceholderSurface/PlaceholderSurface";
import { Launchpad } from "./surfaces/launchpad/Launchpad";
import { OpportunitiesList } from "./surfaces/opportunities/OpportunitiesList";
import { CaptureList } from "./surfaces/capture/CaptureList";
import { CaptureDetail } from "./surfaces/capture/CaptureDetail";
import { useUiStore } from "./stores/ui-store";

export function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <AppShell>
      <LeftRail collapsed={!sidebarOpen} onToggle={toggleSidebar} />
      <MainCanvas>
        <Routes>
          <Route index element={<Navigate to="/launchpad" replace />} />
          <Route path="/launchpad" element={<Launchpad />} />
          <Route path="/fast-track" element={<PlaceholderSurface name="Fast Track" />} />
          <Route path="/opportunities" element={<OpportunitiesList />} />
          <Route path="/opp/:notice_id" element={<OpportunitiesList />} />
          <Route path="/capture" element={<CaptureList />} />
          <Route path="/capture/:opp_id" element={<CaptureDetail />} />
          <Route path="/pipeline" element={<PlaceholderSurface name="Pipeline" />} />
          <Route path="/action-items" element={<PlaceholderSurface name="Action Items" />} />
          <Route path="/settings/*" element={<PlaceholderSurface name="Settings" />} />
        </Routes>
      </MainCanvas>
    </AppShell>
  );
}
