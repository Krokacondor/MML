// Light and dark themes. A visitor's pick is remembered on their device;
// without one the site follows the device's own setting. A small script in
// index.html's <head> sets data-theme before the page paints, so there is no
// flash of the wrong colors.

const KEY = 'sl.theme';
const system = window.matchMedia('(prefers-color-scheme: dark)');

const saved = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
const current = () => saved() || (system.matches ? 'dark' : 'light');

function apply(btn) {
  const dark = current() === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  btn.setAttribute('aria-pressed', String(dark));
  btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

export function watchTheme() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  apply(btn);
  btn.onclick = () => {
    try { localStorage.setItem(KEY, current() === 'dark' ? 'light' : 'dark'); } catch {}
    apply(btn);
  };
  system.addEventListener('change', () => apply(btn));
}
