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

// ============================================================================
// MODUL 4: IMPORT MASSAL DATABASE SANTRI DARI EXCEL (SHEETJS)
// ============================================================================
let importModalInstance = null;
let parsedExcelValidRows = [];

function getImportModal() {
    if (!importModalInstance) {
        const modalEl = document.getElementById('importExcelModal');
        if (modalEl) {
            importModalInstance = new bootstrap.Modal(modalEl);
        }
    }
    return importModalInstance;
}

function openImportModal() {
    parsedExcelValidRows = [];
    document.getElementById('excelFileInput').value = '';
    document.getElementById('importPreviewContainer').classList.add('d-none');
    document.getElementById('importPreviewTableBody').innerHTML = '';
    document.getElementById('btnSubmitImport').disabled = true;

    const modal = getImportModal();
    if (modal) modal.show();
}

// Fungsi Unduh Template Excel (.xlsx)
function downloadTemplateExcel() {
    if (typeof XLSX === 'undefined') {
        Swal.fire('Library Belum Siap', 'Pastikan CDN SheetJS (xlsx) sudah terpasang di index.html.', 'error');
        return;
    }

    const templateData = [
        { "Nama Lengkap": "Ahmad Fauzan Al-Farisi", "Asrama": "Asrama Abu Bakar", "Tingkat": "15 Juz" },
        { "Nama Lengkap": "Muhammad Rizky Pratama", "Asrama": "Asrama Umar bin Khattab", "Tingkat": "15 Juz" },
        { "Nama Lengkap": "Zaidan Abdurrahman", "Asrama": "Asrama Utsman bin Affan", "Tingkat": "30 Juz" }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    // Atur lebar kolom agar rapi saat dibuka di Microsoft Excel
    worksheet['!cols'] = [
        { wch: 30 }, // Kolom Nama Lengkap
        { wch: 25 }, // Kolom Asrama
        { wch: 15 }  // Kolom Tingkat
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data_Santri");
    XLSX.writeFile(workbook, "Template_Import_Santri_Tahfidz.xlsx");
}

// Fungsi Normalisasi Tingkat (15 -> '15 Juz', 30 -> '30 Juz')
function normalizeTingkatSantri(rawVal) {
    if (rawVal === undefined || rawVal === null) return null;
    const cleaned = String(rawVal).trim().toLowerCase();
    if (cleaned === '15' || cleaned === '15 juz' || cleaned === '15juz' || cleaned.includes('15')) {
        return '15 Juz';
    }
    if (cleaned === '30' || cleaned === '30 juz' || cleaned === '30juz' || cleaned.includes('30')) {
        return '30 Juz';
    }
    return null;
}

// Fungsi Baca & Pratinjau File Excel saat Dipilih
function handleExcelFilePreview(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading('Membaca file Excel...');
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Ambil sheet pertama
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Konversi ke array objek JSON
            const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            if (rawRows.length === 0) {
                Swal.fire('File Kosong', 'Tidak ditemukan baris data di dalam file Excel tersebut.', 'warning');
                hideLoading();
                return;
            }

            parsedExcelValidRows = [];
            let invalidCount = 0;
            const previewHtml = [];

            rawRows.forEach((row, index) => {
                // Pencocokan nama kolom yang fleksibel (tidak peka huruf besar/kecil atau spasi)
                const normalizedRow = {};
                Object.keys(row).forEach(k => {
                    normalizedRow[k.trim().toLowerCase()] = row[k];
                });

                const rawNama = normalizedRow['nama lengkap'] || normalizedRow['nama santri'] || normalizedRow['nama'] || '';
                const rawAsrama = normalizedRow['asrama'] || normalizedRow['kamar'] || normalizedRow['nama asrama'] || '';
                const rawTingkat = normalizedRow['tingkat'] || normalizedRow['kategori'] || normalizedRow['kategori tingkat'] || '';

                const nama = String(rawNama).trim();
                const asrama = String(rawAsrama).trim();
                const tingkat = normalizeTingkatSantri(rawTingkat);

                const isValid = nama.length > 0 && asrama.length > 0 && tingkat !== null;

                if (isValid) {
                    parsedExcelValidRows.push({ nama, asrama, tingkat });
                } else {
                    invalidCount++;
                }

                previewHtml.push(`
                    <tr class="${isValid ? '' : 'table-danger'}">
                        <td class="text-center text-muted small">${index + 2}</td>
                        <td class="fw-semibold">${nama ? escapeHtml(nama) : '<span class="text-danger fst-italic">Kosong</span>'}</td>
                        <td>${asrama ? escapeHtml(asrama) : '<span class="text-danger fst-italic">Kosong</span>'}</td>
                        <td class="text-center">${tingkat ? `<span class="badge bg-secondary">${tingkat}</span>` : `<span class="text-danger small fw-bold">Invalid (${escapeHtml(String(rawTingkat))})</span>`}</td>
                        <td class="text-center">
                            ${isValid 
                                ? '<span class="badge bg-success"><i class="fa-solid fa-check me-1"></i>Siap Import</span>' 
                                : '<span class="badge bg-danger"><i class="fa-solid fa-xmark me-1"></i>Dilewati</span>'}
                        </td>
                    </tr>
                `);
            });

            document.getElementById('importPreviewTableBody').innerHTML = previewHtml.join('');
            document.getElementById('badgeValidCount').textContent = `${parsedExcelValidRows.length} Data Valid`;
            document.getElementById('badgeInvalidCount').textContent = `${invalidCount} Tidak Valid`;
            document.getElementById('importPreviewContainer').classList.remove('d-none');

            const btnSubmit = document.getElementById('btnSubmitImport');
            btnSubmit.disabled = parsedExcelValidRows.length === 0;
            btnSubmit.innerHTML = `<i class="fa-solid fa-cloud-arrow-up me-2"></i>Import ${parsedExcelValidRows.length} Santri`;

        } catch (err) {
            Swal.fire('Gagal Membaca File Excel', 'Pastikan format file adalah .xlsx, .xls, atau .csv yang valid.', 'error');
        } finally {
            hideLoading();
        }
    };

    reader.readAsArrayBuffer(file);
}

// Fungsi Simpan Massal (Bulk Insert) ke Supabase
async function handleProcessImportExcel() {
    if (parsedExcelValidRows.length === 0) return;

    showLoading(`Mengimpor ${parsedExcelValidRows.length} data santri ke database...`);
    try {
        // Bagi menjadi batch per 100 baris agar aman untuk ratusan/ribuan santri
        const BATCH_SIZE = 100;
        for (let i = 0; i < parsedExcelValidRows.length; i += BATCH_SIZE) {
            const chunk = parsedExcelValidRows.slice(i, i + BATCH_SIZE);
            const { error } = await supabaseClient
                .from('santri')
                .insert(chunk);

            if (error) throw error;
        }

        const modal = getImportModal();
        if (modal) modal.hide();

        Swal.fire({
            icon: 'success',
            title: 'Import Berhasil!',
            text: `Sebanyak ${parsedExcelValidRows.length} data santri berhasil ditambahkan ke database.`,
            confirmButtonColor: '#0f766e'
        });

        await fetchAllSantri();
    } catch (err) {
        Swal.fire('Gagal Mengimpor Data', err.message, 'error');
    } finally {
        hideLoading();
    }
}


// ============================================================================
// MODUL 5: EXPORT EXCEL, UNDUH PDF & PRINT (PER TES DAN REKAP TAHUNAN)
// Mendukung Tingkat 15 Juz (Juz 1-15) & Tingkat 30 Juz (Juz 16-30)
// ============================================================================

function getFormattedTanggalCetak() {
    return new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

// ----------------------------------------------------------------------------
// A. HELPER & EXPORT UNTUK NILAI PER TES (TES 1 S/D TES 10 PER TAHAP)
// ----------------------------------------------------------------------------
function buildDataNilaiTesForExport() {
    const tingkat = appState.activeTingkat;
    const tahap = appState.activeTahap;
    const tesKe = appState.activeTes;
    const tahapInfo = KONFIGURASI_TAHAP[tingkat][tahap];
    const juzList = tahapInfo.juzList;

    const keyword = document.getElementById('searchNilaiInput').value.trim().toLowerCase();
    const santriFiltered = appState.santriList
        .filter(s => s.tingkat === tingkat)
        .filter(s => s.nama.toLowerCase().includes(keyword) || s.asrama.toLowerCase().includes(keyword))
        .sort((a, b) => a.nama.localeCompare(b.nama));

    const rows = santriFiltered.map((santri, idx) => {
        const log = appState.nilaiMap[santri.id];
        if (!log) {
            return {
                no: idx + 1,
                nama: santri.nama,
                asrama: santri.asrama,
                juz1: '-',
                juz2: '-',
                juz3: '-',
                juz4: '-',
                juz5: '-',
                rataRata: '-',
                status: 'Belum Dinilai',
                isLulus: false
            };
        }

        const avg = parseFloat(log.rata_rata || 0);
        const lulus = avg >= KKM_THRESHOLD;
        return {
            no: idx + 1,
            nama: santri.nama,
            asrama: santri.asrama,
            juz1: Number(log.nilai_juz_1).toFixed(0),
            juz2: Number(log.nilai_juz_2).toFixed(0),
            juz3: Number(log.nilai_juz_3).toFixed(0),
            juz4: Number(log.nilai_juz_4).toFixed(0),
            juz5: Number(log.nilai_juz_5).toFixed(0),
            rataRata: avg.toFixed(2),
            status: lulus ? 'Tuntas / Lulus' : 'Belum Tuntas',
            isLulus: lulus
        };
    });

    return {
        tingkat,
        tahap,
        tesKe,
        tahapLabel: tahapInfo.label,
        juzList,
        rows
    };
}

// 1. Export Excel Nilai Per Tes
function exportNilaiTesExcel() {
    const meta = buildDataNilaiTesForExport();
    if (meta.rows.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data santri untuk diekspor.', 'info');
        return;
    }

    const excelData = meta.rows.map(r => ({
        "No": r.no,
        "Nama Lengkap Santri": r.nama,
        "Asrama": r.asrama,
        [`Juz ${meta.juzList[0]}`]: r.juz1 === '-' ? '-' : Number(r.juz1),
        [`Juz ${meta.juzList[1]}`]: r.juz2 === '-' ? '-' : Number(r.juz2),
        [`Juz ${meta.juzList[2]}`]: r.juz3 === '-' ? '-' : Number(r.juz3),
        [`Juz ${meta.juzList[3]}`]: r.juz4 === '-' ? '-' : Number(r.juz4),
        [`Juz ${meta.juzList[4]}`]: r.juz5 === '-' ? '-' : Number(r.juz5),
        "Rata-rata": r.rataRata === '-' ? '-' : Number(r.rataRata),
        "Status KKM (Min 85)": r.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
        { wch: 6 },  // No
        { wch: 30 }, // Nama
        { wch: 22 }, // Asrama
        { wch: 10 }, // Juz 1
        { wch: 10 }, // Juz 2
        { wch: 10 }, // Juz 3
        { wch: 10 }, // Juz 4
        { wch: 10 }, // Juz 5
        { wch: 12 }, // Rata-rata
        { wch: 20 }  // Status KKM
    ];

    const workbook = XLSX.utils.book_new();
    const sheetName = `Tes_${meta.tesKe}_Tahap_${meta.tahap}`;
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const fileName = `Nilai_Tahfidz_${meta.tingkat.replace(/\s+/g, '')}_Tahap${meta.tahap}_Tes${meta.tesKe}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast('success', 'File Excel berhasil diunduh');
}

// 2. Unduh PDF Nilai Per Tes
function exportNilaiTesPDF() {
    const meta = buildDataNilaiTesForExport();
    if (meta.rows.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data santri untuk diunduh.', 'info');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'mm', 'a4');

    // Header Laporan PDF
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`LAPORAN PENILAIAN TAHFIDZ SANTRI - TINGKAT ${meta.tingkat.toUpperCase()}`, 14, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: Tes ${meta.tesKe}  |  Tahap ${meta.tahap} (${meta.tahapLabel})  |  Standar KKM: 85.00  |  Tanggal Cetak: ${getFormattedTanggalCetak()}`, 14, 22);

    const tableHead = [[
        'No',
        'Nama Lengkap Santri',
        'Asrama',
        `Juz ${meta.juzList[0]}`,
        `Juz ${meta.juzList[1]}`,
        `Juz ${meta.juzList[2]}`,
        `Juz ${meta.juzList[3]}`,
        `Juz ${meta.juzList[4]}`,
        'Rata-rata',
        'Status KKM'
    ]];

    const tableBody = meta.rows.map(r => [
        r.no,
        r.nama,
        r.asrama,
        r.juz1,
        r.juz2,
        r.juz3,
        r.juz4,
        r.juz5,
        r.rataRata,
        r.status
    ]);

    doc.autoTable({
        startY: 27,
        head: tableHead,
        body: tableBody,
        theme: 'grid',
        headStyles: {
            fillColor: [15, 118, 110],
            textColor: 255,
            halign: 'center',
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            1: { halign: 'left', cellWidth: 65 },
            2: { halign: 'center', cellWidth: 40 },
            3: { halign: 'center', cellWidth: 18 },
            4: { halign: 'center', cellWidth: 18 },
            5: { halign: 'center', cellWidth: 18 },
            6: { halign: 'center', cellWidth: 18 },
            7: { halign: 'center', cellWidth: 18 },
            8: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
            9: { halign: 'center', cellWidth: 38, fontStyle: 'bold' }
        },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 9) {
                const val = data.cell.raw;
                if (val === 'Tuntas / Lulus') {
                    data.cell.styles.textColor = [22, 101, 52];
                } else if (val === 'Belum Tuntas') {
                    data.cell.styles.textColor = [185, 28, 28];
                }
            }
        }
    });

    const fileName = `Laporan_Nilai_${meta.tingkat.replace(/\s+/g, '')}_Tahap${meta.tahap}_Tes${meta.tesKe}.pdf`;
    doc.save(fileName);
    showToast('success', 'Laporan PDF berhasil diunduh');
}

// 3. Print / Cetak Langsung Nilai Per Tes
function printNilaiTes() {
    const meta = buildDataNilaiTesForExport();
    if (meta.rows.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data santri untuk dicetak.', 'info');
        return;
    }

    const rowsHtml = meta.rows.map(r => `
        <tr>
            <td style="text-align:center;">${r.no}</td>
            <td><strong>${escapeHtml(r.nama)}</strong></td>
            <td style="text-align:center;">${escapeHtml(r.asrama)}</td>
            <td style="text-align:center;">${r.juz1}</td>
            <td style="text-align:center;">${r.juz2}</td>
            <td style="text-align:center;">${r.juz3}</td>
            <td style="text-align:center;">${r.juz4}</td>
            <td style="text-align:center;">${r.juz5}</td>
            <td style="text-align:center; font-weight:bold;">${r.rataRata}</td>
            <td style="text-align:center; font-weight:bold; color:${r.status === 'Tuntas / Lulus' ? '#15803d' : (r.status === 'Belum Tuntas' ? '#b91c1c' : '#64748b')};">
                ${r.status}
            </td>
        </tr>
    `).join('');

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <title>Cetak Nilai Tahfidz - ${meta.tingkat} - Tes ${meta.tesKe}</title>
            <style>
                @page { size: A4 landscape; margin: 15mm; }
                body { font-family: Arial, sans-serif; color: #1e293b; font-size: 12px; margin: 0; }
                .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 15px; }
                .header h2 { margin: 0 0 5px 0; color: #0f766e; text-transform: uppercase; }
                .header p { margin: 2px 0; color: #475569; font-size: 11px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #94a3b8; padding: 7px 8px; }
                th { background-color: #0f766e; color: #ffffff; text-transform: uppercase; font-size: 11px; }
                tr:nth-child(even) { background-color: #f8fafc; }
                .footer-sign { margin-top: 30px; display: flex; justify-content: flex-end; }
                .sign-box { text-align: center; width: 220px; }
                .sign-space { height: 60px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Laporan Hasil Penilaian Tahfidz Santri</h2>
                <p><strong>Kategori:</strong> Tingkat ${meta.tingkat} &nbsp;|&nbsp; <strong>Tahap ${meta.tahap}:</strong> ${meta.tahapLabel} &nbsp;|&nbsp; <strong>Periode Evaluasi:</strong> Tes ${meta.tesKe}</p>
                <p>Kriteria Ketuntasan Minimum (KKM): 85.00 &nbsp;|&nbsp; Tanggal Cetak: ${getFormattedTanggalCetak()}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width:35px;">No</th>
                        <th>Nama Lengkap Santri</th>
                        <th>Asrama</th>
                        <th>Juz ${meta.juzList[0]}</th>
                        <th>Juz ${meta.juzList[1]}</th>
                        <th>Juz ${meta.juzList[2]}</th>
                        <th>Juz ${meta.juzList[3]}</th>
                        <th>Juz ${meta.juzList[4]}</th>
                        <th>Rata-rata</th>
                        <th>Status KKM</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            <div class="footer-sign">
                <div class="sign-box">
                    <p>Mengetahui,<br>Koordinator Tahfidz</p>
                    <div class="sign-space"></div>
                    <p><strong>( _______________________ )</strong></p>
                </div>
            </div>
        </body>
        </html>
    `;

    openPrintWindow(htmlContent);
}

// ----------------------------------------------------------------------------
// B. HELPER & EXPORT UNTUK REKAPITULASI TAHUNAN (TES 1 S/D TES 10)
// ----------------------------------------------------------------------------
function buildDataRekapForExport() {
    const tingkat = appState.activeTingkat;
    const tahapFilter = document.getElementById('rekapTahapFilter').value;
    const tahapSelectEl = document.getElementById('rekapTahapFilter');
    const tahapFilterText = tahapSelectEl.options[tahapSelectEl.selectedIndex]?.text || 'Semua Tahap';

    const keyword = document.getElementById('searchRekapInput').value.trim().toLowerCase();
    const santriFiltered = appState.santriList
        .filter(s => s.tingkat === tingkat)
        .filter(s => s.nama.toLowerCase().includes(keyword) || s.asrama.toLowerCase().includes(keyword))
        .sort((a, b) => a.nama.localeCompare(b.nama));

    const rows = santriFiltered.map((santri, idx) => {
        const logsSantri = appState.rekapLogs.filter(log => {
            const matchSantri = log.santri_id === santri.id;
            const matchTahap = tahapFilter === 'ALL' || String(log.tahap) === String(tahapFilter);
            return matchSantri && matchTahap;
        });

        let totalSemuaTes = 0;
        let jumlahTesTerisi = 0;
        const nilaiPerTes = {};

        for (let tes = 1; tes <= 10; tes++) {
            const logsPerTes = logsSantri.filter(l => l.tes_ke === tes);
            if (logsPerTes.length === 0) {
                nilaiPerTes[`tes_${tes}`] = '-';
            } else {
                const avgTes = logsPerTes.reduce((sum, item) => sum + parseFloat(item.rata_rata), 0) / logsPerTes.length;
                totalSemuaTes += avgTes;
                jumlahTesTerisi++;
                nilaiPerTes[`tes_${tes}`] = Number(avgTes.toFixed(1));
            }
        }

        const rataAkhirNum = jumlahTesTerisi > 0 ? (totalSemuaTes / jumlahTesTerisi) : null;
        const rataAkhirStr = rataAkhirNum !== null ? rataAkhirNum.toFixed(2) : '-';
        let statusAkhir = 'Belum Ada Nilai';

        if (rataAkhirNum !== null) {
            statusAkhir = rataAkhirNum >= KKM_THRESHOLD ? 'LULUS / TUNTAS' : 'BELUM TUNTAS';
        }

        return {
            no: idx + 1,
            nama: santri.nama,
            asrama: santri.asrama,
            ...nilaiPerTes,
            rataAkhir: rataAkhirStr,
            statusAkhir
        };
    });

    return {
        tingkat,
        tahapFilter,
        tahapFilterText,
        rows
    };
}

// 1. Export Excel Rekap Tahunan (Tes 1 s/d Tes 10)
function exportRekapExcel() {
    const meta = buildDataRekapForExport();
    if (meta.rows.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data rekap tahunan untuk diekspor.', 'info');
        return;
    }

    const excelData = meta.rows.map(r => ({
        "No": r.no,
        "Nama Lengkap Santri": r.nama,
        "Asrama": r.asrama,
        "Tes 1": r.tes_1,
        "Tes 2": r.tes_2,
        "Tes 3": r.tes_3,
        "Tes 4": r.tes_4,
        "Tes 5": r.tes_5,
        "Tes 6": r.tes_6,
        "Tes 7": r.tes_7,
        "Tes 8": r.tes_8,
        "Tes 9": r.tes_9,
        "Tes 10": r.tes_10,
        "Rata-rata Akhir": r.rataAkhir === '-' ? '-' : Number(r.rataAkhir),
        "Status Kelulusan Akhir": r.statusAkhir
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
        { wch: 6 },  // No
        { wch: 30 }, // Nama
        { wch: 22 }, // Asrama
        { wch: 8 },  // Tes 1
        { wch: 8 },  // Tes 2
        { wch: 8 },  // Tes 3
        { wch: 8 },  // Tes 4
        { wch: 8 },  // Tes 5
        { wch: 8 },  // Tes 6
        { wch: 8 },  // Tes 7
        { wch: 8 },  // Tes 8
        { wch: 8 },  // Tes 9
        { wch: 8 },  // Tes 10
        { wch: 15 }, // Rata-rata Akhir
        { wch: 22 }  // Status Kelulusan Akhir
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Rekap_${meta.tingkat.replace(/\s+/g, '')}`);

    const tahapSuffix = meta.tahapFilter === 'ALL' ? 'SemuaTahap' : `Tahap${meta.tahapFilter}`;
    const fileName = `Rekap_Tahunan_Tahfidz_${meta.tingkat.replace(/\s+/g, '')}_${tahapSuffix}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast('success', 'File Excel Rekap Tahunan berhasil diunduh');
}

// 2. Unduh PDF Rekap Tahunan (Tes 1 s/d Tes 10)
function exportRekapPDF() {
    const meta = buildDataRekapForExport();
    if (meta.rows.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data rekap tahunan untuk diunduh.', 'info');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'mm', 'a4');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`REKAPITULASI TAHUNAN PENILAIAN TAHFIDZ (TES 1 S/D TES 10) - TINGKAT ${meta.tingkat.toUpperCase()}`, 14, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Cakupan: ${meta.tahapFilterText}  |  Standar KKM: 85.00  |  Tanggal Cetak: ${getFormattedTanggalCetak()}`, 14, 22);

    const tableHead = [[
        'No', 'Nama Santri', 'Asrama',
        'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10',
        'Rata-rata', 'Status Akhir'
    ]];

    const tableBody = meta.rows.map(r => [
        r.no, r.nama, r.asrama,
        r.tes_1, r.tes_2, r.tes_3, r.tes_4, r.tes_5,
        r.tes_6, r.tes_7, r.tes_8, r.tes_9, r.tes_10,
        r.rataAkhir, r.statusAkhir
    ]);

    doc.autoTable({
        startY: 27,
        head: tableHead,
        body: tableBody,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2 },
        headStyles: {
            fillColor: [15, 118, 110],
            textColor: 255,
            halign: 'center',
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { halign: 'left', cellWidth: 52 },
            2: { halign: 'center', cellWidth: 32 },
            3: { halign: 'center', cellWidth: 12 },
            4: { halign: 'center', cellWidth: 12 },
            5: { halign: 'center', cellWidth: 12 },
            6: { halign: 'center', cellWidth: 12 },
            7: { halign: 'center', cellWidth: 12 },
            8: { halign: 'center', cellWidth: 12 },
            9: { halign: 'center', cellWidth: 12 },
            10: { halign: 'center', cellWidth: 12 },
            11: { halign: 'center', cellWidth: 12 },
            12: { halign: 'center', cellWidth: 12 },
            13: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
            14: { halign: 'center', cellWidth: 33, fontStyle: 'bold' }
        },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 14) {
                const val = data.cell.raw;
                if (val === 'LULUS / TUNTAS') {
                    data.cell.styles.textColor = [22, 101, 52];
                } else if (val === 'BELUM TUNTAS') {
                    data.cell.styles.textColor = [185, 28, 28];
                }
            }
        }
    });

    const tahapSuffix = meta.tahapFilter === 'ALL' ? 'SemuaTahap' : `Tahap${meta.tahapFilter}`;
    const fileName = `Rekap_Tahunan_${meta.tingkat.replace(/\s+/g, '')}_${tahapSuffix}.pdf`;
    doc.save(fileName);
    showToast('success', 'PDF Rekap Tahunan berhasil diunduh');
}

// 3. Print / Cetak Langsung Rekap Tahunan
function printRekapTahunan() {
    const meta = buildDataRekapForExport();
    if (meta.rows.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data rekap tahunan untuk dicetak.', 'info');
        return;
    }

    const rowsHtml = meta.rows.map(r => `
        <tr>
            <td style="text-align:center;">${r.no}</td>
            <td><strong>${escapeHtml(r.nama)}</strong></td>
            <td style="text-align:center;">${escapeHtml(r.asrama)}</td>
            <td style="text-align:center;">${r.tes_1}</td>
            <td style="text-align:center;">${r.tes_2}</td>
            <td style="text-align:center;">${r.tes_3}</td>
            <td style="text-align:center;">${r.tes_4}</td>
            <td style="text-align:center;">${r.tes_5}</td>
            <td style="text-align:center;">${r.tes_6}</td>
            <td style="text-align:center;">${r.tes_7}</td>
            <td style="text-align:center;">${r.tes_8}</td>
            <td style="text-align:center;">${r.tes_9}</td>
            <td style="text-align:center;">${r.tes_10}</td>
            <td style="text-align:center; font-weight:bold;">${r.rataAkhir}</td>
            <td style="text-align:center; font-weight:bold; color:${r.statusAkhir === 'LULUS / TUNTAS' ? '#15803d' : (r.statusAkhir === 'BELUM TUNTAS' ? '#b91c1c' : '#64748b')};">
                ${r.statusAkhir}
            </td>
        </tr>
    `).join('');

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <title>Cetak Rekap Tahunan - ${meta.tingkat}</title>
            <style>
                @page { size: A4 landscape; margin: 12mm; }
                body { font-family: Arial, sans-serif; color: #1e293b; font-size: 11px; margin: 0; }
                .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 12px; }
                .header h2 { margin: 0 0 4px 0; color: #0f766e; text-transform: uppercase; font-size: 16px; }
                .header p { margin: 2px 0; color: #475569; font-size: 11px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #94a3b8; padding: 5px 6px; }
                th { background-color: #0f766e; color: #ffffff; text-transform: uppercase; font-size: 10px; }
                tr:nth-child(even) { background-color: #f8fafc; }
                .footer-sign { margin-top: 25px; display: flex; justify-content: flex-end; }
                .sign-box { text-align: center; width: 220px; }
                .sign-space { height: 55px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Rekapitulasi Tahunan Penilaian Tahfidz Santri (Tes 1 s/d Tes 10)</h2>
                <p><strong>Kategori:</strong> Tingkat ${meta.tingkat} &nbsp;|&nbsp; <strong>Cakupan Tahap:</strong> ${meta.tahapFilterText}</p>
                <p>Kriteria Ketuntasan Minimum (KKM): 85.00 &nbsp;|&nbsp; Tanggal Cetak: ${getFormattedTanggalCetak()}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width:30px;">No</th>
                        <th>Nama Lengkap Santri</th>
                        <th>Asrama</th>
                        <th>Tes 1</th>
                        <th>Tes 2</th>
                        <th>Tes 3</th>
                        <th>Tes 4</th>
                        <th>Tes 5</th>
                        <th>Tes 6</th>
                        <th>Tes 7</th>
                        <th>Tes 8</th>
                        <th>Tes 9</th>
                        <th>Tes 10</th>
                        <th>Rata-rata Akhir</th>
                        <th>Status Kelulusan Akhir</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            <div class="footer-sign">
                <div class="sign-box">
                    <p>Mengetahui,<br>Koordinator Tahfidz</p>
                    <div class="sign-space"></div>
                    <p><strong>( _______________________ )</strong></p>
                </div>
            </div>
        </body>
        </html>
    `;

    openPrintWindow(htmlContent);
}

// Helper Pembuka Jendela Print Bersih
function openPrintWindow(htmlString) {
    const printWin = window.open('', '_blank', 'width=1100,height=750');
    if (!printWin) {
        Swal.fire('Pop-up Diblokir', 'Izinkan pop-up pada browser Anda untuk mencetak dokumen.', 'warning');
        return;
    }
    printWin.document.open();
    printWin.document.write(htmlString);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
        printWin.print();
    }, 400);
}
