// Authentication Module - With Security Enhancements
import { signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
        console.log('Valid session found, restoring user');
        _setAppCurrentUser(existingSession);
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
}

export function checkLoadingComplete() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.display = 'none';
        const authVisible = !document.getElementById('auth-container').classList.contains('hidden-section');
        const mainVisible = !document.getElementById('main-app').classList.contains('hidden-section');
        if (!authVisible && !mainVisible) {
            const currentUser = _getAppCurrentUser();
            if (currentUser) {
                _initAppUI();
            } else {
                document.getElementById('auth-container').classList.remove('hidden-section');
            }
        }
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
                    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_users', user.id);
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

        const job = document.getElementById('reg-jobTitle').value;
        const name = document.getElementById('reg-name').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;

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

        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_users');
        await addDoc(usersRef, {
            jobTitle: job,
            name,
            username,
            password: hashedPassword, // Store hashed password
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
    const originalHTML = googleBtn.innerHTML;
    googleBtn.disabled = true;
    googleBtn.innerHTML = '登入中...';

    try {
        const provider = new GoogleAuthProvider();

        // Add Calendar scope for event sync
        provider.addScope('https://www.googleapis.com/auth/calendar.events');

        const result = await signInWithPopup(auth, provider);
        const googleUser = result.user;

        // Get OAuth credential to extract access token
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential && credential.accessToken) {
            // Store access token for Calendar API
            const { setAccessToken } = await import('./google-calendar.js');
            setAccessToken(credential.accessToken);
            console.log('[Auth] Calendar access token stored');
        }

        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_users');
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
            const docRef = await addDoc(usersRef, newUserData);
            userData = { id: docRef.id, ...newUserData };
            showAlert('Google 帳號註冊成功！已授權行事曆同步');
        } else {
            const existingDoc = querySnapshot.docs[0];
            userData = { id: existingDoc.id, ...existingDoc.data() };
        }

        _setAppCurrentUser(userData);
        saveSession(userData); // Save session with expiry
        _initAppUI();
    } catch (err) {
        if (err.code === 'auth/popup-closed-by-user') {
            showAlert('登入已取消');
        } else if (err.code === 'auth/unauthorized-domain') {
            showAlert('網域未授權！請至 Firebase Console 新增此網域');
        } else {
            showAlert('Google 登入失敗：' + err.message);
        }
    } finally {
        googleBtn.disabled = false;
        googleBtn.innerHTML = originalHTML;
    }
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
    } else {
        document.getElementById('register-card').classList.add('hidden-section');
        document.getElementById('login-card').classList.remove('hidden-section');
    }
}

window.handleAppLogin = handleAppLogin;
window.handleAppRegister = handleAppRegister;
window.handleGoogleLogin = handleGoogleLogin;
window.appLogout = appLogout;
window.toggleAuthMode = toggleAuthMode;
