const i18n = window.TimeBlockerI18n;
const t = (key, params = {}) => i18n.t(key, params);

const urlParams = new URLSearchParams(window.location.search);
const start = urlParams.get('start') || '??:??';
const end = urlParams.get('end') || '??:??';
const ruleKey = urlParams.get('ruleKey') || '';

function getSiteName() {
    return urlParams.get('site') || t('blocked.siteUnknown');
}

function renderHeaderTexts() {
    const site = getSiteName();
    document.getElementById('siteDisplay').textContent = site;
    document.getElementById('timeDisplay').textContent = t('blocked.timeInfo', { start, end });
}

function getDayKey(now = new Date()) {
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getWeekKey(now = new Date()) {
    const utcDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const day = utcDate.getUTCDay() || 7; // 1..7, Monday-first
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function normalizeCounter(rawValue) {
    if (typeof rawValue === 'number') {
        return {
            dayKey: getDayKey(),
            dayCount: rawValue,
            weekKey: getWeekKey(),
            weekCount: rawValue
        };
    }

    return {
        dayKey: rawValue?.dayKey || getDayKey(),
        dayCount: Number(rawValue?.dayCount) || 0,
        weekKey: rawValue?.weekKey || getWeekKey(),
        weekCount: Number(rawValue?.weekCount) || 0
    };
}

function renderCounters(dayCount, weekCount) {
    document.getElementById('dailyAttemptsDisplay').textContent = t('blocked.dailyAttempts', { count: dayCount });
    document.getElementById('weeklyAttemptsDisplay').textContent = t('blocked.weeklyAttempts', { count: weekCount });
}

function updateAttemptsCounter() {
    if (!ruleKey || !chrome?.storage?.local) {
        renderCounters(1, 1);
        return;
    }

    chrome.storage.local.get({ blockAttempts: {} }, (data) => {
        const blockAttempts = data.blockAttempts || {};
        const now = new Date();
        const todayKey = getDayKey(now);
        const currentWeekKey = getWeekKey(now);
        const currentCounter = normalizeCounter(blockAttempts[ruleKey]);

        if (currentCounter.dayKey !== todayKey) {
            currentCounter.dayKey = todayKey;
            currentCounter.dayCount = 0;
        }

        if (currentCounter.weekKey !== currentWeekKey) {
            currentCounter.weekKey = currentWeekKey;
            currentCounter.weekCount = 0;
        }

        currentCounter.dayCount += 1;
        currentCounter.weekCount += 1;
        blockAttempts[ruleKey] = currentCounter;

        chrome.storage.local.set({ blockAttempts }, () => {
            renderCounters(currentCounter.dayCount, currentCounter.weekCount);
        });
    });
}

document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
});

function updateCountdown() {
    const now = new Date();
    const [endHour, endMin] = end.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(endHour, endMin, 0, 0);

    const diff = endTime - now;
    if (diff > 0) {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        document.getElementById('countdown').textContent = t('blocked.countdown', { mins, secs });
    } else {
        document.getElementById('countdown').textContent = t('blocked.finished');
    }
}

setInterval(updateCountdown, 1000);

i18n.init(() => {
    renderHeaderTexts();
    updateAttemptsCounter();
    updateCountdown();
});
