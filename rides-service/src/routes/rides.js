const express = require('express');
const { db } = require('../data/store');
const { validateNewRide, validateRideQuery, parseId } = require('../validation');
const { notFound, forbidden, conflict, AppError } = require('../errors');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

function seatsAvailable(ride) {
  return ride.seatsTotal - db.bookings.filter((b) => b.rideId === ride.id).length;
}

function toDto(ride) {
  const driver = db.users.find((u) => u.id === ride.driverId);
  return {
    id: ride.id,
    driver: { id: driver.id, name: driver.name },
    origin: ride.origin,
    destination: ride.destination,
    departureTime: ride.departureTime,
    seatsTotal: ride.seatsTotal,
    seatsAvailable: seatsAvailable(ride),
    pricePerSeat: ride.pricePerSeat,
    weather: ride.weather,
    createdAt: ride.createdAt,
  };
}

function findRide(rawId) {
  const id = parseId(rawId);
  const ride = db.rides.find((r) => r.id === id);
  if (!ride) throw notFound(`Ride ${id} does not exist`);
  return ride;
}

/**
 * @param {{ getForecast: Function }} deps  weather client (injected so tests can mock it)
 */
module.exports = function ridesRouter({ getForecast }) {
  const router = express.Router();

  // GET /api/v1/rides?date=YYYY-MM-DD&available=true&destination=campus  (public)
  router.get('/', (req, res) => {
    const filters = validateRideQuery(req.query);
    let rides = db.rides.slice();
    if (filters.date) rides = rides.filter((r) => r.departureTime.startsWith(filters.date));
    if (filters.destination) rides = rides.filter((r) => r.destination.toLowerCase().includes(filters.destination));
    if (filters.available !== undefined) {
      rides = rides.filter((r) => (seatsAvailable(r) > 0) === filters.available);
    }
    rides.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
    res.status(200).json(rides.map(toDto));
  });

  // GET /api/v1/rides/:id  (public)
  router.get('/:id', (req, res) => {
    res.status(200).json(toDto(findRide(req.params.id)));
  });

  // POST /api/v1/rides  (protected) -> 201, includes forecast from Open-Meteo
  router.post(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
      const input = validateNewRide(req.body);
      const weather = await getForecast({
        lat: input.origin.lat,
        lng: input.origin.lng,
        time: input.departureTime,
      });

      const ride = {
        id: db.nextRideId++,
        driverId: req.user.id,
        origin: input.origin,
        destination: input.destination,
        departureTime: input.departureTime,
        seatsTotal: input.seats,
        pricePerSeat: input.pricePerSeat,
        weather,
        createdAt: new Date().toISOString(),
      };
      db.rides.push(ride);
      res.status(201).location(`/api/v1/rides/${ride.id}`).json(toDto(ride));
    })
  );

  // DELETE /api/v1/rides/:id  (protected, only the driver who published it) -> 204
  router.delete('/:id', requireAuth, (req, res) => {
    const ride = findRide(req.params.id);
    if (ride.driverId !== req.user.id) throw forbidden('Only the driver who published this ride can cancel it');
    db.rides = db.rides.filter((r) => r.id !== ride.id);
    db.bookings = db.bookings.filter((b) => b.rideId !== ride.id);
    res.status(204).end();
  });

  // POST /api/v1/rides/:id/bookings  (protected) -> 201 reserve one seat
  router.post('/:id/bookings', requireAuth, (req, res) => {
    const ride = findRide(req.params.id);
    if (ride.driverId === req.user.id) throw conflict('You cannot book a seat in your own ride');
    if (Date.parse(ride.departureTime) <= Date.now()) throw conflict('This ride has already departed');
    if (db.bookings.some((b) => b.rideId === ride.id && b.passengerId === req.user.id)) {
      throw conflict('You already have a seat in this ride');
    }
    if (seatsAvailable(ride) <= 0) throw conflict('This ride has no seats available');

    const booking = {
      id: db.nextBookingId++,
      rideId: ride.id,
      passengerId: req.user.id,
      createdAt: new Date().toISOString(),
    };
    db.bookings.push(booking);
    res.status(201).json({ ...booking, seatsAvailable: seatsAvailable(ride) });
  });

  // GET /api/v1/rides/:id/weather  (public) -> live forecast from Open-Meteo, 503 if the provider fails
  router.get(
    '/:id/weather',
    asyncHandler(async (req, res) => {
      const ride = findRide(req.params.id);
      const weather = await getForecast({ lat: ride.origin.lat, lng: ride.origin.lng, time: ride.departureTime });
      if (weather.status !== 'ok') {
        throw new AppError(503, 'WEATHER_UNAVAILABLE', weather.reason);
      }
      ride.weather = weather; // keep the latest good forecast
      res.status(200).json(weather);
    })
  );

  return router;
};

module.exports.toDto = toDto;
