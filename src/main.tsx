import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Integration scaffold only. No remote reads or writes, including on mount.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>
      <h1>Amigo Secreto 2026</h1>
      <p>La integración local está preparada. El catálogo se implementará en una siguiente iteración.</p>
    </main>
  </StrictMode>,
);
