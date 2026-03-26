// ===== Configuration =====
// TODO: Replace with your Supabase project credentials
const SUPABASE_URL = 'https://kattpnfudttpzdpmueuk.supabase.co';   // e.g. 'https://xxxxx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthdHRwbmZ1ZHR0cHpkcG11ZXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDkxMTYsImV4cCI6MjA5MDA4NTExNn0.uRtQm4FYMbh9-_pm9KBTb-92_1iwPwaaNozg12nS8kY';   // your anon/public key

// ===== Constants =====
const DATES = [
  { date: '2026-03-27', label: '3月27日 周五' },
  { date: '2026-03-28', label: '3月28日 周六' },
  { date: '2026-03-29', label: '3月29日 周日' },
];

const START_HOUR = 8;
const END_HOUR = 24; // midnight

function generateTimeSlots() {
  const slots = [];
  for (let h = START_HOUR; h < END_HOUR; h++) {
    const start = String(h).padStart(2, '0') + ':00';
    const end = String(h + 1 === 24 ? 0 : h + 1).padStart(2, '0') + ':00';
    const endLabel = h + 1 === 24 ? '24:00' : end;
    slots.push({ start, endLabel, key: `${h}` });
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

// ===== State =====
let currentDate = DATES[0].date;
let reservations = {};  // { "2026-03-27_8": { name, contact }, ... }
let selectedSlot = null;
let supabase = null;
let useLocalStorage = true;

// ===== Supabase Init =====
function initSupabase() {
  if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      useLocalStorage = false;
      // Subscribe to real-time changes
      supabase
        .channel('reservations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
          loadReservations();
        })
        .subscribe();
      return true;
    } catch (e) {
      console.warn('Supabase init failed, falling back to localStorage', e);
    }
  }
  return false;
}

// ===== Data Layer =====
async function loadReservations() {
  if (!useLocalStorage && supabase) {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*');
      if (error) throw error;
      reservations = {};
      data.forEach(r => {
        reservations[`${r.date}_${r.time_slot}`] = { name: r.name, contact: r.contact };
      });
    } catch (e) {
      console.error('Failed to load reservations:', e);
      showToast('加载预约数据失败，请刷新重试', 'error');
    }
  } else {
    const saved = localStorage.getItem('reservations');
    if (saved) {
      try { reservations = JSON.parse(saved); } catch (e) { reservations = {}; }
    }
  }
  renderSlots();
}

async function saveReservation(date, timeSlot, name, contact) {
  const key = `${date}_${timeSlot}`;

  if (!useLocalStorage && supabase) {
    const { error } = await supabase
      .from('reservations')
      .insert([{ date, time_slot: timeSlot, name, contact }]);
    if (error) {
      if (error.code === '23505') { // unique violation
        throw new Error('该时间段已被预约，请选择其他时间');
      }
      throw new Error('预约失败：' + error.message);
    }
    reservations[key] = { name, contact };
  } else {
    if (reservations[key]) {
      throw new Error('该时间段已被预约，请选择其他时间');
    }
    reservations[key] = { name, contact };
    localStorage.setItem('reservations', JSON.stringify(reservations));
  }
}

// ===== Rendering =====
function renderSlots() {
  const container = document.getElementById('timeSlots');
  const loading = document.getElementById('loading');
  loading.style.display = 'none';

  const dateInfo = DATES.find(d => d.date === currentDate);
  let html = '';

  TIME_SLOTS.forEach(slot => {
    const key = `${currentDate}_${slot.key}`;
    const reservation = reservations[key];
    const isBooked = !!reservation;
    const statusClass = isBooked ? 'booked' : 'available';
    const statusText = isBooked ? '已预约' : '可预约';

    html += `
      <div class="time-slot ${statusClass}" data-slot="${slot.key}" ${isBooked ? '' : 'onclick="onSlotClick(\'' + slot.key + '\')"'}>
        <div class="slot-left">
          <span class="slot-time">${slot.start} - ${slot.endLabel}</span>
          ${isBooked ? `<span class="booked-name">${escapeHtml(reservation.name)}</span>` : ''}
        </div>
        <div class="slot-status">
          <span class="status-dot"></span>
          <span>${statusText}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Event Handlers =====
function onSlotClick(slotKey) {
  selectedSlot = slotKey;
  const slot = TIME_SLOTS.find(s => s.key === slotKey);
  const dateInfo = DATES.find(d => d.date === currentDate);
  document.getElementById('selectedInfo').textContent =
    `${dateInfo.label}  ${slot.start} - ${slot.endLabel}`;
  openModal();
}

function switchDate(date) {
  currentDate = date;
  document.querySelectorAll('.date-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.date === date);
  });
  renderSlots();
}

// ===== Modal =====
function openModal() {
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('nameInput').value = '';
  document.getElementById('contactInput').value = '';
  document.getElementById('submitBtn').disabled = false;
  // Focus name input after animation
  setTimeout(() => document.getElementById('nameInput').focus(), 350);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  selectedSlot = null;
}

// ===== Toast =====
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ===== Form Submit =====
async function handleSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('nameInput').value.trim();
  const contact = document.getElementById('contactInput').value.trim();

  if (!name || !contact) {
    showToast('请填写完整信息', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '提交中...';

  try {
    await saveReservation(currentDate, selectedSlot, name, contact);
    closeModal();
    showToast('预约成功！');
    renderSlots();
  } catch (err) {
    showToast(err.message, 'error');
    submitBtn.disabled = false;
  }

  submitBtn.textContent = '确认预约';
}

// ===== Demo Banner =====
function showDemoBanner() {
  if (useLocalStorage) {
    const banner = document.createElement('div');
    banner.className = 'demo-banner';
    banner.innerHTML = '当前为演示模式（数据仅保存在本设备）。配置 Supabase 后可多用户共享数据。';
    const container = document.querySelector('.container');
    container.insertBefore(banner, container.children[1]);
  }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  // Init Supabase
  initSupabase();
  showDemoBanner();

  // Date tabs
  document.querySelectorAll('.date-tab').forEach(tab => {
    tab.addEventListener('click', () => switchDate(tab.dataset.date));
  });

  // Modal controls
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Form
  document.getElementById('bookingForm').addEventListener('submit', handleSubmit);

  // Load data
  loadReservations();
});
