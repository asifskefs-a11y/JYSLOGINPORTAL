import { db } from './firebase_config.js';
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// WEBAUTHN BIOMETRIC & DEVICE LOCK ENGINE (v1.0)                   */
// ================================================================ */

window.biometricManager = {
    isSupported: () => !!(window.PublicKeyCredential),

    /**
     * ENROLL: Register device biometric/PIN for the current user
     */
    enroll: async function() {
        if (!this.isSupported()) {
            alert("❌ Your browser or device does not support biometric authentication.");
            return;
        }

        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user'));
        if (!staff || !staff.firebaseKey) {
            alert("❌ Session expired. Please login with password first.");
            return;
        }

        const confirmEnroll = confirm("Secure your account? Enabling Biometric Access will allow you to login and check-in using your device's Fingerprint, Face ID, or PIN.");
        if (!confirmEnroll) return;

        if (window.showGlobalSpinner) window.showGlobalSpinner("Enrolling Biometrics...");

        try {
            const userId = staff.adekPass || staff.mobile;
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const createOptions = {
                publicKey: {
                    challenge: challenge,
                    rp: { name: "JYS Portal", id: window.location.hostname || "localhost" },
                    user: {
                        id: Uint8Array.from(userId, c => c.charCodeAt(0)),
                        name: staff.fullName || staff.name,
                        displayName: staff.fullName || staff.name
                    },
                    pubKeyCredParams: [
                        { type: "public-key", alg: -7 }, // ES256
                        { type: "public-key", alg: -257 } // RS256
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required"
                    },
                    timeout: 60000,
                    attestation: "none"
                }
            };

            const credential = await navigator.credentials.create(createOptions);
            if (credential) {
                // We only need to store the rawId/ID to identify the credential later
                const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));

                // Store in Firebase under staff user node
                await update(ref(db, `staff/${staff.firebaseKey}`), {
                    biometricCredentialId: credentialId,
                    biometricEnabled: true,
                    biometricEnrolledAt: Date.now()
                });

                // Update local session objects
                staff.biometricCredentialId = credentialId;
                staff.biometricEnabled = true;
                localStorage.setItem('loggedStaff', JSON.stringify(staff));
                sessionStorage.setItem('active_staff_user', JSON.stringify(staff));

                // Also store locally for "Quick Login" discovery
                localStorage.setItem('jys_biometric_enrolled', 'true');
                localStorage.setItem('jys_biometric_user', userId);

                if (window.showWhatsAppToast) {
                    window.showWhatsAppToast("✅ Biometric Active", "Biometric / Screen Lock Enabled Successfully!", "success");
                } else {
                    alert("✅ Biometric / Screen Lock Enabled Successfully!");
                }

                // Update UI toggle if exists
                const toggle = document.getElementById('biometric-toggle-btn');
                if (toggle) {
                    toggle.innerHTML = '<i class="fa-solid fa-fingerprint text-emerald-400"></i><span>Biometrics Enabled</span>';
                    toggle.classList.add('active');
                }
            }
        } catch (err) {
            console.error("Biometric Enrollment Error:", err);
            if (err.name !== 'NotAllowedError') {
                alert("❌ Enrollment Failed: " + err.message);
            }
        } finally {
            if (window.hideGlobalSpinner) window.hideGlobalSpinner();
        }
    },

    /**
     * VERIFY: Fast-track check for Check-In / Check-Out
     */
    verify: async function() {
        if (!this.isSupported()) return true; // Fallback to success if not supported

        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user'));
        if (!staff || !staff.biometricCredentialId) return true; // Fallback to password if not enrolled

        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const rawId = Uint8Array.from(atob(staff.biometricCredentialId), c => c.charCodeAt(0));

            const getOptions = {
                publicKey: {
                    challenge: challenge,
                    allowCredentials: [{
                        id: rawId,
                        type: 'public-key'
                    }],
                    userVerification: "required",
                    timeout: 60000
                }
            };

            const assertion = await navigator.credentials.get(getOptions);
            return !!assertion;
        } catch (err) {
            console.warn("Biometric Verification Error/Cancelled:", err);
            return false;
        }
    },

    /**
     * LOGIN: Quick login from login screen
     */
    quickLogin: async function() {
        if (!this.isSupported()) {
            alert("Biometrics not supported on this browser.");
            return;
        }

        const enrolledUser = localStorage.getItem('jys_biometric_user');
        if (!enrolledUser) {
            alert("No biometric credentials found on this device. Please login with password first to enroll.");
            return;
        }

        if (window.showGlobalSpinner) window.showGlobalSpinner("Verifying Identity...");

        try {
            // We need to fetch the staff record first to get their Credential ID
            const snap = await get(ref(db, 'staff'));
            if (!snap.exists()) throw new Error("Staff database unavailable");

            const allStaff = snap.val();
            let staffRecord = null;
            let staffKey = null;

            for (const [key, u] of Object.entries(allStaff)) {
                const id = (u.adekPass || u.mobile || "").toString();
                if (id === enrolledUser) {
                    staffRecord = u;
                    staffKey = key;
                    break;
                }
            }

            if (!staffRecord || !staffRecord.biometricCredentialId) {
                alert("Biometric link lost. Please login with password.");
                localStorage.removeItem('jys_biometric_enrolled');
                return;
            }

            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            const rawId = Uint8Array.from(atob(staffRecord.biometricCredentialId), c => c.charCodeAt(0));

            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    allowCredentials: [{ id: rawId, type: 'public-key' }],
                    userVerification: "required"
                }
            });

            if (assertion) {
                // Success! Log them in
                const foundUser = { ...staffRecord, firebaseKey: staffKey };

                // Use the existing handleStaffLogin success logic via a helper if possible,
                // or replicate here since we're modularizing.
                this.finalizeLogin(foundUser);
            }
        } catch (err) {
            console.error("Quick Login Error:", err);
            if (err.name !== 'NotAllowedError') {
                alert("Login Failed: " + err.message);
            }
        } finally {
            if (window.hideGlobalSpinner) window.hideGlobalSpinner();
        }
    },

    finalizeLogin: function(foundUser) {
        console.log("✅ Biometric Login: Authentication Successful for", foundUser.name);

        // Save session
        localStorage.setItem('loggedStaff', JSON.stringify(foundUser));
        sessionStorage.setItem('active_staff_user', JSON.stringify(foundUser));

        if (window.triggerSuccessPopup) {
            window.triggerSuccessPopup(`Welcome back, ${foundUser.name || foundUser.fullName}! 🛡️`);
        }

        // Initialize User Dashboard
        if (window.initUserDashboard) {
            window.initUserDashboard(foundUser);
        } else if (window.renderDashboard) {
            window.renderDashboard(foundUser);
        }

        // Show Dashboard View
        if (window.showStaffView) {
            window.showStaffView('staff-dash-area');
        }

        // Hide auth area
        const authArea = document.getElementById('staff-auth-area');
        if (authArea) authArea.classList.add('hidden');
    }
};

window.enrollBiometrics = () => window.biometricManager.enroll();
window.quickBiometricLogin = () => window.biometricManager.quickLogin();

// Auto-check on load
document.addEventListener('DOMContentLoaded', () => {
    const isEnrolled = localStorage.getItem('jys_biometric_enrolled') === 'true';
    const loginBtn = document.getElementById('biometric-login-btn');
    if (isEnrolled && loginBtn) {
        loginBtn.classList.remove('hidden');
    }

    // Update sidebar toggle state if user is logged in
    const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user'));
    if (staff && staff.biometricCredentialId) {
        const toggle = document.getElementById('biometric-toggle-btn');
        if (toggle) {
            toggle.innerHTML = '<i class="fa-solid fa-fingerprint text-emerald-400"></i><span>Biometrics Enabled</span>';
            toggle.classList.add('active');
        }
    }
});

console.log("✅ Biometric Module Loaded (WebAuthn Support Active)");
