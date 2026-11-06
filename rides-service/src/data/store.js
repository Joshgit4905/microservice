// In-memory data store. Data resets every time the service restarts.
// Demo users: passwords are stored only as bcrypt hashes. Plain demo passwords are in the README.

const SEED_USERS = [
  {
    id: 'u1',
    name: 'Ana Torres',
    email: 'ana@campusride.test',
    role: 'driver',
    passwordHash: '$2a$10$ubsbKsImhB6brHzmfvgho.jl32hLr1LngJMbg.D/jXjqDU9jE9RC2', // Driver123!
  },
  {
    id: 'u2',
    name: 'Luis Ramírez',
    email: 'luis@campusride.test',
    role: 'student',
    passwordHash: '$2a$10$lh8oUqVVSTEtJeaDU8nBOeOoXxNkCKO//LeK1a/rmtMgnCyXtJdoO', // Rider123!
  },
  {
    id: 'u3',
    name: 'Sofía Méndez',
    email: 'sofia@campusride.test',
    role: 'student',
    passwordHash: '$2a$10$ODl2LefKgTL5x7inwzq/7OYeCPRWZWr4hHC3gKRaBdfL2gtPVO3O6', // Rider456!
  },
];

function hoursFromNow(hours) {
  const d = new Date(Date.now() + hours * 3600 * 1000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function seedRides() {
  return [
    {
      id: 1,
      driverId: 'u1',
      origin: { name: 'Plaza de Armas', lat: 20.5931, lng: -100.3896 },
      destination: 'Main campus',
      departureTime: hoursFromNow(20),
      seatsTotal: 3,
      pricePerSeat: 25,
      weather: { status: 'unavailable', reason: 'Not fetched yet. Use GET /api/v1/rides/1/weather' },
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      driverId: 'u1',
      origin: { name: 'Central de Autobuses', lat: 20.5779, lng: -100.3637 },
      destination: 'Main campus',
      departureTime: hoursFromNow(44),
      seatsTotal: 2,
      pricePerSeat: 30,
      weather: { status: 'unavailable', reason: 'Not fetched yet. Use GET /api/v1/rides/2/weather' },
      createdAt: new Date().toISOString(),
    },
  ];
}

const db = { users: [], rides: [], bookings: [], nextRideId: 1, nextBookingId: 1 };

function reset() {
  db.users = SEED_USERS.map((u) => ({ ...u }));
  db.rides = seedRides();
  db.bookings = [{ id: 1, rideId: 2, passengerId: 'u3', createdAt: new Date().toISOString() }];
  db.nextRideId = db.rides.length + 1;
  db.nextBookingId = db.bookings.length + 1;
}

reset();

module.exports = { db, reset };
