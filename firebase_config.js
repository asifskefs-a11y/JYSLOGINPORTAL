import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBQJbAcwEZLQYLooRydSSgNRvzrXG5Vl24",
    authDomain: "schoollog-f0a04.firebaseapp.com",
    projectId: "schoollog-f0a04",
    storageBucket: "schoollog-f0a04.firebasestorage.app",
    messagingSenderId: "961486864461",
    appId: "1:961486864461:web:62b8742704c55d287f5c04",
    measurementId: "G-G7QEGJTBPE",
    databaseURL: "https://schoollog-f0a04-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const SHEETS_URL = "https://script.google.com/macros/s/AKfycbyr-n_jC830cUR47oPrwZgV89NzKqknvNTobSq0PLA7Bp3BlvrZNKWI1SnusSWwbgwt/exec";
