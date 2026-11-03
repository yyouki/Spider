# space — Autonomous AI Workspace

space diarahkan menjadi **satu AI utama dengan banyak kemampuan terintegrasi**: riset web, coding, file/document analysis, multimodal perception, memory, sandbox execution, hosting, dan evaluasi. Pengguna tetap berinteraksi dengan satu identitas dan satu pusat koordinasi.

> **Status saat ini:** repository masih berada pada tahap fondasi dan dokumentasi arsitektur. Dokumen visi di bawah adalah target/roadmap, bukan klaim bahwa semua kemampuan sudah tersedia. Codespaces saat ini adalah development workspace Linux; bukan Windows Cloud PC dan tidak menjalankan semua OS guest secara otomatis.

## Dokumen desain utama

- [Visi produk](docs/VISION.md)
- [Arsitektur satu AI utama](docs/ARCHITECTURE.md)
- [Keamanan, identitas, dan izin](docs/SECURITY-AND-PERMISSIONS.md)
- [Multimodal dan persepsi](docs/MULTIMODAL-AND-PERCEPTION.md)
- [Memori, evaluasi, dan self-improvement](docs/LEARNING-AND-SELF-IMPROVEMENT.md)
- [Roadmap pengembangan](docs/ROADMAP.md)
- [Batasan platform saat ini](docs/PLATFORM-LIMITS.md)

## Prinsip penting

- **Satu AI utama:** kemampuan khusus berupa tool/skill yang tunduk pada policy dan task ledger yang sama.
- **Kerja berbasis bukti:** rencanakan, kerjakan, uji, dan laporkan apa yang benar-benar terverifikasi.
- **Self-improvement terkendali:** perubahan diuji di branch/sandbox, dievaluasi, dan dapat di-rollback. Agent tidak boleh menaikkan izinnya sendiri atau mengubah policy keselamatan.
- **Akses akun dengan izin sempit:** gunakan OAuth scope yang diperlukan per layanan, bukan password universal.
- **Sandbox-first:** jangan menjalankan kode tak tepercaya di host.
- **Persisten dan dapat dipulihkan:** job, checkpoint, dan data penting disimpan sesuai kebijakan retensi; backup harus diuji.
- **Jujur terhadap limit:** tidak menjanjikan akurasi 100%, media tanpa batas, semua OS di satu host, atau 24/7 gratis tanpa kuota.

## Status eksperimen Codespaces / Windows

Bagian ini merupakan eksperimen lama yang tetap disimpan terpisah dari target Autonomous AI Workspace.

Eksperimen Windows VM hanya dapat dicoba jika Codespace benar-benar menyediakan Docker, `/dev/kvm`, `/dev/net/tun`, memori, dan ruang disk yang memadai. Project tidak dapat menjamin Codespaces menyediakan semua itu atau menjamin RDP dapat dijangkau.

### Apa yang disiapkan

- Startup biasa tidak menjalankan `docker rm -f`, tidak membuat ulang disk, dan tidak menginstal ulang Windows.
- `storage/data.img` menjadi disk tamu persisten dan dikecualikan dari Git.
- Jika disk hilang, startup berhenti dengan pesan; instalasi awal hanya dilakukan lewat `scripts/init-windows.sh` dengan konfirmasi.
- Jika container hilang tetapi disk valid masih ada, script boleh membuat ulang container mengitari disk tersebut.
- Tidak ada fallback diam-diam ke QEMU TCG bila KVM tidak tersedia.
- `scripts/stop-windows.sh` menghentikan Windows lalu menjalankan backup GCS jika telah dikonfigurasi.
- Restore memeriksa SHA-256 dan menolak menimpa disk yang sudah ada.
- Menu OS menjelaskan status Windows, macOS, dan Googlebook OS tanpa mengklaim semua guest OS bisa berjalan di Codespaces.

## Memulai eksperimen Codespaces

1. Salin konfigurasi contoh:

   ```bash
   cp .env.example .env
   ```

2. Jalankan pemeriksaan:

   ```bash
   ./scripts/preflight.sh
   ```

   Jika pemeriksaan gagal, jangan memulai VM. Khususnya, jika `/dev/kvm` tidak ada atau ruang disk tidak cukup, Codespace ini bukan host yang sesuai untuk jalur Windows VM ini.

3. Untuk instalasi Windows pertama kali saja:

   ```bash
   ./scripts/init-windows.sh
   ```

   Script meminta mengetik `CREATE WINDOWS`. Instalasi pertama dapat mengunduh komponen Windows dan memerlukan beberapa GB disk serta waktu. Repo tidak memuat atau membagikan lisensi Windows.

4. Untuk penggunaan normal, restart, atau setelah container metadata hilang:

   ```bash
   ./scripts/start-windows.sh
   ```

   Script menggunakan disk yang sudah ada. Jika disk tidak ditemukan atau kosong, script berhenti dan tidak memasang OS baru.

5. Untuk menghentikan Windows dan mencoba backup otomatis ke GCS:

   ```bash
   ./scripts/stop-windows.sh
   ```

## Backup Google Cloud Storage

Google Cloud Storage memerlukan bucket dan autentikasi Google Cloud yang valid. Konfigurasikan `BACKUP_BUCKET` dan optional `BACKUP_PREFIX` di `.env`, lalu login di terminal Codespace:

```bash
gcloud auth login
./scripts/stop-windows.sh
```

Jika Windows dihentikan dengan script tersebut, `backup-windows.sh` membuat arsip gzip dari disk yang sudah berhenti, mengunggah object bernama unik, dan mengunggah checksum. Script tidak membuat bucket, tidak mengaktifkan billing, dan tidak menghapus backup lama. Untuk backup manual, pastikan Windows/container sudah berhenti, lalu jalankan:

```bash
./scripts/backup-windows.sh
```

Untuk restore setelah kehilangan disk lokal, berikan URI object backup yang tepat:

```bash
./scripts/restore-windows.sh gs://YOUR_BUCKET/space-vm/windows/windows-TIMESTAMP.img.gz
```

Restore menolak berjalan jika `storage/data.img` sudah ada. Backup disk besar dapat memerlukan waktu, CPU, storage sementara, bandwidth, dan biaya Cloud Storage. Selalu cek harga/kuota serta sisa disk sebelum menjalankan.

**Batas penting:** Codespaces tidak menjamin menjalankan backup hook sebelum setiap stop/timeout/delete dari UI. Untuk menangkap perubahan terakhir, gunakan `scripts/stop-windows.sh` sebelum menghentikan Codespace. Jika Codespace/storage dihapus, data lokal bisa hilang; hanya backup cloud yang telah berhasil diunggah yang dapat dipakai untuk recovery.

## Menu OS

```bash
./scripts/select-os.sh
```

- **Windows:** dapat dicoba jika preflight lulus.
- **macOS:** tidak tersedia di Linux Codespaces; project tidak mengunduh image tidak resmi atau mem-bypass lisensi.
- **Googlebook OS:** ditujukan untuk perangkat Googlebook dan tidak tersedia sebagai guest VM generik yang didukung di repo ini.

## AI developer tools di Windows

Setelah Windows menyala, buka folder share `\\host.lan\Data` di dalam Windows. Jalankan PowerShell sebagai user Windows, lalu:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& '\\host.lan\Data\install-ai-tools.ps1'
```

Script mencoba memasang Google Antigravity, Cursor, dan aplikasi ChatGPT (Codex tersedia di dalamnya) melalui `winget`. Jika `winget` tidak tersedia atau instalasi Antigravity gagal, halaman download resmi dibuka untuk instalasi manual. Login dilakukan sendiri, dan setiap tool dapat memiliki batas pemakaian/langganan masing-masing.

Repo ini tidak membuat akun Google, tidak mengakali kelayakan usia/region, dan tidak memberikan Google AI Pro secara otomatis. Promosi dan subscription harus diklaim oleh pemegang akun yang memenuhi syarat melalui Google; perangkat/promo tertentu dapat mensyaratkan pembelian.

## Catatan keamanan

- Jangan commit `.env`, service-account JSON, token, atau password.
- Jangan commit file VM.
- Tidak ada auto-rebuild, auto-format disk, atau auto-restore ke atas disk yang sudah ada.
- Jangan menganggap port 3389 bisa diakses hanya karena Codespaces meneruskan port; uji konektivitas dari jaringan aktual.
