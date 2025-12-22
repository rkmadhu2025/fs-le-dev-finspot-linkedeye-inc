/**
 * LinkedEye-FinSpot Main JavaScript
 * Enterprise ITSM & Incident Management Platform
 *
 * Run. Operate. Transform Infrastructure — Intelligently.
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    API_BASE_URL: '/api/proxy',
    // WebSocket connects directly to backend API for real-time events
    WS_URL: window.BACKEND_WS_URL || 'https://fs-le-dev-inc-api.finspot.in',
    TOKEN_KEY: 'authToken',
    REFRESH_TOKEN_KEY: 'refreshToken',
    USER_KEY: 'currentUser',
    TOAST_DURATION: 5000,
    DEBOUNCE_DELAY: 300
};

// ============================================
// AUTHENTICATION
// ============================================

const Auth = {
    getToken() {
        return localStorage.getItem(CONFIG.TOKEN_KEY);
    },

    setToken(token) {
        localStorage.setItem(CONFIG.TOKEN_KEY, token);
    },

    getRefreshToken() {
        return localStorage.getItem(CONFIG.REFRESH_TOKEN_KEY);
    },

    setRefreshToken(token) {
        localStorage.setItem(CONFIG.REFRESH_TOKEN_KEY, token);
    },

    getUser() {
        const user = localStorage.getItem(CONFIG.USER_KEY);
        return user ? JSON.parse(user) : null;
    },

    setUser(user) {
        localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
    },

    isAuthenticated() {
        return !!this.getToken();
    },

    async login(email, password) {
        try {
            const response = await API.post('/auth/login', { email, password });

            if (response.success) {
                this.setToken(response.data.accessToken);
                this.setRefreshToken(response.data.refreshToken);
                this.setUser(response.data.user);
                return { success: true };
            }

            return { success: false, error: response.error };
        } catch (error) {
            return { success: false, error: 'Login failed. Please try again.' };
        }
    },

    async logout() {
        try {
            await API.post('/auth/logout');
        } catch (e) {
            // Ignore errors on logout
        }

        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.REFRESH_TOKEN_KEY);
        localStorage.removeItem(CONFIG.USER_KEY);
        window.location.href = '/login';
    },

    async refreshAccessToken() {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            this.logout();
            return false;
        }

        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });

            const data = await response.json();

            if (data.success) {
                this.setToken(data.data.accessToken);
                return true;
            }
        } catch (e) {
            console.error('Token refresh failed:', e);
        }

        this.logout();
        return false;
    }
};

// ============================================
// API CLIENT
// ============================================

const API = {
    async request(method, endpoint, data = null, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${CONFIG.API_BASE_URL}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        const token = Auth.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            method,
            headers,
            ...options
        };

        if (data && method !== 'GET') {
            config.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, config);

            // Handle 401 - try to refresh token
            if (response.status === 401) {
                const refreshed = await Auth.refreshAccessToken();
                if (refreshed) {
                    headers['Authorization'] = `Bearer ${Auth.getToken()}`;
                    const retryResponse = await fetch(url, { ...config, headers });
                    return await retryResponse.json();
                }
            }

            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    },

    get(endpoint, options) {
        return this.request('GET', endpoint, null, options);
    },

    post(endpoint, data, options) {
        return this.request('POST', endpoint, data, options);
    },

    put(endpoint, data, options) {
        return this.request('PUT', endpoint, data, options);
    },

    patch(endpoint, data, options) {
        return this.request('PATCH', endpoint, data, options);
    },

    delete(endpoint, options) {
        return this.request('DELETE', endpoint, null, options);
    }
};

// ============================================
// WEBSOCKET
// ============================================

const Socket = {
    instance: null,
    listeners: new Map(),

    connect() {
        if (typeof io === 'undefined') {
            console.warn('Socket.IO not loaded');
            return;
        }

        this.instance = io(CONFIG.WS_URL, {
            auth: {
                token: Auth.getToken()
            }
        });

        this.instance.on('connect', () => {
            console.log('WebSocket connected');
            this.emit('authenticate', { token: Auth.getToken() });
        });

        this.instance.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });

        // Global event listeners
        this.instance.on('incident:created', (data) => {
            Toast.info(`New incident created: ${data.number}`);
            this.triggerListeners('incident:created', data);
        });

        this.instance.on('incident:updated', (data) => {
            this.triggerListeners('incident:updated', data);
        });

        // Listen for alert:received event (emitted by backend webhook routes)
        this.instance.on('alert:received', (data) => {
            Toast.warning(`New alert: ${data.name}`);
            this.triggerListeners('alert:received', data);
        });
    },

    emit(event, data) {
        if (this.instance) {
            this.instance.emit(event, data);
        }
    },

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    },

    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    },

    triggerListeners(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data));
        }
    },

    disconnect() {
        if (this.instance) {
            this.instance.disconnect();
            this.instance = null;
        }
    }
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================

const Toast = {
    container: null,

    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },

    show(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: 'check-circle',
            error: 'times-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };

        toast.innerHTML = `
            <i class="fas fa-${icons[type] || icons.info}"></i>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto remove
        if (duration > 0) {
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        return toast;
    },

    success(message, duration) {
        return this.show(message, 'success', duration);
    },

    error(message, duration) {
        return this.show(message, 'error', duration);
    },

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    },

    info(message, duration) {
        return this.show(message, 'info', duration);
    }
};

// Global function alias
window.showToast = (message, type) => Toast.show(message, type);

// ============================================
// UI UTILITIES
// ============================================

const UI = {
    // Debounce function
    debounce(func, wait = CONFIG.DEBOUNCE_DELAY) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Format date/time
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString();
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString();
    },

    formatRelativeTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    },

    // Escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    },

    // Get initials from name
    getInitials(firstName, lastName) {
        return (firstName?.charAt(0) || '') + (lastName?.charAt(0) || '');
    },

    // Toggle loading state
    setLoading(element, isLoading) {
        if (isLoading) {
            element.classList.add('loading');
            element.disabled = true;
        } else {
            element.classList.remove('loading');
            element.disabled = false;
        }
    },

    // Show/hide modal
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.classList.add('modal-open');
        }
    },

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    },

    // Confirm dialog
    async confirm(message, title = 'Confirm') {
        return new Promise((resolve) => {
            const confirmed = window.confirm(message);
            resolve(confirmed);
        });
    }
};

// ============================================
// NAVIGATION
// ============================================

const Navigation = {
    init() {
        // Mobile menu toggle
        const menuToggle = document.querySelector('.menu-toggle');
        const sidebar = document.querySelector('.sidebar');

        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });
        }

        // Close sidebar on outside click (mobile)
        document.addEventListener('click', (e) => {
            if (sidebar && sidebar.classList.contains('open')) {
                if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            }
        });

        // User menu dropdown
        const userMenu = document.querySelector('.user-menu');
        if (userMenu) {
            userMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                userMenu.classList.toggle('open');
            });

            document.addEventListener('click', () => {
                userMenu.classList.remove('open');
            });
        }

        // Active nav item
        this.setActiveNavItem();
    },

    setActiveNavItem() {
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
            }
        });
    }
};

// ============================================
// NOTIFICATIONS PANEL
// ============================================

const Notifications = {
    panel: null,
    unreadCount: 0,

    init() {
        this.panel = document.getElementById('notifications-panel');
        this.loadNotifications();

        // Poll for new notifications
        setInterval(() => this.loadNotifications(), 60000);
    },

    async loadNotifications() {
        try {
            const response = await API.get('/notifications?limit=10');
            if (response.success) {
                this.render(response.data);
                this.updateBadge(response.unreadCount || 0);
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    },

    render(notifications) {
        if (!this.panel) return;

        const list = this.panel.querySelector('.notification-list');
        if (!list) return;

        if (!notifications || notifications.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bell-slash"></i>
                    <p>No notifications</p>
                </div>
            `;
            return;
        }

        list.innerHTML = notifications.map(n => `
            <div class="notification-item ${n.read ? '' : 'unread'}" onclick="Notifications.markAsRead('${n.id}')">
                <div class="notification-icon notification-${n.type}">
                    <i class="fas fa-${this.getIcon(n.type)}"></i>
                </div>
                <div class="notification-content">
                    <p class="notification-message">${n.message}</p>
                    <span class="notification-time">${UI.formatRelativeTime(n.createdAt)}</span>
                </div>
            </div>
        `).join('');
    },

    getIcon(type) {
        const icons = {
            incident: 'exclamation-triangle',
            change: 'exchange-alt',
            problem: 'bug',
            alert: 'bell',
            system: 'cog'
        };
        return icons[type] || 'bell';
    },

    updateBadge(count) {
        this.unreadCount = count;
        const badge = document.querySelector('.notification-badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    },

    async markAsRead(id) {
        try {
            await API.patch(`/notifications/${id}/read`);
            this.loadNotifications();
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    },

    async markAllAsRead() {
        try {
            await API.patch('/notifications/read-all');
            this.loadNotifications();
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    },

    toggle() {
        if (this.panel) {
            this.panel.classList.toggle('open');
        }
    }
};

// ============================================
// SEARCH
// ============================================

const GlobalSearch = {
    input: null,
    results: null,
    isOpen: false,

    init() {
        this.input = document.getElementById('global-search');
        this.results = document.getElementById('search-results');

        if (this.input) {
            this.input.addEventListener('input', UI.debounce((e) => {
                this.search(e.target.value);
            }, 300));

            this.input.addEventListener('focus', () => {
                if (this.input.value) {
                    this.showResults();
                }
            });

            // Keyboard shortcut (Cmd/Ctrl + K)
            document.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                    e.preventDefault();
                    this.input.focus();
                }
            });
        }

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.global-search')) {
                this.hideResults();
            }
        });
    },

    async search(query) {
        if (!query || query.length < 2) {
            this.hideResults();
            return;
        }

        try {
            const response = await API.get(`/search?q=${encodeURIComponent(query)}`);
            if (response.success) {
                this.renderResults(response.data);
                this.showResults();
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    },

    renderResults(results) {
        if (!this.results) return;

        if (!results || results.length === 0) {
            this.results.innerHTML = `
                <div class="search-empty">
                    <p>No results found</p>
                </div>
            `;
            return;
        }

        const grouped = this.groupResults(results);

        this.results.innerHTML = Object.entries(grouped).map(([type, items]) => `
            <div class="search-group">
                <h4 class="search-group-title">${type}</h4>
                ${items.map(item => `
                    <a href="${item.url}" class="search-result-item">
                        <i class="fas fa-${this.getResultIcon(item.type)}"></i>
                        <div class="search-result-content">
                            <span class="search-result-title">${item.title}</span>
                            <span class="search-result-subtitle">${item.subtitle || ''}</span>
                        </div>
                    </a>
                `).join('')}
            </div>
        `).join('');
    },

    groupResults(results) {
        return results.reduce((groups, item) => {
            const type = item.type || 'Other';
            if (!groups[type]) groups[type] = [];
            groups[type].push(item);
            return groups;
        }, {});
    },

    getResultIcon(type) {
        const icons = {
            incident: 'exclamation-triangle',
            change: 'exchange-alt',
            problem: 'bug',
            asset: 'server',
            user: 'user'
        };
        return icons[type] || 'file';
    },

    showResults() {
        if (this.results) {
            this.results.classList.add('open');
            this.isOpen = true;
        }
    },

    hideResults() {
        if (this.results) {
            this.results.classList.remove('open');
            this.isOpen = false;
        }
    }
};

// ============================================
// THEME MANAGEMENT
// ============================================

const Theme = {
    STORAGE_KEY: 'linkedeye-theme',

    init() {
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        if (savedTheme) {
            this.setTheme(savedTheme);
        }
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(this.STORAGE_KEY, theme);
    },

    toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    },

    getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'dark';
    }
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all modules
    Theme.init();
    Navigation.init();
    GlobalSearch.init();

    if (Auth.isAuthenticated()) {
        Socket.connect();
        Notifications.init();
    }

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.active').forEach(d => {
                d.classList.remove('active');
            });
        }
    });

    // Handle modal backdrop clicks
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            const modal = backdrop.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
            }
        });
    });

    console.log('LinkedEye-FinSpot initialized');
});

// ============================================
// EXPORTS (for global access)
// ============================================

window.LinkedEye = {
    Auth,
    API,
    Socket,
    Toast,
    UI,
    Navigation,
    Notifications,
    GlobalSearch,
    Theme
};
