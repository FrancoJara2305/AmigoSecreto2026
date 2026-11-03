import { useState } from 'react';
import { Palette } from 'lucide-react';
import { applyTheme, defaultTheme, SHOW_THEME_TOGGLE, type Theme } from '../../app/theme';

// Temporary switch for the experimental theme; hidden when SHOW_THEME_TOGGLE is false.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  if (!SHOW_THEME_TOGGLE) return null;
  const chicha = theme === 'chicha';
  function toggle() { const next: Theme = chicha ? 'original' : 'chicha'; applyTheme(next); setTheme(next); }
  return <button type="button" className="theme-toggle" aria-pressed={chicha} onClick={toggle}>
    <Palette aria-hidden="true" />Diseño: {chicha ? 'Chicha (experimental)' : 'Original'}
  </button>;
}
