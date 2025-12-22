"""
LinkedEye-FinSpot Frontend Application
Enterprise ITSM & Incident Management Platform

Run. Operate. Transform Infrastructure — Intelligently.
"""

import os
from datetime import timedelta
from functools import wraps

import requests
from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify, g
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_wtf.csrf import CSRFProtect
from flask_session import Session
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__,
    template_folder='templates',
    static_folder='static'
)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'linkedeye-finspot-secret-key-change-me')
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'flask_session')
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)
app.config['API_BASE_URL'] = os.getenv('API_BASE_URL') or os.getenv('BACKEND_API_URL', 'http://localhost:5000') + '/api/v1'
app.config['WTF_CSRF_ENABLED'] = True
app.config['WTF_CSRF_TIME_LIMIT'] = 3600  # 1 hour

# Cookie settings for production (HTTPS)
is_production = os.getenv('FLASK_ENV') == 'production'
app.config['SESSION_COOKIE_SECURE'] = is_production  # Only send over HTTPS in production
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['WTF_CSRF_SSL_STRICT'] = False  # Allow CSRF to work behind reverse proxy

# Create session directory if not exists
os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)

# Initialize extensions
Session(app)
csrf = CSRFProtect(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'info'


class User(UserMixin):
    """User model for Flask-Login"""
    def __init__(self, user_data, token):
        self.id = user_data.get('id')
        self.email = user_data.get('email')
        self.first_name = user_data.get('firstName')
        self.last_name = user_data.get('lastName')
        self.role = user_data.get('role')
        self.department = user_data.get('department')
        self.job_title = user_data.get('jobTitle')
        self.avatar = user_data.get('avatar')
        self.token = token

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def initials(self):
        return f"{self.first_name[0]}{self.last_name[0]}".upper() if self.first_name and self.last_name else "??"


@login_manager.user_loader
def load_user(user_id):
    """Load user from session"""
    user_data = session.get('user_data')
    token = session.get('access_token')
    if user_data and token:
        return User(user_data, token)
    return None


def api_request(method, endpoint, data=None, token=None):
    """Make API request to backend"""
    url = f"{app.config['API_BASE_URL']}{endpoint}"
    headers = {'Content-Type': 'application/json'}

    if token:
        headers['Authorization'] = f'Bearer {token}'
    elif current_user.is_authenticated:
        headers['Authorization'] = f'Bearer {current_user.token}'

    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, params=data, timeout=10)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data, timeout=10)
        elif method == 'PUT':
            response = requests.put(url, headers=headers, json=data, timeout=10)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=10)
        else:
            return None

        return response.json()
    except requests.exceptions.RequestException as e:
        app.logger.error(f"API request failed: {e}")
        return {'success': False, 'error': 'API connection failed'}


@app.before_request
def before_request():
    """Before each request"""
    g.api_base_url = app.config['API_BASE_URL']


@app.context_processor
def inject_globals():
    """Inject global variables into templates"""
    # Get backend WebSocket URL from environment or derive from API URL
    backend_ws_url = os.getenv('BACKEND_WS_URL')
    if not backend_ws_url:
        api_url = app.config['API_BASE_URL']
        # Extract base URL (remove /api/v1 suffix)
        backend_ws_url = api_url.rsplit('/api', 1)[0] if '/api' in api_url else api_url

    return {
        'app_name': 'LinkedEye-FinSpot',
        'app_tagline': 'Run. Operate. Transform Infrastructure — Intelligently.',
        'backend_ws_url': backend_ws_url
    }


# ============================================
# AUTH ROUTES
# ============================================

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login page"""
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')

        response = api_request('POST', '/auth/login', {
            'email': email,
            'password': password
        })

        if response and response.get('success'):
            user_data = response['data']['user']
            token = response['data']['accessToken']

            # Store in session
            session['user_data'] = user_data
            session['access_token'] = token
            session['refresh_token'] = response['data'].get('refreshToken')
            session.permanent = True

            # Create user object and login
            user = User(user_data, token)
            login_user(user, remember=True)

            flash(f'Welcome back, {user.first_name}!', 'success')

            next_page = request.args.get('next')
            return redirect(next_page or url_for('dashboard'))
        else:
            error = response.get('error', 'Login failed') if response else 'API connection failed'
            flash(error, 'error')

    return render_template('auth/login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    """Registration page"""
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        data = {
            'email': request.form.get('email'),
            'password': request.form.get('password'),
            'firstName': request.form.get('first_name'),
            'lastName': request.form.get('last_name'),
            'phone': request.form.get('phone'),
            'department': request.form.get('department'),
            'jobTitle': request.form.get('job_title')
        }

        response = api_request('POST', '/auth/register', data)

        if response and response.get('success'):
            flash('Registration successful! Your account is pending approval.', 'success')
            return redirect(url_for('login'))
        else:
            error = response.get('error', 'Registration failed') if response else 'API connection failed'
            flash(error, 'error')

    return render_template('auth/register.html')


@app.route('/logout')
@login_required
def logout():
    """Logout"""
    api_request('POST', '/auth/logout')
    logout_user()
    session.clear()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))


# ============================================
# DASHBOARD ROUTES (RUN)
# ============================================

@app.route('/')
@app.route('/dashboard')
@login_required
def dashboard():
    """Main operations dashboard"""
    # Fetch dashboard data
    dashboard_data = api_request('GET', '/dashboard')
    kpis = api_request('GET', '/dashboard/kpis')
    quick_stats = api_request('GET', '/dashboard/quick-stats')

    return render_template('dashboard/index.html',
        dashboard_data=dashboard_data.get('data') if dashboard_data else {},
        kpis=kpis.get('data') if kpis else {},
        quick_stats=quick_stats.get('data') if quick_stats else {}
    )


# ============================================
# INCIDENT ROUTES (RUN)
# ============================================

@app.route('/incidents')
@login_required
def incidents_list():
    """Incident list view"""
    page = request.args.get('page', 1, type=int)
    state = request.args.get('state', '')
    priority = request.args.get('priority', '')
    search = request.args.get('search', '')

    params = {'page': page, 'limit': 25}
    if state:
        params['state'] = state
    if priority:
        params['priority'] = priority
    if search:
        params['search'] = search

    response = api_request('GET', '/incidents', params)
    stats = api_request('GET', '/incidents/stats')

    return render_template('incidents/list.html',
        incidents=response.get('data', []) if response else [],
        pagination=response.get('pagination', {}) if response else {},
        stats=stats.get('data', {}) if stats else {},
        filters={'state': state, 'priority': priority, 'search': search}
    )


@app.route('/incidents/<incident_id>')
@login_required
def incident_detail(incident_id):
    """Incident detail view"""
    response = api_request('GET', f'/incidents/{incident_id}')

    if not response or not response.get('success'):
        flash('Incident not found', 'error')
        return redirect(url_for('incidents_list'))

    return render_template('incidents/detail.html', incident=response.get('data'), incident_id=incident_id)


@app.route('/incidents/create', methods=['GET', 'POST'])
@login_required
def incident_create():
    """Create incident"""
    if request.method == 'POST':
        data = {
            'shortDescription': request.form.get('short_description'),
            'description': request.form.get('description'),
            'impact': request.form.get('impact', 'MEDIUM'),
            'urgency': request.form.get('urgency', 'MEDIUM'),
            'category': request.form.get('category'),
            'subcategory': request.form.get('subcategory'),
            'assignmentGroupId': request.form.get('assignment_group'),
            'assignedToId': request.form.get('assigned_to'),
            'configItemId': request.form.get('config_item')
        }

        response = api_request('POST', '/incidents', data)

        if response and response.get('success'):
            flash(f"Incident {response['data']['number']} created successfully!", 'success')
            return redirect(url_for('incident_detail', incident_id=response['data']['id']))
        else:
            flash(response.get('error', 'Failed to create incident'), 'error')

    # Fetch form data
    teams = api_request('GET', '/teams')
    assets = api_request('GET', '/assets', {'limit': 100})

    return render_template('incidents/create.html',
        teams=teams.get('data', []) if teams else [],
        assets=assets.get('data', []) if assets else []
    )


# ============================================
# CHANGE ROUTES (OPERATE)
# ============================================

@app.route('/changes')
@login_required
def changes_list():
    """Change list view"""
    page = request.args.get('page', 1, type=int)
    state = request.args.get('state', '')
    change_type = request.args.get('type', '')

    params = {'page': page, 'limit': 25}
    if state:
        params['state'] = state
    if change_type:
        params['type'] = change_type

    response = api_request('GET', '/changes', params)

    return render_template('changes/list.html',
        changes=response.get('data', []) if response else [],
        pagination=response.get('pagination', {}) if response else {},
        filters={'state': state, 'type': change_type}
    )


@app.route('/changes/create', methods=['GET', 'POST'])
@login_required
def change_create():
    """Create new change"""
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form.to_dict()
        response = api_request('POST', '/changes', data)
        if response and response.get('success'):
            flash('Change created successfully', 'success')
            return redirect(url_for('change_detail', change_id=response['data']['id']))
        flash(response.get('error', 'Failed to create change') if response else 'API error', 'error')

    teams = api_request('GET', '/teams')
    return render_template('changes/create.html',
        teams=teams.get('data', []) if teams else []
    )


@app.route('/changes/calendar')
@login_required
def changes_calendar():
    """Change calendar view"""
    response = api_request('GET', '/changes/calendar')
    return render_template('changes/calendar.html',
        changes=response.get('data', []) if response else []
    )


@app.route('/changes/<change_id>')
@login_required
def change_detail(change_id):
    """Change detail view"""
    response = api_request('GET', f'/changes/{change_id}')

    if not response or not response.get('success'):
        flash('Change not found', 'error')
        return redirect(url_for('changes_list'))

    return render_template('changes/detail.html', change=response.get('data'))


# ============================================
# PROBLEM ROUTES (OPERATE)
# ============================================

@app.route('/problems')
@login_required
def problems_list():
    """Problem list view"""
    page = request.args.get('page', 1, type=int)
    response = api_request('GET', '/problems', {'page': page, 'limit': 25})

    return render_template('problems/list.html',
        problems=response.get('data', []) if response else [],
        pagination=response.get('pagination', {}) if response else {}
    )


@app.route('/problems/create', methods=['GET', 'POST'])
@login_required
def problem_create():
    """Create new problem"""
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form.to_dict()
        response = api_request('POST', '/problems', data)
        if response and response.get('success'):
            flash('Problem created successfully', 'success')
            return redirect(url_for('problem_detail', problem_id=response['data']['id']))
        flash(response.get('error', 'Failed to create problem') if response else 'API error', 'error')

    teams = api_request('GET', '/teams')
    return render_template('problems/create.html',
        teams=teams.get('data', []) if teams else []
    )


@app.route('/problems/<problem_id>')
@login_required
def problem_detail(problem_id):
    """Problem detail view"""
    response = api_request('GET', f'/problems/{problem_id}')

    if not response or not response.get('success'):
        flash('Problem not found', 'error')
        return redirect(url_for('problems_list'))

    return render_template('problems/detail.html', problem=response.get('data'))


@app.route('/problems/known-errors')
@login_required
def known_errors():
    """Known error database"""
    response = api_request('GET', '/problems/known-errors')
    return render_template('problems/known_errors.html',
        known_errors=response.get('data', []) if response else []
    )


# ============================================
# ASSET/CMDB ROUTES (OPERATE)
# ============================================

@app.route('/assets')
@login_required
def assets_list():
    """Asset list view"""
    page = request.args.get('page', 1, type=int)
    ci_type = request.args.get('type', '')
    status = request.args.get('status', '')
    search = request.args.get('search', '')

    params = {'page': page, 'limit': 25}
    if ci_type:
        params['type'] = ci_type
    if status:
        params['status'] = status
    if search:
        params['search'] = search

    response = api_request('GET', '/assets', params)
    stats = api_request('GET', '/assets/stats')

    return render_template('assets/list.html',
        assets=response.get('data', []) if response else [],
        pagination=response.get('pagination', {}) if response else {},
        stats=stats.get('data', {}) if stats else {},
        filters={'type': ci_type, 'status': status, 'search': search}
    )


@app.route('/assets/create', methods=['GET', 'POST'])
@login_required
def asset_create():
    """Create new asset/CI"""
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form.to_dict()
        response = api_request('POST', '/assets', data)
        if response and response.get('success'):
            flash('Asset created successfully', 'success')
            return redirect(url_for('asset_detail', asset_id=response['data']['id']))
        flash(response.get('error', 'Failed to create asset') if response else 'API error', 'error')

    return render_template('assets/create.html')


@app.route('/assets/<asset_id>')
@login_required
def asset_detail(asset_id):
    """Asset detail view"""
    response = api_request('GET', f'/assets/{asset_id}')

    if not response or not response.get('success'):
        flash('Asset not found', 'error')
        return redirect(url_for('assets_list'))

    return render_template('assets/detail.html', asset=response.get('data'))


# ============================================
# NETWORK ROUTES (RUN)
# ============================================

@app.route('/network')
@login_required
def network_topology():
    """Network topology view"""
    response = api_request('GET', '/assets', {'type': 'NETWORK_DEVICE', 'limit': 100})
    return render_template('network/index.html',
        devices=response.get('data', []) if response else []
    )


# ============================================
# REPORT ROUTES (TRANSFORM)
# ============================================

@app.route('/reports')
@login_required
def reports():
    """Reports dashboard"""
    return render_template('reports/index.html')


@app.route('/reports/sla')
@login_required
def report_sla():
    """SLA compliance report"""
    period = request.args.get('period', '30d')
    response = api_request('GET', '/reports/sla', {'period': period})
    return render_template('reports/sla.html',
        report=response.get('data', {}) if response else {},
        period=period
    )


@app.route('/reports/mttr')
@login_required
def report_mttr():
    """MTTR report"""
    period = request.args.get('period', '30d')
    response = api_request('GET', '/reports/mttr', {'period': period})
    return render_template('reports/mttr.html',
        report=response.get('data', {}) if response else {},
        period=period
    )


# ============================================
# AI INSIGHTS ROUTES (TRANSFORM)
# ============================================

@app.route('/ai-insights')
@login_required
def ai_insights():
    """AI Insights dashboard"""
    # In production, this would fetch from AI/ML backend
    return render_template('ai-insights/index.html')


# ============================================
# USER & TEAM ROUTES
# ============================================

@app.route('/users')
@login_required
def users_list():
    """User list"""
    response = api_request('GET', '/users')
    return render_template('users/list.html',
        users=response.get('data', []) if response else []
    )


@app.route('/teams')
@login_required
def teams_list():
    """Team list"""
    response = api_request('GET', '/teams')
    return render_template('users/teams.html',
        teams=response.get('data', []) if response else []
    )


@app.route('/on-call')
@login_required
def on_call():
    """On-call schedules"""
    teams = api_request('GET', '/teams')
    return render_template('users/on_call.html',
        teams=teams.get('data', []) if teams else []
    )


# ============================================
# INTEGRATIONS ROUTES
# ============================================

@app.route('/integrations')
@login_required
def integrations():
    """Integrations hub"""
    response = api_request('GET', '/integrations')
    return render_template('integrations/index.html',
        integrations=response.get('data', []) if response else []
    )


@app.route('/integrations/linkedeye-monitoring')
@login_required
def linkedeye_monitoring():
    """LinkedEye Monitoring Integration configuration"""
    response = api_request('GET', '/integrations')
    integrations_list = response.get('data', []) if response else []

    # Find LinkedEye monitoring integration if exists
    integration = next(
        (i for i in integrations_list if i.get('type') == 'LINKEDEYE_MONITORING' or 'LinkedEye Monitoring' in i.get('name', '')),
        None
    )

    return render_template('integrations/linkedeye-monitoring.html',
        integration=integration
    )


# ============================================
# API PROXY ENDPOINTS
# ============================================

@app.route('/api/proxy/<path:endpoint>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@login_required
@csrf.exempt
def api_proxy(endpoint):
    """Proxy API requests for AJAX calls"""
    data = request.get_json() if request.method in ['POST', 'PUT'] else request.args.to_dict()
    response = api_request(request.method, f'/{endpoint}', data)
    return jsonify(response)


# ============================================
# ERROR HANDLERS
# ============================================

@app.errorhandler(404)
def not_found(error):
    return render_template('errors/404.html'), 404


@app.errorhandler(500)
def server_error(error):
    return render_template('errors/500.html'), 500


@app.errorhandler(403)
def forbidden(error):
    return render_template('errors/403.html'), 403


# ============================================
# RUN APPLICATION
# ============================================

if __name__ == '__main__':
    print("""
===================================================================
                    LINKEDEYE-FINSPOT
   Enterprise ITSM & Incident Management Platform
   Run. Operate. Transform Infrastructure - Intelligently.
===================================================================
   Frontend running on http://localhost:8000
   Backend API: http://localhost:5000/api/v1
===================================================================
    """)
    app.run(host='0.0.0.0', port=8000, debug=True)
