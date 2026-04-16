const urlParams = new URLSearchParams(window.location.search);
const site = urlParams.get('site') || 'неизвестный сайт';
const start = urlParams.get('start') || '??:??';
const end = urlParams.get('end') || '??:??';
const ruleKey = urlParams.get('ruleKey') || '';
const attemptsRaw = parseInt(urlParams.get('attempts') || '0', 10);
const attempts = Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? attemptsRaw : 1;

document.getElementById('siteDisplay').textContent = site;
document.getElementById('timeDisplay').textContent = `Разрешён с ${start} до ${end} в выбранные дни`;
document.getElementById('attemptsDisplay').textContent = `Вы пытались зайти сюда уже ${attempts} раз`;

function updateAttemptsCounter() {
    if (!ruleKey || !chrome?.storage?.local) {
        return;
    }

    chrome.storage.local.get({ blockAttempts: {} }, (data) => {
        const blockAttempts = data.blockAttempts || {};
        const nextAttempts = (blockAttempts[ruleKey] || 0) + 1;
        blockAttempts[ruleKey] = nextAttempts;

        chrome.storage.local.set({ blockAttempts }, () => {
            document.getElementById('attemptsDisplay').textContent = `Вы пытались зайти сюда уже ${nextAttempts} раз`;
        });
    });
}

document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
});

updateAttemptsCounter();

// Небольшой обратный отсчет до конца блокировки (по времени)
function updateCountdown() {
    const now = new Date();
    const [endHour, endMin] = end.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(endHour, endMin, 0, 0);
    
    const diff = endTime - now;
    if (diff > 0) {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        document.getElementById('countdown').textContent = `До окончания блокировки: ${mins} мин ${secs} сек`;
    } else {
        document.getElementById('countdown').textContent = 'Блокировка должна закончиться. Попробуйте обновить страницу.';
    }
}
setInterval(updateCountdown, 1000);
updateCountdown();
