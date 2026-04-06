/**
 * Database Wrapper (IndexedDB)
 */
const DB_NAME = 'DTR_Database';
const DB_VERSION = 2; // Bumped version for multi-user upgrade
const STORE_USERS = 'users'; // Key: 'id'
const STORE_LOGS = 'user_logs'; // Key: 'userId_date'

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // Create Users store
            if (!db.objectStoreNames.contains(STORE_USERS)) {
                db.createObjectStore(STORE_USERS, { keyPath: 'id' });
            }
            // Create New Logs Store (Multi-tenant)
            if (!db.objectStoreNames.contains(STORE_LOGS)) {
                db.createObjectStore(STORE_LOGS, { keyPath: 'id' }); // id will be 'userId_date'
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- DB Hooks for Users ---
async function saveUserDB(userObj) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_USERS, 'readwrite');
        const store = tx.objectStore(STORE_USERS);
        const req = store.put(userObj);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

async function getAllUsersDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_USERS, 'readonly');
        const store = tx.objectStore(STORE_USERS);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deleteUserDB(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_USERS, 'readwrite');
        const store = tx.objectStore(STORE_USERS);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

async function getUserDB(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_USERS, 'readonly');
        const store = tx.objectStore(STORE_USERS);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// --- DB Hooks for Logs ---
async function getLog(userId, dateStr) {
    const db = await initDB();
    const id = `${userId}_${dateStr}`;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_LOGS, 'readonly');
        const store = tx.objectStore(STORE_LOGS);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || {
            id, userId, date: dateStr,
            amIn: null, amOut: null, pmIn: null, pmOut: null,
            undertime: 0,
            images: []
        });
        req.onerror = () => reject(req.error);
    });
}

async function saveLog(logData) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_LOGS, 'readwrite');
        const store = tx.objectStore(STORE_LOGS);
        const req = store.put(logData);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

/**
 * App Logic
 */
const getTodayStr = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
};

const formatTime = (dateObj) => {
    return dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

document.addEventListener('DOMContentLoaded', async () => {
    
    // Global User State
    let usersList = [];
    let activeUserId = localStorage.getItem('lastActiveUser') || null;

    // --- Core Navigation ---
    const navDashboard = document.getElementById('nav-dashboard');
    const navReport = document.getElementById('nav-report');
    const navSettings = document.getElementById('nav-settings');
    const views = document.querySelectorAll('.view');
    const navButtons = [navDashboard, navReport, navSettings];

    const switchView = (viewId, activeNav) => {
        views.forEach(v => v.classList.remove('active'));
        navButtons.forEach(b => b.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        activeNav.classList.add('active');
        
        if(viewId === 'view-report') {
            refreshReportOptions();
        }
    };

    navDashboard.addEventListener('click', () => switchView('view-dashboard', navDashboard));
    navReport.addEventListener('click', () => switchView('view-report', navReport));
    navSettings.addEventListener('click', () => switchView('view-settings', navSettings));

    // --- Clock Clock ---
    const timeDisplay = document.getElementById('current-date-time');
    setInterval(() => {
        timeDisplay.innerText = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);


    // --- Global App Scoping updates ---
    const updateGlobalScope = async () => {
        // Enforce warnings if no active string is running
        const warningBlock = document.getElementById('no-user-warning');
        const dashboardView = document.getElementById('view-dashboard');
        
        if(!activeUserId) {
            warningBlock.style.display = 'block';
            dashboardView.style.opacity = '0.1';
            dashboardView.style.pointerEvents = 'none';
        } else {
            warningBlock.style.display = 'none';
            dashboardView.style.opacity = '1';
            dashboardView.style.pointerEvents = 'auto';
            // Actually reload dashboard logs 
            await reloadTodayLogs();
        }
    };


    // --- Dashboard Specific Tracking ---
    let currentLog = null;
    
    const reloadTodayLogs = async () => {
        if(!activeUserId) return;
        let todayDateStr = getTodayStr();
        currentLog = await getLog(activeUserId, todayDateStr);
        checkLogState();
    };

    const checkLogState = () => {
        if(!currentLog) return;
        const { amIn, amOut, pmIn, pmOut, undertime } = currentLog;
        let nextAction = '';
        let buttonText = '';
        let buttonDisabled = false;

        document.getElementById('log-am-in').innerText = amIn || '--:--';
        document.getElementById('log-am-out').innerText = amOut || '--:--';
        document.getElementById('log-pm-in').innerText = pmIn || '--:--';
        document.getElementById('log-pm-out').innerText = pmOut || '--:--';

        const statusText = document.getElementById('current-status-text');
        const indicator = document.querySelector('.status-indicator');
        
        if (!amIn) {
            nextAction = 'amIn'; buttonText = 'Clock In (AM Arrival)'; indicator.classList.remove('active'); statusText.innerText = 'Not Clocked In';
        } else if (!amOut) {
            nextAction = 'amOut'; buttonText = 'Clock Out (AM Departure)'; indicator.classList.add('active'); statusText.innerText = 'Clocked In (AM)';
        } else if (!pmIn) {
            nextAction = 'pmIn'; buttonText = 'Clock In (PM Arrival)'; indicator.classList.remove('active'); statusText.innerText = 'On Break (Lunch)';
        } else if (!pmOut) {
            nextAction = 'pmOut'; buttonText = 'Clock Out (PM Departure)'; indicator.classList.add('active'); statusText.innerText = 'Clocked In (PM)';
        } else {
            buttonText = 'Shift Completed'; buttonDisabled = true; indicator.classList.remove('active'); statusText.innerText = 'Shift Completed';
        }

        const btn = document.getElementById('btn-clock-action');
        btn.innerText = buttonText;
        btn.disabled = buttonDisabled;
        btn.dataset.action = nextAction;
        
        document.getElementById('manual-undertime').value = undertime || '';
        renderGallery();
    };

    document.getElementById('btn-clock-action').addEventListener('click', async (e) => {
        if(!activeUserId) return;
        const action = e.target.dataset.action;
        if (!action) return;
        const now = new Date();
        currentLog[action] = formatTime(now);
        await saveLog(currentLog);
        checkLogState();
    });

    document.getElementById('btn-save-adjustment').addEventListener('click', async () => {
        if(!activeUserId) return;
        const undertime = parseInt(document.getElementById('manual-undertime').value) || 0;
        currentLog.undertime = undertime;
        await saveLog(currentLog);
        alert('Adjustments saved.');
    });


    // --- Media Gallery ---
    const uploadZone = document.getElementById('upload-zone');
    const fileUpload = document.getElementById('file-upload');

    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault(); uploadZone.classList.remove('dragover');
        if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
    fileUpload.addEventListener('change', (e) => handleFiles(e.target.files));

    const handleFiles = (files) => {
        if(!activeUserId || !currentLog) return;
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                currentLog.images = currentLog.images || [];
                currentLog.images.push(e.target.result);
                await saveLog(currentLog);
                renderGallery();
            };
            reader.readAsDataURL(file); 
        });
    };

    const renderGallery = () => {
        const gallery = document.getElementById('image-gallery');
        gallery.innerHTML = '';
        if(currentLog && currentLog.images && currentLog.images.length) {
            currentLog.images.forEach(dataUrl => {
                const img = document.createElement('img');
                img.src = dataUrl;
                img.className = 'gallery-img';
                gallery.appendChild(img);
            });
        }
    };

    // --- User Switching (Sidebar Dropdown) ---
    const selectUserUi = document.getElementById('active-user-select');
    
    selectUserUi.addEventListener('change', async (e) => {
        activeUserId = e.target.value;
        if(activeUserId) {
            localStorage.setItem('lastActiveUser', activeUserId);
        } else {
            localStorage.removeItem('lastActiveUser');
        }
        updateGlobalScope();
        refreshReportOptions();
    });

    const repopulateDropdown = () => {
        selectUserUi.innerHTML = '<option value="">-- Select Active User --</option>';
        usersList.forEach(u => {
            const isSelected = (u.id === activeUserId) ? 'selected' : '';
            selectUserUi.innerHTML += `<option value="${u.id}" ${isSelected}>${u.name}</option>`;
        });
    };

    // --- User Management Engine (Settings View) ---
    const renderUsersList = () => {
        const listDiv = document.getElementById('users-list-container');
        listDiv.innerHTML = '';
        if(usersList.length === 0) {
            listDiv.innerHTML = '<p class="subtitle">No users added yet.</p>';
            return;
        }

        usersList.forEach(user => {
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `
                <div class="user-info">
                    <strong>${user.name}</strong>
                    <small>Hours: ${user.prescribed_hours}</small>
                </div>
                <div class="user-actions">
                    <button class="btn-secondary btn-sm" onclick="appContext.editUser('${user.id}')">Edit</button>
                    <button class="btn-danger btn-sm" onclick="appContext.deleteUser('${user.id}')">Delete</button>
                </div>
            `;
            listDiv.appendChild(div);
        });
        repopulateDropdown();
    };

    const loadUsersEngine = async () => {
        usersList = await getAllUsersDB();
        
        // Safety bounds
        if(activeUserId && !usersList.find(u => u.id === activeUserId)) {
            activeUserId = null;
            localStorage.removeItem('lastActiveUser');
        }

        renderUsersList();
        updateGlobalScope();
    };

    const inputUserId = document.getElementById('edit-user-id');
    const inputName = document.getElementById('setting-name');
    const inputHours = document.getElementById('setting-hours');
    const btnCancel = document.getElementById('btn-cancel-edit');
    const titleForm = document.getElementById('user-form-title');

    document.getElementById('btn-save-user').addEventListener('click', async () => {
        const nameVal = inputName.value.trim();
        const hrsVal = inputHours.value.trim();
        if(!nameVal) return alert('Name is required');

        const uId = inputUserId.value || 'usr_' + Date.now();
        const userObj = {
            id: uId,
            name: nameVal,
            prescribed_hours: hrsVal
        };

        await saveUserDB(userObj);
        
        // Auto select if first user
        if(usersList.length === 0 && !activeUserId) {
            activeUserId = uId;
            localStorage.setItem('lastActiveUser', uId);
        }

        resetUserForm();
        await loadUsersEngine();
    });

    const resetUserForm = () => {
        inputName.value = '';
        inputHours.value = '';
        inputUserId.value = '';
        titleForm.innerText = 'Add New User';
        btnCancel.style.display = 'none';
    };

    btnCancel.addEventListener('click', resetUserForm);

    // Context Bridge for inline onclick html hooks
    window.appContext = {
        editUser: (id) => {
            const user = usersList.find(u => u.id === id);
            if(!user) return;
            inputUserId.value = user.id;
            inputName.value = user.name;
            inputHours.value = user.prescribed_hours;
            titleForm.innerText = 'Edit User: ' + user.name;
            btnCancel.style.display = 'inline-block';
        },
        deleteUser: async (id) => {
            if(confirm("Delete this user? Cannot be undone.")) {
                await deleteUserDB(id);
                if(activeUserId === id) {
                    activeUserId = null;
                    localStorage.removeItem('lastActiveUser');
                }
                resetUserForm();
                await loadUsersEngine();
            }
        }
    };


    // --- Report / Print Engine ---
    const reportMonth = document.getElementById('report-month');
    const reportYear = document.getElementById('report-year');
    
    const refreshReportOptions = () => {
        const now = new Date();
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        if(reportMonth.options.length === 0) {
            months.forEach((m, i) => {
                reportMonth.innerHTML += `<option value="${i}">${m}</option>`;
            });
            reportMonth.value = now.getMonth();
        }
        if(reportYear.options.length === 0) {
            let y = now.getFullYear();
            reportYear.innerHTML = `<option value="${y-1}">${y-1}</option><option value="${y}">${y}</option><option value="${y+1}">${y+1}</option>`;
            reportYear.value = y;
        }
        
        if(document.getElementById('view-report').classList.contains('active')) {
            generateForm48();
        }
    };

    const generateForm48 = async () => {
        const printContainer = document.getElementById('printable-form-container');
        
        if(!activeUserId) {
            printContainer.innerHTML = '<div style="padding: 2rem; color: #ef4444; font-weight: bold;">Error: No active user selected. Please select a user from the sidebar first.</div>';
            return;
        }

        const m = parseInt(reportMonth.value);
        const y = parseInt(reportYear.value);
        const currentUser = await getUserDB(activeUserId);
        
        const userName = currentUser ? currentUser.name : 'Unknown User';
        const userHours = currentUser ? currentUser.prescribed_hours : '';
        const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m];

        // Fetch logs
        const db = await initDB();
        const tx = db.transaction(STORE_LOGS, 'readonly');
        const store = tx.objectStore(STORE_LOGS);
        const allLogs = await new Promise((res, rej) => {
            const req = store.getAll();
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });

        const monthLogs = allLogs.filter(log => {
            const d = new Date(log.date);
            return log.userId === activeUserId && d.getMonth() === m && d.getFullYear() === y;
        }).reduce((acc, log) => {
            acc[log.date] = log;
            return acc;
        }, {});

        const daysInMonth = new Date(y, m + 1, 0).getDate();
        let rows = '';

        let totalUndertimeMins = 0;

        for(let i=1; i<=daysInMonth; i++) {
            const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const log = monthLogs[dateStr] || {};
            
            const uMin = log.undertime || 0;
            totalUndertimeMins += uMin;

            const formatTimeOutput = (t) => t ? t.replace(/\s*[AP]M\s*/i, '') : "";

            rows += `
                <tr>
                    <td>${i}</td>
                    <td>${formatTimeOutput(log.amIn)}</td>
                    <td>${formatTimeOutput(log.amOut)}</td>
                    <td>${formatTimeOutput(log.pmIn)}</td>
                    <td>${formatTimeOutput(log.pmOut)}</td>
                    <td>${uMin > 0 ? Math.floor(uMin/60) : ''}</td>
                    <td>${uMin > 0 ? uMin%60 : ''}</td>
                </tr>
            `;
        }

        const totalHrsUndertime = Math.floor(totalUndertimeMins/60);
        const totalMinsUndertime = totalUndertimeMins%60;

        const tableTemplate = `
            <table class="cs-table">
                <thead>
                    <tr>
                        <th rowspan="2">Day</th>
                        <th colspan="2">A.M.</th>
                        <th colspan="2">P.M.</th>
                        <th colspan="2">Undertime</th>
                    </tr>
                    <tr>
                        <th>Arrival</th>
                        <th>Departure</th>
                        <th>Arrival</th>
                        <th>Departure</th>
                        <th>Hours</th>
                        <th>Minutes</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr>
                        <td colspan="5" style="text-align: right; font-weight: bold; padding-right: 5px;">TOTAL</td>
                        <td>${totalHrsUndertime > 0 ? totalHrsUndertime : ''}</td>
                        <td>${totalMinsUndertime > 0 ? totalMinsUndertime : ''}</td>
                    </tr>
                </tbody>
            </table>
        `;

        const template = `
            <div class="cs-form-48">
                <div class="cs-form-title">
                    <h4>Civil Service Form No. 48</h4>
                    <h3>DAILY TIME RECORD</h3>
                    <div class="cs-emp-name">----- ${userName} -----</div>
                    <div>(Name)</div>
                </div>
                <div class="cs-header-info">
                    <div>For the month of: <span style="font-weight:bold;border-bottom:1px solid black;padding:0 10px;">${monthName} ${y}</span></div>
                    <div>Official hours for arrival<br>and departure</div>
                    <div style="display:flex; justify-content:space-between">
                        <span>Regular days: <span style="border-bottom:1px solid black;padding:0 5px;">${userHours}</span></span>
                        <span>Saturdays: ___________________</span>
                    </div>
                </div>
                ${tableTemplate}
                <div class="cs-footer">
                    <p>
                        I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
                    </p>
                    <div class="cs-signature-line"></div>
                    <div class="cs-signature-label">(Signature)</div>
                    <p>VERIFIED as to the prescribed office hours:</p>
                    <div class="cs-signature-line"></div>
                    <div class="cs-signature-label">(In Charge)</div>
                </div>
            </div>
        `;

        printContainer.innerHTML = `
            <div class="printable-page">
                ${template}
                ${template}
            </div>
        `;
    };

    reportMonth.addEventListener('change', generateForm48);
    reportYear.addEventListener('change', generateForm48);

    document.getElementById('btn-print').addEventListener('click', () => {
        if(!activeUserId) return alert("Select a user to print their report.");
        window.print();
    });

    // Boot Up
    await loadUsersEngine();
});
