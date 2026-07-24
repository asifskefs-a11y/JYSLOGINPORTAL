import { db } from './firebase_config.js';
import { ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {
    console.log("SchoolLog Module Initialization - Vers 2.0");
    const path = window.location.pathname;

    try {
        const staffLoginForm = document.getElementById('staff-login-form');
        if (staffLoginForm) {
            staffLoginForm.onsubmit = async (e) => {
                e.preventDefault();
                const mobile = document.getElementById('s-log-mobile').value;
                const pass = document.getElementById('s-log-pass').value;
                const submitBtn = e.target.querySelector('button');
                if (submitBtn) submitBtn.disabled = true;
                try {
                    const snap = await get(child(ref(db), 'staff/' + mobile));
                    if (snap.exists() && snap.val().password === pass) {
                        const data = snap.val();
                        if ((data.role || "").toLowerCase().trim() === 'admin') {
                            localStorage.setItem('isAdminLoggedIn', 'true');
                            window.location.href = 'admin.html';
                            return;
                        }
                        localStorage.setItem('loggedStaff', JSON.stringify(data));
                        window.renderDashboard(data);
                    } else { alert("Invalid Credentials"); }
                } catch (err) { console.error(err); }
                finally { if (submitBtn) submitBtn.disabled = false; }
            };
        }

        const staffRegForm = document.getElementById('staff-reg-form');
        if (staffRegForm) {
            staffRegForm.onsubmit = async (e) => {
                e.preventDefault();
                const name = document.getElementById('s-reg-name').value;
                const branch = document.getElementById('s-reg-branch').value;
                const role = document.getElementById('s-reg-role').value;
                const company = document.getElementById('s-reg-company').value;
                const pass = document.getElementById('s-reg-pass').value;
                const confirmPass = document.getElementById('s-reg-confirm').value;

                if (pass !== confirmPass) return alert("Passwords do not match!");
                const submitBtn = e.target.querySelector('button');
                submitBtn.disabled = true;

                try {
                    const dynamicData = {};
                    document.querySelectorAll('.dynamic-input').forEach(input => {
                        dynamicData[input.getAttribute('data-field')] = input.value;
                    });
                    const mobileField = document.querySelector('[data-field="Mobile Number"]');
                    const mobile = mobileField ? mobileField.value : company;

                    if (!mobile) {
                        submitBtn.disabled = false;
                        return alert("Mobile Number is required.");
                    }

                    const data = {
                        name, branch, role, company, password: pass, mobile,
                        ...dynamicData,
                        createdAt: new Date().toISOString()
                    };

                    await set(ref(db, 'staff/' + mobile), data);
                    alert("Registration successful! Please login.");
                    window.toggleStaffTab('login');
                } catch (err) { alert("Registration failed: " + err.message); }
                finally { submitBtn.disabled = false; }
            };
        }

        const adminLoginForm = document.getElementById('admin-login-form');
        if (adminLoginForm) {
            adminLoginForm.onsubmit = (e) => {
                e.preventDefault();
                const user = document.getElementById('admin-mobile').value.toLowerCase().trim();
                const pass = document.getElementById('admin-pass').value.trim();
                if (user === 'admin' && pass === '1234') {
                    localStorage.setItem('isAdminLoggedIn', 'true');
                    window.location.href = 'admin.html';
                } else { alert("Denied"); }
            };
        }

        const visitorForm = document.getElementById('visitor-form');
        if (visitorForm) {
            visitorForm.onsubmit = async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                btn.disabled = true; btn.innerText = "Processing...";
                try {
                    const res = await window.uploadToDrive({
                        type: 'signature',
                        department: 'Visitor',
                        staffName: document.getElementById('v-name').value,
                        fileName: `Visitor_Sig_${Date.now()}.png`,
                        image: window.getCompressedSignature(document.getElementById('v-sig-pad'))
                    });
                    if (res.status !== 'success' && !res.signatureUrl) throw new Error(res.message || "Upload failed");
                    const sig = res.signatureUrl || res.fileUrl;
                    const now = new Date();
                    const data = { id: document.getElementById('v-id').value, name: document.getElementById('v-name').value, mobile: document.getElementById('v-mobile').value, company: document.getElementById('v-company').value, purpose: document.getElementById('v-purpose').value, date: now.toLocaleDateString('en-US'), timeIn: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}), status: "active", signatureUrl: sig };
                    await set(ref(db, 'visitors/' + data.id), data);
                    localStorage.setItem('vActive', JSON.stringify({id: data.id, name: data.name, timeIn: data.timeIn}));
                    alert("Signed In!"); window.checkVisitorSession();
                } catch (error) { alert("Error: " + error.message); }
                finally { btn.disabled = false; btn.innerText = "Confirm Sign-In"; }
            };
        }

        if (path.includes('admin.html') && localStorage.getItem('isAdminLoggedIn') === 'true') {
            window.isAdminLoggedIn = true;
            document.getElementById('view-admin-auth')?.classList.add('hidden');
            document.getElementById('view-admin-dash')?.classList.remove('hidden');
            window.loadAdminDashboard();
        }

        if (path.includes('staff-login.html')) {
            window.checkStaffAuth();
            window.loadRegistrationFields();
        }

        if (path.includes('visitor.html')) window.checkVisitorSession();

        // --- BIND LOGOUT BUTTONS ---
        const bindLogout = (id) => {
            const btn = document.getElementById(id);
            if (btn) {
                console.log("Binding Logout to:", id);
                btn.onclick = (e) => {
                    e.preventDefault();
                    console.log("Logout clicked:", id);
                    if (typeof window.logoutStaff === 'function') {
                        window.logoutStaff();
                    } else {
                        console.error("logoutStaff function not found!");
                        // Fallback
                        localStorage.clear();
                        sessionStorage.clear();
                        window.location.href = 'staff-login.html';
                    }
                };
            }
        };
        bindLogout('staff-logout-btn');
        bindLogout('staff-logout');
        bindLogout('admin-logout-btn');

        window.initSigPad();
        window.initVisitorCanvas();
    } catch (e) { console.error("Init Error:", e); }
});
