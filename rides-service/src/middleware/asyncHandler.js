// Forwards rejected promises to the error handler (Express 4 does not do it by itself).
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
