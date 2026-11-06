// Errors that are safe to show to the client. Anything else becomes a generic 500.
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, details);
const unauthorized = (message) => new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message) => new AppError(403, 'FORBIDDEN', message);
const notFound = (message) => new AppError(404, 'NOT_FOUND', message);
const conflict = (message) => new AppError(409, 'CONFLICT', message);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
