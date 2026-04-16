// Функция проверки, нужно ли блокировать сайт сейчас
function shouldBlock(rule) {
    const now = new Date();
    
    // Проверка дня недели (1 = Пн, 7 = Вс)
    const currentDay = now.getDay(); // 0 = Вс в JS
    const jsDayToRuleDay = currentDay === 0 ? 7 : currentDay; // Преобразуем: Вс = 7
    if (!rule.days.includes(jsDayToRuleDay)) {
        return false;
    }

    // Проверка времени
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = rule.start.split(':').map(Number);
    const [endHour, endMin] = rule.end.split(':').map(Number);
    
    const startTotal = startHour * 60 + startMin;
    let endTotal = endHour * 60 + endMin;
    
    // Если конец меньше начала (например, 22:00 - 02:00), значит интервал переходит через полночь
    if (endTotal < startTotal) {
        // Если сейчас больше начала ИЛИ меньше конца (после полуночи)
        return currentTime >= startTotal || currentTime < endTotal;
    } else {
        // Обычный интервал внутри дня
        return currentTime >= startTotal && currentTime < endTotal;
    }
}

// Получаем хост из URL
function getHostname(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
        return '';
    }
}

// Функция блокировки или обновления страницы
function checkAndBlock(tabId, url) {
    if (!url || url.startsWith('chrome://') || url.startsWith('about:')) return;
    
    const hostname = getHostname(url);
    if (!hostname) return;

    chrome.storage.local.get({ rules: [] }, (data) => {
        const rules = data.rules;
        // Ищем правило, подходящее под сайт
        const matchingRule = rules.find(rule => {
            // Простое сравнение: домен сайта включает строку правила или совпадает
            return hostname.includes(rule.site) || hostname === rule.site;
        });

        if (matchingRule && shouldBlock(matchingRule)) {
            // Блокируем: перенаправляем на локальную страницу-заглушку
            const blockPageUrl = chrome.runtime.getURL('blocked.html');
            // Добавляем параметры для информации
            const infoUrl = `${blockPageUrl}?site=${encodeURIComponent(hostname)}&start=${matchingRule.start}&end=${matchingRule.end}`;
            chrome.tabs.update(tabId, { url: infoUrl });
        }
    });
}

// Слушаем навигацию
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    // Только для основных фреймов (не iframe)
    if (details.frameId === 0) {
        checkAndBlock(details.tabId, details.url);
    }
});

// Также слушаем обновление вкладки (если пользователь ввел адрес вручную)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        checkAndBlock(tabId, changeInfo.url);
    }
});

// Периодическая проверка раз в минуту на случай, если время наступило, пока вкладка открыта
setInterval(() => {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && tab.id) {
                checkAndBlock(tab.id, tab.url);
            }
        });
    });
}, 60000); // 60 секунд