const socket = io();

const videoFeed = document.getElementById('videoFeed');
const countDisplay = document.getElementById('countDisplay');
const sessionStatus = document.getElementById('sessionStatus');
const excelFileStatus = document.getElementById('excelFileStatus');
const excelFiles = document.getElementById('excelFiles');

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');

// Set default date & time
const today = new Date().toISOString().split('T')[0];
document.getElementById('tanggal').value = today;
document.getElementById('jam').value = new Date().toTimeString().slice(0, 5);

// Auto-refresh video jika error
setInterval(function() {
    if (videoFeed) {
        videoFeed.onerror = function() {
            console.log('🔄 Video error, refreshing...');
            videoFeed.src = '/video_feed?' + new Date().getTime();
        };
    }
}, 3000);

// Socket Events
socket.on('connect', () => {
    console.log('✅ Connected to server');
    btnStart.disabled = false;
});

socket.on('update_stats', (data) => {
    countDisplay.textContent = data.count;
});

socket.on('processing_status', (data) => {
    if (data.status === 'running') {
        btnStart.disabled = true;
        btnStop.disabled = false;
        document.querySelector('.overlay-info').style.borderColor = '#4caf50';
        sessionStatus.textContent = data.session_data.asal_ayam;
        sessionStatus.style.color = '#4caf50';
        excelFileStatus.textContent = data.excel_file || '...';
        excelFileStatus.style.color = '#4caf50';
    } else {
        btnStart.disabled = false;
        btnStop.disabled = true;
        document.querySelector('.overlay-info').style.borderColor = '#f0c040';
        
        if (data.saved_file) {
            sessionStatus.textContent = 'Selesai';
            sessionStatus.style.color = '#f0c040';
            excelFileStatus.textContent = data.saved_file;
            excelFileStatus.style.color = '#f0c040';
            loadExcelFiles();
        } else {
            sessionStatus.textContent = 'Idle';
            sessionStatus.style.color = '#8899aa';
            excelFileStatus.textContent = '-';
            excelFileStatus.style.color = '#8899aa';
        }
    }
});

// Button Handlers
btnStart.addEventListener('click', () => {
    const asalAyam = document.getElementById('asalAyam').value || 'Unknown';
    const tanggal = document.getElementById('tanggal').value;
    const jam = document.getElementById('jam').value;
    
    socket.emit('start_processing', {
        asal_ayam: asalAyam,
        tanggal: tanggal,
        jam: jam,
        keterangan: ''  // Kosong
    });
});

btnStop.addEventListener('click', () => {
    socket.emit('stop_processing');
});

// Load Excel files
async function loadExcelFiles() {
    try {
        const response = await fetch('/api/exports');
        const files = await response.json();
        
        if (files.length === 0) {
            excelFiles.innerHTML = '<p>Belum ada file Excel</p>';
            return;
        }
        
        let html = `<table>
            <thead>
                <tr>
                    <th>Nama File</th>
                    <th>Ukuran</th>
                    <th>Tanggal</th>
                    <th>Download</th>
                </tr>
            </thead>
            <tbody>`;
        
        files.forEach(file => {
            const size = (file.size / 1024).toFixed(1) + ' KB';
            const date = new Date(file.modified).toLocaleString('id-ID');
            html += `
                <tr>
                    <td>${file.name}</td>
                    <td>${size}</td>
                    <td>${date}</td>
                    <td><a href="/api/export/download/${file.name}" class="btn-download" download>📥 Download</a></td>
                </tr>
            `;
        });
        html += '</tbody></table>';
        excelFiles.innerHTML = html;
        
    } catch (error) {
        console.error('Failed to load Excel files:', error);
        excelFiles.innerHTML = '<p>Gagal load file</p>';
    }
}

// Load Excel files setiap 10 detik
setInterval(loadExcelFiles, 10000);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 's' || e.key === 'S') {
        if (!btnStart.disabled) btnStart.click();
    } else if (e.key === 'x' || e.key === 'X') {
        if (!btnStop.disabled) btnStop.click();
    }
});

// Load initial data
loadExcelFiles();

console.log('📋 Shortcuts: [S]tart, Stop (X)');