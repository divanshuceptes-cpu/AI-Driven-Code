import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Calendar, CheckCircle, Clock, XCircle } from 'lucide-react';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const userRes = await api.get('/users/me');
      const leavesRes = await api.get('/leaves');
      setUser(userRes.data);
      setLeaves(leavesRes.data);
    };
    fetchData();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Welcome, {user?.full_name}</h1>
      
      {/* Balances */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {user?.LeaveBalances?.map(b => (
          <div key={b.leave_type_id} className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
            <p className="text-gray-500 text-sm">{b.LeaveType.name}</p>
            <p className="text-2xl font-bold">{b.total_days - b.used_days} / {b.total_days} Days</p>
          </div>
        ))}
      </div>

      {/* History */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4">Type</th>
              <th className="p-4">Dates</th>
              <th className="p-4">Days</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map(l => (
              <tr key={l.id} className="border-t">
                <td className="p-4 font-medium">{l.LeaveType.name}</td>
                <td className="p-4">{l.start_date} to {l.end_date}</td>
                <td className="p-4">{l.total_days}</td>
                <td className="p-4">
                  <span className={`flex items-center gap-1 ${
                    l.status === 'Approved' ? 'text-green-600' : 
                    l.status === 'Rejected' ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                    {l.status === 'Approved' && <CheckCircle size={16} />}
                    {l.status === 'Rejected' && <XCircle size={16} />}
                    {l.status === 'Pending' && <Clock size={16} />}
                    {l.status}
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
