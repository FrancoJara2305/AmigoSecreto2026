import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './components/ui/ToastNotifications';
import { ProgressProvider } from './components/ui/ProgressOverlay';
import { App } from './app/App';
import { initializePrivateAccess } from './app/private-access-bootstrap';
import { PrivateAccessProvider } from './app/PrivateAccessProvider';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { applyTheme, defaultTheme } from './app/theme';
import './styles/tokens.css';
import './styles/components.css';
import './styles/preview.css';
import './styles/catalogue.css';
import './styles/profile.css';
import './styles/private-access.css';
import './styles/gift-editor.css';
// EXPERIMENTAL theme: only active with <html data-theme="chicha"> (see src/app/theme.ts).
import './styles/theme-chicha.css';

// Capture credentials before rendering. Private mutations are authorized by the server.
initializePrivateAccess();
applyTheme(defaultTheme);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivateAccessProvider><ToastProvider><ProgressProvider><App /><ThemeToggle /></ProgressProvider></ToastProvider></PrivateAccessProvider>
  </StrictMode>,
);
