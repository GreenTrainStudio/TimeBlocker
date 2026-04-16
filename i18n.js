(function () {
  const locales = window.TIMEBLOCKER_LOCALES || {};
  const fallbackLanguage = 'en';
  let activeLanguage = fallbackLanguage;

  function normalizeLanguage(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const base = raw.toLowerCase().split('-')[0];
    return locales[base] ? base : null;
  }

  function detectLanguage() {
    return normalizeLanguage(navigator.language) || (locales.ru ? 'ru' : fallbackLanguage);
  }

  function format(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) => {
      return Object.prototype.hasOwnProperty.call(params, key) ? params[key] : `{${key}}`;
    });
  }

  function t(key, params = {}, language = activeLanguage) {
    const dict = locales[language] || locales[fallbackLanguage] || {};
    const fallback = locales[fallbackLanguage] || {};
    const value = dict[key] ?? fallback[key] ?? key;
    return format(value, params);
  }

  function applyI18n(root = document, language = activeLanguage) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n, {}, language);
    });

    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.dataset.i18nTitle, {}, language));
    });

    root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel, {}, language));
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder, {}, language));
    });
  }

  function init(callback) {
    const finalize = (lang) => {
      activeLanguage = lang;
      applyI18n(document, activeLanguage);
      if (typeof callback === 'function') callback(activeLanguage);
    };

    if (!chrome?.storage?.local) {
      finalize(detectLanguage());
      return;
    }

    chrome.storage.local.get({ language: null }, (data) => {
      const resolved = normalizeLanguage(data.language) || detectLanguage();
      finalize(resolved);
    });
  }

  window.TimeBlockerI18n = {
    init,
    t,
    applyI18n,
    getLanguage: () => activeLanguage
  };
})();
