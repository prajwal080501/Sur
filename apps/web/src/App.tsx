import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { LatencyPage } from './pages/dev/LatencyPage.js';
import { RangePage } from './pages/RangePage.js';
import { StudioPage } from './pages/StudioPage.js';

const SharePage = lazy(async () => {
  const module = await import('./pages/SharePage.js');
  return { default: module.SharePage };
});

export function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/studio" aria-label="Sur home">
          Sur
        </NavLink>
        <nav aria-label="Primary navigation">
          <NavLink to="/studio">Studio</NavLink>
          <NavLink to="/riyaz/range">Range</NavLink>
          <NavLink to="/dev/latency">Latency lab</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/riyaz/range" element={<RangePage />} />
          <Route path="/dev/latency" element={<LatencyPage />} />
          <Route
            path="/s/:slug"
            element={
              <Suspense fallback={<p className="content">Loading performance…</p>}>
                <SharePage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate replace to="/studio" />} />
        </Routes>
      </main>
    </div>
  );
}
