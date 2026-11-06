const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized } = require('../errors');

// Requires "Authorization: Bearer <JWT>". Puts { id, role } in req.user.
function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(unauthorized('Missing or malformed Authorization header. Use: Bearer <token>'));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'], // pin the algorithm: never accept "none" or others
      issuer: config.jwtIssuer,
    });
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(unauthorized('Token expired. Log in again to get a new one.'));
    }
    return next(unauthorized('Invalid token'));
  }
}

module.exports = { requireAuth };
