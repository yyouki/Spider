# Roadmap pengembangan space

Roadmap ini sengaja mengutamakan fondasi yang bisa diuji sebelum menambahkan OS runner atau otonomi tinggi.

## Tahap 0 — Product & threat-model foundation
- [x] Tetapkan konsep satu AI utama.
- [x] Definisikan modul sebagai skills/tools, bukan identitas agent terpisah.
- [x] Dokumentasikan batas izin, self-update, memori, dan multimodal.
- [ ] Konfirmasi arsitektur provider dan biaya yang dapat diterima.
- [ ] Buat threat model dan data inventory final.

## Tahap 1 — MVP workspace
- Mobile-first dashboard/PWA.
- API gateway dan satu session-aware orchestrator.
- Model router dengan provider adapter.
- Tool registry dengan schema dan permission manifest.
- Task ledger, checkpoint, cancel/pause.
- File upload terbatas dan workspace file browser.
- Audit log dan user approval UI.
- Test suite dan CI.

**Acceptance:** satu prompt dapat direncanakan, memanggil tool read-only, menyelesaikan tugas kecil, menyimpan hasil, lalu melanjutkan setelah restart.

## Tahap 2 — Browser dan research
- Browser automation terisolasi.
- Search/retrieval dengan sumber, tanggal, dan kutipan.
- Prompt-injection boundary.
- Research report dengan confidence/limitations.

**Acceptance:** agent dapat meriset dokumentasi publik dan menyajikan klaim beserta sumber. Tindakan tulis ke website memerlukan approval.

## Tahap 3 — Coding dan Linux sandbox
- Sandbox Linux non-root.
- Git branch per task.
- Dependency install, build, test, lint.
- Resource/network limits.
- Snapshot dan artifact export.

**Acceptance:** agent membuat project kecil, menjalankan tests, memperbaiki kegagalan, dan tidak mengubah host.

## Tahap 4 — Memory dan learning
- Project memory dan error memory.
- Provenance, retention, export/delete.
- Evaluation dataset dan regression runner.
- Versioned prompt/tool changes.

**Acceptance:** kesalahan yang pernah diidentifikasi menjadi regression test; update tidak dirilis bila test gagal.

## Tahap 5 — Multimodal
- Image/screenshot understanding.
- Document/PDF parsing dengan page refs.
- Audio transcription dan timestamp.
- Video frame sampling dan object tracking.
- Media upload safeguards.

**Acceptance:** laporan menyebutkan sumber, halaman/timestamp, dan bagian yang tidak terverifikasi.

## Tahap 6 — Hosting AI projects
- Build artifact.
- Staging preview.
- Deployment adapter.
- Environment separation dan encrypted secrets.
- Cost/quota guard.

**Acceptance:** deploy hanya ke target yang diizinkan, dengan rollback dan catatan versi.

## Tahap 7 — Device dan OS runners
Urutan realistis:
1. Linux runner.
2. Android build/test runner atau emulator ketika host mendukung.
3. Windows runner pada host Windows/KVM dengan RAM/storage yang memadai.
4. macOS runner hanya pada host Apple yang kompatibel dan sesuai lisensi.

Tidak satu pun runner dianggap tersedia hanya karena menu UI menampilkannya.

## Tahap 8 — Autonomous scheduler dan self-improvement
- Durable scheduled jobs.
- Monitoring, queue, pause/cancel.
- Agent-proposed code changes.
- Sandbox evaluation, staging, approvals, rollback.
- 24/7 operation berdasarkan kuota dan budget.

## Release gate

Satu tahap belum boleh disebut selesai sebelum:
- implementasi nyata ada;
- automated tests lulus;
- batas provider telah diverifikasi;
- tidak ada secret di Git;
- failure path diuji;
- dokumentasi setup dan recovery tersedia;
- status "verified" dibedakan dari "planned" dan "not tested".
