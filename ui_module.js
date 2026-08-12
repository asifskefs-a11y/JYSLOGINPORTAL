// ================================================================ */
// WHATSAPP-STYLE TOAST ENGINE (NEW v4.1)                           */
// ================================================================ */
window.showWhatsAppToast = (title, message, type = 'info') => {
    let container = document.getElementById('toast-notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-notification-container';
        container.className = 'fixed top-4 right-4 z-[9999999] flex flex-col gap-3 max-w-sm w-full pointer-events-none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto bg-slate-900/95 border-l-4 border-emerald-500 text-white p-4 rounded-xl shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-x-full flex flex-col gap-1';
    toast.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="font-bold text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                <i class="fa-solid fa-bell animate-bounce"></i> ${title}
            </span>
            <button onclick="this.parentElement.parentElement.remove()" class="text-slate-400 hover:text-white text-xs">&times;</button>
        </div>
        <p class="text-xs text-slate-200 mt-1">${message}</p>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-x-full'), 50);
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
};

// ================================================================ */
// UI UTILITIES & INTERFACE HELPERS                                 */
// ================================================================ */

// ================================================================ */
// SIGNATURE PAD ENGINE (PREMIUM v3.6.0 - EVENT ISOLATION FIX)      */
// ================================================================ */
class SignaturePadEngine {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.canvas = document.getElementById(canvasId);
        this.isDrawing = false;
        this.isLocked = true;

        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            this._setupCanvas();
            this._bindEvents();
        }

        window.addEventListener('resize', () => {
            // Debounced resize to avoid precision loss during active drawing
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this._setupCanvas(), 250);
        });
    }


_setupCanvas() {
    if (!this.canvas) {
        this.canvas = document.getElementById(this.canvasId);
    }

    if (!this.canvas) {
        console.warn(`⚠️ Signature Canvas [${this.canvasId}] not found in DOM yet. Skipping setup.`);
        return;
    }

    // Check if element is hidden in a tab
    if (this.canvas.offsetParent === null && !this.canvas.clientWidth) {
        console.warn("⚠️ Canvas is currently hidden/invisible. Setup deferred.");
        return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    if (!this.ctx) {
        this.ctx = this.canvas.getContext('2d', { alpha: false });
    }

    if (rect.width > 0 && this.ctx) {
        this.canvas.width = rect.width * ratio;
        this.canvas.height = rect.height * ratio;
        this.ctx.resetTransform();
        this.ctx.scale(ratio, ratio);
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.strokeStyle = '#1E1B4B';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width / ratio, this.canvas.height / ratio);
    }
}

_getPosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

_handleStart(e) {
    if (this.isLocked) return;
    e.preventDefault();
    e.stopPropagation(); // Prevents modal auto-close
    const pos = this._getPosition(e);
    this.isDrawing = true;
    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
}

_handleMove(e) {
    if (!this.isDrawing || this.isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = this._getPosition(e);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
}

_handleEnd(e) {
    if (this.isDrawing) {
        e?.stopPropagation();
        this.isDrawing = false;
        this.ctx.closePath();
    }
}

_bindEvents() {
    const c = this.canvas;
    const wrapper = c.closest('.canvas-wrapper') || c.parentElement;

    // Prevent touch events from bubbling up to Modal / Backdrop Close Listeners
    ['pointerdown', 'touchstart', 'mousedown'].forEach(evt => {
        c.addEventListener(evt, (e) => {
            e.stopPropagation();
        }, { passive: false });

        if (wrapper) {
            wrapper.addEventListener(evt, (e) => {
                e.stopPropagation();
            }, { passive: false });
        }
    });

    c.addEventListener('pointerdown', this._handleStart.bind(this));
    c.addEventListener('pointermove', this._handleMove.bind(this));
    window.addEventListener('pointerup', this._handleEnd.bind(this));
    c.style.touchAction = 'none';
}

unlock() { this.isLocked = false; return this; }
lock() { this.isLocked = true; return this; }
clear() { this._setupCanvas(); }
toDataURL() { return this.canvas.toDataURL("image/png"); }
}

class SignaturePadManager {
    constructor() { this.pads = new Map(); }
    getPad(id) {
        if (!this.pads.has(id)) {
            const pad = new SignaturePadEngine(id);
            this.pads.set(id, pad);
        }
        return this.pads.get(id);
    }
}

window.sigPadManager = new SignaturePadManager();
window.getCanvasBase64 = (id) => window.sigPadManager.getPad(id).toDataURL();

window.clearSignaturePad = (id) => {
    const pad = window.sigPadManager.getPad(id);
    if (pad) {
        pad.clear();
        pad.lock();
    }
    const canvas = document.getElementById(id);
    const wrapper = canvas?.closest('.canvas-wrapper');
    if (wrapper) wrapper.classList.remove('unlocked');
};

window.unlockCanvas = (el, event) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const wrapper = el.closest('.canvas-wrapper') || el;
    const canvas = wrapper?.querySelector('canvas') || wrapper;
    if (wrapper) wrapper.classList.add('unlocked');

    if (canvas) {
        const pad = window.sigPadManager.getPad(canvas.id);
        if (pad) {
            pad.unlock();
            // Setup dimensions safely without clearing active path
            pad._setupCanvas();
        }
    }
};

window.initVisitorCanvas = () => window.sigPadManager.getPad('v-sig-pad');

// --- GLOBAL SUCCESS POPUP ---
window.triggerSuccessPopup = (msg) => {
    alert(msg || "Action completed successfully!");
};

// ================================================================ */
// GLOBAL LOADING SPINNER (v4.0 - UNIVERSAL LOGO LOADER)            */
// ================================================================ */
let spinnerTimeout = null;

window.showGlobalSpinner = (message = "Loading...") => {
    const spinner = document.getElementById('universal-logo-loader');
    const spText = document.getElementById('universal-loader-text');

    if (spinner) {
        if (spText && message) spText.innerText = message;
        spinner.style.display = 'flex';
        spinner.classList.remove('hidden');

        // Use Pulse instead of Spin
        const img = spinner.querySelector('img');
        if (img) img.className = "w-28 h-28 object-contain rounded-2xl logo-pulse-anim";

        // Safety Auto-Hide after 15 seconds max
        if (spinnerTimeout) clearTimeout(spinnerTimeout);
        spinnerTimeout = setTimeout(() => {
            window.hideGlobalSpinner();
        }, 15000);
    }
};

window.hideGlobalSpinner = () => {
    const spinner = document.getElementById('universal-logo-loader');
    if (spinner) {
        spinner.style.display = 'none';
        spinner.classList.add('hidden');
    }
    if (spinnerTimeout) clearTimeout(spinnerTimeout);
};

// Aliases for backward compatibility
window.showLoader = window.showGlobalSpinner;
window.hideLoader = window.hideGlobalSpinner;

/**
 * ROLE-BASED DASHBOARD RULES (v4.0)
 * Triggered ONLY IF user's role is strictly 'Cleaner'
 */
window.applyRoleDashboardRules = (userRole) => {
    const role = (userRole || '').toString().trim().toLowerCase();
    const isSimpleCleaner = (role === 'cleaner');
    const isSecurity = (role === 'security');
    const isAdmin = (role === 'admin');
    const isResolver = (role === 'cleaner leader' || role === 'technician' || role === 'housekeeping');

    console.log(`🛡️ Applying Rules for Role: [${role}] | Restricted: ${isSimpleCleaner}`);

    // Sidebar & Menu Elements (Logic only for hiding restricted menu sections)
    const restrictedMenuSections = ['menu-asset-section'];
    const cleanerHistorySection = 'cleaner-attendance-section';

    if (isSimpleCleaner) {
        // 🛑 CLEANER ROLE: Hide advanced menu sections and show history
        restrictedMenuSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        const historyEl = document.getElementById(cleanerHistorySection);
        if (historyEl) historyEl.classList.remove('hidden');

        // Hide all task items for simple cleaner
        const taskBtn = document.getElementById('menu-tasks-btn');
        if (taskBtn) taskBtn.classList.add('hidden');
        const createBtn = document.getElementById('menu-create-task-btn');
        if (createBtn) createBtn.classList.add('hidden');
    } else {
        // ✅ OTHERS: Show advanced menu sections and hide cleaner history
        restrictedMenuSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('hidden');
        });
        const historyEl = document.getElementById(cleanerHistorySection);
        if (historyEl) historyEl.classList.add('hidden');

        // Task Visibility Rules
        const taskBtn = document.getElementById('menu-tasks-btn');
        if (taskBtn) taskBtn.classList.remove('hidden');

        const createBtn = document.getElementById('menu-create-task-btn');
        const dashCreateBtn = document.getElementById('s-dash-create-task-btn');

        if (isSecurity || isAdmin) {
            if (createBtn) createBtn.classList.remove('hidden');
            if (dashCreateBtn) dashCreateBtn.classList.remove('hidden');
        } else {
            if (createBtn) createBtn.classList.add('hidden');
            if (dashCreateBtn) dashCreateBtn.classList.add('hidden');
        }
    }

    if (role.includes('tech')) {
        // Renaming in UI if needed, though most is handled by templates
    }
};

// --- AUTOMATIC SPINNER ATTACHMENT (FORCE FIX) ---
document.addEventListener('DOMContentLoaded', () => {
    // Auto-catch all form submit events
    document.addEventListener('submit', (e) => {
        window.showGlobalSpinner("Saving Data...");
    }, true);

    // Auto-catch all primary action buttons
    const attachButtonListeners = () => {
        document.querySelectorAll('button[type="submit"], .btn-primary, .submit-btn, .btn-submit-transfer').forEach(btn => {
            if (!btn.dataset.spinnerBound) {
                btn.addEventListener('click', () => {
                    setTimeout(() => {
                        const form = btn.closest('form');
                        if (!form || form.checkValidity()) {
                            window.showGlobalSpinner("Please wait...");
                        }
                    }, 10);
                });
                btn.dataset.spinnerBound = "true";
            }
        });
    };

    attachButtonListeners();
    const observer = new MutationObserver(attachButtonListeners);
    observer.observe(document.body, { childList: true, subtree: true });
});

// Aliases for backward compatibility with previous step
window.showLoader = window.showGlobalSpinner;
window.hideLoader = window.hideGlobalSpinner;

/**
 * UNIVERSAL TABLE PAGINATOR (v4.0)
 * Handles client-side pagination for all dashboard tables
 */
class TablePaginator {
    constructor(containerId, itemsPerPage = 20) {
        this.containerId = containerId; // ID of the <div> where controls go
        this.itemsPerPage = itemsPerPage;
        this.currentPage = 1;
        this.data = [];
        this.renderCallback = null;
    }

    /**
     * @param {Array} dataArray - The full dataset to paginate
     * @param {Function} renderRowCallback - (pageItems, startIndex) => void
     */
    init(dataArray, renderRowCallback) {
        this.data = dataArray || [];
        this.renderCallback = renderRowCallback;
        this.currentPage = 1;
        this.render();
    }

    render() {
        if (!this.renderCallback) return;

        window.showGlobalSpinner("Syncing View...");

        setTimeout(() => {
            const totalPages = Math.max(1, Math.ceil(this.data.length / this.itemsPerPage));
            if (this.currentPage > totalPages) this.currentPage = totalPages;
            if (this.currentPage < 1) this.currentPage = 1;

            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage;
            const pageItems = this.data.slice(start, end);

            // Execute actual rendering of rows
            this.renderCallback(pageItems, start);

            // Render controls UI
            this.renderControls(totalPages);

            window.hideGlobalSpinner();
        }, 100);
    }


    renderControls(totalPages) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-white/50 backdrop-blur-sm border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4 shadow-sm">
                <div class="flex items-center gap-3">
                    <span class="opacity-50">Show:</span>
                    <select class="page-size-select bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-indigo-600 outline-none">
                        <option value="10" ${this.itemsPerPage === 10 ? 'selected' : ''}>10</option>
                        <option value="20" ${this.itemsPerPage === 20 ? 'selected' : ''}>20</option>
                        <option value="50" ${this.itemsPerPage === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${this.itemsPerPage === 100 ? 'selected' : ''}>100</option>
                    </select>
                    <span class="ml-2">Total: <span class="text-indigo-600 font-black">${this.data.length}</span></span>
                </div>

                <div class="flex items-center gap-4">
                    <button class="prev-btn w-8 h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-full disabled:opacity-30 disabled:grayscale transition-all active:scale-90" ${this.currentPage === 1 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>

                    <div class="flex items-center gap-1">
                        <span class="opacity-50">Page</span>
                        <span class="text-indigo-600">${this.currentPage}</span>
                        <span class="opacity-50">/ ${totalPages}</span>
                    </div>

                    <button class="next-btn w-8 h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-full disabled:opacity-30 disabled:grayscale transition-all active:scale-90" ${this.currentPage >= totalPages ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;

        // Bind control events
        container.querySelector('.prev-btn')?.addEventListener('click', (e) => { e.preventDefault(); this.currentPage--; this.render(); });
        container.querySelector('.next-btn')?.addEventListener('click', (e) => { e.preventDefault(); this.currentPage++; this.render(); });
        container.querySelector('.page-size-select')?.addEventListener('change', (e) => {
            this.itemsPerPage = parseInt(e.target.value);
            this.currentPage = 1;
            this.render();
        });
    }
}

window.TablePaginator = TablePaginator;

// Initialize global paginators object
window.adminPaginators = {
    visitors: new TablePaginator('visitor-logs-pagination'),
    contractors: new TablePaginator('contractor-logs-pagination'),
    attendance: new TablePaginator('staff-attendance-pagination'),
    tasks: new TablePaginator('tasks-pagination'),
    directory: new TablePaginator('directory-pagination'),
    assets: new TablePaginator('assets-pagination'),
    disposal: new TablePaginator('disposal-pagination'),
    transfers: new TablePaginator('transfer-pagination')
};

// --- STAFF UI TAB TOGGLING ---
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
            regForm.classList.add('hidden');
        }
    } catch (e) { console.error("Toggle Tab Error:", e); }
};

// ================================================================ */
// MEDIA RENDERING & FALLBACKS                                      */
// ================================================================ */

window.getDirectDriveImageUrl = (driveUrl) => {
    if (!driveUrl || driveUrl === 'N/A' || driveUrl === '-') return 'https://placehold.co/400x300/e2e8f0/64748b?text=No+Photo';
    if (driveUrl.startsWith('data:image')) return driveUrl;
    let fileId = null;
    const match = driveUrl.match(/\/file\/d\/([^\/]+)/) || driveUrl.match(/[?&]id=([^&]+)/) || driveUrl.match(/([a-zA-Z0-9_-]{25,})/);
    if (match) fileId = match[1];
    return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : driveUrl;
};

window.formatDriveImageUrl = window.getDirectDriveImageUrl;
window.openImageZoom = (url) => { if(!url || url.includes('placeholder')) return; window.open(url, '_blank'); };

// ================================================================ */
// COMPRESSION & IMAGE HELPERS                                      */
// ================================================================ */

window.compressImageFile = async (file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; } }
                else { if (h > maxHeight) { w *= maxHeight / h; h = maxHeight; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

// ================================================================ */
// APP LAUNCH VIDEO LOGIC                                           */
// ================================================================ */
window.handleLaunchVideo = () => {
    const overlay = document.getElementById('launchVideoOverlay');
    const video = document.getElementById('appLaunchVideo');
    const skipBtn = document.getElementById('skipVideoBtn');
    if (!overlay || !video) return;
    if (sessionStorage.getItem('videoPlayedThisSession') === 'true') { overlay.remove(); return; }
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    let hasHidden = false;
    const hideOverlay = () => {
        if (hasHidden) return;
        hasHidden = true;
        sessionStorage.setItem('videoPlayedThisSession', 'true');
        overlay.style.transition = 'opacity 0.8s ease-out';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 800);
    };
    const safetyTimeout = setTimeout(hideOverlay, 4500);
    video.onended = hideOverlay;
    if (skipBtn) skipBtn.onclick = hideOverlay;
    video.play().catch(hideOverlay);
};

document.addEventListener('DOMContentLoaded', window.handleLaunchVideo);
window.addEventListener('load', () => { setTimeout(() => { const o = document.getElementById('launchVideoOverlay'); if(o) o.remove(); }, 5000); });

console.log("✅ ui_module.js loaded (UI & Interface Helpers)");
