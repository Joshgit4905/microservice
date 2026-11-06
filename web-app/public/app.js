// Rides module (frontend). Talks only to the web app server, which forwards to the rides microservice.
let currentUser = null;

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c); // strings are inserted as text, never as HTML
  return node;
}

function toast(message, isError = false) {
  const t = $('#toast');
  t.textContent = message;
  t.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = 'toast'), 3500);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = data && data.error ? data.error : { message: `HTTP ${res.status}` };
    const details = err.details ? ': ' + err.details.map((d) => d.message).join('; ') : '';
    const e = new Error(err.message + details);
    e.status = res.status;
    throw e;
  }
  return data;
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function weatherBadge(w) {
  if (w && w.status === 'ok') {
    return el('div', { class: 'weather' }, `${w.description} · ${Math.round(w.temperatureC)} °C · rain ${w.precipitationProbability ?? '–'}%`);
  }
  return el('div', { class: 'weather off' }, `Weather unavailable${w && w.reason ? ' — ' + w.reason : ''}`);
}

function rideCard(ride) {
  const isMine = currentUser && ride.driver.id === currentUser.id;
  const actions = el('div', { class: 'actions' },
    el('div', { class: 'seats' }, `${ride.seatsAvailable}/${ride.seatsTotal}`, el('small', {}, 'seats free')));

  if (currentUser && !isMine) {
    const b = el('button', { class: 'btn small', onclick: () => book(ride.id) }, 'Book seat');
    if (ride.seatsAvailable === 0) b.disabled = true;
    actions.append(b);
  }
  if (isMine) actions.append(el('button', { class: 'btn small danger', onclick: () => cancelRide(ride.id) }, 'Cancel ride'));
  actions.append(el('button', { class: 'btn small ghost', onclick: () => refreshWeather(ride.id) }, 'Refresh weather'));

  return el('article', { class: 'ride' },
    el('div', {},
      el('div', { class: 'route' }, ride.origin.name, el('span', { class: 'arrow' }, '→'), ride.destination),
      el('div', { class: 'meta' },
        el('span', {}, fmtDate(ride.departureTime)),
        el('span', {}, `$${ride.pricePerSeat} MXN / seat`),
        el('span', {}, `Driver: ${ride.driver.name}${isMine ? ' (you)' : ''}`)),
      weatherBadge(ride.weather)),
    actions);
}

async function loadRides() {
  const form = new FormData($('#filters'));
  const params = new URLSearchParams();
  if (form.get('date')) params.set('date', form.get('date'));
  if (form.get('available')) params.set('available', 'true');
  const box = $('#rides');
  try {
    const rides = await api('GET', `/api/rides${params.size ? '?' + params : ''}`);
    box.replaceChildren(...(rides.length ? rides.map(rideCard) : [el('div', { class: 'empty' }, 'No rides match these filters.')]));
  } catch (e) {
    box.replaceChildren(el('div', { class: 'empty' }, e.message));
  }
}

async function loadBookings() {
  if (!currentUser) return;
  try {
    const list = await api('GET', '/api/bookings');
    $('#bookings').replaceChildren(...(list.length
      ? list.map((b) => el('li', {}, b.ride ? `${b.ride.origin.name} → ${b.ride.destination} · ${fmtDate(b.ride.departureTime)}` : 'Ride cancelled'))
      : [el('li', {}, 'You have no bookings yet.')]));
  } catch (e) {
    toast(e.message, true);
  }
}

function renderSession() {
  const area = $('#session-area');
  if (currentUser) {
    area.replaceChildren(el('span', {}, `${currentUser.name} · ${currentUser.role}`),
      el('button', { class: 'btn small ghost', onclick: logout }, 'Log out'));
  } else {
    area.replaceChildren(el('span', {}, 'Browsing as guest'));
  }
  $('#login-card').classList.toggle('hidden', !!currentUser);
  $('#offer-card').classList.toggle('hidden', !currentUser);
  $('#bookings-card').classList.toggle('hidden', !currentUser);
}

async function refreshAll() {
  renderSession();
  await Promise.all([loadRides(), loadBookings()]);
}

async function login(email, password) {
  try {
    const data = await api('POST', '/session', { email, password });
    currentUser = data.user;
    toast(`Welcome, ${currentUser.name}`);
    await refreshAll();
  } catch (e) {
    toast(e.message, true);
  }
}

async function logout() {
  await api('DELETE', '/session').catch(() => {});
  currentUser = null;
  await refreshAll();
}

function handleAuthError(e) {
  if (e.status === 401) {
    currentUser = null;
    renderSession();
    toast('Your session expired. Log in again.', true);
    return true;
  }
  return false;
}

async function book(id) {
  try {
    await api('POST', `/api/rides/${id}/bookings`);
    toast('Seat booked');
    await Promise.all([loadRides(), loadBookings()]);
  } catch (e) {
    if (!handleAuthError(e)) toast(e.message, true);
  }
}

async function cancelRide(id) {
  try {
    await api('DELETE', `/api/rides/${id}`);
    toast('Ride cancelled');
    await loadRides();
  } catch (e) {
    if (!handleAuthError(e)) toast(e.message, true);
  }
}

async function refreshWeather(id) {
  try {
    await api('GET', `/api/rides/${id}/weather`);
    toast('Forecast updated');
    await loadRides();
  } catch (e) {
    toast(e.message, true);
  }
}

// ---- events ----
$('#login-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  login(f.get('email'), f.get('password'));
});

document.querySelectorAll('.demo-users .chip').forEach((chip) =>
  chip.addEventListener('click', () => {
    $('#login-form [name=email]').value = chip.dataset.email;
    $('#login-form [name=password]').value = chip.dataset.pass;
  }));

$('#filters').addEventListener('submit', (ev) => {
  ev.preventDefault();
  loadRides();
});

$('#offer-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const body = {
    origin: { name: f.get('originName'), lat: Number(f.get('lat')), lng: Number(f.get('lng')) },
    destination: f.get('destination'),
    departureTime: new Date(f.get('departure')).toISOString(),
    seats: Number(f.get('seats')),
    pricePerSeat: Number(f.get('price')),
  };
  try {
    const ride = await api('POST', '/api/rides', body);
    toast(`Ride #${ride.id} published`);
    ev.target.reset();
    setDefaultDeparture();
    await loadRides();
  } catch (e) {
    if (!handleAuthError(e)) toast(e.message, true);
  }
});

function setDefaultDeparture() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  d.setHours(7);
  const pad = (n) => String(n).padStart(2, '0');
  $('#offer-form [name=departure]').value =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

// ---- start ----
(async function init() {
  setDefaultDeparture();
  try {
    currentUser = (await api('GET', '/session')).user;
  } catch {
    currentUser = null;
  }
  await refreshAll();
})();
