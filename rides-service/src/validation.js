// Small, dependency-free validators. Each returns a list of { field, message }.
const { badRequest } = require('./errors');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value, field, min, max, errors) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    errors.push({ field, message: `${field} must be a text between ${min} and ${max} characters` });
  }
}

function throwIfErrors(errors) {
  if (errors.length) throw badRequest('Invalid request data', errors);
}

function validateLogin(body) {
  const errors = [];
  if (!isPlainObject(body)) {
    throwIfErrors([{ field: 'body', message: 'Body must be a JSON object' }]);
  }
  if (typeof body.email !== 'string' || !EMAIL.test(body.email)) {
    errors.push({ field: 'email', message: 'email must be a valid email address' });
  }
  if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 128) {
    errors.push({ field: 'password', message: 'password is required' });
  }
  throwIfErrors(errors);
  return { email: body.email.trim().toLowerCase(), password: body.password };
}

function validateNewRide(body) {
  const errors = [];
  if (!isPlainObject(body)) {
    throwIfErrors([{ field: 'body', message: 'Body must be a JSON object' }]);
  }

  const { origin, destination, departureTime, seats, pricePerSeat } = body;

  if (!isPlainObject(origin)) {
    errors.push({ field: 'origin', message: 'origin must be an object { name, lat, lng }' });
  } else {
    text(origin.name, 'origin.name', 3, 120, errors);
    if (!isNumber(origin.lat) || origin.lat < -90 || origin.lat > 90) {
      errors.push({ field: 'origin.lat', message: 'origin.lat must be a number between -90 and 90' });
    }
    if (!isNumber(origin.lng) || origin.lng < -180 || origin.lng > 180) {
      errors.push({ field: 'origin.lng', message: 'origin.lng must be a number between -180 and 180' });
    }
  }

  text(destination, 'destination', 3, 120, errors);

  if (typeof departureTime !== 'string' || !ISO_DATETIME.test(departureTime) || Number.isNaN(Date.parse(departureTime))) {
    errors.push({
      field: 'departureTime',
      message: 'departureTime must be an ISO 8601 date-time with timezone, e.g. 2026-11-10T07:30:00-06:00',
    });
  } else if (Date.parse(departureTime) <= Date.now()) {
    errors.push({ field: 'departureTime', message: 'departureTime must be in the future' });
  }

  if (!Number.isInteger(seats) || seats < 1 || seats > 6) {
    errors.push({ field: 'seats', message: 'seats must be an integer between 1 and 6' });
  }

  if (!isNumber(pricePerSeat) || pricePerSeat < 0 || pricePerSeat > 500) {
    errors.push({ field: 'pricePerSeat', message: 'pricePerSeat must be a number between 0 and 500 (MXN)' });
  }

  throwIfErrors(errors);
  return {
    origin: { name: origin.name.trim(), lat: origin.lat, lng: origin.lng },
    destination: destination.trim(),
    departureTime: new Date(departureTime).toISOString(),
    seats,
    pricePerSeat,
  };
}

function validateRideQuery(query) {
  const errors = [];
  const result = {};

  if (query.date !== undefined) {
    if (typeof query.date !== 'string' || !ISO_DATE.test(query.date) || Number.isNaN(Date.parse(query.date))) {
      errors.push({ field: 'date', message: 'date must have the format YYYY-MM-DD' });
    } else {
      result.date = query.date;
    }
  }

  if (query.available !== undefined) {
    if (query.available !== 'true' && query.available !== 'false') {
      errors.push({ field: 'available', message: 'available must be true or false' });
    } else {
      result.available = query.available === 'true';
    }
  }

  if (query.destination !== undefined) {
    if (typeof query.destination !== 'string' || query.destination.length > 120) {
      errors.push({ field: 'destination', message: 'destination must be a text up to 120 characters' });
    } else {
      result.destination = query.destination.trim().toLowerCase();
    }
  }

  throwIfErrors(errors);
  return result;
}

function parseId(raw) {
  if (!/^[1-9]\d{0,8}$/.test(raw)) {
    throw badRequest('Invalid ride id', [{ field: 'id', message: 'id must be a positive integer' }]);
  }
  return Number(raw);
}

module.exports = { validateLogin, validateNewRide, validateRideQuery, parseId };
