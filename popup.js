const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

document.addEventListener('DOMContentLoaded', () => {
    const daysContainer = document.getElementById('daysContainer');
    const siteInput = document.getElementById('siteInput');
    const startTime = document.getElementById('startTime');
    const endTime = document.getElementById('endTime');
    const addBtn = document.getElementById('addBtn');
    const updateBtn = document.getElementById('updateBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const rulesListDiv = document.getElementById('rulesList');
    const editModeIndicator = document.getElementById('editModeIndicator');
    const editingSite = document.getElementById('editingSite');
    const hardDeleteToggle = document.getElementById('hardDeleteToggle');
    const holdDeletePanel = document.getElementById('holdDeletePanel');
    const holdDeleteBtn = document.getElementById('holdDeleteBtn');
    const holdDeleteText = document.getElementById('holdDeleteText');
    const holdDeleteNote = document.getElementById('holdDeleteNote');

    let selectedDays = new Set([1, 2, 3, 4, 5]);
    let editingIndex = -1; // -1 means not editing
    let allRules = [];
    let selectedRuleIndex = null;
    let storageChangeDebounce = null;
    let holdDeleteTimer = null;
    let holdDeleteRaf = null;
    let holdDeleteStart = null;
    let pendingHoldAction = null; // { type: 'delete' | 'edit', index: number }
    const HOLD_DELETE_MS = 20000;

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
            btn.className = `day-btn ${selectedDays.has(dayNum) ? 'selected' : ''}`;
            btn.textContent = name;
            btn.addEventListener('click', () => {
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

    // Switch to edit mode
    function enterEditMode(index) {
        const rule = allRules[index];
        editingIndex = index;
        
        siteInput.value = rule.site;
        startTime.value = rule.start;
        endTime.value = rule.end;
        
        selectedDays.clear();
        rule.days.forEach(d => selectedDays.add(d));
        renderDayButtons();
        hardDeleteToggle.checked = Boolean(rule.hardDeleteEnabled);
        
        // Update UI
        addBtn.style.display = 'none';
        updateBtn.style.display = 'block';
        cancelEditBtn.style.display = 'block';
        editModeIndicator.classList.add('active');
        editingSite.textContent = rule.site;
    }

    // Exit edit mode
    function exitEditMode() {
        editingIndex = -1;
        siteInput.value = '';
        startTime.value = '09:00';
        endTime.value = '18:00';
        hardDeleteToggle.checked = false;
        
        selectedDays.clear();
        [1, 2, 3, 4, 5].forEach(d => selectedDays.add(d));
        renderDayButtons();
        
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
        if (pendingHoldAction?.type === 'delete') {
            holdDeleteText.textContent = 'Удерживайте 20с для удаления';
        } else if (pendingHoldAction?.type === 'edit') {
            holdDeleteText.textContent = 'Удерживайте 20с для редактирования';
        } else {
            holdDeleteText.textContent = 'Удерживайте 20с';
        }
        if (hidePanel) {
            holdDeletePanel.classList.remove('active');
            pendingHoldAction = null;
            holdDeleteText.textContent = 'Удерживайте 20с';
        }
    }

    function updateHoldDeleteProgress() {
        if (!holdDeleteStart) return;
        const elapsed = Date.now() - holdDeleteStart;
        const progress = Math.min(100, (elapsed / HOLD_DELETE_MS) * 100);
        holdDeleteBtn.style.setProperty('--progress', `${progress}%`);
        holdDeleteText.textContent = `Удерживайте... ${Math.max(0, Math.ceil((HOLD_DELETE_MS - elapsed) / 1000))}с`;

        if (elapsed < HOLD_DELETE_MS) {
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
        enterEditMode(index);
    }

    function requestHoldAction(type, index) {
        const rule = allRules[index];
        pendingHoldAction = { type, index };
        holdDeletePanel.classList.add('active');

        if (type === 'delete') {
            holdDeletePanel.querySelector('h3').textContent = 'Подтверждение удаления';
            holdDeleteNote.textContent = `Правило для ${rule.site}. Удерживайте кнопку 20 секунд без отпускания, чтобы удалить правило.`;
            holdDeleteText.textContent = 'Удерживайте 20с для удаления';
        } else {
            holdDeletePanel.querySelector('h3').textContent = 'Разблокировка редактирования';
            holdDeleteNote.textContent = `Правило для ${rule.site} защищено сложным удалением. Удерживайте кнопку 20 секунд, чтобы открыть редактирование.`;
            holdDeleteText.textContent = 'Удерживайте 20с для редактирования';
        }

        resetHoldDeleteState(false);
    }

    function beginHoldDelete() {
        if (!pendingHoldAction) return;
        resetHoldDeleteState(false);
        holdDeleteStart = Date.now();
        holdDeleteRaf = requestAnimationFrame(updateHoldDeleteProgress);
        holdDeleteTimer = setTimeout(() => {
            if (!pendingHoldAction) return;
            if (pendingHoldAction.type === 'delete') {
                confirmDelete(pendingHoldAction.index);
                return;
            }
            confirmEdit(pendingHoldAction.index);
        }, HOLD_DELETE_MS);
    }

    function cancelHoldDelete() {
        if (!pendingHoldAction) return;
        if (pendingHoldAction.type === 'delete') {
            holdDeleteText.textContent = 'Удерживайте 20с для удаления';
        } else {
            holdDeleteText.textContent = 'Удерживайте 20с для редактирования';
        }
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
            hardDeleteEnabled: hardDeleteToggle.checked
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

    holdDeleteBtn.addEventListener('mousedown', beginHoldDelete);
    holdDeleteBtn.addEventListener('mouseup', cancelHoldDelete);
    holdDeleteBtn.addEventListener('mouseleave', cancelHoldDelete);
    holdDeleteBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        beginHoldDelete();
    }, { passive: false });
    holdDeleteBtn.addEventListener('touchend', cancelHoldDelete);
    holdDeleteBtn.addEventListener('touchcancel', cancelHoldDelete);

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || (!changes.rules && !changes.blockAttempts)) return;
        clearTimeout(storageChangeDebounce);
        storageChangeDebounce = setTimeout(loadRules, 80);
    });
    
    // Initialize
    loadRules();
});
