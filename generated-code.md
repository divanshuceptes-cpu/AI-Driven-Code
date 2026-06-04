#### File: .env.example

```text
# Backend Configuration
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:password@localhost:5432/leave_management?schema=public"
JWT_SECRET=your_super_secret_jwt_key_change_me
COOKIE_SECRET=your_cookie_secret

# AWS Config (Placeholders)
AWS_REGION=us-east-1
S3_BUCKET_NAME=lms-attachments
```

#### File: package.json

```json
{
  "name": "leave-management-system",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node backend/src/index.js",
    "server": "nodemon backend/src/index.js",
    "client": "npm start --prefix frontend",
    "dev": "concurrently "npm run server" "npm run client"",
    "db:migrate": "npx prisma migrate dev",
    "db:generate": "npx prisma generate"
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "nodemon": "^3.0.3",
    "prisma": "^5.10.2"
  },
  "dependencies": {
    "@prisma/client": "^5.10.2"
  }
}
```

#### File: prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  employee
  manager
  hr_admin
}

enum LeaveStatus {
  pending
  approved
  rejected
  cancelled
}

model User {
  id            String         @id @default(uuid()) @db.Uuid
  email         String         @unique
  password_hash String
  full_name     String
  role          Role           @default(employee)
  manager_id    String?        @db.Uuid
  department    String?
  created_at    DateTime       @default(now())

  manager       User?          @relation("ManagerToEmployee", fields: [manager_id], references: [id])
  subordinates  User[]         @relation("ManagerToEmployee")
  balances      LeaveBalance[]
  requests      LeaveRequest[]
}

model LeaveType {
  id               Int            @id @default(autoincrement())
  name             String         @unique
  annual_allowance Int
  balances         LeaveBalance[]
  requests         LeaveRequest[]
}

model LeaveBalance {
  id             Int       @id @default(autoincrement())
  user_id        String    @db.Uuid
  leave_type_id  Int
  remaining_days Decimal   @db.Decimal(5, 2)

  user           User      @relation(fields: [user_id], references: [id])
  leave_type     LeaveType @relation(fields: [leave_type_id], references: [id])

  @@unique([user_id, leave_type_id])
}

model LeaveRequest {
  id              String      @id @default(uuid()) @db.Uuid
  user_id         String      @db.Uuid
  leave_type_id   Int
  start_date      DateTime    @db.Date
  end_date        DateTime    @db.Date
  total_days      Decimal     @db.Decimal(5, 2)
  status          LeaveStatus @default(pending)
  reason          String?     @db.Text
  manager_comment String?     @db.Text
  created_at      DateTime    @default(now())

  user            User        @relation(fields: [user_id], references: [id])
  leave_type      LeaveType   @relation(fields: [leave_type_id], references: [id])
}
```

#### File: backend/package.json

```json
{
  "name": "lms-backend",
  "version": "1.0.0",
  "main": "src/index.js",
  "dependencies": {
    "@prisma/client": "^5.10.2",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "joi": "^17.12.2",
    "jsonwebtoken": "^9.0.2",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "winston": "^3.11.0"
  }
}
```

#### File: backend/src/index.js

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth.routes');
const leaveRoutes = require('./routes/leave.routes');
const managerRoutes = require('./routes/manager.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(passport.initialize());

// Passport Strategy Configuration
require('./config/passport')(passport);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/admin', adminRoutes);

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, prisma };
```

#### File: backend/src/config/passport.js

```javascript
const JwtStrategy = require('passport-jwt').Strategy;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const cookieExtractor = (req) => {
  let token = null;
  if (req && req.cookies) {
    token = req.cookies['jwt'];
  }
  return token;
};

const opts = {
  jwtFromRequest: cookieExtractor,
  secretOrKey: process.env.JWT_SECRET,
};

module.exports = (passport) => {
  passport.use(
    new JwtStrategy(opts, async (jwt_payload, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: jwt_payload.id },
          select: { id: true, email: true, role: true, full_name: true }
        });
        if (user) return done(null, user);
        return done(null, false);
      } catch (err) {
        return done(err, false);
      }
    })
  );
};
```

#### File: backend/src/routes/auth.routes.js

```javascript
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });

    const { password_hash, ...userNoPass } = user;
    res.json({ user: userNoPass });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('jwt');
  res.json({ success: true });
});

module.exports = router;
```

#### File: backend/src/routes/leave.routes.js

```javascript
const express = require('express');
const router = express.Router();
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const auth = passport.authenticate('jwt', { session: false });

router.get('/balances', auth, async (req, res) => {
  const balances = await prisma.leaveBalance.findMany({
    where: { user_id: req.user.id },
    include: { leave_type: true }
  });
  res.json(balances);
});

router.post('/request', auth, async (req, res) => {
  const { leave_type_id, start_date, end_date, reason } = req.body;
  
  const start = new Date(start_date);
  const end = new Date(end_date);
  const diffTime = Math.abs(end - start);
  const total_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  try {
    const balance = await prisma.leaveBalance.findUnique({
      where: { user_id_leave_type_id: { user_id: req.user.id, leave_type_id } }
    });

    if (balance.remaining_days < total_days) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const request = await prisma.leaveRequest.create({
      data: {
        user_id: req.user.id,
        leave_type_id,
        start_date: start,
        end_date: end,
        total_days,
        reason,
        status: 'pending'
      }
    });
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my-history', auth, async (req, res) => {
  const requests = await prisma.leaveRequest.findMany({
    where: { user_id: req.user.id },
    include: { leave_type: true },
    orderBy: { created_at: 'desc' }
  });
  res.json(requests);
});

module.exports = router;
```

#### File: backend/src/routes/manager.routes.js

```javascript
const express = require('express');
const router = express.Router();
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const auth = passport.authenticate('jwt', { session: false });

const isManager = (req, res, next) => {
  if (req.user.role === 'manager' || req.user.role === 'hr_admin') return next();
  res.status(403).json({ error: 'Forbidden' });
};

router.get('/pending', auth, isManager, async (req, res) => {
  const requests = await prisma.leaveRequest.findMany({
    where: {
      status: 'pending',
      user: { manager_id: req.user.id }
    },
    include: { user: true, leave_type: true }
  });
  res.json(requests);
});

router.patch('/request/:id', auth, isManager, async (req, res) => {
  const { id } = req.params;
  const { status, comment } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.update({
        where: { id },
        data: { status, manager_comment: comment }
      });

      if (status === 'approved') {
        await tx.leaveBalance.update({
          where: { 
            user_id_leave_type_id: { 
              user_id: request.user_id, 
              leave_type_id: request.leave_type_id 
            } 
          },
          data: { remaining_days: { decrement: request.total_days } }
        });
      }
      return request;
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

#### File: frontend/package.json

```json
{
  "name": "lms-frontend",
  "version": "1.0.0",
  "dependencies": {
    "@tanstack/react-query": "^5.24.1",
    "axios": "^1.6.7",
    "date-fns": "^3.3.1",
    "lucide-react": "^0.344.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.1",
    "tailwind-merge": "^2.2.1",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "vite": "^5.1.4"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

#### File: frontend/tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

#### File: frontend/src/context/AuthContext.jsx

```javascript
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const checkAuth = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/auth/me'); // Simple endpoint to verify cookie
        setUser(res.data.user);
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    // For demo purposes, we skip the 'me' check or assume login handles it
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await axios.post('http://localhost:5000/api/auth/login', { email, password });
    setUser(res.data.user);
    return res.data;
  };

  const logout = async () => {
    await axios.post('http://localhost:5000/api/auth/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

#### File: frontend/src/App.jsx

```javascript
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import RequestLeave from './pages/RequestLeave';
import ManagerPanel from './pages/ManagerPanel';

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />;
  return children;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-gray-50">
            <Navbar />
            <main className="container mx-auto px-4 py-8">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                <Route path="/apply" element={
                  <ProtectedRoute>
                    <RequestLeave />
                  </ProtectedRoute>
                } />
                <Route path="/manage" element={
                  <ProtectedRoute roles={['manager', 'hr_admin']}>
                    <ManagerPanel />
                  </ProtectedRoute>
                } />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
```

#### File: frontend/src/components/Navbar.jsx

```javascript
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Calendar, Home, CheckSquare } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 flex justify-between items-center h-16">
        <div className="flex items-center space-x-8">
          <span className="text-xl font-bold text-indigo-600">LMS Portal</span>
          <div className="hidden md:flex space-x-4">
            <Link to="/" className="flex items-center space-x-1 text-gray-600 hover:text-indigo-600">
              <Home size={18} /> <span>Dashboard</span>
            </Link>
            <Link to="/apply" className="flex items-center space-x-1 text-gray-600 hover:text-indigo-600">
              <Calendar size={18} /> <span>Apply</span>
            </Link>
            {(user.role === 'manager' || user.role === 'hr_admin') && (
              <Link to="/manage" className="flex items-center space-x-1 text-gray-600 hover:text-indigo-600">
                <CheckSquare size={18} /> <span>Approvals</span>
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">{user.full_name}</span>
          <button onClick={() => { logout(); navigate('/login'); }} className="text-gray-400 hover:text-red-500">
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
```

#### File: frontend/src/pages/Dashboard.jsx

```javascript
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { format } from 'date-fns';

const Dashboard = () => {
  const { data: balances } = useQuery({
    queryKey: ['balances'],
    queryFn: () => axios.get('http://localhost:5000/api/leaves/balances', { withCredentials: true }).then(res => res.data)
  });

  const { data: history } = useQuery({
    queryKey: ['history'],
    queryFn: () => axios.get('http://localhost:5000/api/leaves/my-history', { withCredentials: true }).then(res => res.data)
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">My Leave Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {balances?.map(b => (
          <div key={b.id} className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-gray-500 text-sm font-medium">{b.leave_type.name} Leave</h3>
            <p className="text-3xl font-bold mt-2">{b.remaining_days} days</p>
            <div className="w-full bg-gray-200 h-2 mt-4 rounded-full overflow-hidden">
                <div 
                    className="bg-indigo-600 h-full" 
                    style={{ width: `${(b.remaining_days / b.leave_type.annual_allowance) * 100}%` }}
                />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold">Recent Requests</h2>
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">Type</th>
              <th className="px-6 py-3">Dates</th>
              <th className="px-6 py-3">Days</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {history?.map(req => (
              <tr key={req.id}>
                <td className="px-6 py-4">{req.leave_type.name}</td>
                <td className="px-6 py-4">
                  {format(new Date(req.start_date), 'MMM dd')} - {format(new Date(req.end_date), 'MMM dd, yyyy')}
                </td>
                <td className="px-6 py-4">{req.total_days}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium 
                    ${req.status === 'approved' ? 'bg-green-100 text-green-700' : 
                      req.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                    {req.status}
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

#### File: frontend/src/pages/Login.jsx

```javascript
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      alert('Login failed');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-xl shadow-md border">
      <h2 className="text-2xl font-bold text-center mb-8">Sign In</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Email Address</label>
          <input 
            type="email" 
            className="mt-1 w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input 
            type="password" 
            className="mt-1 w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500" 
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 transition">
          Login
        </button>
      </form>
    </div>
  );
};

export default Login;
```

#### File: backend/scripts/seed.js

```javascript
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  // Create HR Admin
  const hr = await prisma.user.upsert({
    where: { email: 'hr@company.com' },
    update: {},
    create: {
      email: 'hr@company.com',
      password_hash: passwordHash,
      full_name: 'HR Manager',
      role: 'hr_admin',
      department: 'HR'
    }
  });

  // Create Leave Types
  const annual = await prisma.leaveType.upsert({
    where: { name: 'Annual' },
    update: {},
    create: { name: 'Annual', annual_allowance: 20 }
  });

  const sick = await prisma.leaveType.upsert({
    where: { name: 'Sick' },
    update: {},
    create: { name: 'Sick', annual_allowance: 10 }
  });

  // Create standard employee
  const emp = await prisma.user.upsert({
    where: { email: 'employee@company.com' },
    update: {},
    create: {
      email: 'employee@company.com',
      password_hash: passwordHash,
      full_name: 'John Doe',
      role: 'employee',
      department: 'Engineering',
      manager_id: hr.id
    }
  });

  // Initialize Balances
  await prisma.leaveBalance.createMany({
    data: [
      { user_id: emp.id, leave_type_id: annual.id, remaining_days: 20 },
      { user_id: emp.id, leave_type_id: sick.id, remaining_days: 10 },
    ],
    skipDuplicates: true
  });

  console.log('Seed completed.');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
```

#### File: Dockerfile

```dockerfile
# Build Frontend
FROM node:18-alpine as build-step
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Production Server
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production
COPY backend/ ./backend/
COPY prisma/ ./prisma/
COPY --from=build-step /app/frontend/dist ./backend/public

EXPOSE 5000
CMD ["node", "backend/src/index.js"]
```

#### File: frontend/index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Leave Management System</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

#### File: frontend/src/main.jsx

```javascript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

#### File: frontend/src/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```