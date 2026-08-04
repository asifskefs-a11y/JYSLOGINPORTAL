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
                const adek = document.getElementById('s-log-adek').value.trim();
                const pass = document.getElementById('s-log-pass').value.trim();
                const submitBtn = e.target.querySelector('button');
                if (submitBtn) submitBtn.disabled = true;

                try {
                    // Fetch all staff and find the one with matching ADEK Pass
                    const snap = await get(ref(db, 'staff'));
                    if (snap.exists()) {
                        const allStaff = snap.val();
                        let foundUser = null;

                        // Loop through keys to find matching ADEK Pass Number
                        for (const mobile in allStaff) {
                            const user = allStaff[mobile];
                            if ((user.adcPassNumber === adek || user.adekPass === adek) && user.password === pass) {
                                foundUser = user;
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
                            window.renderDashboard(foundUser);
                        } else {
                            alert("Invalid ADEK Pass or Password");
                        }
                    } else { alert("No registered staff found."); }
                } catch (err) { console.error(err); }
                finally { if (submitBtn) submitBtn.disabled = false; }
            };
        }

        const staffRegForm = document.getElementById('staff-reg-form');
        if (staffRegForm) {
            staffRegForm.onsubmit = async (e) => {
                e.preventDefault();
                const name = document.getElementById('s-reg-name').value;
                const mobileNumber = document.getElementById('s-reg-mobile').value;
                const adcPassNumber = document.getElementById('s-reg-adek').value;
                const companyName = document.getElementById('s-reg-company-name').value;
                const branch = document.getElementById('s-reg-branch').value;
                const role = document.getElementById('s-reg-role').value;
                const companyIdNumber = document.getElementById('s-reg-company').value;
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

                    if (!adek) {
                        submitBtn.disabled = false;
                        return alert("ADEK Pass Number is required.");
                    }

                    const data = {
                        name: name,
                        fullName: name,
                        mobile: mobileNumber,
                        mobileNumber: mobileNumber,
                        adcPassNumber: adcPassNumber,
                        companyName: companyName,
                        branch: branch,
                        schoolName: branch,
                        role: role,
                        position: role,
                        company: companyIdNumber,
                        companyIdNumber: companyIdNumber,
                        password: pass,
                        ...dynamicData,
                        createdAt: new Date().toISOString()
                    };

                    // Save to both nodes for robust admin dashboard mapping
                    await set(ref(db, 'staff/' + mobileNumber), data);
                    await set(ref(db, 'users/' + mobileNumber), data);

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
                btn.disabled = true; btn.innerText = "UPLOADING...";
                try {
                    // 1. Capture Signature from Canvas
                    const sigBase64 = window.getCanvasBase64('v-sig-pad');
                    if (!sigBase64 || sigBase64.length < 1000) throw new Error("Please provide a signature.");

                    // 2. Upload to Google Drive (Signature Folder)
                    const res = await window.uploadToDrive({
                        type: 'signature',
                        department: 'Visitor',
                        staffName: document.getElementById('v-name').value,
                        fileName: `Visitor_Sig_${Date.now()}.png`,
                        image: sigBase64
                    });

                    if (res.status !== 'success') throw new Error(res.message || "Upload failed");

                    const driveUrl = res.fileUrl || res.signatureUrl;
                    const now = new Date();

                    // 3. Save ONLY the URL to Firebase
                    const data = {
                        id: document.getElementById('v-id').value,
                        name: document.getElementById('v-name').value,
                        mobile: document.getElementById('v-mobile').value,
                        company: document.getElementById('v-company').value,
                        purpose: document.getElementById('v-purpose').value,
                        date: now.toLocaleDateString('en-US'),
                        timeIn: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}),
                        status: "active",
                        signatureUrl: driveUrl
                    };

                    await set(ref(db, 'visitors/' + data.id), data);
                    localStorage.setItem('vActive', JSON.stringify({id: data.id, name: data.name, timeIn: data.timeIn}));
                    window.triggerSuccessPopup("Sign-In Successful! 🏢");
                    if (typeof window.checkVisitorSession === 'function') window.checkVisitorSession();
                } catch (error) {
                    alert("Sign-In Error: " + error.message);
                } finally {
                    btn.disabled = false;
                    btn.innerText = "Confirm Sign-In";
                }
            };
        }

        if (path.includes('admin.html')) {
            const isAdmin = localStorage.getItem('isAdminLoggedIn') === 'true';
            const authSection = document.getElementById('view-admin-auth');
            const dashSection = document.getElementById('view-admin-dash');

            if (isAdmin) {
                window.isAdminLoggedIn = true;
                if (authSection) authSection.classList.add('hidden');
                if (dashSection) dashSection.classList.remove('hidden');
                window.loadAdminDashboard();
            } else {
                if (authSection) {
                    authSection.classList.remove('hidden');
                    authSection.classList.add('active');
                    authSection.style.display = 'flex';
                }
                if (dashSection) dashSection.classList.add('hidden');
            }
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

        // --- BIND DELETE ACCOUNT ---
        const delBtn = document.getElementById('delete-my-account');
        if (delBtn) {
            delBtn.onclick = async () => {
                if (!confirm("Are you sure? This will PERMANENTLY delete your account.")) return;
                try {
                    if (window.currentStaff && window.currentStaff.mobile) {
                        await set(ref(db, 'staff/' + window.currentStaff.mobile), null);
                        await set(ref(db, 'users/' + window.currentStaff.mobile), null);
                        window.logoutStaff();
                    }
                } catch (e) { alert("Error deleting account: " + e.message); }
            };
        }

        window.initSigPad();
        window.initVisitorCanvas();
    } catch (e) { console.error("Init Error:", e); }
});
