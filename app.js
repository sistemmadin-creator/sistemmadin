/**
 * ============================================================================
 * SISTEM PENILAIAN TAHFIDZ SANTRI - MAIN APPLICATION LOGIC (app.js)
 * ============================================================================
 */

// 1. KONFIGURASI SUPABASE CLIENT
// Ganti kedua nilai di bawah ini dengan Project URL dan Anon Key dari Dashboard Supabase Anda
const SUPABASE_URL = 'https://xttudwxkmjezzivzjflz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_MMLU3qDbmLbXjRFV1eic6Q_wta0Yd47';

const KKM_THRESHOLD = 85.0;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. KONFIGURASI PEMETAAN TINGKAT & TAHAP JUZ
const KONFIGURASI_TAHAP = {
    '15 Juz': {
        1: { label: 'Juz 1 - 5', juzList: [1, 2, 3, 4, 5] },
        2: { label: 'Juz 6 - 10', juzList: [6, 7, 8, 9, 10] },
        3: { label: 'Juz 11 - 15', juzList: [11, 12, 13, 14, 15] }
    },
    '30 Juz': {
        1: { label: 'Juz 16 - 20', juzList: [16, 17, 18, 19, 20] },
        2: { label: 'Juz 21 - 25', juzList: [21, 22, 23, 24, 25] },
        3: { label: 'Juz 26 - 30', juzList: [26, 27, 28, 29, 30] }
    }
};

// 3. STATE GLOBAL APLIKASI
const appState = {
    activeMenu: 'santri',      // 'santri' | '15 Juz' | '30 Juz'
    activeTingkat: '15 Juz',   // '15 Juz' | '30 Juz'
    activeMode: 'tes',         // 'tes' | 'rekap'
    activeTes: 1,              // 1 s/d 10
    activeTahap: 1,            // 1, 2, atau 3
    santriList: [],            // Seluruh data santri dari tabel santri
    nilaiMap: {},              // Map: santri_id -> record nilai_log untuk tes & tahap aktif
    rekapLogs: []              // Seluruh data nilai_log untuk tingkat aktif (Tes 1 s/d 10)
};

// Instance Modal Bootstrap
let santriModalInstance = null;
let nilaiModalInstance = null;

// ============================================================================
// INISIALISASI SAAT HALAMAN DIMUAT
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    santriModalInstance = new bootstrap.Modal(document.getElementById('santriModal'));
    nilaiModalInstance = new bootstrap.Modal(document.getElementById('nilaiModal'));

    if (SUPABASE_URL.includes('YOUR_PROJECT_ID') || SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')) {
        Swal.fire({
            icon: 'warning',
            title: 'Kredensial Supabase Belum Diatur',
            html: 'Silakan buka file <code>app.js</code> dan ganti <b>SUPABASE_URL</b> serta <b>SUPABASE_ANON_KEY</b> dengan kredensial proyek Supabase Anda.',
            confirmButtonColor: '#0f766e'
        });
        return;
    }

    await fetchAllSantri();
});

// ============================================================================
// UTILITAS UI (LOADING SPINNER & NOTIFIKASI)
// ============================================================================
function showLoading(message = 'Memuat data...') {
    document.getElementById('loadingText').textContent = message;
    document.getElementById('loadingOverlay').classList.remove('d-none');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('d-none');
}

function showToast(icon, title) {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: icon,
        title: title,
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================================
// NAVIGASI ANTAR MENU UTAMA
// ============================================================================
async function switchMainMenu(menu) {
    appState.activeMenu = menu;

    // Update tombol aktif di Navbar
    document.getElementById('nav-santri').classList.toggle('active', menu === 'santri');
    document.getElementById('nav-15juz').classList.toggle('active', menu === '15 Juz');
    document.getElementById('nav-30juz').classList.toggle('active', menu === '30 Juz');

    const viewSantri = document.getElementById('view-santri');
    const viewPenilaian = document.getElementById('view-penilaian');

    if (menu === 'santri') {
        viewPenilaian.classList.add('d-none');
        viewSantri.classList.remove('d-none');
        await fetchAllSantri();
    } else {
        viewSantri.classList.add('d-none');
        viewPenilaian.classList.remove('d-none');

        appState.activeTingkat = menu;
        appState.activeTahap = 1;
        appState.activeMode = 'tes';
        appState.activeTes = 1;

        setupPenilaianHeaderAndControls();
        await loadNilaiPerTahapDanTes();
    }
}

// ============================================================================
// MODUL 1: CRUD DATABASE SANTRI
// ============================================================================
async function fetchAllSantri() {
    showLoading('Mengambil database santri...');
    try {
        const { data, error } = await supabaseClient
            .from('santri')
            .select('*')
            .order('nama', { ascending: true });

        if (error) throw error;

        appState.santriList = data || [];
        updateSantriStatistics();
        renderSantriTable();
    } catch (err) {
        Swal.fire('Gagal Memuat Data Santri', err.message, 'error');
    } finally {
        hideLoading();
    }
}

function updateSantriStatistics() {
    const total = appState.santriList.length;
    const count15 = appState.santriList.filter(s => s.tingkat === '15 Juz').length;
    const count30 = appState.santriList.filter(s => s.tingkat === '30 Juz').length;

    document.getElementById('stat-total-santri').textContent = total;
    document.getElementById('stat-15juz-santri').textContent = count15;
    document.getElementById('stat-30juz-santri').textContent = count30;
}

function renderSantriTable() {
    const keyword = document.getElementById('searchSantriInput').value.trim().toLowerCase();
    const kategoriFilter = document.getElementById('filterKategoriSantri').value;
    const tbody = document.getElementById('santriTableBody');

    const filtered = appState.santriList.filter(santri => {
        const matchKeyword = santri.nama.toLowerCase().includes(keyword) ||
                             santri.asrama.toLowerCase().includes(keyword);
        const matchKategori = kategoriFilter === 'ALL' || santri.tingkat === kategoriFilter;
        return matchKeyword && matchKategori;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5 text-muted">
                    <i class="fa-solid fa-folder-open fa-2x mb-2 d-block opacity-50"></i>
                    Tidak ada data santri yang sesuai dengan pencarian.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map((santri, idx) => {
        const badgeClass = santri.tingkat === '15 Juz'
            ? 'bg-primary-subtle text-primary border border-primary-subtle'
            : 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';

        return `
            <tr>
                <td class="text-center fw-semibold text-muted">${idx + 1}</td>
                <td class="fw-semibold text-dark">${escapeHtml(santri.nama)}</td>
                <td>
                    <span class="badge bg-light text-secondary border">
                        <i class="fa-solid fa-building-user me-1"></i>${escapeHtml(santri.asrama)}
                    </span>
                </td>
                <td class="text-center">
                    <span class="badge ${badgeClass} px-3 py-2">${escapeHtml(santri.tingkat)}</span>
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-primary me-1" title="Edit Santri" onclick="openSantriModal('${santri.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" title="Hapus Santri" onclick="handleDeleteSantri('${santri.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function openSantriModal(santriId = null) {
    const form = document.getElementById('santriForm');
    form.reset();

    if (santriId) {
        const santri = appState.santriList.find(s => s.id === santriId);
        if (!santri) return;

        document.getElementById('santriModalTitle').innerHTML = '<i class="fa-solid fa-user-pen me-2"></i>Edit Data Santri';
        document.getElementById('santriIdInput').value = santri.id;
        document.getElementById('santriNamaInput').value = santri.nama;
        document.getElementById('santriAsramaInput').value = santri.asrama;
        document.getElementById('santriTingkatInput').value = santri.tingkat;
    } else {
        document.getElementById('santriModalTitle').innerHTML = '<i class="fa-solid fa-user-plus me-2"></i>Tambah Data Santri';
        document.getElementById('santriIdInput').value = '';
        document.getElementById('santriTingkatInput').value = '15 Juz';
    }

    santriModalInstance.show();
}

async function handleSaveSantri(event) {
    event.preventDefault();

    const id = document.getElementById('santriIdInput').value.trim();
    const nama = document.getElementById('santriNamaInput').value.trim();
    const asrama = document.getElementById('santriAsramaInput').value.trim();
    const tingkat = document.getElementById('santriTingkatInput').value;

    if (!nama || !asrama) {
        Swal.fire('Validasi Gagal', 'Nama lengkap dan asrama wajib diisi.', 'warning');
        return;
    }

    showLoading('Menyimpan data santri...');
    try {
        if (id) {
            const { error } = await supabaseClient
                .from('santri')
                .update({ nama, asrama, tingkat })
                .eq('id', id);
            if (error) throw error;
            showToast('success', 'Data santri berhasil diperbarui');
        } else {
            const { error } = await supabaseClient
                .from('santri')
                .insert([{ nama, asrama, tingkat }]);
            if (error) throw error;
            showToast('success', 'Santri baru berhasil ditambahkan');
        }

        santriModalInstance.hide();
        await fetchAllSantri();
    } catch (err) {
        Swal.fire('Gagal Menyimpan Data', err.message, 'error');
    } finally {
        hideLoading();
    }
}

async function handleDeleteSantri(santriId) {
    const santri = appState.santriList.find(s => s.id === santriId);
    if (!santri) return;

    const confirmResult = await Swal.fire({
        icon: 'warning',
        title: 'Hapus Data Santri?',
        html: `Anda yakin ingin menghapus <b>${escapeHtml(santri.nama)}</b>?<br><small class="text-danger">Seluruh riwayat nilai santri ini juga akan terhapus secara permanen.</small>`,
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (!confirmResult.isConfirmed) return;

    showLoading('Menghapus data santri...');
    try {
        const { error } = await supabaseClient
            .from('santri')
            .delete()
            .eq('id', santriId);

        if (error) throw error;

        showToast('success', 'Data santri berhasil dihapus');
        await fetchAllSantri();
    } catch (err) {
        Swal.fire('Gagal Menghapus', err.message, 'error');
    } finally {
        hideLoading();
    }
}

// ============================================================================
// MODUL 2: PENILAIAN TINGKAT 15 JUZ & 30 JUZ (TES 1-10)
// ============================================================================
function setupPenilaianHeaderAndControls() {
    const tingkat = appState.activeTingkat;
    const santriCount = appState.santriList.filter(s => s.tingkat === tingkat).length;

    document.getElementById('penilaianTitle').textContent = `Penilaian Tahfidz Tingkat ${tingkat}`;
    document.getElementById('penilaianCountSantri').textContent = `${santriCount} Santri`;

    // Render Tombol Pilihan Tes 1 - 10 & Rekap Tahunan
    renderTestSelectorButtons();

    // Render Sub-Tab Tahap 1, 2, 3
    renderTahapTabs();

    // Siapkan opsi dropdown di tab Rekap Tahunan
    const tahapConfig = KONFIGURASI_TAHAP[tingkat];
    const rekapSelect = document.getElementById('rekapTahapFilter');
    rekapSelect.innerHTML = `
        <option value="ALL">Gabungan Seluruh Tahap (Tahap 1 - 3)</option>
        <option value="1">Tahap 1 (${tahapConfig[1].label})</option>
        <option value="2">Tahap 2 (${tahapConfig[2].label})</option>
        <option value="3">Tahap 3 (${tahapConfig[3].label})</option>
    `;
}

function renderTestSelectorButtons() {
    const container = document.getElementById('testSelectorContainer');
    let html = '';

    for (let i = 1; i <= 10; i++) {
        const isActive = appState.activeMode === 'tes' && appState.activeTes === i;
        const btnClass = isActive ? 'btn-emerald fw-bold shadow-sm' : 'btn-outline-secondary';
        html += `
            <button type="button" class="btn btn-sm ${btnClass} px-3" onclick="selectPeriodeTes(${i})">
                Tes ${i}
            </button>
        `;
    }

    const isRekapActive = appState.activeMode === 'rekap';
    const rekapBtnClass = isRekapActive ? 'btn-warning text-dark fw-bold shadow-sm' : 'btn-outline-warning text-dark';
    html += `
        <button type="button" class="btn btn-sm ${rekapBtnClass} px-3 ms-auto" onclick="selectModeRekap()">
            <i class="fa-solid fa-table-list me-1"></i>Rekap Tahunan (Tes 1-10)
        </button>
    `;

    container.innerHTML = html;

    // Update badge status periode aktif
    const badge = document.getElementById('activePeriodBadge');
    if (appState.activeMode === 'tes') {
        const tahapLabel = KONFIGURASI_TAHAP[appState.activeTingkat][appState.activeTahap].label;
        badge.textContent = `Aktif: Tes ${appState.activeTes} • Tahap ${appState.activeTahap} (${tahapLabel})`;
    } else {
        badge.textContent = `Aktif: Rekapitulasi Tahunan (Tes 1 s/d Tes 10)`;
    }
}

function renderTahapTabs() {
    const container = document.getElementById('tahapTabsContainer');
    const tahapConfig = KONFIGURASI_TAHAP[appState.activeTingkat];

    container.innerHTML = [1, 2, 3].map(tahapNum => {
        const isActive = appState.activeTahap === tahapNum ? 'active' : '';
        return `
            <li class="nav-item">
                <button class="nav-link ${isActive}" onclick="selectTahap(${tahapNum})">
                    <i class="fa-solid fa-bookmark me-1"></i>Tahap ${tahapNum}: <strong>${tahapConfig[tahapNum].label}</strong>
                </button>
            </li>
        `;
    }).join('');
}

async function selectPeriodeTes(tesKe) {
    appState.activeMode = 'tes';
    appState.activeTes = tesKe;

    document.getElementById('subview-rekap-tahunan').classList.add('d-none');
    document.getElementById('subview-tes-harian').classList.remove('d-none');

    renderTestSelectorButtons();
    await loadNilaiPerTahapDanTes();
}

async function selectTahap(tahapKe) {
    appState.activeTahap = tahapKe;
    renderTahapTabs();
    renderTestSelectorButtons();
    await loadNilaiPerTahapDanTes();
}

async function loadNilaiPerTahapDanTes() {
    showLoading(`Memuat nilai ${appState.activeTingkat} - Tahap ${appState.activeTahap} (Tes ${appState.activeTes})...`);
    try {
        // Pastikan daftar santri selalu sinkron
        const { data: santriData, error: santriErr } = await supabaseClient
            .from('santri')
            .select('*')
            .eq('tingkat', appState.activeTingkat)
            .order('nama', { ascending: true });

        if (santriErr) throw santriErr;

        // Update subset santri tingkat terkait di state
        const otherSantri = appState.santriList.filter(s => s.tingkat !== appState.activeTingkat);
        appState.santriList = [...otherSantri, ...(santriData || [])];
        document.getElementById('penilaianCountSantri').textContent = `${(santriData || []).length} Santri`;

        // Ambil log nilai sesuai tingkat, tahap, dan tes_ke
        const { data: nilaiData, error: nilaiErr } = await supabaseClient
            .from('nilai_log')
            .select('*')
            .eq('tingkat', appState.activeTingkat)
            .eq('tahap', appState.activeTahap)
            .eq('tes_ke', appState.activeTes);

        if (nilaiErr) throw nilaiErr;

        // Petakan berdasarkan santri_id untuk akses O(1)
        appState.nilaiMap = {};
        (nilaiData || []).forEach(row => {
            appState.nilaiMap[row.santri_id] = row;
        });

        renderNilaiTable();
    } catch (err) {
        Swal.fire('Gagal Memuat Nilai', err.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderNilaiTable() {
    const tingkat = appState.activeTingkat;
    const tahap = appState.activeTahap;
    const juzList = KONFIGURASI_TAHAP[tingkat][tahap].juzList;

    // 1. Render Header Tabel dengan Nomor Juz Dinamis
    const thead = document.getElementById('nilaiTableHead');
    thead.innerHTML = `
        <tr>
            <th style="width: 55px;">No</th>
            <th class="text-start" style="min-width: 200px;">Nama Santri</th>
            <th style="min-width: 140px;">Asrama</th>
            <th>Juz ${juzList[0]}</th>
            <th>Juz ${juzList[1]}</th>
            <th>Juz ${juzList[2]}</th>
            <th>Juz ${juzList[3]}</th>
            <th>Juz ${juzList[4]}</th>
            <th class="bg-light-emerald">Rata-rata</th>
            <th style="min-width: 150px;">Status KKM</th>
            <th style="width: 140px;">Aksi</th>
        </tr>
    `;

    // 2. Filter Santri berdasarkan Tingkat Aktif & Pencarian
    const keyword = document.getElementById('searchNilaiInput').value.trim().toLowerCase();
    const santriTingkat = appState.santriList
        .filter(s => s.tingkat === tingkat)
        .filter(s => s.nama.toLowerCase().includes(keyword) || s.asrama.toLowerCase().includes(keyword))
        .sort((a, b) => a.nama.localeCompare(b.nama));

    const tbody = document.getElementById('nilaiTableBody');

    if (santriTingkat.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center py-5 text-muted">
                    <i class="fa-solid fa-user-slash fa-2x mb-2 d-block opacity-50"></i>
                    Belum ada santri pada kategori <strong>${tingkat}</strong> atau pencarian tidak ditemukan.
                </td>
            </tr>
        `;
        return;
    }

    // 3. Render Baris Nilai per Santri
    tbody.innerHTML = santriTingkat.map((santri, idx) => {
        const log = appState.nilaiMap[santri.id];

        if (!log) {
            return `
                <tr>
                    <td class="text-center text-muted fw-semibold">${idx + 1}</td>
                    <td class="fw-semibold text-dark">${escapeHtml(santri.nama)}</td>
                    <td class="text-center"><span class="badge bg-light text-secondary border">${escapeHtml(santri.asrama)}</span></td>
                    <td class="text-center text-muted">-</td>
                    <td class="text-center text-muted">-</td>
                    <td class="text-center text-muted">-</td>
                    <td class="text-center text-muted">-</td>
                    <td class="text-center text-muted">-</td>
                    <td class="text-center fw-bold text-muted bg-light-emerald">-</td>
                    <td class="text-center">
                        <span class="badge bg-secondary-subtle text-secondary">Belum Dinilai</span>
                    </td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-emerald w-100" onclick="openNilaiModal('${santri.id}')">
                            <i class="fa-solid fa-plus-circle me-1"></i>Input Nilai
                        </button>
                    </td>
                </tr>
            `;
        }

        const rataRata = parseFloat(log.rata_rata || 0);
        const isLulus = rataRata >= KKM_THRESHOLD;
        const statusBadge = isLulus
            ? `<span class="badge bg-success px-3 py-2"><i class="fa-solid fa-check-circle me-1"></i>Tuntas / Lulus</span>`
            : `<span class="badge bg-danger px-3 py-2"><i class="fa-solid fa-triangle-exclamation me-1"></i>Belum Tuntas</span>`;

        return `
            <tr>
                <td class="text-center text-muted fw-semibold">${idx + 1}</td>
                <td class="fw-semibold text-dark">${escapeHtml(santri.nama)}</td>
                <td class="text-center"><span class="badge bg-light text-secondary border">${escapeHtml(santri.asrama)}</span></td>
                <td class="text-center fw-medium">${Number(log.nilai_juz_1).toFixed(0)}</td>
                <td class="text-center fw-medium">${Number(log.nilai_juz_2).toFixed(0)}</td>
                <td class="text-center fw-medium">${Number(log.nilai_juz_3).toFixed(0)}</td>
                <td class="text-center fw-medium">${Number(log.nilai_juz_4).toFixed(0)}</td>
                <td class="text-center fw-medium">${Number(log.nilai_juz_5).toFixed(0)}</td>
                <td class="text-center fw-bold ${isLulus ? 'text-success' : 'text-danger'} bg-light-emerald fs-6">
                    ${rataRata.toFixed(2)}
                </td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-emerald w-100 fw-semibold" onclick="openNilaiModal('${santri.id}')">
                        <i class="fa-solid fa-pen-to-square me-1"></i>Edit Nilai
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================================
// MODAL INPUT / EDIT NILAI & OPERASI UPSERT SUPABASE
// ============================================================================
function openNilaiModal(santriId) {
    const santri = appState.santriList.find(s => s.id === santriId);
    if (!santri) return;

    const tingkat = appState.activeTingkat;
    const tahap = appState.activeTahap;
    const tesKe = appState.activeTes;
    const tahapInfo = KONFIGURASI_TAHAP[tingkat][tahap];
    const existingLog = appState.nilaiMap[santriId];

    // Set metadata pada modal
    document.getElementById('nilaiSantriId').value = santri.id;
    document.getElementById('nilaiSantriNama').textContent = santri.nama;
    document.getElementById('nilaiSantriAsrama').textContent = santri.asrama;
    document.getElementById('nilaiModalSubtitle').textContent =
        `Tingkat ${tingkat} • Tahap ${tahap} (${tahapInfo.label}) • Periode Tes ${tesKe}`;

    // Set label dinamis Juz 1-5 sesuai tahap (misal Juz 16 s/d Juz 20)
    tahapInfo.juzList.forEach((nomorJuz, idx) => {
        const urutan = idx + 1;
        document.getElementById(`labelJuz${urutan}`).textContent = `Nilai Juz ${nomorJuz}`;
    });

    // Isi nilai jika sudah pernah diinput sebelumnya
    document.getElementById('inputJuz1').value = existingLog ? existingLog.nilai_juz_1 : '';
    document.getElementById('inputJuz2').value = existingLog ? existingLog.nilai_juz_2 : '';
    document.getElementById('inputJuz3').value = existingLog ? existingLog.nilai_juz_3 : '';
    document.getElementById('inputJuz4').value = existingLog ? existingLog.nilai_juz_4 : '';
    document.getElementById('inputJuz5').value = existingLog ? existingLog.nilai_juz_5 : '';

    calculateModalAverage();
    nilaiModalInstance.show();
}

function calculateModalAverage() {
    const vals = [1, 2, 3, 4, 5].map(i => {
        const raw = parseFloat(document.getElementById(`inputJuz${i}`).value);
        return isNaN(raw) ? 0 : raw;
    });

    const avg = vals.reduce((acc, curr) => acc + curr, 0) / 5.0;
    document.getElementById('previewRataRata').textContent = avg.toFixed(2);

    const statusContainer = document.getElementById('previewStatusKKM');
    if (avg >= KKM_THRESHOLD) {
        statusContainer.innerHTML = `
            <span class="badge bg-success fs-6 px-3 py-2">
                <i class="fa-solid fa-check-circle me-1"></i>Tuntas / Lulus Tahap
            </span>
        `;
    } else {
        statusContainer.innerHTML = `
            <span class="badge bg-danger fs-6 px-3 py-2">
                <i class="fa-solid fa-xmark-circle me-1"></i>Belum Tuntas
            </span>
        `;
    }
}

async function handleSaveNilai(event) {
    event.preventDefault();

    const santriId = document.getElementById('nilaiSantriId').value;
    const nilaiInputs = [1, 2, 3, 4, 5].map(i => parseFloat(document.getElementById(`inputJuz${i}`).value));

    // Validasi rentang nilai 0 - 100
    for (let i = 0; i < nilaiInputs.length; i++) {
        if (isNaN(nilaiInputs[i]) || nilaiInputs[i] < 0 || nilaiInputs[i] > 100) {
            Swal.fire('Nilai Tidak Valid', `Pastikan seluruh nilai berada pada rentang 0 hingga 100.`, 'warning');
            return;
        }
    }

    const rataRata = Number((nilaiInputs.reduce((a, b) => a + b, 0) / 5.0).toFixed(2));

    const payload = {
        santri_id: santriId,
        tingkat: appState.activeTingkat,
        tahap: appState.activeTahap,
        tes_ke: appState.activeTes,
        nilai_juz_1: nilaiInputs[0],
        nilai_juz_2: nilaiInputs[1],
        nilai_juz_3: nilaiInputs[2],
        nilai_juz_4: nilaiInputs[3],
        nilai_juz_5: nilaiInputs[4],
        rata_rata: rataRata
    };

    showLoading('Menyimpan nilai ke database...');
    try {
        // Operasi UPSERT berdasarkan Unique Constraint: (santri_id, tingkat, tahap, tes_ke)
        const { error } = await supabaseClient
            .from('nilai_log')
            .upsert(payload, {
                onConflict: 'santri_id,tingkat,tahap,tes_ke'
            });

        if (error) throw error;

        nilaiModalInstance.hide();
        showToast('success', 'Nilai santri berhasil disimpan');
        await loadNilaiPerTahapDanTes();
    } catch (err) {
        Swal.fire('Gagal Menyimpan Nilai', err.message, 'error');
    } finally {
        hideLoading();
    }
}

// ============================================================================
// MODUL 3: REKAPITULASI TAHUNAN (TES 1 S/D TES 10)
// ============================================================================
async function selectModeRekap() {
    appState.activeMode = 'rekap';

    document.getElementById('subview-tes-harian').classList.add('d-none');
    document.getElementById('subview-rekap-tahunan').classList.remove('d-none');

    renderTestSelectorButtons();
    await loadRekapTahunan();
}

async function loadRekapTahunan() {
    showLoading(`Menghitung rekapitulasi tahunan Tingkat ${appState.activeTingkat}...`);
    try {
        const { data, error } = await supabaseClient
            .from('nilai_log')
            .select('*')
            .eq('tingkat', appState.activeTingkat);

        if (error) throw error;

        appState.rekapLogs = data || [];
        renderRekapTable();
    } catch (err) {
        Swal.fire('Gagal Memuat Rekap Tahunan', err.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderRekapTable() {
    const tingkat = appState.activeTingkat;
    const tahapFilter = document.getElementById('rekapTahapFilter').value;
    const keyword = document.getElementById('searchRekapInput').value.trim().toLowerCase();
    const tbody = document.getElementById('rekapTableBody');

    const santriTingkat = appState.santriList
        .filter(s => s.tingkat === tingkat)
        .filter(s => s.nama.toLowerCase().includes(keyword) || s.asrama.toLowerCase().includes(keyword))
        .sort((a, b) => a.nama.localeCompare(b.nama));

    if (santriTingkat.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="15" class="text-center py-5 text-muted">
                    Tidak ada data santri untuk ditampilkan pada rekap tahunan.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = santriTingkat.map((santri, idx) => {
        // Filter log milik santri ini sesuai filter tahap (ALL atau Tahap 1/2/3)
        const logsSantri = appState.rekapLogs.filter(log => {
            const matchSantri = log.santri_id === santri.id;
            const matchTahap = tahapFilter === 'ALL' || String(log.tahap) === String(tahapFilter);
            return matchSantri && matchTahap;
        });

        let totalSemuaTes = 0;
        let jumlahTesTerisi = 0;
        let kolomTesHtml = '';

        // Kalkulasi nilai rata-rata untuk masing-masing Tes 1 s/d Tes 10
        for (let tes = 1; tes <= 10; tes++) {
            const logsPerTes = logsSantri.filter(l => l.tes_ke === tes);

            if (logsPerTes.length === 0) {
                kolomTesHtml += `<td class="text-center text-muted">-</td>`;
            } else {
                const avgTes = logsPerTes.reduce((sum, item) => sum + parseFloat(item.rata_rata), 0) / logsPerTes.length;
                totalSemuaTes += avgTes;
                jumlahTesTerisi++;

                const cellColor = avgTes >= KKM_THRESHOLD ? 'text-success fw-semibold' : 'text-danger fw-semibold';
                kolomTesHtml += `<td class="text-center ${cellColor}">${avgTes.toFixed(1)}</td>`;
            }
        }

        const rataRataAkhir = jumlahTesTerisi > 0 ? (totalSemuaTes / jumlahTesTerisi) : null;
        let rataAkhirHtml = `<span class="text-muted">-</span>`;
        let statusAkhirHtml = `<span class="badge bg-secondary-subtle text-secondary">Belum Ada Nilai</span>`;

        if (rataRataAkhir !== null) {
            const lulusAkhir = rataRataAkhir >= KKM_THRESHOLD;
            rataAkhirHtml = `<span class="fw-bold fs-6 ${lulusAkhir ? 'text-success' : 'text-danger'}">${rataRataAkhir.toFixed(2)}</span>`;
            statusAkhirHtml = lulusAkhir
                ? `<span class="badge bg-success px-3 py-2"><i class="fa-solid fa-medal me-1"></i>LULUS / TUNTAS</span>`
                : `<span class="badge bg-danger px-3 py-2"><i class="fa-solid fa-rotate-right me-1"></i>BELUM TUNTAS</span>`;
        }

        return `
            <tr>
                <td class="text-center text-muted fw-semibold">${idx + 1}</td>
                <td class="fw-semibold text-dark">${escapeHtml(santri.nama)}</td>
                <td class="text-center"><span class="badge bg-light text-secondary border">${escapeHtml(santri.asrama)}</span></td>
                ${kolomTesHtml}
                <td class="text-center bg-light-emerald">${rataAkhirHtml}</td>
                <td class="text-center">${statusAkhirHtml}</td>
            </tr>
        `;
    }).join('');
}
