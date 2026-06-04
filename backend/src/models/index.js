const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  full_name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password_hash: { type: DataTypes.TEXT, allowNull: false },
  role_id: { type: DataTypes.INTEGER },
  manager_id: { type: DataTypes.UUID },
  department: { type: DataTypes.STRING }
}, { tableName: 'users', timestamps: false });

const LeaveRequest = sequelize.define('LeaveRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  leave_type_id: { type: DataTypes.INTEGER, allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  total_days: { type: DataTypes.DECIMAL, allowNull: false },
  reason: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'Pending' },
  manager_note: { type: DataTypes.TEXT }
}, { tableName: 'leave_requests', timestamps: true, createdAt: 'created_at', updatedAt: false });

const LeaveBalance = sequelize.define('LeaveBalance', {
  user_id: { type: DataTypes.UUID, primaryKey: true },
  leave_type_id: { type: DataTypes.INTEGER, primaryKey: true },
  used_days: { type: DataTypes.DECIMAL, defaultValue: 0 },
  total_days: { type: DataTypes.DECIMAL, allowNull: false }
}, { tableName: 'leave_balances', timestamps: false });

const LeaveType = sequelize.define('LeaveType', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  default_days: { type: DataTypes.INTEGER }
}, { tableName: 'leave_types', timestamps: false });

// Associations
User.hasMany(LeaveRequest, { foreignKey: 'user_id' });
LeaveRequest.belongsTo(User, { foreignKey: 'user_id' });
LeaveRequest.belongsTo(LeaveType, { foreignKey: 'leave_type_id' });
User.hasMany(LeaveBalance, { foreignKey: 'user_id' });

module.exports = { User, LeaveRequest, LeaveBalance, LeaveType };
