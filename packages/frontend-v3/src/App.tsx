import { Routes, Route, Navigate } from "react-router-dom";
import { PlaceholderSurface } from "./components/PlaceholderSurface";

export function App() {
  return (
    <Routes>
      <Route index element={<Navigate to="/launchpad" replace />} />
      <Route
        path="/launchpad"
        element={<PlaceholderSurface name="Launchpad" />}
      />
      <Route
        path="/fast-track"
        element={<PlaceholderSurface name="Fast Track" />}
      />
      <Route
        path="/opportunities"
        element={<PlaceholderSurface name="Opportunities" />}
      />
      <Route
        path="/opp/:notice_id"
        element={<PlaceholderSurface name="Opportunity Detail" />}
      />
      <Route path="/capture" element={<PlaceholderSurface name="Capture" />} />
      <Route
        path="/capture/:opp_id"
        element={<PlaceholderSurface name="Capture Detail" />}
      />
      <Route
        path="/pipeline"
        element={<PlaceholderSurface name="Pipeline" />}
      />
      <Route
        path="/action-items"
        element={<PlaceholderSurface name="Action Items" />}
      />
      <Route
        path="/settings/*"
        element={<PlaceholderSurface name="Settings" />}
      />
    </Routes>
  );
}
