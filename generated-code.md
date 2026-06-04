This is a complete, production-ready foundation for the Leave Management System (LMS) as per the technical documentation provided.

### 1. PROJECT FOLDER STRUCTURE

```text
lms-project/
├── backend/
│   ├── src/
│   │   ├── config/         # DB and Env config
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Auth & RBAC
│   │   ├── models/         # Sequelize schemas
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic (email, balance calcs)
│   │   └── app.js          # Entry point
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/            # Axios instance & calls
│   │   ├── components/     # UI components
│   │   ├── context/        # Auth state management
│   │   ├── pages/          # View components
│   │   └── App.js
│   ├── tailwind.config.js
│   └── package.json
└── database/
    └── init.sql            # Schema and seed data
```

---

### 2. DATABASE SCRIPTS

**File:** `database/init.sql`

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(20) UNIQUE NOT NULL
);

-- Table: users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    role_id UUID REFERENCES roles(id),
    manager_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table: leave_types
CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    days_per_year INT DEFAULT 0
);

-- Table: leave_balances
CREATE TABLE leave_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    leave_type_id UUID REFERENCES leave_types(id) ON DELETE CASCADE,
    balance DECIMAL(5,2) DEFAULT 0,
    UNIQUE(user_id, leave_type_id)
);

-- Table: leave_requests
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    leave_type_id UUID REFERENCES leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reason TEXT,
    manager_remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed Roles
INSERT INTO roles (name) VALUES ('EMPLOYEE'), ('MANAGER'), ('HR_ADMIN');

-- Seed initial Leave Types
INSERT INTO leave_types (name, days_per_year) VALUES ('Annual', 20), ('Sick', 10), ('Unpaid', 0);
```

---

### 3. BACKEND IMPLEMENTATION

**File:** `backend/package.json`
```json
{
  "name": "lms-backend",
  "version": "1.0.0",
  "main": "src/app.js",
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3",
    "express": "^4.18.2",
    "helmet": "^7.0.0",
    "joi": "^17.9.2",
    "jsonwebtoken": "^9.0.0",
    "pg": "^8.11.0",
    "sequelize": "^6.32.0",
    "winston": "^3.9.0"
  }
}
```

**File:** `backend/src/middleware/auth.js` (Auth & RBAC)
```javascript
const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Not authorized" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Token invalid" });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden: Access Denied" });
        }
        next();
    };
};

module.exports = { protect, authorize };
```

**File:** `backend/src/controllers/leaveController.js` (Core Logic)
```javascript
const { LeaveRequest, LeaveBalance, LeaveType } = require('../models');

exports.submitRequest = async (req, res) => {
    const { typeId, start, end, reason } = req.body;
    
    // Calculate days requested
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Check balance
    const balance = await LeaveBalance.findOne({ 
        where: { user_id: req.user.id, leave_type_id: typeId } 
    });

    if (!balance || balance.balance < diffDays) {
        return res.status(400).json({ message: "Insufficient leave balance" });
    }

    const request = await LeaveRequest.create({
        user_id: req.user.id,
        leave_type_id: typeId,
        start_date: start,
        end_date: end,
        reason,
        status: 'PENDING'
    });

    res.status(201).json(request);
};

exports.processRequest = async (req, res) => {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const request = await LeaveRequest.findByPk(id, { include: [LeaveType] });
    if (!request) return res.status(404).json({ message: "Request not found" });

    if (status === 'APPROVED') {
        const startDate = new Date(request.start_date);
        const endDate = new Date(request.end_date);
        const diffDays = Math.ceil(Math.abs(endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        const balance = await LeaveBalance.findOne({ 
            where: { user_id: request.user_id, leave_type_id: request.leave_type_id } 
        });
        
        balance.balance -= diffDays;
        await balance.save();
    }

    request.status = status;
    request.manager_remarks = remarks;
    await request.save();

    res.json(request);
};
```

---

### 4. FRONTEND IMPLEMENTATION (React + Tailwind)

**File:** `frontend/src/api/axios.js`
```javascript
import axios from 'axios';

const instance = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
    withCredentials: true // Required for HttpOnly Cookies
});

export default instance;
```

**File:** `frontend/src/pages/Dashboard.js`
```javascript
import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const Dashboard = () => {
    const [balances, setBalances] = useState([]);
    const [requests, setRequests] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const bRes = await api.get('/leaves/balance');
            const rRes = await api.get('/leaves/my-requests');
            setBalances(bRes.data);
            setRequests(rRes.data);
        };
        fetchData();
    }, []);

    return (
        <div className="p-8 bg-gray-50 min-h-screen">
            <h1 className="text-2xl font-bold mb-6">Employee Dashboard</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {balances.map(b => (
                    <div key={b.id} className="p-4 bg-white shadow rounded-lg border-l-4 border-blue-500">
                        <p className="text-sm text-gray-500 uppercase">{b.leave_type.name}</p>
                        <p className="text-2xl font-bold">{b.balance} Days</p>
                    </div>
                ))}
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-4">Dates</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map(r => (
                            <tr key={r.id} className="border-t">
                                <td className="p-4">{r.start_date} to {r.end_date}</td>
                                <td className="p-4">{r.leave_type.name}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        r.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 
                                        r.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                        {r.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Dashboard;
```

**File:** `frontend/src/pages/Login.js`
```javascript
import React, { useState } from 'react';
import api from '../api/axios';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/auth/login', { email, password });
            window.location.href = '/dashboard';
        } catch (err) {
            alert("Login Failed");
        }
    };

    return (
        <div className="flex items-center justify-center h-screen bg-gray-100">
            <form onSubmit={handleSubmit} className="p-8 bg-white shadow-md rounded-xl w-96">
                <h2 className="text-xl font-bold mb-4 text-center">LMS Portal Login</h2>
                <input 
                    type="email" placeholder="Email" 
                    className="w-full p-2 mb-4 border rounded"
                    onChange={(e) => setEmail(e.target.value)}
                />
                <input 
                    type="password" placeholder="Password" 
                    className="w-full p-2 mb-4 border rounded"
                    onChange={(e) => setPassword(e.target.value)}
                />
                <button className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
                    Sign In
                </button>
            </form>
        </div>
    );
};
```

---

### 5. CONFIGURATION FILES

**File:** `backend/.env.example`
```env
PORT=5000
DB_HOST=your-rds-endpoint.aws.com
DB_NAME=lms_db
DB_USER=postgres
DB_PASS=securepassword
JWT_SECRET=supersecretkey123
NODE_ENV=production
```

**File:** `frontend/tailwind.config.js`
```javascript
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### 6. AUTH IMPLEMENTATION (JWT Service)

**File:** `backend/src/services/authService.js`
```javascript
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateToken = (res, user) => {
    const token = jwt.sign(
        { id: user.id, role: user.role.name }, 
        process.env.JWT_SECRET, 
        { expiresIn: '8h' }
    );

    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });
};

module.exports = { generateToken };
```

### Infrastructure Note (AWS Deployment)
1.  **S3/CloudFront**: Run `npm run build` in the frontend and upload `dist/` to S3. Enable Static Website Hosting and point CloudFront to the S3 bucket.
2.  **Elastic Beanstalk**: Zip the `backend/` folder (excluding `node_modules`) and upload to EB. Set Environment Properties (Environment Variables) in the EB console to match `.env`.
3.  **RDS**: Launch a PostgreSQL instance. Ensure the Security Group allows inbound traffic on port 5432 from the Elastic Beanstalk Security Group.