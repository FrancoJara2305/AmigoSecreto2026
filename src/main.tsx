import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './components/ui/ToastNotifications';
import { App } from './app/App';
import { initializePrivateAccess } from './app/private-access-bootstrap';
import { PrivateAccessProvider } from './app/PrivateAccessProvider';
import './styles/tokens.css';
import './styles/components.css';
import './styles/preview.css';
import './styles/catalogue.css';
import './styles/profile.css';
import './styles/private-access.css';
import './styles/gift-editor.css';

// Capture credentials before rendering. Private mutations are authorized by the server.
initializePrivateAccess();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivateAccessProvider><ToastProvider><App /></ToastProvider></PrivateAccessProvider>
  </StrictMode>,
);
