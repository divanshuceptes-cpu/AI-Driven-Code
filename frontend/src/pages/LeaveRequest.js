import React, { useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const LeaveRequest = () => {
  const [form, setForm] = useState({ leave_type_id: 1, start_date: '', end_date: '', reason: '' });
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/leaves', form);
      alert('Request submitted successfully');
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 bg-white p-8 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Request Leave</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Leave Type</label>
          <select 
            className="w-full border p-2 rounded"
            onChange={e => setForm({...form, leave_type_id: e.target.value})}
          >
            <option value="1">Annual Leave</option>
            <option value="2">Sick Leave</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Start Date</label>
          <input type="date" required className="w-full border p-2 rounded" 
            onChange={e => setForm({...form, start_date: e.target.value})} />
        </div>
        <div>
          <label className="block text-sm font-medium">End Date</label>
          <input type="date" required className="w-full border p-2 rounded" 
            onChange={e => setForm({...form, end_date: e.target.value})} />
        </div>
        <div>
          <label className="block text-sm font-medium">Reason</label>
          <textarea className="w-full border p-2 rounded" 
            onChange={e => setForm({...form, reason: e.target.value})}></textarea>
        </div>
        <button className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">
          Submit Request
        </button>
      </form>
    </div>
  );
};

export default LeaveRequest;
