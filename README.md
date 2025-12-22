# LinkedEye-FinSpot

**Enterprise ITSM & Incident Management Platform**

*Run. Operate. Transform Infrastructure — Intelligently.*

## Overview

LinkedEye-FinSpot is an enterprise-grade IT Service Management (ITSM) and Incident Management platform designed to compete with ServiceNow ITSM, Grafana Cloud, PagerDuty, Datadog, and Atlassian Opsgenie.

Built on the ROT (Run-Operate-Transform) Framework methodology, this platform provides comprehensive tools for infrastructure operations, incident management, change management, problem management, and more.

## Features

### RUN Module
- **Operations Dashboard** - Real-time KPIs and incident overview
- **Incident Management** - Full lifecycle incident tracking with SLA monitoring
- **Alert Management** - Prometheus/Alertmanager integration
- **Network Observability** - Infrastructure topology and health monitoring

### OPERATE Module
- **Change Management** - Change requests, approvals, and implementation tracking
- **Problem Management** - Root cause analysis and Known Error Database (KEDB)
- **Asset Management (CMDB)** - Configuration item tracking and relationships
- **Team Management** - On-call schedules and escalation policies

### TRANSFORM Module
- **Reports & Analytics** - Pre-built and custom reporting
- **AI Insights** - Pattern detection and recommendations (coming soon)
- **Automation** - StackStorm/Ansible integration (coming soon)

## Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL 15+
- **ORM**: Prisma
- **Real-time**: Socket.IO
- **Authentication**: JWT with refresh tokens

### Frontend
- **Framework**: Python Flask
- **Templates**: Jinja2
- **JavaScript**: Vanilla JS with modular architecture
- **Charts**: Chart.js
- **Icons**: Font Awesome 6

## Prerequisites

- Node.js 18+
- Python 3.10+
- PostgreSQL 15+
- npm or yarn

## Installation

### 1. Clone the Repository

```bash
cd linkedeye-finspot
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your database credentials
# DATABASE_URL="postgresql://user:password@localhost:5432/linkedeye"

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Seed the database with demo data
npx prisma db seed

# Start the backend server
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the frontend server
python app.py
```

### 4. Access the Application

- **Frontend**: http://localhost:8000
- **Backend API**: http://localhost:5000/api/v1
- **WebSocket**: ws://localhost:5000

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@linkedeye.local | Password123! |
| Manager | manager@linkedeye.local | Password123! |
| Operator | operator1@linkedeye.local | Password123! |
| On-Call | operator2@linkedeye.local | Password123! |

## API Documentation

### Authentication

```bash
# Login
POST /api/v1/auth/login
{
  "email": "admin@linkedeye.local",
  "password": "Password123!"
}

# Response includes accessToken and refreshToken
```

### Incidents

```bash
# List incidents
GET /api/v1/incidents?page=1&limit=20&state=NEW

# Create incident
POST /api/v1/incidents
{
  "shortDescription": "Server down",
  "description": "Production server not responding",
  "impact": "HIGH",
  "urgency": "HIGH",
  "category": "Infrastructure"
}

# Update incident
PATCH /api/v1/incidents/:id
{
  "state": "IN_PROGRESS"
}

# Resolve incident
POST /api/v1/incidents/:id/resolve
{
  "resolutionCode": "Resolved",
  "resolutionNotes": "Restarted the service"
}
```

### Webhook Integration

```bash
# Prometheus Alertmanager webhook
POST /api/v1/webhooks/alertmanager
# Automatically creates incidents from alerts

# Grafana webhook
POST /api/v1/webhooks/grafana
```

## Project Structure

```
linkedeye-finspot/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.js            # Seed data
│   ├── src/
│   │   ├── config/            # Configuration files
│   │   ├── controllers/       # Request handlers
│   │   ├── middleware/        # Express middleware
│   │   ├── routes/            # API routes
│   │   ├── services/          # Business logic
│   │   ├── utils/             # Utilities
│   │   └── server.js          # Entry point
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── templates/
│   │   ├── auth/              # Login/register pages
│   │   ├── dashboard/         # Dashboard templates
│   │   ├── incidents/         # Incident management
│   │   ├── changes/           # Change management
│   │   ├── problems/          # Problem management
│   │   ├── assets/            # CMDB templates
│   │   ├── network/           # Network observability
│   │   ├── reports/           # Reports & analytics
│   │   ├── components/        # Shared components
│   │   └── errors/            # Error pages
│   ├── static/
│   │   ├── css/main.css       # Main stylesheet
│   │   └── js/main.js         # Main JavaScript
│   ├── app.py                 # Flask application
│   └── requirements.txt
│
└── README.md
```

## Environment Variables

### Backend (.env)

```env
# Server
PORT=5000
NODE_ENV=development
API_VERSION=v1

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/linkedeye"

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRES_IN=7d

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:8000

# Integrations
PROMETHEUS_URL=http://localhost:9090
GRAFANA_URL=http://localhost:3000
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
```

## Integrations

### Prometheus/Alertmanager

Configure Alertmanager to send webhooks to:
```
http://localhost:5000/api/v1/webhooks/alertmanager
```

### Grafana

Configure Grafana alerts to send webhooks to:
```
http://localhost:5000/api/v1/webhooks/grafana
```

### Slack

Set `SLACK_WEBHOOK_URL` in your .env file to enable Slack notifications.

## Development

### Running Tests

```bash
cd backend
npm test
```

### Database Migrations

```bash
# Create a new migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database
npx prisma migrate reset
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.

---

**LinkedEye-FinSpot** - Enterprise ITSM & Incident Management Platform

*Run. Operate. Transform Infrastructure — Intelligently.*
