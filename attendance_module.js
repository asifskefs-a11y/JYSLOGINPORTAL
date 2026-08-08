import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, update, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// ATTENDANCE MODULE - COMPLETE FIX                                */
// ================================================================ */

let sigCallback = null;
let sessionListener = null;
let cachedStaff = null;
let isCheckInProgress = false;

// ================================================================ */
// OPEN SIGNATURE MODAL                                             */
// ================================================================ */

window.openSignatureModal = function(title, callback) {
    console.log("🔓 Opening signature modal:", title);

    const modal = document.getElementById('signature-modal');
    if (!modal) {
        alert("Signature modal not found. Please refresh.");
        return;
    }

    const titleEl = document.getElementById('sig-modal-title');
    if (titleEl) titleEl.innerText = title || "Sign to Confirm";

    sigCallback = callback;

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function() {
        setTimeout(function() {
            const pad = window.sigPadManager.initPad('sig-canvas');
            if (pad) {
                pad.clear();
                pad.unlock();
                console.log("✅ Signature pad ready");
            }
        }, 300);
    });
};

// ================================================================ */
// CLOSE SIGNATURE MODAL                                            */
// ================================================================ */

window.closeSignatureModal = function() {
    console.log("🔒 Closing signature modal");

    const modal = document.getElementById('signature-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    document.body.style.overflow = '';
    sigCallback = null;

    const pad = window.sigPadManager.getPad('sig-canvas');
    if (pad) pad.lock();
};

// ================================================================ */
// CONFIRM SIGNATURE - FIXED                                       */
// ================================================================ */

document.addEventListener('DOMContentLoaded', function() {
    const confirmBtn = document.getElementById('sig-confirm-btn');
    if (confirmBtn) {
        confirmBtn.onclick = function() {
            console.log("✅ Confirm signature clicked");

            if (confirmBtn.disabled) return;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

            const pad = window.sigPadManager.getPad('sig-canvas');
            if (!pad) {
                alert("Signature pad not ready");
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fa-regular fa-check-circle"></i> Confirm';
                return;
            }

            if (pad.isEmpty()) {
                alert("Please sign before confirming.");
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fa-regular fa-check-circle"></i> Confirm';
                return;
            }

            const data = pad.toDataURL();
            if (sigCallback) {
                window.showLoadingOverlay('Processing your request...');
                sigCallback(data);
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fa-regular fa-check-circle"></i> Confirm';
            } else {
                alert("No callback defined");
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fa-regular fa-check-circle"></i> Confirm';
            }
        };
    }
});

// ================================================================ */
// LOADING OVERLAY                                                  */
// ================================================================ */

window.showLoadingOverlay = function(message = 'Processing...') {
    const existing = document.getElementById('loading-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999998;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
        <div style="
            background: white; padding: 32px 24px; border-radius: 20px;
            text-align: center; max-width: 280px; width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
            animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        ">
            <div style="width: 48px; height: 48px; margin: 0 auto 12px;
                border: 3px solid #e2e8f0; border-top-color: #4f46e5;
                border-radius: 50%; animation: spin 0.6s linear infinite;"></div>
            <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0;">${message}</h3>
            <p style="font-size: 11px; color: #94a3b8; margin: 2px 0 0;">Please wait...</p>
        </div>
    `;

    document.body.appendChild(overlay);
};

window.hideLoadingOverlay = function() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease';
        setTimeout(function() {
            if (overlay.parentElement) overlay.remove();
        }, 200);
    }
};

// ================================================================ */
// PREMIUM SUCCESS ANIMATION                                        */
// ================================================================ */

window.showPremiumSuccessAnimation = function(title, message, emoji = '🎉') {
    window.hideLoadingOverlay();
    window.closeSignatureModal();

    const existing = document.getElementById('premium-success-animation');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'premium-success-animation';
    container.style.cssText = `
        position: fixed; inset: 0; z-index: 9999999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        animation: fadeIn 0.3s ease-out; padding: 20px;
    `;

    container.innerHTML = `
        <div style="
            background: white; width: 90%; max-width: 340px;
            padding: 36px 24px 32px 24px; border-radius: 28px;
            text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,0.25);
            animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            position: relative; overflow: hidden;
        ">
            <div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
                background: radial-gradient(circle at center, rgba(16,185,129,0.06), transparent 70%);
                pointer-events: none;"></div>

            <div style="font-size: 56px; margin-bottom: 12px; display: block; animation: emojiBounce 1s ease-in-out infinite;">${emoji}</div>

            <div style="width: 80px; height: 80px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" style="width: 80px; height: 80px; display: block;">
                    <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none" style="
                        stroke: #10b981; stroke-width: 3.5;
                        stroke-dasharray: 166; stroke-dashoffset: 166;
                        stroke-miterlimit: 10; stroke-linecap: round;
                        animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
                    "/>
                    <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" style="
                        stroke: #10b981; stroke-width: 3.5;
                        stroke-dasharray: 48; stroke-dashoffset: 48;
                        stroke-linecap: round; stroke-linejoin: round;
                        animation: stroke 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
                    "/>
                </svg>
            </div>

            <h3 style="font-size: 20px; font-weight: 900; color: #0f172a; margin: 0 0 4px;">${title}</h3>
            <p style="font-size: 13px; color: #64748b; font-weight: 500; margin: 0 0 16px; line-height: 1.5;">${message}</p>

            <div style="display: flex; justify-content: center; gap: 8px; margin-bottom: 16px;">
                <span style="font-size: 24px; animation: sparkle 0.6s ease 0.2s infinite alternate;">✨</span>
                <span style="font-size: 28px; animation: sparkle 0.6s ease 0.4s infinite alternate;">🌟</span>
                <span style="font-size: 24px; animation: sparkle 0.6s ease 0.6s infinite alternate;">✨</span>
            </div>

            <button onclick="this.closest('#premium-success-animation').remove()" style="
                padding: 12px 40px; background: linear-gradient(135deg, #4f46e5, #4338ca);
                color: white; border: none; border-radius: 16px; font-weight: 700;
                font-size: 14px; cursor: pointer; box-shadow: 0 4px 20px rgba(79,70,229,0.3);
                transition: all 0.2s ease; position: relative; z-index: 1;">
                👍 Awesome!
            </button>
        </div>
    `;

    document.body.appendChild(container);

    setTimeout(function() {
        if (container.parentElement) {
            container.style.opacity = '0';
            container.style.transition = 'opacity 0.3s ease';
            setTimeout(function() {
                if (container.parentElement) container.remove();
            }, 300);
        }
    }, 3000);

    container.onclick = function(e) {
        if (e.target === container) container.remove();
    };
};

// ================================================================ */
// CHECK-IN BUTTON HANDLER - FIXED                                 */
// ================================================================ */

window.handleCheckIn = function(staff) {
    console.log("🌅 Check-In button clicked!");
    console.log("👤 Staff data:", staff);

    if (isCheckInProgress) {
        console.log("⏳ Check-in already in progress");
        return;
    }

    // Use cached staff if parameter is undefined
    const staffData = staff || cachedStaff || window.currentStaff;

    if (!staffData) {
        console.error("❌ Staff data not found");
        alert("Staff data not found. Please logout and login again.");
        return;
    }

    console.log("✅ Staff data found:", staffData.fullName || staffData.name);

    // Open password modal
    isCheckInProgress = true;

    window._pendingCheckIn = {
        staff: staffData,
        onSuccess: function() {
            console.log("✅ Password verified for check-in");
            isCheckInProgress = false;
            requestAnimationFrame(function() {
                setTimeout(function() {
                    window.openSignatureModal("☀️ Morning Check-In", async function(sigData) {
                        await window.completeCheckIn(staffData, sigData);
                    });
                }, 300);
            });
        },
        onCancel: function() {
            isCheckInProgress = false;
        }
    };

    showPasswordModal('☀️ Morning Check-In', 'Enter your password to check in');
};

// ================================================================ */
// CHECK-OUT BUTTON HANDLER - FIXED                                */
// ================================================================ */

window.handleCheckOut = function(staff) {
    console.log("🌆 Check-Out button clicked!");
    console.log("👤 Staff data:", staff);

    // Use cached staff if parameter is undefined
    const staffData = staff || cachedStaff || window.currentStaff;

    if (!staffData) {
        console.error("❌ Staff data not found");
        alert("Staff data not found. Please logout and login again.");
        return;
    }

    console.log("✅ Staff data found:", staffData.fullName || staffData.name);

    window._pendingCheckOut = {
        staff: staffData,
        onSuccess: function() {
            console.log("✅ Password verified for check-out");
            setTimeout(function() {
                window.completeCheckOut(staffData);
            }, 300);
        }
    };

    showPasswordModal('🌙 Evening Check-Out', 'Enter your password to check out');
};

// ================================================================ */
// COMPLETE CHECK-IN                                                */
// ================================================================ */

window.completeCheckIn = async function(staff, sigData) {
    console.log("✅ Completing Check-In");

    try {
        const mobile = staff.mobile || staff.mobileNumber;
        if (!mobile) {
            alert("Staff mobile not found");
            return;
        }

        const name = staff.fullName || staff.name || "Staff";
        const adek = staff.adekPass || staff.adcPassNumber || "N/A";
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit', hour12: true});
        const dateKey = new Date().toISOString().split('T')[0];
        const today = new Date().toLocaleDateString('en-US');

        const result = await window.uploadStaffAttendanceSignature(
            { name, adekPass: adek, mobile },
            sigData,
            'checkin'
        );

        if (result.status === 'success') {
            const key = mobile + '_' + Date.now();

            const data = {
                mobile: mobile,
                name: name,
                adekPass: adek,
                status: 'checked_in',
                date: today,
                dateKey: dateKey,
                timeIn: time,
                signatureUrl: result.fileUrl,
                checkInTimestamp: Date.now(),
                folderPath: result.folderPath || '',
                fileName: result.fileName || ''
            };

            await set(ref(db, 'staff_attendance/' + key), data);
            await set(ref(db, 'active_staff_sessions/' + mobile), {
                status: 'checked_in',
                key: key,
                timeIn: time,
                dateKey: dateKey
            });

            updateAttendanceUI('checked_in', time);

            window.showPremiumSuccessAnimation(
                '☀️ Good Morning!',
                `${name}\nChecked in at ${time}`,
                '🌅'
            );

            console.log("✅ Check-In complete");
        } else {
            alert("Signature upload failed: " + (result.message || "Unknown error"));
        }
    } catch (error) {
        console.error("Check-in error:", error);
        alert("Check-in failed: " + error.message);
    }
};

// ================================================================ */
// COMPLETE CHECK-OUT                                               */
// ================================================================ */

window.completeCheckOut = async function(staff) {
    console.log("✅ Completing Check-Out");

    try {
        const mobile = staff.mobile || staff.mobileNumber;
        if (!mobile) {
            alert("Staff mobile not found");
            return;
        }

        const name = staff.fullName || staff.name || "Staff";
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit', hour12: true});

        const sessionSnapshot = await get(ref(db, 'active_staff_sessions/' + mobile));
        const session = sessionSnapshot.val();

        if (!session || session.status !== 'checked_in') {
            alert("You are not checked in.");
            return;
        }

        const updateData = {
            status: 'checked_out',
            checkOutTime: time,
            checkOutTimestamp: Date.now()
        };

        await update(ref(db, 'staff_attendance/' + session.key), updateData);
        await set(ref(db, 'active_staff_sessions/' + mobile), null);

        updateAttendanceUI('checked_out', time);

        window.showPremiumSuccessAnimation(
            '🌙 Good Night!',
            `${name}\nChecked out at ${time}`,
            '🌙'
        );

        console.log("✅ Check-Out complete");
    } catch (error) {
        console.error("Check-out error:", error);
        alert("Check-out failed: " + error.message);
    }
};

// ================================================================ */
// PASSWORD MODAL - FIXED                                          */
// ================================================================ */

function showPasswordModal(title, message) {
    console.log("🔐 Showing password modal:", title);

    const modal = document.getElementById('password-modal');
    if (!modal) {
        console.error("❌ Password modal not found");
        alert("Password modal not found. Please refresh.");
        return;
    }

    const titleEl = document.getElementById('password-modal-title');
    if (titleEl) titleEl.textContent = title || '🔐 Verification Required';

    const descEl = document.querySelector('#password-modal .text-sm');
    if (descEl) descEl.textContent = message || 'Enter your password to continue';

    const errorEl = document.getElementById('password-error');
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.style.display = 'none';
    }

    const passInput = document.getElementById('modal-auth-pass');
    if (passInput) {
        passInput.value = '';
        requestAnimationFrame(function() {
            setTimeout(function() { passInput.focus(); }, 300);
        });
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

window.closePasswordModal = function() {
    console.log("🔒 Closing password modal");

    const modal = document.getElementById('password-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    const passInput = document.getElementById('modal-auth-pass');
    if (passInput) passInput.value = '';
    const errorEl = document.getElementById('password-error');
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.style.display = 'none';
    }
    window._pendingCheckIn = null;
    window._pendingCheckOut = null;
    isCheckInProgress = false;
};

// ================================================================ */
// PASSWORD VERIFICATION - FIXED                                   */
// ================================================================ */

document.addEventListener('DOMContentLoaded', function() {
    const passBtn = document.getElementById('password-confirm-btn');
    if (passBtn) {
        passBtn.onclick = function() {
            console.log("🔐 Password confirm clicked");

            const passInput = document.getElementById('modal-auth-pass');
            const errorEl = document.getElementById('password-error');

            if (!passInput) {
                console.error("❌ Password input not found");
                return;
            }

            const entered = passInput.value.trim();

            // Check for Check-In
            if (window._pendingCheckIn) {
                const staff = window._pendingCheckIn.staff;
                const actual = staff.password || staff.pass || '';

                if (entered === actual) {
                    console.log("✅ Password correct for Check-In");
                    if (errorEl) {
                        errorEl.classList.add('hidden');
                        errorEl.style.display = 'none';
                    }

                    const modal = document.getElementById('password-modal');
                    if (modal) {
                        modal.classList.add('hidden');
                        modal.style.display = 'none';
                    }

                    passInput.value = '';

                    if (window._pendingCheckIn.onSuccess) {
                        requestAnimationFrame(function() {
                            setTimeout(function() {
                                window._pendingCheckIn.onSuccess();
                            }, 300);
                        });
                    }
                    window._pendingCheckIn = null;
                } else {
                    console.log("❌ Password incorrect for Check-In");
                    if (errorEl) {
                        errorEl.classList.remove('hidden');
                        errorEl.style.display = 'block';
                        errorEl.textContent = '❌ Incorrect Password. Please try again.';
                        errorEl.style.color = '#dc2626';
                        errorEl.style.background = '#fee2e2';
                        errorEl.style.padding = '10px 16px';
                        errorEl.style.borderRadius = '12px';
                        errorEl.style.fontWeight = '700';
                        errorEl.style.fontSize = '13px';
                    }
                    passInput.value = '';
                    passInput.focus();
                }
                return;
            }

            // Check for Check-Out
            if (window._pendingCheckOut) {
                const staff = window._pendingCheckOut.staff;
                const actual = staff.password || staff.pass || '';

                if (entered === actual) {
                    console.log("✅ Password correct for Check-Out");
                    if (errorEl) {
                        errorEl.classList.add('hidden');
                        errorEl.style.display = 'none';
                    }

                    const modal = document.getElementById('password-modal');
                    if (modal) {
                        modal.classList.add('hidden');
                        modal.style.display = 'none';
                    }

                    passInput.value = '';

                    if (window._pendingCheckOut.onSuccess) {
                        requestAnimationFrame(function() {
                            setTimeout(function() {
                                window._pendingCheckOut.onSuccess();
                            }, 300);
                        });
                    }
                    window._pendingCheckOut = null;
                } else {
                    console.log("❌ Password incorrect for Check-Out");
                    if (errorEl) {
                        errorEl.classList.remove('hidden');
                        errorEl.style.display = 'block';
                        errorEl.textContent = '❌ Incorrect Password. Please try again.';
                        errorEl.style.color = '#dc2626';
                        errorEl.style.background = '#fee2e2';
                        errorEl.style.padding = '10px 16px';
                        errorEl.style.borderRadius = '12px';
                        errorEl.style.fontWeight = '700';
                        errorEl.style.fontSize = '13px';
                    }
                    passInput.value = '';
                    passInput.focus();
                }
                return;
            }

            console.warn("⚠️ No pending action found");
        };
    }

    const passInput = document.getElementById('modal-auth-pass');
    if (passInput) {
        passInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const btn = document.getElementById('password-confirm-btn');
                if (btn) btn.click();
            }
        });
    }
});

// ================================================================ */
// UI UPDATE - FIXED                                                */
// ================================================================ */

function updateAttendanceUI(status, time) {
    const statusText = document.getElementById('attendanceStatusText');
    const cinBtn = document.getElementById('s-checkin-btn');
    const coutBtn = document.getElementById('s-checkout-btn');

    if (status === 'checked_in') {
        if (cinBtn) {
            cinBtn.classList.add('hidden');
        }
        if (coutBtn) {
            coutBtn.classList.remove('hidden');
            coutBtn.innerHTML = '<i class="fa-regular fa-circle-xmark"></i> Evening Check-Out';
            // Fix: Properly attach event without replacing the button
            coutBtn.onclick = function() {
                console.log("🔄 Check-Out button clicked");
                window.handleCheckOut(cachedStaff || window.currentStaff);
            };
        }
        if (statusText) {
            statusText.innerText = `✅ Checked in at ${time}`;
            statusText.style.color = '#10b981';
        }
    } else {
        if (cinBtn) {
            cinBtn.classList.remove('hidden');
            cinBtn.innerHTML = '<i class="fa-regular fa-check-circle"></i> Morning Check-In';
            // Fix: Properly attach event without replacing the button
            cinBtn.onclick = function() {
                console.log("🔄 Check-In button clicked");
                window.handleCheckIn(cachedStaff || window.currentStaff);
            };
        }
        if (coutBtn) {
            coutBtn.classList.add('hidden');
        }
        if (statusText) {
            statusText.innerText = "🌅 Ready to check in";
            statusText.style.color = '#4f46e5';
        }
    }
}

// ================================================================ */
// RENDER DASHBOARD - ULTRA FAST & FIXED                           */
// ================================================================ */

window.renderDashboard = function(staff) {
    console.log("📋 Rendering dashboard (optimized)");

    // Cache staff data
    cachedStaff = staff;
    window.currentStaff = staff;

    // Show dashboard immediately
    const authArea = document.getElementById('staff-auth-area');
    const dashArea = document.getElementById('staff-dash-area');

    if (authArea) authArea.classList.add('hidden');
    if (dashArea) dashArea.classList.remove('hidden');

    // Get staff name
    const name = staff.fullName || staff.name || staff.fullname || "Staff";

    // Update UI elements
    const nameDisplay = document.getElementById('userNameDisplay');
    if (nameDisplay) nameDisplay.innerText = name;

    const menuName = document.getElementById('menuUserName');
    if (menuName) menuName.innerText = name;

    const roleEl = document.getElementById('s-dash-role-display');
    if (roleEl) {
        roleEl.innerText = staff.role || staff.position || "Staff";
    }

    const branchEl = document.getElementById('userBranchDisplay');
    if (branchEl) {
        branchEl.innerHTML = `<i class="fa-solid fa-location-dot text-indigo-400"></i> ${staff.branch || staff.school || "Jern Yafoor School"}`;
    }

    // Profile photo - lazy load
    const profileImg = window.getDirectDriveImageUrl(staff.profilePicUrl);
    ['userAvatar', 'menuAvatar'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = `<img src="${profileImg}" class="w-full h-full object-cover" loading="lazy" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4f46e5&color=fff&size=128'">`;
            el.classList.add('overflow-hidden');
        }
    });

    // ========================================================== */
    // ATTENDANCE LISTENER - FIXED                                */
    // ========================================================== */

    const cinBtn = document.getElementById('s-checkin-btn');
    const coutBtn = document.getElementById('s-checkout-btn');
    const statusText = document.getElementById('attendanceStatusText');

    const mobile = staff.mobile || staff.mobileNumber;
    if (!mobile) {
        console.error("No mobile found");
        return;
    }

    // Remove old listener if exists
    if (sessionListener) {
        sessionListener();
        sessionListener = null;
    }

    // ========================================================== */
    // DIRECT BUTTON BINDING - FIXED                              */
    // ========================================================== */

    // Bind Check-In button directly
    if (cinBtn) {
        // Remove any existing listeners by cloning
        const newCinBtn = cinBtn.cloneNode(true);
        cinBtn.parentNode.replaceChild(newCinBtn, cinBtn);

        newCinBtn.onclick = function() {
            console.log("🔄 Check-In button clicked (direct binding)");
            window.handleCheckIn(staff);
        };
        console.log("✅ Check-In button bound");
    }

    // Bind Check-Out button directly (hidden initially)
    if (coutBtn) {
        const newCoutBtn = coutBtn.cloneNode(true);
        coutBtn.parentNode.replaceChild(newCoutBtn, coutBtn);

        newCoutBtn.onclick = function() {
            console.log("🔄 Check-Out button clicked (direct binding)");
            window.handleCheckOut(staff);
        };
        console.log("✅ Check-Out button bound");
    }

    // ========================================================== */
    // SESSION LISTENER                                           */
    // ========================================================== */

    const sessionRef = ref(db, 'active_staff_sessions/' + mobile);

    // Check session once first for fast initial load
    get(sessionRef).then(function(snapshot) {
        const session = snapshot.val();
        updateButtons(session);
    }).catch(function(error) {
        console.warn("Session check error:", error);
    });

    // Setup real-time listener
    sessionListener = onValue(sessionRef, function(snapshot) {
        const session = snapshot.val();
        updateButtons(session);
    });
};

function updateButtons(session) {
    const cinBtn = document.getElementById('s-checkin-btn');
    const coutBtn = document.getElementById('s-checkout-btn');
    const statusText = document.getElementById('attendanceStatusText');
    const staff = cachedStaff || window.currentStaff;

    if (session && session.status === 'checked_in') {
        // Checked IN
        if (cinBtn) {
            cinBtn.classList.add('hidden');
        }
        if (coutBtn) {
            coutBtn.classList.remove('hidden');
            coutBtn.innerHTML = '<i class="fa-regular fa-circle-xmark"></i> Evening Check-Out';
            // Fix: Set onclick directly without cloning
            coutBtn.onclick = function() {
                console.log("🔄 Check-Out button clicked (from listener)");
                window.handleCheckOut(staff);
            };
        }
        if (statusText) {
            statusText.innerText = `✅ Checked in at ${session.timeIn || 'recently'}`;
            statusText.style.color = '#10b981';
        }
    } else {
        // Checked OUT
        if (cinBtn) {
            cinBtn.classList.remove('hidden');
            cinBtn.innerHTML = '<i class="fa-regular fa-check-circle"></i> Morning Check-In';
            // Fix: Set onclick directly without cloning
            cinBtn.onclick = function() {
                console.log("🔄 Check-In button clicked (from listener)");
                window.handleCheckIn(staff);
            };
        }
        if (coutBtn) {
            coutBtn.classList.add('hidden');
        }
        if (statusText) {
            statusText.innerText = "🌅 Ready to check in";
            statusText.style.color = '#4f46e5';
        }
    }
}

// ================================================================ */
// LOGOUT - CLEANUP                                                 */
// ================================================================ */

window.logoutStaff = function() {
    console.log("🔒 Logging out - cleaning up listeners");

    if (sessionListener) {
        sessionListener();
        sessionListener = null;
    }

    cachedStaff = null;
    window.currentStaff = null;
    isCheckInProgress = false;

    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch(e) {}

    window.location.href = 'staff-login.html';
};

console.log("✅ attendance_module.js loaded (CHECK-IN FIXED)");