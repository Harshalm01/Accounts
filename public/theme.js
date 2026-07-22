// public/theme.js
// Enforces light mode across the portal
(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.removeItem('portal-theme');
})();

