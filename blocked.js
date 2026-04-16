const urlParams = new URLSearchParams(window.location.search);
const site = urlParams.get('site') || 'неизвестный сайт';
const start = urlParams.get('start') || '??:??';
const end = urlParams.get('end') || '??:??';

document.getElementById('siteDisplay').textContent = site;
document.getElementById('timeDisplay').textContent = `Разрешён с ${start} до ${end} в выбранные дни`;

document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
});

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