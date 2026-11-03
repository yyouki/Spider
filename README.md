# space — Autonomous AI Workspace

space diarahkan menjadi **satu AI utama dengan banyak kemampuan terintegrasi**: riset web, coding, file/document analysis, multimodal perception, memory, sandbox execution, hosting, dan evaluasi. Pengguna tetap berinteraksi dengan satu identitas dan satu pusat koordinasi.

> **Status:** MVP AI pertama tersedia di `apps/space-ai`. Saat ini ia memiliki chat persisten, kalkulator, pemeriksaan kapabilitas, dan project memory yang memerlukan persetujuan. Browser agent, coding sandbox, multimodal, OS runners, dan self-update produksi belum diimplementasikan.

## Mulai dari AI MVP

Lihat [apps/space-ai](apps/space-ai/README.md) untuk persiapan lokal, konfigurasi Cloudflare Access, dan deployment. Jangan membuat endpoint chat publik: aplikasi harus dilindungi Cloudflare Access dan dikunci ke satu identitas pemilik.

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

## Security

- Jangan commit `.env`, `.dev.vars`, token, service-account JSON, cookies, atau password.
- Jangan commit file VM.
- Jangan deploy `apps/space-ai` sebelum Cloudflare Access dan allow-list satu pemilik disetel.
- Tidak ada auto-rebuild, auto-format disk, atau auto-restore ke atas disk yang sudah ada.
- Jangan anggap port 3389 bisa diakses hanya karena Codespaces meneruskan port; uji konektivitas dari jaringan aktual.
