import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 SchoolLog Init: Checking Auth & Forms...");
    const path = window.location.pathname;

    try {
        // --- 1. ADMIN LOGIN FORM HANDLER ---
        const adminForm = document.getElementById('admin-login-form');
        if (adminForm) {
            adminForm.onsubmit = (e) => {
                e.preventDefault();
                const user = document.getElementById('admin-mobile').value.toLowerCase().trim();
                const pass = document.getElementById('admin-pass').value.trim();

                // HARDCODED ADMIN CREDENTIALS
                if ((user === 'admin' || user === '961486864461') && pass === '1234') {
                    console.log("✅ Admin Login Success");
                    localStorage.setItem('isAdminLoggedIn', 'true');
                    window.location.href = 'admin.html';
                } else {
                    alert("❌ Invalid Admin Credentials. Please use 'admin' and '1234'.");
                }
            };
        }

        // --- 2. STAFF LOGIN FORM HANDLER ---
        const staffForm = document.getElementById('staff-login-form');
        if (staffForm) {
            staffForm.onsubmit = async (e) => {
                e.preventDefault();
                const adek = document.getElementById('s-log-adek').value.trim();
                const pass = document.getElementById('s-log-pass').value.trim();
                const btn = e.target.querySelector('button');
                if (btn) btn.disabled = true;

                try {
                    const snap = await get(ref(db, 'staff'));
                    if (snap.exists()) {
                        const allStaff = snap.val();
                        let foundUser = null;

                        for (const mobile in allStaff) {
                            const u = allStaff[mobile];
                            if ((u.adekPass === adek || u.adcPassNumber === adek) && u.password === pass) {
                                foundUser = u;
                                break;
                            }
                        }

                        if (foundUser) {
                            if ((foundUser.role || "").toLowerCase().trim() === 'admin') {
                                localStorage.setItem('isAdminLoggedIn', 'true');
                                window.location.href = 'admin.html';
                                return;
                            }
                            localStorage.setItem('loggedStaff', JSON.stringify(foundUser));
                            window.location.reload();
                        } else {
                            alert("❌ Invalid Credentials");
                        }
                    }
                } catch (err) { console.error(err); }
                finally { if (btn) btn.disabled = false; }
            };
        }

        // --- 3. VISITOR SIGN-IN ---
        const visitorForm = document.getElementById('visitor-form');
        if (visitorForm) {
            visitorForm.onsubmit = async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                btn.disabled = true; btn.innerText = "UPLOADING...";
                try {
                    const sigBase64 = window.getCanvasBase64('v-sig-pad');
                    if (!sigBase64 || sigBase64.length < 1000) throw new Error("Please provide a signature.");

                    const res = await window.uploadToDrive({
                        category: UPLOAD_CONFIG.CATEGORIES.VISITORS,
                        fileName: `Visitor_Sig_${Date.now()}.png`,
                        image: sigBase64
                    });

                    if (res.status !== 'success') throw new Error(res.message || "Upload failed");

                    const data = {
                        id: document.getElementById('v-id').value,
                        name: document.getElementById('v-name').value,
                        mobile: document.getElementById('v-mobile').value,
                        company: document.getElementById('v-company').value,
                        purpose: document.getElementById('v-purpose').value,
                        date: new Date().toLocaleDateString('en-US'),
                        timeIn: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}),
                        status: "active",
                        signatureUrl: res.fileUrl
                    };

                    await set(ref(db, 'visitors/' + data.id), data);
                    localStorage.setItem('vActive', JSON.stringify({id: data.id, name: data.name, timeIn: data.timeIn}));
                    window.triggerSuccessPopup("Sign-In Successful! 🏢");
                    if (window.checkVisitorSession) window.checkVisitorSession();
                } catch (error) { alert("Sign-In Error: " + error.message); }
                finally { btn.disabled = false; btn.innerText = "Confirm Sign-In"; }
            };
        }

        // --- 4. AUTO-VIEW ROUTING ---
        const isAdmin = localStorage.getItem('isAdminLoggedIn') === 'true';
        const loggedStaff = localStorage.getItem('loggedStaff');

        if (path.includes('admin.html')) {
            const authSec = document.getElementById('view-admin-auth');
            const dashSec = document.getElementById('view-admin-dash');

            if (isAdmin) {
                if (authSec) authSec.classList.add('hidden');
                if (dashSec) {
                    dashSec.classList.remove('hidden');
                    dashSec.style.display = 'block';
                }
                if (window.loadAdminDashboard) {
                    window.loadAdminDashboard();
                } else {
                    setTimeout(() => { if (window.loadAdminDashboard) window.loadAdminDashboard(); }, 500);
                }
            } else {
                if (authSec) {
                    authSec.classList.remove('hidden');
                    authSec.style.display = 'flex';
                }
                if (dashSec) dashSec.classList.add('hidden');
            }
        }

        if (path.includes('staff-login.html')) {
            if (loggedStaff) {
                if (window.renderDashboard) window.renderDashboard(JSON.parse(loggedStaff));
            } else {
                if (window.checkStaffAuth) window.checkStaffAuth();
            }
        }

        if (path.includes('visitor.html')) {
            if (window.checkVisitorSession) window.checkVisitorSession();
        }

        // --- 5. LOGOUT HANDLING ---
        const bindLogout = (id) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.onclick = (e) => {
                    e.preventDefault();
                    localStorage.removeItem('isAdminLoggedIn');
                    localStorage.removeItem('loggedStaff');
                    window.location.href = 'index.html';
                };
            }
        };
        ['staff-logout-btn', 'staff-logout', 'admin-logout-btn'].forEach(bindLogout);

        if (window.initSigPad) window.initSigPad();
        if (window.initVisitorCanvas) window.initVisitorCanvas();

    } catch (e) { console.error("Init Error:", e); }
});
