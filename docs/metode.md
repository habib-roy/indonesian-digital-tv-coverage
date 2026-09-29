# Metode perhitungan

Aplikasi ini **memperkirakan** kuat sinyal TV digital (DVB-T2) di atap rumah Anda. Hasilnya estimasi, bukan hasil ukur. Semua perhitungan berjalan di browser Anda.

## Model propagasi

- **Longley-Rice / ITM** (Irregular Terrain Model, NTIA). Kode ini port TypeScript dari [NTIA/itm](https://github.com/NTIA/itm) (domain publik). Hasilnya sudah dicocokkan dengan kode C++ aslinya pada 13 skenario uji, termasuk mode LOS, difraksi, dan troposcatter.
- Parameter mengikuti praktik perencanaan DTV **FCC OET-69**: F(50,90), yaitu 50% lokasi dan 90% waktu, mode _broadcast_. Iklim ekuatorial, refraktivitas N₀ = 350, polarisasi horizontal, tanah rata-rata (ε = 15, σ = 0,005 S/m).
- **Rugi clutter di rumah** mengikuti **ITU-R P.2108-1 §3.1**. Jenis lingkungan diambil dari **ESA WorldCover 2021** (resolusi 10 m). Kawasan bangunan dianggap "urban" dengan tinggi clutter 15 m, pepohonan 15 m, dan lahan terbuka 10 m.
- **Ambang terima** dihitung dari dasar teori, bukan diambil dari tabel. Rumusnya noise −174 dBm/Hz + 10·log(7,61 MHz) + NF 6 dB + C/N 20 dB, sehingga daya minimum ≈ −79 dBm. Angka C/N itu adalah DVB-T2 256-QAM CR 3/5 ditambah 3 dB margin implementasi. Receiver acuan memakai antena Yagi 10 dBi dan rugi kabel 3 dB.
- **Grafik profil** menampilkan tanah yang sudah dikoreksi kelengkungan bumi (k = 4/3), garis lurus sinyal, 60% zona Fresnel pertama, dan titik penghalang utama (metode Deygout). Grafik ini hanya untuk penjelasan. Kuat medan tetap dihitung oleh ITM.

## Sumber data

| Data                    | Sumber                                                                             | Lisensi                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Ketinggian tanah        | AWS Terrain Tiles (Terrarium), gabungan SRTM & lainnya, ±30–90 m                   | Beragam, lihat [atribusi](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |
| Tutupan lahan           | ESA WorldCover 2021 v200 via Microsoft Planetary Computer                          | CC BY 4.0                                                                                   |
| Lokasi menara           | OpenStreetMap                                                                      | ODbL 1.0                                                                                    |
| Wilayah layanan & kanal | Wikipedia bahasa Indonesia, "Televisi digital di Indonesia" (Permenkominfo 6/2019) | CC BY-SA 4.0                                                                                |
| Peta dasar              | OpenFreeMap / OpenStreetMap                                                        | ODbL 1.0                                                                                    |
| Pencarian alamat        | Nominatim / OpenStreetMap                                                          | ODbL 1.0                                                                                    |

## Keterbatasan (penting)

- **Tinggi menara dan daya pancar (ERP) sebagian besar masih perkiraan.** Data per menara di Indonesia tidak dipublikasikan secara terbuka. Nilai bawaannya 100 m dan 5 kW, dan kartu hasil diberi tanda "estimasi". Kontribusi data sangat membantu.
- Sebagian pemancar hanya diletakkan di **pusat kota wilayah layanan** karena lokasi menaranya belum ada di OpenStreetMap.
- Frekuensi yang dipakai adalah **kanal tertinggi** yang dialokasikan untuk wilayah itu, jadi hasilnya perkiraan paling pesimis. Kanal yang benar-benar dipakai tiap mux bisa berbeda.
- Model elevasi ±30 m **tidak memuat gedung**. Gedung tinggi di dekat rumah hanya diwakili secara rata-rata oleh model clutter.
- **Heatmap** memakai clutter "suburban" yang seragam agar tetap cepat, sehingga bisa berbeda dari hasil analisis rumah.
- Interferensi antar-pemancar (SFN/co-channel) dan noise lokal tidak dimodelkan.

Hasil lapangan Anda (sinyal diterima atau tidak) sangat berharga. Laporkan lewat tombol **Kontribusi**.
