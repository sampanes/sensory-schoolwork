import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ConfigurationsPage from "./pages/ConfigurationsPage";
import HomePage from "./pages/HomePage";

const MathApp = lazy(() => import("./apps/math/App"));
const SpellingApp = lazy(() => import("./apps/spelling/App"));
const SentencesApp = lazy(() => import("./apps/sentences/App"));

function AppFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
      <p className="text-sm font-semibold">Loading…</p>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<AppFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/configurations" element={<ConfigurationsPage />} />
        <Route path="/math" element={<MathApp />} />
        <Route path="/spelling" element={<SpellingApp />} />
        <Route path="/sentences" element={<SentencesApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
