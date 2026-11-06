const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { db } = require('../data/store');
const { validateLogin } = require('../validation');
const { unauthorized, notFound } = require('../errors');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// Slow down brute-force attempts on the login endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again in 15 minutes.' } },
});

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// POST /api/v1/auth/login -> 200 { accessToken, tokenType, expiresIn, user }
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = validateLogin(req.body);
    const user = db.users.find((u) => u.email === email);

    // Same message for unknown email and wrong password (no user enumeration).
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) throw unauthorized('Invalid email or password');

    // Only an identifier and a role go in the token: never personal data.
    const accessToken = jwt.sign({ role: user.role }, config.jwtSecret, {
      algorithm: 'HS256',
      subject: user.id,
      issuer: config.jwtIssuer,
      expiresIn: config.jwtExpiresIn,
    });
    const { exp, iat } = jwt.decode(accessToken);

    res.status(200).json({
      accessToken,
      tokenType: 'Bearer',
      expiresIn: exp - iat,
      user: publicUser(user),
    });
  })
);

// GET /api/v1/auth/me -> 200 { user }   (protected)
router.get('/me', requireAuth, (req, res) => {
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) throw notFound('User not found');
  res.json({ user: publicUser(user) });
});

module.exports = router;
