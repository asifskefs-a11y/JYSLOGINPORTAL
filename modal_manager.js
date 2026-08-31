/**
 * Global Modal Manager
 * Handles event delegation, multi-step workflows, and dynamic rendering.
 */

import { ModalPayloadBuilders } from './modal_payloads.js';

class ModalManager {
    constructor() {
        this.activeModal = null;
        this.modalChain = [];
        this.isWorkflowAborted = false;

        this._setupDelegation();
    }

    /**
     * Requirement 2: Event delegation on document
     */
    _setupDelegation() {
        document.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-modal-id]');
            if (trigger) {
                e.preventDefault();
                this.handleTrigger(trigger);
            }

            // Close modal on overlay click
            if (e.target.matches('.modal-overlay') || e.target.matches('[id$="-modal"]')) {
                if (!e.target.querySelector('.modal-content')?.contains(e.target)) {
                    this.closeActive();
                }
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModal) {
                this.closeActive();
            }
        });
    }

    /**
     * Requirement 3: Handle triggers with data attributes
     */
    async handleTrigger(el) {
        const modalId = el.getAttribute('data-modal-id');
        const type = el.getAttribute('data-modal-type');
        const rawPayload = el.getAttribute('data-payload');

        let payload = {};
        if (rawPayload) {
            try {
                payload = JSON.parse(decodeURIComponent(rawPayload));
            } catch (e) {
                console.error("❌ ModalManager: Failed to parse payload", e);
            }
        }

        // Requirement 7: Validate and build payload
        if (type && ModalPayloadBuilders[type]) {
            const built = ModalPayloadBuilders[type](payload);
            payload = built.data; // Use the internal data for existing functions
        }

        // Check for existing opening functions to maintain compatibility
        const capitalizedType = type ? type.charAt(0).toUpperCase() + type.slice(1) : '';
        const legacyFuncs = [
            `open${capitalizedType}Modal`,
            `openStaffDocumentReviewModal` // special case
        ];

        let handled = false;
        if (type === 'docReview' && window.openStaffDocumentReviewModal) {
            window.openStaffDocumentReviewModal(payload.mobile);
            handled = true;
        } else {
            for (const fn of legacyFuncs) {
                if (typeof window[fn] === 'function') {
                    // Pass ID if it exists in payload
                    const id = payload.id || payload.firebaseKey || payload.mobile || payload.barcode;
                    window[fn](id || payload);
                    handled = true;
                    break;
                }
            }
        }

        if (!handled) {
            this.open(modalId, payload);
        }
    }

    /**
     * Opens a specific modal with data
     */
    open(id, payload = {}) {
        const modal = document.getElementById(id);
        if (!modal) {
            console.error(`❌ ModalManager: Modal element #${id} not found.`);
            return;
        }

        // Requirement 5: Modal chain for multi-step
        if (this.activeModal) {
            this.modalChain.push({ id: this.activeModal.id, payload: this.activeModal._payload });
            this._hide(this.activeModal);
        }

        modal._payload = payload;
        this.activeModal = modal;
        this._show(modal, payload);

        console.log(`🎭 ModalManager: Opened ${id}`, payload);
    }

    /**
     * Requirement 6: Abort/Cancel mechanism
     */
    closeActive() {
        if (!this.activeModal) return;

        this._hide(this.activeModal);

        // Resume previous if chain exists
        if (this.modalChain.length > 0) {
            const previous = this.modalChain.pop();
            this.open(previous.id, previous.payload);
        } else {
            this.activeModal = null;
            this.modalChain = [];
        }
    }

    abortWorkflow() {
        this.isWorkflowAborted = true;
        this.closeAll();
        console.warn("🛑 ModalManager: Workflow aborted by user.");
    }

    closeAll() {
        document.querySelectorAll('[id$="-modal"], .modal-overlay').forEach(m => this._hide(m));
        this.activeModal = null;
        this.modalChain = [];
    }

    _show(el, payload) {
        el.classList.remove('hidden');
        el.style.display = 'flex';

        // Trigger specific initialization if needed
        if (window[`on${el.id.replace(/-/g, '')}Open`]) {
            window[`on${el.id.replace(/-/g, '')}Open`](payload);
        }
    }

    _hide(el) {
        el.classList.add('hidden');
        el.style.display = 'none';
    }
}

// Instantiate and expose to window
window.modalManager = new ModalManager();
export default window.modalManager;
