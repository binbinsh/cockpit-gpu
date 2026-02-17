(function () {
  const version = '26.0217.2232';
  const cacheToken = String(Date.now());

  const url = new URL(window.location.href);
  url.searchParams.set('gpu_cache_buster', cacheToken);
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', url.toString());
  }

  const css = document.querySelector('link[href^="cockpit-gpu.css"]');
  if (css) {
    const cssUrl = new URL(css.getAttribute('href'), window.location.href);
    cssUrl.searchParams.set('_', cacheToken);
    cssUrl.searchParams.set('v', version);
    css.setAttribute('href', cssUrl.toString());
  }

  const appScript = document.createElement('script');
  appScript.src = `cockpit-gpu.js?v=${version}&_=${cacheToken}`;
  appScript.type = 'text/javascript';
  document.head.appendChild(appScript);
})();
