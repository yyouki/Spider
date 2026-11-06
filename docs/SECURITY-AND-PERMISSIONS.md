# Keamanan, identitas, dan izin

## Prinsip utama

AI boleh melakukan pekerjaan mandiri di ruang kerja yang secara eksplisit diberikan kepadanya. AI **tidak** mendapatkan izin global ke seluruh akun, file, atau perangkat hanya karena pengguna menginginkan agent otonom.

Akses harus dapat dibatasi, diaudit, dicabut, dan dipulihkan.

## Satu identitas AI, bukan satu password universal

space boleh memiliki satu identitas aplikasi/agent yang konsisten di UI. Namun koneksi ke Google, GitHub, Microsoft, atau layanan lain harus dilakukan melalui mekanisme otorisasi provider masing-masing.

Jangan:
- menyimpan password Gmail atau password situs dalam konfigurasi agent;
- memakai satu password untuk semua layanan;
- menyimpan session cookies atau browser profile pribadi tanpa izin;
- meminta atau menyimpan kode 2FA;
- memasukkan token ke repository, log, prompt, atau file publik;
- membuat akun dengan memalsukan umur/identitas atau menghindari syarat provider.

Gunakan OAuth Authorization Code dengan PKCE, izin sekecil mungkin, token terenkripsi, rotasi/revocation, dan koneksi terpisah per provider. Ikuti:
- RFC 9700: https://www.rfc-editor.org/rfc/rfc9700.html
- Google OAuth best practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices

OAuth scope harus spesifik. Contoh: izin membaca repository tidak otomatis berarti izin menghapus repository. Izin membaca email tidak otomatis memberikan izin mengirim email.

## Tingkatan tindakan

### Level 0 — read-only
Boleh berjalan otomatis pada sumber yang telah disetujui:
- membaca file dalam workspace yang dipilih;
- membaca dokumentasi publik;
- menganalisis gambar/dokumen yang diunggah pengguna;
- memeriksa status build dan test;
- membaca log project milik pengguna.

### Level 1 — perubahan lokal yang dapat dipulihkan
Boleh berjalan otomatis di sandbox/workspace:
- membuat branch;
- menulis file proyek;
- memasang dependency di sandbox;
- menjalankan test;
- memperbaiki kode;
- membuat snapshot/checkpoint.

### Level 2 — tindakan eksternal berdampak
Perlu konfirmasi pengguna sebelum dieksekusi:
- mengirim email/pesan atau mengunggah konten publik;
- mengubah pengaturan akun atau permission;
- menghubungkan integrasi baru;
- men-deploy ke production;
- membuat/menghapus database, bucket, atau resource cloud;
- melakukan migrasi data;
- mengubah DNS/domain;
- membagikan file dengan pihak lain.

### Level 3 — tindakan sangat sensitif atau tidak diizinkan
Tidak boleh dilakukan oleh agent secara mandiri:
- mengambil alih akun tanpa alur otorisasi resmi;
- menghindari login, MFA, biometrik, atau access controls;
- mencuri/mengekstrak password, cookies, token, atau private keys;
- menghapus/menyebarkan data pribadi;
- mengakses perangkat atau akun orang lain tanpa izin;
- mengubah atau menghapus audit log;
- memperluas permission dirinya sendiri;
- menonaktifkan policy, approval, atau rollback guard.

## Akses perangkat

Companion app hanya boleh mengakses kapabilitas Android yang pengguna berikan melalui permission dan API resmi. Aksi seperti membaca file, kamera, microphone, lokasi, notifikasi, atau menjalankan perintah harus memiliki penjelasan, status izin yang terlihat, dan tombol revoke.

Biometrik:
- Gunakan Android BiometricPrompt/keystore atau mekanisme autentikasi OS yang didukung.
- Jangan mengumpulkan atau menyimpan gambar sidik jari, template biometrik, atau raw face data.
- Agent hanya menerima hasil autentikasi yang diperlukan, bukan material biometrik mentah.
- Deteksi wajah dalam media berbeda dari identifikasi seseorang. Identifikasi wajah tidak aktif secara default dan memerlukan dasar, izin, serta evaluasi privasi yang sesuai.

## Prompt injection dan konten tidak tepercaya

Halaman web, file, PDF, dokumen, kode, gambar, audio, video, dan hasil tool adalah input tidak tepercaya. Instruksi yang ditemukan di dalamnya tidak dapat mengganti system policy atau izin pengguna.

Tool output harus diberi label sebagai data. Jangan biarkan file yang dibaca meminta agent mengungkap secrets, mengubah sistem prompt, atau memanggil tool dengan permission lebih tinggi.

## Secrets dan audit

- Simpan API keys dan OAuth tokens dalam secret manager/encrypted store.
- Redact secrets sebelum logging.
- Catat siapa yang memberi izin, scope, target resource, waktu, hasil, dan approval ID.
- Sediakan revoke-all dan emergency stop.
- Pisahkan development, staging, dan production credentials.
- Terapkan short-lived credentials bila provider mendukung.

## Self-update safety

AI boleh:
1. membuat perubahan pada branch terpisah;
2. menjelaskan alasan perubahan;
3. menjalankan tests, lint, security scans, dan evaluation;
4. membangun artifact;
5. melakukan deployment staging;
6. mengajukan rilis untuk approval.

AI tidak boleh mengedit policy/approval engine atau memberikan dirinya sendiri secret/scope lebih tinggi. Perubahan ke policy, autentikasi, secret management, produksi, dan migrasi destruktif memerlukan review manusia. Setiap rilis harus memiliki versi sebelumnya yang bisa di-rollback.

## Data dan open source

Repository publik hanya berisi source code, contoh konfigurasi tanpa secret, schema, dokumentasi, dan test fixtures sintetis. Jangan publish:
- database produksi;
- conversation atau user memory;
- upload pengguna;
- token/cookie/password/private key;
- personal data atau biometric data;
- file VM dan backup.


## Public multi-user login release gate

Public registration must remain disabled until all of the following are implemented and verified:
- independent user identity and tenant-scoped Durable Object/database keys for chats, files, memory, projects, shares, analytics, and tasks;
- authorization checks on every HTTP, WebSocket/Agent, callable, and artifact route (not only in the React UI);
- per-user encrypted OAuth grants with provider-specific scopes, token rotation/revocation, and no cross-tenant token lookup;
- CSRF/state validation, origin checks, session rotation, secure cookies, login throttling, abuse controls, and account recovery;
- data export/deletion, retention policy, audit events, and automated cross-tenant isolation tests;
- a separate owner/admin role that cannot be granted by a public user.
A successful sign-in test is not sufficient evidence of tenant isolation. Do not switch public registration on until security tests and staging review pass.
