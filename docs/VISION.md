# Visi space: satu AI yang mampu bekerja

## Tujuan

space diarahkan menjadi satu AI utama yang dapat memahami tujuan pengguna, merencanakan pekerjaan, memakai alat, memeriksa hasil, belajar dari evaluasi, dan mengelola proyek dalam lingkungan kerja yang terisolasi.

Pengalaman pengguna tetap berupa **satu AI dan satu identitas percakapan**. Kemampuan khusus seperti riset web, coding, analisis dokumen, persepsi gambar/video/audio, pengelolaan sandbox, dan deployment adalah modul/skill yang dipanggil oleh AI utama. Modul tersebut bukan chatbot yang berjalan sendiri-sendiri dengan kebijakan berbeda.

## Prinsip produk

1. **Outcome-first:** memahami hasil yang diminta, bukan hanya menyalin kata-kata prompt.
2. **Plan, act, verify:** buat rencana, kerjakan melalui alat yang sesuai, lalu verifikasi.
3. **Honest accuracy:** bedakan fakta, asumsi, ketidakpastian, dan hasil yang benar-benar diuji. Tidak ada klaim akurasi 100%.
4. **One identity, scoped access:** satu identitas AI di dalam space, tetapi setiap integrasi akun memiliki izin OAuth yang terpisah dan dapat dicabut.
5. **Sandbox-first:** kode dan aplikasi asing dijalankan dalam sandbox, bukan pada host kontrol.
6. **Persistent work:** rencana, state, dan artefak disimpan agar tugas dapat dilanjutkan setelah restart.
7. **Safe self-improvement:** AI boleh mengusulkan perubahan pada dirinya, menguji perubahan di branch/sandbox, dan membuat rilis bertahap. AI tidak boleh memperluas izin, mengubah aturan keselamatan, atau menimpa produksi tanpa kontrol yang tepat.
8. **Open-source by design:** source code boleh terbuka; token, credentials, data pribadi, file pengguna, dan memory privat tidak boleh ikut ter-publish.

## Pengalaman yang dituju

Pengguna bisa memberi permintaan sederhana seperti "buatkan aplikasi belajar pemrograman". AI utama akan:
- mengklarifikasi hanya hal yang benar-benar diperlukan;
- menyusun rencana dan asumsi;
- meneliti dokumentasi ketika diperlukan;
- membuat project dan memasang dependency di workspace;
- menjalankan test dan pemeriksaan keamanan;
- memperbaiki kegagalan yang dapat direproduksi;
- menyiapkan preview/deployment jika diizinkan;
- memberikan hasil, bukti pengujian, batasan, dan cara melanjutkan.

AI tidak boleh mengarang bahwa aplikasi sudah berjalan, model telah dilatih, video sudah dianalisis seluruh frame-nya, atau deployment berhasil jika operasi tersebut tidak benar-benar dilakukan.

## Batas realitas teknis

- Model AI tetap mempunyai batas konteks, biaya, latensi, kemampuan, dan kemungkinan salah.
- Video, audio, file besar, emulator, dan VM memerlukan bandwidth, storage, CPU, dan RAM.
- Pengiriman media tidak dapat dijanjikan tanpa batas; batas provider dan kapasitas penyimpanan tetap berlaku.
- Proses 24/7 tidak harus berupa loop CPU yang terus aktif. Sistem dapat menyimpan job, tidur saat idle, lalu bangun ketika ada event atau jadwal.
- Windows, Android, macOS, dan Linux membutuhkan runner yang kompatibel. Satu container Linux Codespaces tidak dapat berubah menjadi semua OS.
- Hosting gratis memiliki kuota dan pembatasan; tidak ada jaminan workload berat dapat berjalan tanpa biaya.

## Ukuran keberhasilan

Keberhasilan diukur dengan benchmark dan observability, bukan klaim "mengalahkan" suatu merek:
- task completion rate;
- verified test pass rate;
- factuality dan citation coverage;
- rate of unsupported claims;
- recovery success setelah restart;
- security regression count;
- latency p50/p95;
- penggunaan token, CPU, RAM, storage, dan biaya;
- jumlah tindakan eksternal tanpa persetujuan (target: nol untuk tindakan yang memerlukan persetujuan).

## Bukan tujuan

- Mengambil alih semua akun/perangkat dengan satu password universal.
- Mengumpulkan password, cookie browser, private key, atau template biometrik.
- Mengakses data orang lain tanpa otorisasi.
- Menjalankan software tidak tepercaya langsung di host.
- Mengubah source atau policy produksi secara diam-diam.
- Mengklaim AI selalu benar atau dapat melakukan semua hal tanpa limit.
