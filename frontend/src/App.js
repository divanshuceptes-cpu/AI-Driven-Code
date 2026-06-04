import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import LeaveRequest from './pages/LeaveRequest';
import Login from './pages/Login'; // Assume basic implementation

function App() {
  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
          <Link to="/" className="text-xl font-bold text-blue-600">LMS Portal</Link>
          <div className="flex gap-4 items-center">
            <Link to="/request" className="text-gray-600 hover:text-blue-600">New Request</Link>
            <button onClick={logout} className="text-red-500 text-sm">Logout</button>
          </div>
        </nav>
        
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/request" element={<LeaveRequest />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
