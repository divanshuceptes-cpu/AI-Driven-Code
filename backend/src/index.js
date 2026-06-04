const express = require('express');
const cors = require('cors');
const sequelize = require('./config/db');
const { authenticate, authorize } = require('./middleware/auth');
const leaveController = require('./controllers/leaveController');
const authController = require('./controllers/authController'); // Implementation assumed basic JWT logic

const app = express();
app.use(cors());
app.use(express.json());

// Auth
app.post('/api/auth/login', authController.login);

// Leaves
app.get('/api/leaves', authenticate, leaveController.getHistory);
app.post('/api/leaves', authenticate, leaveController.submitRequest);
app.get('/api/leaves/pending', authenticate, authorize(['Manager', 'Admin']), leaveController.getPendingApprovals);
app.patch('/api/leaves/:id', authenticate, authorize(['Manager', 'Admin']), leaveController.updateStatus);

// User Profile
app.get('/api/users/me', authenticate, async (req, res) => {
    const { User, LeaveBalance, LeaveType } = require('./models');
    const user = await User.findByPk(req.user.id, {
        include: [{ model: LeaveBalance, include: [LeaveType] }]
    });
    res.json(user);
});

const PORT = process.env.PORT || 5000;
sequelize.authenticate().then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
