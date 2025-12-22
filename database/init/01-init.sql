-- LinkedEye-FinSpot Database Initialization
-- This script runs automatically when PostgreSQL container starts for the first time

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Set timezone
SET timezone = 'Asia/Kolkata';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE linkedeye_finspot TO linkedeye;

-- Create schemas if needed
-- CREATE SCHEMA IF NOT EXISTS itsm;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'LinkedEye-FinSpot database initialized successfully at %', NOW();
END $$;
