const { LeaveRequest, LeaveBalance, LeaveType, User } = require('../models');
const sequelize = require('../config/db');
const { Op } = require('sequelize');

exports.submitRequest = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { leave_type_id, start_date, end_date, reason } = req.body;
    const userId = req.user.id;

    // Calculate days (simple diff)
    const start = new Date(start_date);
    const end = new Date(end_date);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // 1. Check overlap
    const overlap = await LeaveRequest.findOne({
      where: {
        user_id: userId,
        status: { [Op.ne]: 'Rejected' },
        [Op.or]: [
          { start_date: { [Op.between]: [start_date, end_date] } },
          { end_date: { [Op.between]: [start_date, end_date] } }
        ]
      }
    });
    if (overlap) throw new Error('Leave request overlaps with existing dates');

    // 2. Check balance
    const balance = await LeaveBalance.findOne({ where: { user_id: userId, leave_type_id } });
    if (!balance || (balance.total_days - balance.used_days) < diffDays) {
      throw new Error('Insufficient leave balance');
    }

    // 3. Create request
    const request = await LeaveRequest.create({
      user_id: userId,
      leave_type_id,
      start_date,
      end_date,
      total_days: diffDays,
      reason
    }, { transaction: t });

    // 4. Update balance (deduct)
    await balance.increment('used_days', { by: diffDays, transaction: t });

    await t.commit();
    res.status(201).json(request);
  } catch (error) {
    await t.rollback();
    res.status(400).json({ error: error.message });
  }
};

exports.getHistory = async (req, res) => {
  const history = await LeaveRequest.findAll({
    where: { user_id: req.user.id },
    include: [LeaveType],
    order: [['created_at', 'DESC']]
  });
  res.json(history);
};

exports.getPendingApprovals = async (req, res) => {
  const requests = await LeaveRequest.findAll({
    include: [{
      model: User,
      where: { manager_id: req.user.id },
      attributes: ['full_name', 'department']
    }, LeaveType],
    where: { status: 'Pending' }
  });
  res.json(requests);
};

exports.updateStatus = async (req, res) => {
    const { id } = req.params;
    const { status, manager_note } = req.body;
    const t = await sequelize.transaction();

    try {
        const request = await LeaveRequest.findByPk(id);
        if (!request) return res.status(404).json({ error: 'Not found' });

        if (status === 'Rejected') {
            const balance = await LeaveBalance.findOne({ 
                where: { user_id: request.user_id, leave_type_id: request.leave_type_id } 
            });
            await balance.decrement('used_days', { by: request.total_days, transaction: t });
        }

        request.status = status;
        request.manager_note = manager_note;
        await request.save({ transaction: t });

        await t.commit();
        res.json(request);
    } catch (error) {
        await t.rollback();
        res.status(400).json({ error: error.message });
    }
};
