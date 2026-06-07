/* ============================================
   APP.JS - Web App Chấm Công
   Core logic: Fetch, Parse, Render
   ============================================ */

// ============ State ============
const state = {
  sheetUrl: '',
  rawData: [],
  employeeData: [],
  currentEmployee: null,
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  recentSearches: [],
  isLoading: false,
  lastFetchTime: null,
};

// Auto-refresh interval: 5 minutes
const CACHE_DURATION_MS = 5 * 60 * 1000;

// ============ Config Keys ============
const STORAGE_KEYS = {
  SHEET_URL: 'attendance_sheet_url',
  RECENT_SEARCHES: 'attendance_recent_searches',
  THEME: 'attendance_theme',
  LAST_CODE: 'attendance_last_code',
  ANNOUNCEMENT: 'attendance_announcement',
};

// ============ Column Mapping ============
// Maps display-friendly keys to the exact Google Sheets column headers
const COL = {
  eventId: 'Event ID',
  vendor: 'Vendor',
  code: 'Mã CTV',
  type: 'Loại CTV',
  department: 'Bộ phận',
  team: 'Team',
  location: 'Địa điểm',
  name: 'Họ và tên',
  gender: 'Giới tính',
  date: 'Ngày',
  dayOfWeek: 'Thứ',
  actualIn: 'Giờ vào thực tế',
  actualOut: 'Giờ ra thực tế',
  calcIn: 'Giờ vào - Tính công',
  calcOut: 'Giờ ra - Tính công',
  totalHours: 'Tổng giờ',
  nightBreak: 'Giờ nghỉ ĐÊM',
  dayBreak: 'Giờ nghỉ NGÀY',
  totalWorkHours: 'Tổng giờ làm việc',
  expectedOT: 'OT dự kiến',
  actualOT: 'OT thực tế',
  actualCOT: 'COT  Thực tế',
  nightCOT: 'COT  Đêm Thực tế',
  totalBasicHours: 'Tổng giờ cơ bản',
  totalCalcHours: 'Tổng giờ làm việc tính công',
  workDays: 'Ngày công',
  shift: 'Ca chấm công',
  attendanceMethod: 'Hình thức chấm công',
  workstation: 'Workstation',
  attendancePerson: 'Người chấm công dành cho chấm công thẻ',
  claimStatus: 'Claim công',
  cicoStatus: 'CI-CO (1)',
  deptStatus: 'Department (2)',
  wsStatus: 'Workstation (3)',
  methodStatus: 'Hình thức chấm công (4)',
  shiftStatus: 'Ca chấm công (5)',
};

// ============ DOM Elements ============
const $ = (id) => document.getElementById(id);

// ============ Init ============
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadConfig();
  loadAnnouncement();
  setupEventListeners();
  checkUrlParams();
});

function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function loadConfig() {
  // Load sheet URL
  state.sheetUrl = localStorage.getItem(STORAGE_KEYS.SHEET_URL) || '';
  
  // Load recent searches
  try {
    state.recentSearches = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES) || '[]');
  } catch {
    state.recentSearches = [];
  }

  // Show appropriate screen
  if (state.sheetUrl) {
    showScreen('search');
    renderRecentSearches();
    
    // Auto-search last code
    const lastCode = localStorage.getItem(STORAGE_KEYS.LAST_CODE);
    if (lastCode) {
      $('searchInput').value = lastCode;
    }
  } else {
    showScreen('setup');
  }
}

function setupEventListeners() {
  // Enter key to search
  $('searchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });


  // Theme toggle
  $('themeToggle')?.addEventListener('click', toggleTheme);

  // Day detail close
  $('dayDetailClose')?.addEventListener('click', closeDayDetail);
  $('dayDetailOverlay')?.addEventListener('click', closeDayDetail);

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDayDetail();
  });

  // Auto-refresh when page becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isCacheExpired()) {
      silentRefresh();
    }
  });

  // Auto-refresh every 5 minutes
  setInterval(() => {
    if (!document.hidden && isCacheExpired()) {
      silentRefresh();
    }
  }, CACHE_DURATION_MS);
}

function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const sheetUrl = params.get('sheet');
  const code = params.get('code');

  if (sheetUrl) {
    state.sheetUrl = sheetUrl;
    localStorage.setItem(STORAGE_KEYS.SHEET_URL, sheetUrl);
    showScreen('search');
  }

  if (code) {
    $('searchInput').value = code;
    handleSearch();
  }
}

// ============ Screen Management ============
function showScreen(screen) {
  $('setupScreen').style.display = screen === 'setup' ? 'flex' : 'none';
  $('searchSection').style.display = screen === 'search' || screen === 'results' ? 'block' : 'none';
  $('resultsSection').style.display = screen === 'results' ? 'block' : 'none';
  $('emptyState').style.display = screen === 'empty' ? 'block' : 'none';
  $('errorState').style.display = screen === 'error' ? 'block' : 'none';
}


// ============ Theme ============
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEYS.THEME, next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = $('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ============ Search ============
async function handleSearch() {
  const code = $('searchInput').value.trim().toUpperCase();
  if (!code) {
    showToast('Vui lòng nhập mã CTV', 'warning');
    $('searchInput').focus();
    return;
  }

  if (state.isLoading) return;
  state.isLoading = true;
  setSearchLoading(true);

  try {
    // Fetch data if not cached or cache expired
    if (state.rawData.length === 0 || isCacheExpired()) {
      await fetchSheetData();
    }

    // Filter by employee code
    const employeeData = state.rawData.filter(
      (row) => row[COL.code]?.toUpperCase() === code
    );

    if (employeeData.length === 0) {
      showScreen('search');
      $('emptyState').style.display = 'block';
      $('emptyStateDesc').textContent = `Không tìm thấy dữ liệu cho mã CTV "${code}". Vui lòng kiểm tra lại mã hoặc liên hệ quản lý.`;
      showToast(`Không tìm thấy mã CTV: ${code}`, 'warning');
    } else {
      state.employeeData = employeeData;
      state.currentEmployee = {
        code: employeeData[0][COL.code],
        name: employeeData[0][COL.name],
        department: employeeData[0][COL.department],
        team: employeeData[0][COL.team],
        location: employeeData[0][COL.location],
        type: employeeData[0][COL.type],
        gender: employeeData[0][COL.gender],
        vendor: employeeData[0][COL.vendor],
      };

      // Auto-detect the latest month with data
      autoSelectMonth(employeeData);

      // Save to recent searches
      addRecentSearch(code);
      localStorage.setItem(STORAGE_KEYS.LAST_CODE, code);

      // Render everything
      showScreen('results');
      renderProfile();
      renderMonthLabel();
      renderStats();
      renderCalendar();
      renderDetailTable();

      showToast(`Đã tìm thấy ${employeeData.length} bản ghi cho ${state.currentEmployee.name}`, 'success');
    }
  } catch (error) {
    console.error('Search error:', error);
    showScreen('search');
    $('errorState').style.display = 'block';
    $('errorMessage').textContent = `Lỗi: ${error.message}. Vui lòng liên hệ quản trị viên để được hỗ trợ.`;
    showToast('Lỗi khi tải dữ liệu', 'error');
  } finally {
    state.isLoading = false;
    setSearchLoading(false);
  }
}

function setSearchLoading(loading) {
  const btn = $('searchBtn');
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ============ Fetch & Parse Google Sheets ============
async function fetchSheetData() {
  const csvUrl = convertToCSVUrl(state.sheetUrl);
  
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Không thể tải dữ liệu (HTTP ${response.status}). Hãy chắc chắn Google Sheets đã được "Publish to web".`);
  }

  const csvText = await response.text();
  state.rawData = parseCSV(csvText);
  state.lastFetchTime = new Date();

  if (state.rawData.length === 0) {
    throw new Error('Không có dữ liệu trong Google Sheets. Hãy kiểm tra lại link.');
  }

  updateDataStatus();
}

function convertToCSVUrl(url) {
  // Already a CSV export URL
  if (url.includes('/pub?') && url.includes('output=csv')) {
    return url;
  }
  if (url.includes('/export?') && url.includes('format=csv')) {
    return url;
  }

  // Extract spreadsheet ID from various URL formats
  let spreadsheetId = '';

  // Format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/...
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    spreadsheetId = match[1];
  }

  if (!spreadsheetId) {
    // Maybe user pasted just the ID
    if (/^[a-zA-Z0-9-_]{20,}$/.test(url.trim())) {
      spreadsheetId = url.trim();
    }
  }

  if (!spreadsheetId) {
    throw new Error('Không nhận diện được link Google Sheets. Hãy dán link đầy đủ hoặc link đã Publish to web.');
  }

  // Extract gid if present
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

function parseCSV(csvText) {
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || '').trim();
    }

    // Only add rows that have a valid employee code
    if (row[COL.code]) {
      data.push(row);
    }
  }

  return data;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

// ============ Auto-select Month ============
function autoSelectMonth(data) {
  // Find the latest date in the data
  let latestDate = null;

  data.forEach((row) => {
    const dateStr = row[COL.date];
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d) && (!latestDate || d > latestDate)) {
        latestDate = d;
      }
    }
  });

  if (latestDate) {
    state.currentMonth = latestDate.getMonth();
    state.currentYear = latestDate.getFullYear();
  }
}

// ============ Render Profile ============
function renderProfile() {
  const emp = state.currentEmployee;
  if (!emp) return;

  // Avatar - first character of name
  const nameParts = emp.name.split(' ');
  const initials = nameParts.length >= 2
    ? nameParts[nameParts.length - 2][0] + nameParts[nameParts.length - 1][0]
    : emp.name.substring(0, 2);
  $('profileAvatar').textContent = initials.toUpperCase();

  $('profileName').textContent = emp.name;
  $('profileCode').textContent = `Mã CTV: ${emp.code}`;

  const meta = $('profileMeta');
  meta.innerHTML = '';

  const metaItems = [
    { icon: '🏢', text: emp.department || 'N/A' },
    { icon: '👥', text: emp.team || 'N/A' },
    { icon: '📍', text: emp.location || 'N/A' },
    { icon: '🏷️', text: emp.type || 'N/A' },
    { icon: '🏭', text: emp.vendor || 'N/A' },
  ];

  metaItems.forEach(({ icon, text }) => {
    if (text && text !== 'N/A') {
      const item = document.createElement('div');
      item.className = 'profile-card__meta-item';
      item.innerHTML = `<span class="icon">${icon}</span> ${text}`;
      meta.appendChild(item);
    }
  });
}

// ============ Month Navigation ============
function changeMonth(delta) {
  state.currentMonth += delta;
  if (state.currentMonth < 0) {
    state.currentMonth = 11;
    state.currentYear--;
  } else if (state.currentMonth > 11) {
    state.currentMonth = 0;
    state.currentYear++;
  }

  renderMonthLabel();
  renderStats();
  renderCalendar();
  renderDetailTable();
}

function renderMonthLabel() {
  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
    'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
    'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ];
  $('monthLabel').textContent = `${monthNames[state.currentMonth]} ${state.currentYear}`;
}

// ============ Render Stats ============
function renderStats() {
  const monthData = getMonthData();

  // Days worked
  const daysWorked = monthData.length;
  $('statDaysWorked').textContent = daysWorked;

  // Total hours
  let totalHours = 0;
  monthData.forEach((row) => {
    const hours = parseFloat(row[COL.totalWorkHours]) || 0;
    totalHours += hours;
  });
  $('statTotalHours').textContent = totalHours > 0 ? `${totalHours.toFixed(1)}h` : '0h';

  // Claims needed
  const claims = monthData.filter(
    (row) => row[COL.claimStatus] && row[COL.claimStatus].toLowerCase().includes('claim')
  ).length;
  $('statClaims').textContent = claims;

  // Attendance rate (working days in month excluding weekends)
  const workingDays = getWorkingDaysInMonth(state.currentYear, state.currentMonth);
  const today = new Date();
  const isCurrentMonth = state.currentYear === today.getFullYear() && state.currentMonth === today.getMonth();
  const effectiveDays = isCurrentMonth
    ? getWorkingDaysUntilToday(state.currentYear, state.currentMonth)
    : workingDays;

  const rate = effectiveDays > 0 ? Math.round((daysWorked / effectiveDays) * 100) : 0;
  $('statAttendance').textContent = `${Math.min(rate, 100)}%`;
}

function getMonthData() {
  return state.employeeData.filter((row) => {
    const dateStr = row[COL.date];
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() === state.currentMonth && d.getFullYear() === state.currentYear;
  });
}

function getWorkingDaysInMonth(year, month) {
  let count = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d).getDay();
    if (day !== 0) count++; // Skip Sunday only (Saturday may be working)
  }
  return count;
}

function getWorkingDaysUntilToday(year, month) {
  let count = 0;
  const today = new Date();
  const maxDay = Math.min(today.getDate(), new Date(year, month + 1, 0).getDate());
  for (let d = 1; d <= maxDay; d++) {
    const day = new Date(year, month, d).getDay();
    if (day !== 0) count++;
  }
  return count;
}

// ============ Render Calendar ============
function renderCalendar() {
  const body = $('calendarBody');
  body.innerHTML = '';

  const year = state.currentYear;
  const month = state.currentMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  
  // Adjust to Monday-start (0=Mon, 6=Sun)
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Build a map of dates with data
  const dateMap = {};
  state.employeeData.forEach((row) => {
    const dateStr = row[COL.date];
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (d.getMonth() === month && d.getFullYear() === year) {
      const key = String(d.getDate());
      if (!dateMap[key]) dateMap[key] = [];
      dateMap[key].push(row);
    }
  });

  // Empty cells for offset
  for (let i = 0; i < startOffset; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar__cell calendar__cell--empty';
    body.appendChild(cell);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    cell.className = 'calendar__cell';

    const dateObj = new Date(year, month, d);
    const dayOfWeek = dateObj.getDay();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isFuture = dateObj > today;

    // Check if this date has data
    const dayData = dateMap[String(d)];

    if (dateStr === todayStr) {
      cell.classList.add('calendar__cell--today');
    }

    if (dayOfWeek === 0) {
      cell.classList.add('calendar__cell--weekend');
    }

    if (isFuture) {
      cell.classList.add('calendar__cell--future');
    }

    if (dayData && dayData.length > 0) {
      // Check claim status
      const hasClaim = dayData.some(
        (row) => row[COL.claimStatus] && row[COL.claimStatus].toLowerCase().includes('claim')
      );

      if (hasClaim) {
        cell.classList.add('calendar__cell--claim');
      } else {
        cell.classList.add('calendar__cell--worked');
      }

      // Add dot indicator
      const dot = document.createElement('div');
      dot.className = 'calendar__cell-dot';
      cell.appendChild(document.createTextNode(d));
      cell.appendChild(dot);

      // Click handler
      cell.addEventListener('click', () => showDayDetail(d, dayData));
    } else {
      cell.textContent = d;
      if (!isFuture && dayOfWeek !== 0) {
        cell.classList.add('calendar__cell--absent');
      }
    }

    body.appendChild(cell);
  }
}

// ============ Day Detail Popup ============
function showDayDetail(day, dayData) {
  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
    'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
    'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ];

  $('dayDetailTitle').textContent = `Ngày ${day} ${monthNames[state.currentMonth]} ${state.currentYear}`;

  const content = $('dayDetailContent');
  content.innerHTML = '';

  dayData.forEach((row) => {
    const fields = [
      { label: 'Ca chấm công', value: row[COL.shift] },
      { label: 'Giờ vào thực tế', value: formatTime(row[COL.actualIn]) },
      { label: 'Giờ ra thực tế', value: formatTime(row[COL.actualOut]) },
      { label: 'Giờ vào tính công', value: formatTime(row[COL.calcIn]) },
      { label: 'Giờ ra tính công', value: formatTime(row[COL.calcOut]) },
      { label: 'Tổng giờ làm việc', value: row[COL.totalWorkHours] || '0' },
      { label: 'Hình thức', value: row[COL.attendanceMethod] },
      { label: 'Claim công', value: row[COL.claimStatus] },
      { label: 'CI-CO', value: row[COL.cicoStatus] },
      { label: 'Workstation', value: row[COL.workstation] },
    ];

    fields.forEach(({ label, value }) => {
      if (!value) return;
      const rowEl = document.createElement('div');
      rowEl.className = 'day-detail__row';

      const labelEl = document.createElement('span');
      labelEl.className = 'day-detail__label';
      labelEl.textContent = label;

      const valueEl = document.createElement('span');
      valueEl.className = 'day-detail__value';

      // Color-code certain values
      if (label === 'Claim công' && value.toLowerCase().includes('claim')) {
        valueEl.innerHTML = `<span class="badge badge--warning">${value}</span>`;
      } else if (label === 'CI-CO' && value.includes('Đủ')) {
        valueEl.innerHTML = `<span class="badge badge--success">${value}</span>`;
      } else if (label === 'CI-CO' && value.includes('Thiếu')) {
        valueEl.innerHTML = `<span class="badge badge--danger">${value}</span>`;
      } else {
        valueEl.textContent = value;
      }

      rowEl.appendChild(labelEl);
      rowEl.appendChild(valueEl);
      content.appendChild(rowEl);
    });
  });

  $('dayDetailPopup').classList.add('active');
  $('dayDetailOverlay').classList.add('active');
}

function closeDayDetail() {
  $('dayDetailPopup').classList.remove('active');
  $('dayDetailOverlay').classList.remove('active');
}

// ============ Render Detail Table ============
function renderDetailTable() {
  const tbody = $('detailTableBody');
  tbody.innerHTML = '';

  const monthData = getMonthData();

  // Sort by date descending (newest first)
  monthData.sort((a, b) => {
    const dateA = new Date(a[COL.date]);
    const dateB = new Date(b[COL.date]);
    return dateB - dateA;
  });

  if (monthData.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" style="text-align: center; color: var(--text-tertiary); padding: 32px;">Không có dữ liệu trong tháng này</td>`;
    tbody.appendChild(tr);
    return;
  }

  monthData.forEach((row) => {
    const tr = document.createElement('tr');

    // Date
    const dateStr = row[COL.date];
    const d = new Date(dateStr);
    const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

    // Day of week
    const dayName = row[COL.dayOfWeek] || getDayName(d.getDay());

    // Time in/out
    const timeIn = formatTime(row[COL.actualIn]);
    const timeOut = formatTime(row[COL.actualOut]);

    // Total hours
    const totalHours = row[COL.totalWorkHours] || '0';

    // Shift
    const shift = row[COL.shift] || '-';

    // Status badge
    let statusBadge = '';
    const claimStatus = row[COL.claimStatus] || '';
    const cicoStatus = row[COL.cicoStatus] || '';

    if (claimStatus.toLowerCase().includes('claim')) {
      statusBadge = `<span class="badge badge--warning">Cần claim</span>`;
    } else if (cicoStatus.includes('Đủ')) {
      statusBadge = `<span class="badge badge--success">Đủ CI-CO</span>`;
    } else if (cicoStatus.includes('Thiếu')) {
      statusBadge = `<span class="badge badge--danger">Thiếu CI-CO</span>`;
    } else {
      statusBadge = `<span class="badge badge--info">OK</span>`;
    }

    tr.innerHTML = `
      <td>${formattedDate}</td>
      <td>${dayName}</td>
      <td>${timeIn}</td>
      <td>${timeOut}</td>
      <td>${totalHours}h</td>
      <td>${shift}</td>
      <td>${statusBadge}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ============ Recent Searches ============
function addRecentSearch(code) {
  state.recentSearches = state.recentSearches.filter((c) => c !== code);
  state.recentSearches.unshift(code);
  state.recentSearches = state.recentSearches.slice(0, 5);
  localStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(state.recentSearches));
  renderRecentSearches();
}

function renderRecentSearches() {
  const container = $('recentSearches');
  if (!container) return;

  if (state.recentSearches.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  
  // Remove old tags but keep label
  const tags = container.querySelectorAll('.recent-tag');
  tags.forEach((t) => t.remove());

  state.recentSearches.forEach((code) => {
    const tag = document.createElement('button');
    tag.className = 'recent-tag';
    tag.textContent = code;
    tag.onclick = () => {
      $('searchInput').value = code;
      handleSearch();
    };
    container.appendChild(tag);
  });
}

// ============ Helpers ============
function formatTime(datetimeStr) {
  if (!datetimeStr) return '-';
  
  // Handle "2026-06-06 17:55:48" format
  const parts = datetimeStr.split(' ');
  if (parts.length >= 2) {
    const timeParts = parts[1].split(':');
    if (timeParts.length >= 2) {
      return `${timeParts[0]}:${timeParts[1]}`;
    }
  }

  // Handle time-only format "17:55"
  if (datetimeStr.includes(':') && !datetimeStr.includes('-')) {
    return datetimeStr;
  }

  return datetimeStr;
}

function getDayName(dayIndex) {
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return days[dayIndex] || '';
}

// ============ Toast Notifications ============
function showToast(message, type = 'success') {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  toast.innerHTML = `
    <span class="toast__icon">${icons[type] || '📢'}</span>
    <span class="toast__message">${message}</span>
  `;

  container.appendChild(toast);

  // Auto-remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============ Force Refresh Data ============
async function refreshData() {
  const btn = $('refreshBtn');
  if (btn) btn.classList.add('spinning');

  state.rawData = [];
  state.lastFetchTime = null;

  const code = $('searchInput')?.value.trim();
  if (code) {
    await handleSearch();
  } else {
    try {
      await fetchSheetData();
      showToast('Dữ liệu đã được làm mới!', 'success');
    } catch (e) {
      showToast('Lỗi khi làm mới dữ liệu', 'error');
    }
  }

  if (btn) btn.classList.remove('spinning');
}

// Silent refresh (no loading indicator, no toast)
async function silentRefresh() {
  if (state.isLoading || !state.sheetUrl) return;

  try {
    const csvUrl = convertToCSVUrl(state.sheetUrl);
    const response = await fetch(csvUrl);
    if (!response.ok) return;

    const csvText = await response.text();
    const newData = parseCSV(csvText);
    if (newData.length === 0) return;

    state.rawData = newData;
    state.lastFetchTime = new Date();
    updateDataStatus();

    // If employee is currently displayed, re-render with fresh data
    if (state.currentEmployee) {
      const code = state.currentEmployee.code;
      state.employeeData = state.rawData.filter(
        (row) => row[COL.code]?.toUpperCase() === code.toUpperCase()
      );
      if (state.employeeData.length > 0) {
        renderStats();
        renderCalendar();
        renderDetailTable();
      }
    }
  } catch {
    // Silent fail
  }
}

function isCacheExpired() {
  if (!state.lastFetchTime) return true;
  return (new Date() - state.lastFetchTime) > CACHE_DURATION_MS;
}

function updateDataStatus() {
  const statusEl = $('dataStatus');
  const textEl = $('dataStatusText');
  if (!statusEl || !textEl) return;

  statusEl.style.display = 'flex';

  const now = state.lastFetchTime;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  textEl.textContent = `Dữ liệu cập nhật lúc ${timeStr} · ${state.rawData.length} bản ghi`;
}

// ============ Announcement ============
function loadAnnouncement() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENT);
    if (!raw) return;

    const announcement = JSON.parse(raw);
    if (!announcement || !announcement.message) return;

    // Check if user dismissed this specific announcement
    const dismissedId = sessionStorage.getItem('dismissed_announcement');
    if (dismissedId === announcement.timestamp) return;

    // Check if announcement is not too old (max 30 days)
    const postedDate = new Date(announcement.timestamp);
    const now = new Date();
    const daysDiff = (now - postedDate) / (1000 * 60 * 60 * 24);
    if (daysDiff > 30) return;

    renderAnnouncement(announcement);
  } catch {
    // Ignore invalid data
  }
}

function renderAnnouncement(announcement) {
  const banner = $('announcementBanner');
  if (!banner) return;

  $('announcementIcon').textContent = announcement.icon || '📢';
  $('announcementTitle').textContent = announcement.title || 'Thông báo';
  $('announcementMessage').textContent = announcement.message;

  // Format time
  const postedDate = new Date(announcement.timestamp);
  const timeAgo = getTimeAgo(postedDate);
  $('announcementTime').textContent = timeAgo;

  banner.style.display = 'block';

  // Close button
  $('announcementClose').onclick = () => {
    banner.style.display = 'none';
    sessionStorage.setItem('dismissed_announcement', announcement.timestamp);
  };
}

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return `${diffDays} ngày trước`;

  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}
