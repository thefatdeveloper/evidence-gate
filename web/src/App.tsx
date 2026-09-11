import { useEffect, useState } from 'react';

export function App() {
  const [status, setStatus] = useState('checking…');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { status: string }) => setStatus(body.status))
      .catch(() => setStatus('unreachable'));
  }, []);

  return (
    <main>
      <h1>Evidence Gate</h1>
      <p>Backend: {status}</p>
    </main>
  );
}
