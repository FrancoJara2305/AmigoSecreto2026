// EXPERIMENTAL "Chicha Navideña" theme. Its styles live only in styles/theme-chicha.css, scoped to
// <html data-theme="chicha">; without that attribute the original design is untouched.
//   USE_EXPERIMENTAL_CHICHA_THEME: the look everyone gets when the page loads (false = original).
//   SHOW_THEME_TOGGLE: a small corner button to compare both looks live. Nothing is stored:
//   a reload returns to the default above.
export const USE_EXPERIMENTAL_CHICHA_THEME = true;
export const SHOW_THEME_TOGGLE = true;

export type Theme = 'chicha' | 'original';
export const defaultTheme: Theme = USE_EXPERIMENTAL_CHICHA_THEME ? 'chicha' : 'original';

export function applyTheme(theme: Theme) {
  if (theme === 'chicha') document.documentElement.dataset.theme = 'chicha';
  else delete document.documentElement.dataset.theme;
}
