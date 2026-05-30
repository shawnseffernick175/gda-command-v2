const STORAGE_KEY = 'gda-theme';

export type Theme = 'dark' | 'light';

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark';
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
}

export function initTheme() {
  const theme = getTheme();
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}
