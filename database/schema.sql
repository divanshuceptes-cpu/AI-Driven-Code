-- Initial Schema for LMS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(20) UNIQUE NOT NULL
);

INSERT INTO roles (name) VALUES ('Employee'), ('Manager'), ('Admin');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role_id INTEGER REFERENCES roles(id),
    manager_id UUID REFERENCES users(id),
    department VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE leave_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    default_days INTEGER NOT NULL
);

INSERT INTO leave_types (name, default_days) VALUES 
('Annual Leave', 20), 
('Sick Leave', 10), 
('Maternity Leave', 90), 
('Unpaid Leave', 0);

CREATE TABLE leave_balances (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    leave_type_id INTEGER REFERENCES leave_types(id),
    used_days DECIMAL DEFAULT 0,
    total_days DECIMAL NOT NULL,
    UNIQUE(user_id, leave_type_id)
);

CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    leave_type_id INTEGER REFERENCES leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days DECIMAL NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'Pending', -- Pending, Approved, Rejected
    manager_note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
