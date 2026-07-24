import { db } from './firebase_config.js';
import { ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- AUTHENTICATION FLOW ---
window.logoutStaff = () => {
    try {
        localStorage.removeItem('loggedStaff');
        localStorage.removeItem('staff_active_session');
        localStorage.removeItem('isAdminLoggedIn');
        window.location.href = 'index.html';
    } catch (e) { console.error("Logout Error:", e); }
};

window.handleUserLogout = () => {
    window.logoutStaff();
};

window.checkStaffAuth = () => {
    try {
        const saved = localStorage.getItem('loggedStaff');
        if (saved && document.getElementById('staff-dash-area')) {
            window.renderDashboard(JSON.parse(saved));
        } else if (document.getElementById('staff-auth-area')) {
            document.getElementById('staff-auth-area').classList.remove('hidden');
            document.getElementById('staff-dash-area').classList.add('hidden');
        }
    } catch (e) { console.error("Auth Check Error:", e); }
};

window.toggleStaffTab = (tab) => {
    try {
        const logTab = document.getElementById('s-tab-login');
        const regTab = document.getElementById('s-tab-reg');
        const logForm = document.getElementById('staff-login-form');
        const regForm = document.getElementById('staff-reg-form');

        if (!logTab || !regTab || !logForm || !regForm) return;

        if (tab === 'login') {
            logTab.classList.add('text-indigo-600', 'border-indigo-600');
            logTab.classList.remove('text-gray-400', 'border-transparent');
            regTab.classList.add('text-gray-400', 'border-transparent');
            regTab.classList.remove('text-indigo-600', 'border-indigo-600');
            logForm.classList.remove('hidden');
            regForm.classList.add('hidden');
        } else {
            regTab.classList.add('text-indigo-600', 'border-indigo-600');
            regTab.classList.remove('text-gray-400', 'border-transparent');
            logTab.classList.add('text-gray-400', 'border-transparent');
            logTab.classList.remove('text-indigo-600', 'border-indigo-600');
            regForm.classList.remove('hidden');
            logForm.classList.add('hidden');
        }
    } catch (e) { console.error("Toggle Tab Error:", e); }
};
