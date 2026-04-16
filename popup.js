const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

document.addEventListener('DOMContentLoaded', () => {
    const daysContainer = document.getElementById('daysContainer');
    const siteInput = document.getElementById('siteInput');
    const insertCurrentDomainBtn = document.getElementById('insertCurrentDomainBtn');
    const startTime = document.getElementById('startTime');
    const endTime = document.getElementById('endTime');
    const addBtn = document.getElementById('addBtn');
    const updateBtn = document.getElementById('updateBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const newRuleBtn = document.getElementById('newRuleBtn');
    const rulesListDiv = document.getElementById('rulesList');
    const ruleEditorSection = document.getElementById('ruleEditorSection');
    const editModeIndicator = document.getElementById('editModeIndicator');
    const editingSite = document.getElementById('editingSite');
    const hardDeleteToggle = document.getElementById('hardDeleteToggle');
    const holdDeletePanel = document.getElementById('holdDeletePanel');
    const holdDeleteBtn = document.getElementById('holdDeleteBtn');
    const holdDeleteText = document.getElementById('holdDeleteText');
    const holdDeleteNote = document.getElementById('holdDeleteNote');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const holdDurationInput = document.getElementById('holdDurationInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const settingsCloseIcon = document.getElementById('settingsCloseIcon');
    const hardDeleteLabel = document.getElementById('hardDeleteLabel');
    const syncTimersBtn = document.getElementById('syncTimersBtn');
    const syncTimersText = document.getElementById('syncTimersText');

    let selectedDays = new Set([1, 2, 3, 4, 5]);
    let editingIndex = -1; // -1 means not editing
    let allRules = [];
    let selectedRuleIndex = null;
    let isEditLocked = false;
    let storageChangeDebounce = null;
    let holdDeleteTimer = null;
    let holdDeleteRaf = null;
    let holdDeleteStart = null;
    let pendingHoldAction = null; // { type: 'delete' | 'edit', index: number }
    const DEFAULT_HOLD_DELETE_SECONDS = 20;
    let holdDeleteSeconds = DEFAULT_HOLD_DELETE_SECONDS;
    let activeHoldDeleteSeconds = DEFAULT_HOLD_DELETE_SECONDS;
    let syncTimersTimer = null;
    let syncTimersRaf = null;
    let syncTimersStart = null;
    let saveSettingsResetTimer = null;

    function getHoldDeleteMs() {
        return (pendingHoldAction?.seconds || activeHoldDeleteSeconds) * 1000;
    }

    function getHoldBaseText(actionType, seconds = pendingHoldAction?.seconds || activeHoldDeleteSeconds) {
        if (actionType === 'delete') {
            return `Удерживайте ${seconds}с для удаления`;
        }
        if (actionType === 'edit') {
            return `Удерживайте ${seconds}с для редактирования`;
        }
        return `Удерживайте ${seconds}с`;
    }

    function getSyncTimersBaseText() {
        return `Удерживайте ${activeHoldDeleteSeconds}с для обновления текущих таймеров`;
    }

    function refreshHoldLabels() {
        hardDeleteLabel.textContent = `Сложное удаление (удерживать ${activeHoldDeleteSeconds}с)`;
        holdDeleteText.textContent = getHoldBaseText(pendingHoldAction?.type);
        syncTimersText.textContent = getSyncTimersBaseText();
        syncTimersBtn.style.setProperty('--progress', '0%');
    }

    function openSettings() {
        holdDurationInput.value = holdDeleteSeconds;
        settingsModal.classList.add('active');
    }

    function closeSettings() {
        settingsModal.classList.remove('active');
        cancelSyncTimersHold();
    }

    function loadSettings(callback) {
        chrome.storage.local.get({
            holdDeleteSeconds: DEFAULT_HOLD_DELETE_SECONDS,
            activeHoldDeleteSeconds: DEFAULT_HOLD_DELETE_SECONDS
        }, (data) => {
            const rawSeconds = Number(data.holdDeleteSeconds);
            holdDeleteSeconds = Number.isFinite(rawSeconds) ? Math.max(1, Math.min(300, Math.round(rawSeconds))) : DEFAULT_HOLD_DELETE_SECONDS;
            const rawActiveSeconds = Number(data.activeHoldDeleteSeconds);
            activeHoldDeleteSeconds = Number.isFinite(rawActiveSeconds)
                ? Math.max(1, Math.min(300, Math.round(rawActiveSeconds)))
                : holdDeleteSeconds;
            refreshHoldLabels();
            if (typeof callback === 'function') callback();
        });
    }

    function stopSyncTimersHold() {
        if (syncTimersTimer) {
            clearTimeout(syncTimersTimer);
            syncTimersTimer = null;
        }
        if (syncTimersRaf) {
            cancelAnimationFrame(syncTimersRaf);
            syncTimersRaf = null;
        }
        syncTimersStart = null;
        syncTimersBtn.style.setProperty('--progress', '0%');
    }

    function updateSyncTimersProgress() {
        if (!syncTimersStart) return;
        const holdMs = activeHoldDeleteSeconds * 1000;
        const elapsed = Date.now() - syncTimersStart;
        const progress = Math.min(100, (elapsed / holdMs) * 100);
        syncTimersBtn.style.setProperty('--progress', `${progress}%`);
        syncTimersText.textContent = `Удерживайте... ${Math.max(0, Math.ceil((holdMs - elapsed) / 1000))}с`;
        if (elapsed < holdMs) {
            syncTimersRaf = requestAnimationFrame(updateSyncTimersProgress);
        }
    }

    function beginSyncTimersHold(e) {
        if (e) e.preventDefault();
        stopSyncTimersHold();
        syncTimersStart = Date.now();
        const holdMs = activeHoldDeleteSeconds * 1000;
        syncTimersRaf = requestAnimationFrame(updateSyncTimersProgress);
        syncTimersTimer = setTimeout(() => {
            activeHoldDeleteSeconds = holdDeleteSeconds;
            const updatedRules = allRules.map((rule) => ({
                ...rule,
                holdDeleteSeconds: holdDeleteSeconds
            }));
            allRules = updatedRules;
            chrome.storage.local.set({ activeHoldDeleteSeconds, rules: updatedRules }, () => {
                stopSyncTimersHold();
                refreshHoldLabels();
                if (pendingHoldAction) {
                    requestHoldAction(pendingHoldAction.type, pendingHoldAction.index);
                }
            });
        }, holdMs);
    }

    function cancelSyncTimersHold() {
        stopSyncTimersHold();
        syncTimersText.textContent = getSyncTimersBaseText();
    }

    function getRuleKey(rule) {
        const days = [...rule.days].sort((a, b) => a - b).join(',');
        return `${rule.site}|${rule.start}|${rule.end}|${days}`;
    }

    function getDayKey(now = new Date()) {
        return now.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    function getDailyCount(rawValue) {
        if (typeof rawValue === 'number') {
            return rawValue;
        }

        if (!rawValue || rawValue.dayKey !== getDayKey()) {
            return 0;
        }

        return Number(rawValue.dayCount) || 0;
    }

    // Render day buttons
    function renderDayButtons() {
        daysContainer.innerHTML = '';
        dayNames.forEach((name, index) => {
            const dayNum = index + 1;
            const btn = document.createElement('div');
            btn.className = `day-btn ${selectedDays.has(dayNum) ? 'selected' : ''} ${isEditLocked ? 'disabled' : ''}`;
            btn.textContent = name;
            btn.addEventListener('click', () => {
                if (isEditLocked) return;
                if (selectedDays.has(dayNum)) {
                    selectedDays.delete(dayNum);
                } else {
                    selectedDays.add(dayNum);
                }
                renderDayButtons();
            });
            daysContainer.appendChild(btn);
        });
    }
    renderDayButtons();

    function setEditLockState(locked) {
        isEditLocked = locked;
        siteInput.readOnly = locked;
        insertCurrentDomainBtn.disabled = locked;
        startTime.disabled = locked;
        endTime.disabled = locked;
        hardDeleteToggle.disabled = locked;
        updateBtn.disabled = locked;
        ruleEditorSection.classList.toggle('editor-locked', locked);
        renderDayButtons();
    }

    function normalizeDomainFromUrl(rawUrl) {
        try {
            const parsed = new URL(rawUrl);
            if (!parsed.hostname) return '';
            return parsed.hostname.replace(/^www\./i, '');
        } catch (e) {
            return '';
        }
    }

    function insertCurrentTabDomain() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs && tabs[0];
            if (!activeTab || !activeTab.url) return;
            const domain = normalizeDomainFromUrl(activeTab.url);
            if (!domain) return;
            siteInput.value = domain;
            siteInput.focus();
            siteInput.setSelectionRange(domain.length, domain.length);
        });
    }

    insertCurrentDomainBtn.addEventListener('click', insertCurrentTabDomain);

    // Switch to edit mode
    function enterEditMode(index, options = {}) {
        const { locked = false } = options;
        const rule = allRules[index];
        resetHoldDeleteState(true);
        editingIndex = index;
        
        siteInput.value = rule.site;
        startTime.value = rule.start;
        endTime.value = rule.end;
        
        selectedDays.clear();
        rule.days.forEach(d => selectedDays.add(d));
        hardDeleteToggle.checked = Boolean(rule.hardDeleteEnabled);
        setEditLockState(locked);
        
        // Update UI
        addBtn.style.display = 'none';
        updateBtn.style.display = 'block';
        cancelEditBtn.style.display = 'block';
        editModeIndicator.classList.add('active');
        editingSite.textContent = locked ? `${rule.site} (locked)` : rule.site;
    }

    // Exit edit mode
    function exitEditMode() {
        editingIndex = -1;
        siteInput.value = '';
        startTime.value = '09:00';
        endTime.value = '18:00';
        hardDeleteToggle.checked = false;
        setEditLockState(false);
        
        selectedDays.clear();
        [1, 2, 3, 4, 5].forEach(d => selectedDays.add(d));
        
        // Update UI
        addBtn.style.display = 'block';
        updateBtn.style.display = 'none';
        cancelEditBtn.style.display = 'none';
        editModeIndicator.classList.remove('active');
    }

    function resetHoldDeleteState(hidePanel = false) {
        if (holdDeleteTimer) {
            clearTimeout(holdDeleteTimer);
            holdDeleteTimer = null;
        }
        if (holdDeleteRaf) {
            cancelAnimationFrame(holdDeleteRaf);
            holdDeleteRaf = null;
        }
        holdDeleteStart = null;
        holdDeleteBtn.style.setProperty('--progress', '0%');
        holdDeleteText.textContent = getHoldBaseText(pendingHoldAction?.type);
        if (hidePanel) {
            holdDeletePanel.classList.remove('active');
            pendingHoldAction = null;
            holdDeleteText.textContent = getHoldBaseText(undefined, activeHoldDeleteSeconds);
        }
    }

    function updateHoldDeleteProgress() {
        if (!holdDeleteStart) return;
        const elapsed = Date.now() - holdDeleteStart;
        const holdDeleteMs = getHoldDeleteMs();
        const progress = Math.min(100, (elapsed / holdDeleteMs) * 100);
        holdDeleteBtn.style.setProperty('--progress', `${progress}%`);
        holdDeleteText.textContent = `Удерживайте... ${Math.max(0, Math.ceil((holdDeleteMs - elapsed) / 1000))}с`;

        if (elapsed < holdDeleteMs) {
            holdDeleteRaf = requestAnimationFrame(updateHoldDeleteProgress);
        }
    }

    function confirmDelete(index) {
        const removedRule = allRules[index];
        allRules.splice(index, 1);
        chrome.storage.local.get({ blockAttempts: {} }, (data) => {
            const blockAttempts = data.blockAttempts || {};
            delete blockAttempts[getRuleKey(removedRule)];

            chrome.storage.local.set({ rules: allRules, blockAttempts }, () => {
                if (editingIndex === index) {
                    exitEditMode();
                } else if (editingIndex > index) {
                    editingIndex--;
                }
                resetHoldDeleteState(true);
                loadRules();
            });
        });
    }

    function confirmEdit(index) {
        resetHoldDeleteState(true);
        if (editingIndex === index) {
            setEditLockState(false);
            const rule = allRules[index];
            editingSite.textContent = rule.site;
            return;
        }
        enterEditMode(index);
    }

    function requestHoldAction(type, index) {
        const rule = allRules[index];
        const ruleHoldSecondsRaw = Number(rule?.holdDeleteSeconds);
        const ruleHoldSeconds = Number.isFinite(ruleHoldSecondsRaw)
            ? Math.max(1, Math.min(300, Math.round(ruleHoldSecondsRaw)))
            : activeHoldDeleteSeconds;
        pendingHoldAction = { type, index, seconds: ruleHoldSeconds };
        holdDeletePanel.classList.add('active');

        if (type === 'delete') {
            holdDeletePanel.querySelector('h3').textContent = 'Подтверждение удаления';
            holdDeleteNote.textContent = `Правило для ${rule.site}. Удерживайте кнопку ${ruleHoldSeconds} секунд без отпускания, чтобы удалить правило.`;
            holdDeleteText.textContent = getHoldBaseText('delete', ruleHoldSeconds);
        } else {
            holdDeletePanel.querySelector('h3').textContent = 'Разблокировка редактирования';
            holdDeleteNote.textContent = `Правило для ${rule.site} защищено сложным удалением. Удерживайте кнопку ${ruleHoldSeconds} секунд, чтобы открыть редактирование.`;
            holdDeleteText.textContent = getHoldBaseText('edit', ruleHoldSeconds);
        }

        resetHoldDeleteState(false);
    }

    function beginHoldDelete() {
        if (!pendingHoldAction) return;
        resetHoldDeleteState(false);
        holdDeleteStart = Date.now();
        holdDeleteRaf = requestAnimationFrame(updateHoldDeleteProgress);
        const holdDeleteMs = getHoldDeleteMs();
        holdDeleteTimer = setTimeout(() => {
            if (!pendingHoldAction) return;
            if (pendingHoldAction.type === 'delete') {
                confirmDelete(pendingHoldAction.index);
                return;
            }
            confirmEdit(pendingHoldAction.index);
        }, holdDeleteMs);
    }

    function cancelHoldDelete() {
        if (!pendingHoldAction) return;
        holdDeleteText.textContent = getHoldBaseText(pendingHoldAction.type);
        resetHoldDeleteState(false);
    }

    function setSelectedRule(index) {
        selectedRuleIndex = index;
        document.querySelectorAll('.list-item').forEach((item, itemIndex) => {
            item.classList.toggle('selected', itemIndex === selectedRuleIndex);
        });
    }

    // Load and display rules
    function loadRules() {
        chrome.storage.local.get({ rules: [], blockAttempts: {} }, (data) => {
            allRules = data.rules;
            const blockAttempts = data.blockAttempts || {};
            
            if (allRules.length === 0) {
                selectedRuleIndex = null;
                resetHoldDeleteState(true);
                rulesListDiv.innerHTML = '<div style="color:#888; text-align:center; padding:10px;">No rules</div>';
                return;
            }
            if (selectedRuleIndex !== null && (selectedRuleIndex < 0 || selectedRuleIndex >= allRules.length)) {
                selectedRuleIndex = null;
            }
            
            let html = '';
            allRules.forEach((rule, index) => {
                const daysStr = rule.days.map(d => dayNames[d-1]).join(', ');
                const attemptsCount = getDailyCount(blockAttempts[getRuleKey(rule)]);
                const ruleClassName = rule.hardDeleteEnabled ? 'list-item protected' : 'list-item';
                html += `
                    <div class="${ruleClassName}">
                        <div class="list-item-content" data-index="${index}">
                            <span>${rule.site}</span><span class="attempts-count">за день: ${attemptsCount}</span><br>
                            <small>${rule.start} - ${rule.end} | ${daysStr}</small>
                        </div>
                        <div class="list-item-actions">
                            <button class="edit-btn" data-index="${index}" title="Edit">✏️</button>
                            <button class="delete-btn" data-index="${index}" title="Delete">❌</button>
                        </div>
                    </div>
                `;
            });
            rulesListDiv.innerHTML = html;
            setSelectedRule(selectedRuleIndex);
            
            // Add event listeners for delete buttons
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(e.target.dataset.index);
                    setSelectedRule(index);
                    deleteRule(index);
                });
            });
            
            // Add event listeners for edit buttons
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(e.target.dataset.index);
                    setSelectedRule(index);
                    const targetRule = allRules[index];
                    if (targetRule?.hardDeleteEnabled) {
                        enterEditMode(index, { locked: true });
                        requestHoldAction('edit', index);
                        return;
                    }
                    enterEditMode(index);
                });
            });
            
            // Add event listeners for clicking on rule content
            document.querySelectorAll('.list-item-content').forEach(content => {
                content.addEventListener('click', (e) => {
                    const index = parseInt(e.target.closest('.list-item-content').dataset.index);
                    setSelectedRule(index);
                    const targetRule = allRules[index];
                    if (targetRule?.hardDeleteEnabled) {
                        enterEditMode(index, { locked: true });
                        requestHoldAction('edit', index);
                        return;
                    }
                    enterEditMode(index);
                });
            });
        });
    }

    function deleteRule(index) {
        const targetRule = allRules[index];
        if (targetRule?.hardDeleteEnabled) {
            requestHoldAction('delete', index);
            return;
        }

        resetHoldDeleteState(true);
        if (confirm('Delete this rule?')) {
            confirmDelete(index);
        }
    }

    // Validate and get rule from form
    function getRuleFromForm() {
        let site = siteInput.value.trim().toLowerCase();
        const start = startTime.value;
        const end = endTime.value;
        
        if (!site) {
            alert('Enter domain');
            return null;
        }
        
        site = site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        
        if (!start || !end) {
            alert('Select start and end time');
            return null;
        }
        
        if (selectedDays.size === 0) {
            alert('Select at least one day');
            return null;
        }

        return {
            site: site,
            start: start,
            end: end,
            days: Array.from(selectedDays).sort((a, b) => a - b),
            hardDeleteEnabled: hardDeleteToggle.checked,
            holdDeleteSeconds: holdDeleteSeconds
        };
    }

    // Add new rule
    addBtn.addEventListener('click', () => {
        const newRule = getRuleFromForm();
        if (!newRule) return;
        
        // Check for duplicate
        const duplicate = allRules.find(r => 
            r.site === newRule.site && 
            JSON.stringify(r.days) === JSON.stringify(newRule.days) && 
            r.start === newRule.start && 
            r.end === newRule.end
        );
        
        if (duplicate) {
            alert('This rule already exists');
            return;
        }
        
        allRules.push(newRule);
        chrome.storage.local.set({ rules: allRules }, () => {
            siteInput.value = '';
            loadRules();
        });
    });

    // Update existing rule
    updateBtn.addEventListener('click', () => {
        const updatedRule = getRuleFromForm();
        if (!updatedRule || editingIndex === -1) return;
        
        // Check for duplicate with other rules
        const duplicate = allRules.find((r, idx) => 
            idx !== editingIndex &&
            r.site === updatedRule.site && 
            JSON.stringify(r.days) === JSON.stringify(updatedRule.days) && 
            r.start === updatedRule.start && 
            r.end === updatedRule.end
        );
        
        if (duplicate) {
            alert('Another rule with these parameters already exists');
            return;
        }
        
        const previousRule = allRules[editingIndex];
        const previousKey = getRuleKey(previousRule);
        const updatedKey = getRuleKey(updatedRule);

        allRules[editingIndex] = updatedRule;
        chrome.storage.local.get({ blockAttempts: {} }, (data) => {
            const blockAttempts = data.blockAttempts || {};
            if (previousKey !== updatedKey) {
                blockAttempts[updatedKey] = blockAttempts[previousKey] || 0;
                delete blockAttempts[previousKey];
            }

            chrome.storage.local.set({ rules: allRules, blockAttempts }, () => {
                exitEditMode();
                loadRules();
            });
        });
    });

    // Cancel editing
    cancelEditBtn.addEventListener('click', exitEditMode);
    newRuleBtn.addEventListener('click', () => {
        resetHoldDeleteState(true);
        setSelectedRule(null);
        exitEditMode();
    });

    holdDeleteBtn.addEventListener('mousedown', beginHoldDelete);
    holdDeleteBtn.addEventListener('mouseup', cancelHoldDelete);
    holdDeleteBtn.addEventListener('mouseleave', cancelHoldDelete);
    holdDeleteBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        beginHoldDelete();
    }, { passive: false });
    holdDeleteBtn.addEventListener('touchend', cancelHoldDelete);
    holdDeleteBtn.addEventListener('touchcancel', cancelHoldDelete);

    settingsBtn.addEventListener('click', openSettings);
    settingsCloseIcon.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettings();
        }
    });
    saveSettingsBtn.addEventListener('click', () => {
        const parsed = Number(holdDurationInput.value);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 300) {
            alert('Введите число от 1 до 300');
            return;
        }
        holdDeleteSeconds = Math.round(parsed);
        chrome.storage.local.set({ holdDeleteSeconds }, () => {
            refreshHoldLabels();
            if (saveSettingsResetTimer) {
                clearTimeout(saveSettingsResetTimer);
                saveSettingsResetTimer = null;
            }
            saveSettingsBtn.textContent = '✅ Сохранено';
            saveSettingsBtn.disabled = true;
            saveSettingsResetTimer = setTimeout(() => {
                saveSettingsBtn.textContent = '💾 Сохранить';
                saveSettingsBtn.disabled = false;
                saveSettingsResetTimer = null;
            }, 1200);
        });
    });
    syncTimersBtn.addEventListener('mousedown', beginSyncTimersHold);
    syncTimersBtn.addEventListener('mouseup', cancelSyncTimersHold);
    syncTimersBtn.addEventListener('mouseleave', cancelSyncTimersHold);
    syncTimersBtn.addEventListener('touchstart', beginSyncTimersHold, { passive: false });
    syncTimersBtn.addEventListener('touchend', cancelSyncTimersHold);
    syncTimersBtn.addEventListener('touchcancel', cancelSyncTimersHold);

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || (!changes.rules && !changes.blockAttempts)) return;
        clearTimeout(storageChangeDebounce);
        storageChangeDebounce = setTimeout(loadRules, 80);
    });
    
    // Initialize
    loadSettings(loadRules);
});
