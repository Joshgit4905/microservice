const express = require('express');
const { db } = require('../data/store');
const { requireAuth } = require('../middleware/auth');
const { toDto } = require('./rides');

const router = express.Router();

// GET /api/v1/bookings  (protected) -> bookings of the authenticated user, with ride info
router.get('/', requireAuth, (req, res) => {
  const mine = db.bookings
    .filter((b) => b.passengerId === req.user.id)
    .map((b) => {
      const ride = db.rides.find((r) => r.id === b.rideId);
      return { id: b.id, createdAt: b.createdAt, ride: ride ? toDto(ride) : null };
    });
  res.status(200).json(mine);
});

module.exports = router;
