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
    const clearAllBtn = document.getElementById('clearAllBtn');
    const editModeIndicator = document.getElementById('editModeIndicator');
    const editingSite = document.getElementById('editingSite');

    let selectedDays = new Set([1, 2, 3, 4, 5]);
    let editingIndex = -1; // -1 means not editing
    let allRules = [];

    function getRuleKey(rule) {
        const days = [...rule.days].sort((a, b) => a - b).join(',');
        return `${rule.site}|${rule.start}|${rule.end}|${days}`;
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
        
        selectedDays.clear();
        [1, 2, 3, 4, 5].forEach(d => selectedDays.add(d));
        renderDayButtons();
        
        // Update UI
        addBtn.style.display = 'block';
        updateBtn.style.display = 'none';
        cancelEditBtn.style.display = 'none';
        editModeIndicator.classList.remove('active');
    }

    // Load and display rules
    function loadRules() {
        chrome.storage.local.get({ rules: [], blockAttempts: {} }, (data) => {
            allRules = data.rules;
            const blockAttempts = data.blockAttempts || {};
            
            if (allRules.length === 0) {
                rulesListDiv.innerHTML = '<div style="color:#888; text-align:center; padding:10px;">No rules</div>';
                return;
            }
            
            let html = '';
            allRules.forEach((rule, index) => {
                const daysStr = rule.days.map(d => dayNames[d-1]).join(', ');
                const attemptsCount = blockAttempts[getRuleKey(rule)] || 0;
                html += `
                    <div class="list-item">
                        <div class="list-item-content" data-index="${index}">
                            <span>${rule.site}</span><span class="attempts-count">попыток: ${attemptsCount}</span><br>
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
            
            // Add event listeners for delete buttons
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(e.target.dataset.index);
                    deleteRule(index);
                });
            });
            
            // Add event listeners for edit buttons
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(e.target.dataset.index);
                    enterEditMode(index);
                });
            });
            
            // Add event listeners for clicking on rule content
            document.querySelectorAll('.list-item-content').forEach(content => {
                content.addEventListener('click', (e) => {
                    const index = parseInt(e.target.closest('.list-item-content').dataset.index);
                    enterEditMode(index);
                });
            });
        });
    }

    function deleteRule(index) {
        if (confirm('Delete this rule?')) {
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
                    loadRules();
                });
            });
        }
    }

    function clearAllRules() {
        if (confirm('Delete all rules?')) {
            chrome.storage.local.set({ rules: [], blockAttempts: {} }, () => {
                exitEditMode();
                loadRules();
            });
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
            days: Array.from(selectedDays).sort((a, b) => a - b)
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

    clearAllBtn.addEventListener('click', clearAllRules);
    
    // Initialize
    loadRules();
});
