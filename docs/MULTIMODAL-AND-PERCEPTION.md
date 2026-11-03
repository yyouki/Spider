# Kemampuan multimodal dan persepsi

Dokumen ini mendeskripsikan target kemampuan, bukan klaim bahwa semua fitur sudah diimplementasikan.

## Input yang direncanakan

| Input | Pipeline yang dibutuhkan | Hasil yang diharapkan |
|---|---|---|
| Teks/website | parsing, retrieval, source capture | jawaban dengan sumber |
| Gambar/screenshot | image understanding, OCR, object detection | ringkasan, teks, objek, lokasi di gambar |
| PDF/dokumen | text extraction, layout/table parsing, page rendering bila perlu | isi, struktur, tabel, kutipan halaman |
| File/folder | file inventory, type detection, safe parsers | ringkasan, pencarian, metadata |
| Audio | speech-to-text, language detection, audio event analysis | transkrip dengan timestamp dan ringkasan |
| Video | metadata, sampled frames, audio transcription, tracking | ringkasan per segmen dan timestamp |
| Live camera/screen | explicit capture/stream permission, frame sampling | analisis sesuai durasi dan sampling |
| Font/emoji | glyph/font metadata, text rendering, Unicode parsing | nama/karakter/kemiripan dan konteks |

## Persepsi visual

Kemampuan yang realistis untuk dirancang:
- mendeteksi kategori objek seperti kursi, meja, kipas, lemari, atau pintu;
- membedakan kategori manusia, hewan, kendaraan, dan objek umum;
- mendeteksi objek yang bergerak dan mempertahankan track ID sepanjang klip;
- memahami posisi relatif objek;
- membaca teks pada screenshot dan dokumen;
- menghasilkan deskripsi visual yang menyebutkan bagian yang tidak jelas.

Object detection tidak selalu sama dengan pemahaman sempurna. Objek tertutup, buram, kecil, gelap, atau di luar distribusi data dapat menghasilkan kesalahan. Sertakan confidence, kualitas input, timestamp, dan opsi "tidak yakin".

Deteksi keberadaan manusia/hewan dapat menjadi fitur umum. Jangan mengidentifikasi seseorang dari wajah secara default. Biometrik mentah tidak dikirim ke model.

## Video

Jangan mengklaim model "menonton setiap frame" kecuali pipeline memang memproses setiap frame. Untuk video panjang, sistem dapat:
1. membaca metadata dan durasi;
2. mengekstrak/transkrip audio;
3. mengambil frame pada interval atau saat scene berubah;
4. menjalankan object detection/tracking pada rentang yang dipilih;
5. menyusun ringkasan dengan timestamp;
6. menyebutkan bagian yang tidak dianalisis.

Resolusi, frame rate, panjang klip, dan jumlah frame memengaruhi biaya serta waktu proses.

## Media output

Menghasilkan atau mengirim gambar, video, audio, teks, dan file harus mengikuti:
- batas ukuran dan format provider;
- ukuran upload dan download;
- kuota storage/bandwidth;
- resumable/chunked transfer bila didukung;
- pemindaian file dan validasi MIME type;
- hak cipta dan izin atas konten;
- pembatasan platform.

Karena batas provider, "tanpa batas" tidak dapat dijanjikan. Antarmuka harus menampilkan batas yang berlaku dan status unggah.

## Akurasi dan verifikasi

Setiap jawaban multimodal harus membedakan:
- observasi langsung dari input;
- hasil model/inference;
- inferensi yang belum diverifikasi;
- bagian input yang gagal dibaca;
- timestamp atau halaman sumber.

Untuk screenshot/dokumen, pertahankan referensi halaman/region bila ada. Untuk video/audio, gunakan timestamp. Untuk deteksi objek, gunakan koordinat/label/track confidence. Jangan mengarang detail di luar bukti media.

## Data sensitif

Jangan menyimpan foto wajah, suara, sidik jari, atau rekaman perangkat lebih lama dari yang diperlukan. Pengguna harus dapat melihat, mengunduh, dan menghapus data yang diunggah. Biometrik harus tetap ditangani OS/perangkat melalui API resmi; AI tidak memerlukan salinan sidik jari untuk mengetahui apakah pengguna berhasil melakukan autentikasi.
