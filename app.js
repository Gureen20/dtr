/**
 * Firebase Realtime Database & Authentication Wrapper
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDef37ugR50qWYnwX5S_b-L6Zg-P4An6fw",
  authDomain: "dtr-app-e47be.firebaseapp.com",
  databaseURL: "https://dtr-app-e47be-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dtr-app-e47be",
  storageBucket: "dtr-app-e47be.firebasestorage.app",
  messagingSenderId: "816024143039",
  appId: "1:816024143039:web:edfc2cbfb5d740ec03320a",
  measurementId: "G-Q1QXEF2E0P"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Global State
let activeUserId = null;

// --- DB Hooks for Current User ---
async function saveUserProfile(userObj) {
    if(!activeUserId) return false;
    await set(ref(db, 'users/' + activeUserId), userObj);
    return true;
}

async function getUserProfile() {
    if(!activeUserId) return null;
    const snapshot = await get(ref(db, 'users/' + activeUserId));
    return snapshot.exists() ? snapshot.val() : null;
}

// --- DB Hooks for Logs ---
async function getLog(dateStr) {
    if(!activeUserId) return null;
    const id = `${activeUserId}_${dateStr}`;
    const snapshot = await get(ref(db, 'logs/' + id));
    if (snapshot.exists()) {
        return snapshot.val();
    }
    return {
        id, userId: activeUserId, date: dateStr,
        amIn: null, amOut: null, pmIn: null, pmOut: null,
        undertime: 0,
        notes: "",
        images: []
    };
}

async function saveLog(logData) {
    if(!activeUserId) return false;
    await set(ref(db, 'logs/' + logData.id), logData);
    return true;
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

    // DOM Elements
    const authPortal = document.getElementById('auth-portal');
    const mainApp = document.getElementById('app');
    const activeUserDisplay = document.getElementById('active-user-display');
    const btnSignout = document.getElementById('btn-signout');
    
    // --- Authentication Logic ---
    const authForm = document.getElementById('auth-form');
    const inputEmail = document.getElementById('auth-email');
    const inputPassword = document.getElementById('auth-password');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const btnToggle = document.getElementById('btn-auth-toggle');
    const authError = document.getElementById('auth-error');
    const authTitle = document.getElementById('auth-title');

    let isSignUpMode = false;

    btnToggle.addEventListener('click', () => {
        isSignUpMode = !isSignUpMode;
        if(isSignUpMode) {
            authTitle.innerText = "Create Account";
            btnSubmit.innerText = "Sign Up";
            btnToggle.innerText = "Already have an account? Sign In instead.";
        } else {
            authTitle.innerText = "Welcome Back";
            btnSubmit.innerText = "Sign In";
            btnToggle.innerText = "Need an account? Sign Up instead.";
        }
        authError.style.display = 'none';
        inputPassword.value = '';
    });

    authForm.addEventListener('submit', async () => {
        const email = inputEmail.value.trim();
        const password = inputPassword.value;
        authError.style.display = 'none';
        btnSubmit.disabled = true;
        btnSubmit.innerText = "Please wait...";

        try {
            if(isSignUpMode) {
                await createUserWithEmailAndPassword(auth, email, password);
                // On success, Firebase redirects to onAuthStateChanged auto-login
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            authError.innerText = error.message.replace('Firebase: ', '');
            authError.style.display = 'block';
            btnSubmit.disabled = false;
            btnSubmit.innerText = isSignUpMode ? "Sign Up" : "Sign In";
        }
    });

    btnSignout.addEventListener('click', async () => {
        await signOut(auth);
    });

    // Central Auth State Observer
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in
            activeUserId = user.uid;
            authPortal.classList.remove('active');
            mainApp.style.display = 'flex';
            inputPassword.value = '';
            btnSubmit.disabled = false;
            btnSubmit.innerText = isSignUpMode ? "Sign Up" : "Sign In";
            
            activeUserDisplay.innerText = `Logged in: ${user.email}`;
            
            // Boot User App State
            await loadProfileData();
            await reloadTodayLogs();
            refreshReportOptions();
        } else {
            // User is signed out
            activeUserId = null;
            authPortal.classList.add('active');
            mainApp.style.display = 'none';
        }
    });

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
        if(viewId === 'view-report') refreshReportOptions();
    };

    navDashboard.addEventListener('click', () => switchView('view-dashboard', navDashboard));
    navReport.addEventListener('click', () => switchView('view-report', navReport));
    navSettings.addEventListener('click', () => switchView('view-settings', navSettings));

    // --- Mobile Sidebar Toggle ---
    const sidebar = document.querySelector('.sidebar');
    const menuToggle = document.getElementById('btn-menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.add('open');
            if(overlay) overlay.classList.add('active');
        });
    }

    const closeSidebarIfMobile = () => {
        if(window.innerWidth <= 768) {
            sidebar.classList.remove('open');
            if(overlay) overlay.classList.remove('active');
        }
    };
    navButtons.forEach(btn => btn.addEventListener('click', closeSidebarIfMobile));
    if(overlay) overlay.addEventListener('click', closeSidebarIfMobile);

    // --- Clock Clock ---
    const timeDisplay = document.getElementById('current-date-time');
    setInterval(() => {
        timeDisplay.innerText = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);

    // --- Dashboard Specific Tracking ---
    let currentLog = null;
    
    const reloadTodayLogs = async () => {
        if(!activeUserId) return;
        let todayDateStr = getTodayStr();
        currentLog = await getLog(todayDateStr);
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
        document.getElementById('daily-notes').value = currentLog.notes || '';
        renderGallery();
    };

    document.getElementById('btn-clock-action').addEventListener('click', async (e) => {
        if(!activeUserId) return;
        const action = e.target.dataset.action;
        if (!action) return;
        currentLog[action] = formatTime(new Date());
        await saveLog(currentLog);
        checkLogState();
    });

    document.getElementById('btn-save-adjustment').addEventListener('click', async () => {
        if(!activeUserId) return;
        currentLog.undertime = parseInt(document.getElementById('manual-undertime').value) || 0;
        await saveLog(currentLog);
        alert('Adjustments saved.');
    });

    document.getElementById('btn-save-notes').addEventListener('click', async () => {
        if(!activeUserId || !currentLog) return;
        currentLog.notes = document.getElementById('daily-notes').value;
        await saveLog(currentLog);
        alert('Accomplishment report saved.');
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

    // --- Profile Management Engine (Replaces Users Engine) ---
    const inputName = document.getElementById('setting-name');
    const inputHours = document.getElementById('setting-hours');

    const loadProfileData = async () => {
        const p = await getUserProfile();
        inputName.value = p ? p.name : '';
        inputHours.value = p ? p.prescribed_hours : '';
    };

    document.getElementById('btn-save-user').addEventListener('click', async () => {
        const nameVal = inputName.value.trim();
        const hrsVal = inputHours.value.trim();
        if(!nameVal) return alert('Name is required');

        await saveUserProfile({
            id: activeUserId,
            name: nameVal,
            prescribed_hours: hrsVal
        });
        alert('Profile Updated Successfully!');
    });


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
            printContainer.innerHTML = '<div style="color: #ef4444; font-weight: bold;">Error: Not logged in.</div>';
            return;
        }

        const m = parseInt(reportMonth.value);
        const y = parseInt(reportYear.value);
        const currentUser = await getUserProfile();
        
        const userName = currentUser ? currentUser.name : 'Unknown User';
        const userHours = currentUser ? currentUser.prescribed_hours : '';
        const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m];

        // Fetch logs from Firebase exactly matching user/month
        const snapshot = await get(ref(db, 'logs'));
        let monthLogs = {};
        
        if(snapshot.exists()) {
            const allLogs = Object.values(snapshot.val());
            monthLogs = allLogs.filter(log => {
                const d = new Date(log.date);
                return log.userId === activeUserId && d.getMonth() === m && d.getFullYear() === y;
            }).reduce((acc, log) => {
                acc[log.date] = log;
                return acc;
            }, {});
        }

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

});
