// Authentication Module - With Security Enhancements
import { signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db, appId } from './firebase-config.js';
import { showAlert } from '../components/modal.js';
import { hashPassword, verifyPassword, isHashed, saveSession, getSession, clearSession } from './crypto.js';

let _globalUsers = () => [];
let _setAppCurrentUser = () => { };
let _getAppCurrentUser = () => null;
let _startDataListeners = () => { };
let _initAppUI = () => { };

export function setAuthDeps(deps) {
    _globalUsers = deps.globalUsers;
    _setAppCurrentUser = deps.setAppCurrentUser;
    _getAppCurrentUser = deps.getAppCurrentUser;
    _startDataListeners = deps.startDataListeners;
    _initAppUI = deps.initAppUI;
}

export async function initAuth() {
    if (!auth) return;

    // Check existing session first
    const existingSession = getSession();
    if (existingSession) {
        console.log('[Auth] Valid session found, restoring user:', existingSession.email || existingSession.username);
        _setAppCurrentUser(existingSession);

        // Refresh user data from Firestore to get latest fields (e.g., role)
        refreshUserFromFirestore(existingSession);
    }

    // Handle Google login redirect result (for COOP compatibility)
    try {
        console.log('[Auth] Checking for Google redirect result...');
        const result = await getRedirectResult(auth);
        console.log('[Auth] getRedirectResult:', result);
        if (result && result.user) {
            console.log('[Auth] Processing Google redirect result for:', result.user.email);
            await processGoogleLoginResult(result);
            return; // Exit early, processGoogleLoginResult will handle the rest
        } else {
            console.log('[Auth] No Google redirect result found');
        }
    } catch (err) {
        console.error('[Auth] Redirect result error:', err);
        console.error('[Auth] Error code:', err.code);
        console.error('[Auth] Error message:', err.message);
        if (err.code !== 'auth/popup-closed-by-user') {
            showAlert('Google 登入失敗：' + err.message);
        }
    }

    try {
        await signInAnonymously(auth);
    } catch (err) {
        console.error("Auth error:", err);
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            _startDataListeners(user);
        } else {
            checkLoadingComplete();
        }
    });

    // Reliable timeout fallback - ensure UI is shown within 3 seconds
    setTimeout(() => {
        const loader = document.getElementById('global-loader');
        // Check if loader is visible using computed style (more reliable than inline style)
        const isLoaderVisible = loader && window.getComputedStyle(loader).display !== 'none';
        if (isLoaderVisible) {
            console.warn('[Auth] Initialization timeout - forcing UI display');
            checkLoadingComplete();
        }
    }, 3000);
}

export function checkLoadingComplete() {
    const loader = document.getElementById('global-loader');
    const authContainer = document.getElementById('auth-container');
    const mainApp = document.getElementById('main-app');

    // Hide loader
    if (loader) {
        loader.style.display = 'none';
    }

    // If neither auth nor main is visible, show appropriate one
    const authVisible = authContainer && !authContainer.classList.contains('hidden-section');
    const mainVisible = mainApp && !mainApp.classList.contains('hidden-section');

    if (!authVisible && !mainVisible) {
        const currentUser = _getAppCurrentUser();
        if (currentUser) {
            _initAppUI();
        } else {
            authContainer.classList.remove('hidden-section');
        }
    }
}

// Refresh user data from Firestore to get latest fields (e.g., role)
async function refreshUserFromFirestore(sessionUser) {
    if (!db || !sessionUser?.id) return;

    try {
        const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', sessionUser.id);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const freshData = { id: sessionUser.id, ...userDoc.data() };
            console.log('[Auth] Refreshed user data from Firestore, role:', freshData.role);

            // Update current user with fresh data
            _setAppCurrentUser(freshData);
            saveSession(freshData);

            // Re-check admin status
            if (freshData.role === 'admin') {
                console.log('[Auth] Admin user detected after refresh');
                // Trigger admin UI injection if not already done
                const { initAdmin } = await import('./admin.js');
                setTimeout(() => initAdmin(), 500);
            }
        }
    } catch (err) {
        console.error('[Auth] Failed to refresh user data:', err);
    }
}

export async function handleAppLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.innerText = "驗證中...";

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const users = _globalUsers();
        if (users.length === 0 && !db) {
            showAlert("無法連線");
            btn.disabled = false;
            btn.innerText = "開始";
            return;
        }

        // Find user by username
        const user = users.find(u => u.username === username);

        if (!user) {
            showAlert('帳號或密碼錯誤');
            btn.disabled = false;
            btn.innerText = "開始";
            return;
        }

        // Check password - support both hashed and plain text
        let passwordMatch = false;

        if (isHashed(user.password)) {
            // Password is hashed, verify it
            passwordMatch = await verifyPassword(password, user.password);
        } else {
            // Legacy plain text password - migrate to hash
            passwordMatch = (user.password === password);

            if (passwordMatch && db) {
                // Migrate to hashed password
                try {
                    const hashedPwd = await hashPassword(password);
                    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id);
                    await updateDoc(userRef, { password: hashedPwd });
                    console.log('Password migrated to hash');
                } catch (e) {
                    console.warn('Could not migrate password:', e);
                }
            }
        }

        if (passwordMatch) {
            _setAppCurrentUser(user);
            saveSession(user); // Save session with expiry
            _initAppUI();
        } else {
            showAlert('帳號或密碼錯誤');
        }
    } catch (err) {
        showAlert('登入失敗：' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "開始";
    }
}

export async function handleAppRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    btn.innerText = "處理中...";

    try {
        if (!db) throw new Error("資料庫未連線");
        if (!auth || !auth.currentUser) throw new Error("驗證中，請稍候");

        const dept = document.getElementById('reg-department').value;
        const job = document.getElementById('reg-jobTitle').value;
        const name = document.getElementById('reg-name').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;

        // Validate department
        if (!dept) {
            throw new Error('請選擇處室');
        }

        // Validate password strength
        if (password.length < 6) {
            throw new Error('密碼至少需要 6 個字元');
        }

        const users = _globalUsers();
        if (users && users.find(u => u.username === username)) {
            throw new Error('帳號已被使用！');
        }

        // Hash password before storing
        const hashedPassword = await hashPassword(password);

        // Use auth UID as document ID (required by new Firestore rules)
        const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', auth.currentUser.uid);
        await setDoc(userDocRef, {
            department: dept,
            jobTitle: job,
            name,
            username,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        });

        showAlert('建立成功！請登入');
        toggleAuthMode('login');
        e.target.reset();
    } catch (err) {
        showAlert('失敗：' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "建立";
    }
}

export async function handleGoogleLogin() {
    if (!auth || !db) {
        showAlert('系統尚未準備完成');
        return;
    }

    const googleBtn = document.getElementById('btn-google-login');
    googleBtn.disabled = true;
    googleBtn.innerHTML = '登入中...';

    try {
        const provider = new GoogleAuthProvider();

        // Add Calendar scope for event sync
        provider.addScope('https://www.googleapis.com/auth/calendar.events');

        console.log('[Auth] Starting Google popup login...');

        // Use popup for more reliable login (redirect has issues with third-party cookie restrictions)
        const result = await signInWithPopup(auth, provider);

        console.log('[Auth] Google popup login successful:', result.user.email);

        // Process the result directly
        await processGoogleLoginResult(result);

    } catch (err) {
        console.error('[Auth] Google login error:', err);
        googleBtn.disabled = false;
        googleBtn.innerHTML = '🌐 使用 Google 登入';

        if (err.code === 'auth/unauthorized-domain') {
            showAlert('網域未授權！請至 Firebase Console 新增此網域');
        } else if (err.code === 'auth/popup-closed-by-user') {
            showAlert('登入視窗已關閉');
        } else if (err.code === 'auth/popup-blocked') {
            showAlert('彈出視窗被阻擋，請允許此網站的彈出視窗');
        } else {
            showAlert('Google 登入失敗：' + err.message);
        }
    }
}

// Process Google login result after redirect
async function processGoogleLoginResult(result) {
    const googleUser = result.user;
    console.log('[Auth] Google user:', googleUser.email);

    // Get OAuth credential to extract access token
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential && credential.accessToken) {
        try {
            // Store access token for Calendar API
            const { setAccessToken } = await import('./google-calendar.js');
            setAccessToken(credential.accessToken);
            console.log('[Auth] Calendar access token stored');
        } catch (e) {
            console.log('[Auth] Calendar module not available');
        }
    }

    // Use 'users' collection to match the Firestore rules
    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', googleUser.uid);
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const q = query(usersRef, where('googleUid', '==', googleUser.uid));
    const querySnapshot = await getDocs(q);

    let userData;
    if (querySnapshot.empty) {
        const newUserData = {
            googleUid: googleUser.uid,
            email: googleUser.email,
            name: googleUser.displayName || googleUser.email.split('@')[0],
            jobTitle: '待設定',
            username: googleUser.email,
            photoURL: googleUser.photoURL || '',
            createdAt: new Date().toISOString(),
            authType: 'google'
        };
        // Use setDoc with auth UID as document ID (required by new Firestore rules)
        await setDoc(userDocRef, newUserData);
        userData = { id: googleUser.uid, ...newUserData };
        showAlert('Google 帳號註冊成功！請設定您的處室和職稱');
    } else {
        const existingDoc = querySnapshot.docs[0];
        // If the existing document ID doesn't match googleUser.uid, we need to migrate
        if (existingDoc.id !== googleUser.uid) {
            console.log('[Auth] Migrating user document to new ID:', googleUser.uid);
            // Create new document with correct ID
            const newUserData = { ...existingDoc.data(), googleUid: googleUser.uid };
            await setDoc(userDocRef, newUserData);
            userData = { id: googleUser.uid, ...newUserData };
        } else {
            userData = { id: existingDoc.id, ...existingDoc.data() };
        }
    }

    _setAppCurrentUser(userData);
    saveSession(userData);

    // Do NOT sign in anonymously - keep the Google auth state!
    // The Google user is already authenticated and has proper permissions
    console.log('[Auth] Keeping Google auth state, uid:', googleUser.uid);

    _startDataListeners(googleUser);

    // Wait for data listeners to load
    setTimeout(() => {
        _initAppUI();

        // Check if user needs to set department
        if (!userData.department || userData.jobTitle === '待設定') {
            setTimeout(() => {
                showAlert('請先完善您的處室和職稱資料');
                if (window.switchTab) window.switchTab('account');
            }, 500);
        }
    }, 1000);
}

export function appLogout() {
    window.showConfirm('確定要登出？', () => {
        clearSession(); // Clear session
        _setAppCurrentUser(null);
        document.getElementById('main-app').classList.add('hidden-section');
        document.getElementById('auth-container').classList.remove('hidden-section');
        document.getElementById('login-form').reset();
    });
}

export function toggleAuthMode(mode) {
    if (mode === 'register') {
        document.getElementById('login-card').classList.add('hidden-section');
        document.getElementById('register-card').classList.remove('hidden-section');

        // Populate department dropdown
        populateRegisterDepartments();
    } else {
        document.getElementById('register-card').classList.add('hidden-section');
        document.getElementById('login-card').classList.remove('hidden-section');
    }
}

function populateRegisterDepartments() {
    const { DEPARTMENTS, renderPositionOptions } = getDepartmentsModule();
    const deptSelect = document.getElementById('reg-department');
    const posSelect = document.getElementById('reg-jobTitle');

    if (deptSelect) {
        deptSelect.innerHTML = '<option value="">-- 請選擇處室 --</option>';
        for (const [id, dept] of Object.entries(DEPARTMENTS)) {
            deptSelect.innerHTML += `<option value="${id}">${dept.icon} ${dept.name}</option>`;
        }
    }

    if (posSelect) {
        posSelect.innerHTML = '<option value="">-- 請先選擇處室 --</option>';
    }
}

function getDepartmentsModule() {
    // Lazy load to avoid circular dependency
    return {
        DEPARTMENTS: {
            academic: { id: 'academic', name: '教務處', icon: '📚', color: '#3498db', positions: ['教務主任', '教學組長', '設備組長', '註冊組長', '資訊組長', '閱推教師'] },
            student: { id: 'student', name: '學務處', icon: '🎓', color: '#27ae60', positions: ['學務主任', '訓育組長', '生教組長', '體育組長', '衛生組長', '護理師', '午餐秘書', '營養師'] },
            general: { id: 'general', name: '總務處', icon: '🏢', color: '#e67e22', positions: ['總務主任', '事務組長', '出納組長', '文書組長', '事務人員'] },
            counseling: { id: 'counseling', name: '輔導室', icon: '💜', color: '#9b59b6', positions: ['輔導主任', '輔導組長', '特教組長', '專輔教師', '資源班教師'] }
        },
        renderPositionOptions: (deptId) => {
            const dept = getDepartmentsModule().DEPARTMENTS[deptId];
            if (!dept) return '<option value="">-- 請先選擇處室 --</option>';
            let html = '<option value="">-- 請選擇職稱 --</option>';
            dept.positions.forEach(pos => {
                html += `<option value="${pos}">${pos}</option>`;
            });
            return html;
        }
    };
}

// Update position dropdown when department changes
window.updatePositionOptions = function () {
    const deptSelect = document.getElementById('reg-department');
    const posSelect = document.getElementById('reg-jobTitle');
    if (!deptSelect || !posSelect) return;

    const { renderPositionOptions } = getDepartmentsModule();
    posSelect.innerHTML = renderPositionOptions(deptSelect.value);
};

window.handleAppLogin = handleAppLogin;
window.handleAppRegister = handleAppRegister;
window.handleGoogleLogin = handleGoogleLogin;
window.appLogout = appLogout;
window.toggleAuthMode = toggleAuthMode;
