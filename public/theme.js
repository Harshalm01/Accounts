/**
 * 3Folks Media - Theme & UI Initialization
 */
(function () {
  const savedTheme = localStorage.getItem('3fm_theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }

  window.toggleAppTheme = function () {
    const isDark = document.documentElement.classList.toggle('dark-mode');
    localStorage.setItem('3fm_theme', isDark ? 'dark' : 'light');
  };
})();
