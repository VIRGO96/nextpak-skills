import { lazy, Suspense } from 'react';

// Heavy, rarely used UI is code-split (Vite equivalent of next/dynamic).
const ReportsChart = lazy(() => import('./reports-chart'));

export function App() {
  // Public, build-time value. Never put secrets in VITE_ variables.
  const apiUrl = import.meta.env.VITE_API_URL;
  return (
    <main>
      <h1>Dashboard</h1>
      <p>API: {apiUrl}</p>
      <Suspense fallback={<p role="status">Loading chart...</p>}>
        <ReportsChart />
      </Suspense>
    </main>
  );
}
