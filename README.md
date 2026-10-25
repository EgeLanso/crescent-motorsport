# Crescent Motorsport

Siyah / beyaz / gümüş, responsive sim-racing takım sitesi. Tüm içerik Supabase üzerinden admin panelinden yönetilir; sitede hazır/sahte veri yoktur.

## Admin panelinden yönetilenler

- **Pilotlar:** ad, yarış numarası, rol, araç, araç fotoğrafı, LFM profil linki ve toplam starts / wins / podiums / poles değerleri (elle girilir).
- **Yarış sonuçları:** pilot, tarih, oyun, klasman, araç, pist, bitiriş durumu, pozisyon, en iyi tur, sonuç linki, fotoğraf, not.
- **Tur zamanları:** pilot başına en iyi turlar.
- **Takvim:** gelecek yarışlar (geçmiş etkinlikler otomatik ayrı listelenir).
- **Takım fotoğrafları:** doğrudan dosya yükleme (Supabase Storage, en fazla 50 MB, JPG/PNG/WEBP/GIF).
- **Başvurular:** "Takıma katıl" formundan gelenleri okundu işaretle, sil ya da tek tıkla pilot olarak takıma al.

Takım özeti kartlarındaki toplamlar pilot profillerindeki değerlerin toplamıdır.

## Kurulum (bir kerelik)

1. [Supabase](https://supabase.com/) üzerinde proje oluştur.
2. **SQL Editor**'da `schema.sql` dosyasının **tamamını** çalıştır. Tablolar, güvenlik politikaları ve `team-photos` Storage klasörü tek seferde kurulur. Dosya tekrar çalıştırılabilir; mevcut kayıtları silmez.
3. **Authentication → Users**'tan admin kullanıcısını oluştur (e-posta + güçlü şifre). Gerekmiyorsa herkese açık kayıtları kapat.
4. Kullanıcının UUID'sini kopyala. `schema.sql` dosyasının en altındaki `insert into public.admin_users ...` satırını UUID ile doldurup çalıştır.
5. **Project Settings → API**'den Project URL ve **publishable/anon** anahtarı al. `app.js` başındaki `SUPABASE_URL` ve `SUPABASE_ANON_KEY` değerlerini değiştir. `service_role` / secret anahtarını asla kullanma.
6. Klasörün içeriğini GitHub reposunun köküne yükle, **Settings → Pages** ile yayınla.
7. Sitede **GİRİŞ**'e bas, admin hesabınla giriş yap.

## Notlar

- Yazma yetkisi gizli buton ile değil, Supabase Row Level Security ile korunur; sadece `admin_users` listesindeki hesaplar içerik değiştirebilir.
- Başvuru formu ziyaretçilerin yalnızca **gönderebildiği**, okuyamadığı bir tablo kullanır.
- Yerelde test için `index.html`'i doğrudan açma; `app.js` bir ES modülü olduğundan yerel sunucu kullan (VS Code Live Server, `python -m http.server`).
- Wins = P1 bitiriş, Starts = DNS olmayan her yarış, DNF = DNF işaretli kayıt (yarış kayıtlarında bu mantıkla gösterilir).
- `_unused/` klasörü eski/kullanılmayan görselleri içerir; istersen silebilirsin.
