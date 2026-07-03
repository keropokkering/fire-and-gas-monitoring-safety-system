// ==========================================
// FGS-PRO 3000 Authentication Module
// auth.js - Manage operator credentials & session
// ==========================================

const FGSAuth = (() => {

    // ------------------------------------
    // USER CREDENTIALS DATABASE
    // Edit this list to add / remove users
    // ------------------------------------
    const USERS = [
        {
            username: 'admin',
            password: 'admin123',
            role: 'Administrator',
            displayName: 'System Administrator'
        },
        {
            username: 'operator',
            password: 'fgs2024',
            role: 'Operator',
            displayName: 'Field Operator'
        },
        {
            username: 'supervisor',
            password: 'super2024',
            role: 'Supervisor',
            displayName: 'Safety Supervisor'
        }
    ];

    // ------------------------------------
    // Authenticate User
    // ------------------------------------
    function authenticate(username, password) {
        if (!username || !password) {
            return { success: false, message: 'Username and password are required.' };
        }

        const user = USERS.find(
            u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
        );

        if (user) {
            return {
                success: true,
                user: {
                    username: user.username,
                    role: user.role,
                    displayName: user.displayName
                }
            };
        }

        return {
            success: false,
            message: 'Invalid username or password. Access denied.'
        };
    }

    // ------------------------------------
    // Get Current Logged-in User
    // ------------------------------------
    function getCurrentUser() {
        const raw = sessionStorage.getItem('fgs_user');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    // ------------------------------------
    // Check if User Is Authenticated
    // ------------------------------------
    function isAuthenticated() {
        return sessionStorage.getItem('fgs_authenticated') === 'true';
    }

    // ------------------------------------
    // Logout
    // ------------------------------------
    function logout() {
        sessionStorage.removeItem('fgs_authenticated');
        sessionStorage.removeItem('fgs_user');
        window.location.href = 'login.html';
    }

    // ------------------------------------
    // Guard: Call this at the top of index.html
    // to redirect unauthenticated users
    // ------------------------------------
    function requireAuth() {
        if (!isAuthenticated()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    return { authenticate, getCurrentUser, isAuthenticated, logout, requireAuth };
})();
