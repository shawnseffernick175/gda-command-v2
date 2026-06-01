import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell/AppShell";
import { LeftRail } from "./components/LeftRail/LeftRail";
import { MainCanvas } from "./components/MainCanvas/MainCanvas";
import { NavItems } from "./components/NavItems/NavItems";
import { PlaceholderSurface } from "./components/PlaceholderSurface/PlaceholderSurface";
import { Launchpad } from "./surfaces/launchpad/Launchpad";
import { FastTrack } from "./surfaces/fast-track/FastTrack";
import { ActionItemsList } from "./surfaces/action-items/ActionItemsList";
import { PipelineSurface } from "./surfaces/pipeline/PipelineSurface";
import { OpportunitiesList } from "./surfaces/opportunities/OpportunitiesList";
import { CaptureList } from "./surfaces/capture/CaptureList";
import { CaptureDetail } from "./surfaces/capture/CaptureDetail";
import { useUiStore } from "./stores/ui-store";
import { RequireAuth } from "./components/RequireAuth";
import { Login } from "./surfaces/auth/Login";
import { RegulatorySurface } from "./surfaces/regulatory/RegulatorySurface";
import { DoctrineSettings } from "./surfaces/doctrine/DoctrineSettings";
import { KnowledgeBaseSurface } from "./surfaces/knowledge-base/KnowledgeBaseSurface";
import { ColorTeamSurface } from "./surfaces/color-teams/ColorTeamSurface";
import { ColorTeamRunDetail } from "./surfaces/color-teams/ColorTeamRunDetail";

export function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="*"
        element={
          <RequireAuth>
            <AppShell>
              <LeftRail collapsed={!sidebarOpen} onToggle={toggleSidebar}>
                <NavItems collapsed={!sidebarOpen} />
              </LeftRail>
              <MainCanvas>
                <Routes>
                  <Route index element={<Navigate to="/launchpad" replace />} />
                  <Route path="/launchpad" element={<Launchpad />} />
                  <Route path="/fast-track" element={<FastTrack />} />
                  <Route path="/opportunities" element={<OpportunitiesList />} />
                  <Route path="/opp/:notice_id" element={<OpportunitiesList />} />
                  <Route path="/capture" element={<CaptureList />} />
                  <Route path="/capture/:opp_id" element={<CaptureDetail />} />
                  <Route path="/pipeline" element={<PipelineSurface />} />
                  <Route path="/action-items" element={<ActionItemsList />} />
                  <Route path="/regulatory" element={<RegulatorySurface />} />
                  <Route path="/settings/doctrine" element={<DoctrineSettings />} />
                  <Route path="/knowledge-base" element={<KnowledgeBaseSurface />} />
                  <Route path="/color-teams" element={<ColorTeamSurface />} />
                  <Route path="/color-teams/runs/:runId" element={<ColorTeamRunDetail />} />
                  <Route path="/settings/*" element={<PlaceholderSurface name="Settings" />} />
                </Routes>
              </MainCanvas>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
