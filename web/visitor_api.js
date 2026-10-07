/**
 * VISITOR API (Phase 2) - thin client for the visitor/contractor Cloud Functions.
 * The browser never reads/writes visitors/contractors directly any more.
 */
import { app } from './firebase_config.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const fns = getFunctions(app, 'us-central1');
const call = (name) => httpsCallable(fns, name);
const lookupFn = call('visitorLookup');
const checkInFn = call('visitorCheckIn');
const checkOutFn = call('visitorCheckOut');

/** Make sure the anonymous session exists before the first call. */
const ready = () => (window.authReady || Promise.resolve());

export function apiErrorMessage(err) {
    const code = err && err.code;
    if (code === 'functions/resource-exhausted' || code === 'functions/invalid-argument' ||
        code === 'functions/not-found' || code === 'functions/permission-denied' ||
        code === 'functions/unavailable' || code === 'functions/already-exists') {
        return err.message;
    }
    if (code === 'functions/unauthenticated') return 'Session not ready. Please refresh the page.';
    console.error('Visitor API error:', err);
    return 'Something went wrong. Please try again.';
}

export async function visitorLookup(mode, mobile) {
    await ready();
    return (await lookupFn({ mode, mobile })).data;
}
export async function visitorCheckIn(payload) {
    await ready();
    return (await checkInFn(payload)).data;
}
export async function visitorCheckOut(mode, mobile, pin) {
    await ready();
    return (await checkOutFn({ mode, mobile, pin })).data;
}

window.visitorApi = { visitorLookup, visitorCheckIn, visitorCheckOut, apiErrorMessage };
