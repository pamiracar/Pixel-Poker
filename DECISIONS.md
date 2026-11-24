# DECISIONS

Kısa karar kaydı. Yeni kararlar milestone'larla eklenir.

## Teknoloji
- React + TypeScript (strict) + Vite + Vitest (README tercihi; sapma yok). Motor `src/engine` altında DOM/React'tan bağımsız.

## Motor (Milestone 1-2)
- El skoru: `kategori * 15^5 + 5 tiebreak rank (taban 15)`; eşit skor = split pot. 7 karttan 21 kombinasyon denenir (basit ve doğru; performans yeterli).
- As rank'i 14; wheel (A-2-3-4-5) straight'te 5-high sayılır. Royal flush ayrı kategori değil, `isRoyal` bayrağı.
- Deste dağıtımı: burn kartı yok; hole kartlar koltuk sırasıyla, sonra board desteden sırayla çekilir (güvenlik/gerçeklik açısından fark yaratmaz, testlerde deterministik deste için basit).
- Heads-up: dealer small blind'dir ve pre-flop ilk o oynar; flop sonrası big blind ilk oynar.
- Kısmi blind: stack yetmezse eldeki kadar yatırılır, otomatik all-in. `currentBet` yatırılan en yüksek blind'dir.
- Bet/raise `amount` değeri "raise to" (toplam bahis seviyesi) olarak tanımlıdır.
- Tam raise'den küçük all-in, daha önce oynamış oyunculara raise hakkını yeniden açmaz (call/fold kalır).
- Tek oyuncunun karşılanmayan bahsi el sonunda iade edilir (pot hesabından önce).
- Tek chip kuralı: bölünemeyen chip'ler, dealer'ın solundan başlayarak kazananlara birer birer verilir.
- Kalan tek oyuncu pot'u alırken kartları gösterilmez (`outcome.hands` boş).
- Rebuy motorda `rebuy()` ile eller arasında yapılır; botların otomatik rebuy'u ve sayacı üst katmanda (Milestone 3) çağrılır, `Player.rebuys` sayar.

## Milestone 3
- Botlar yalnızca `VisibleState` (engine/view.ts) alır: kendi kartları, board, herkese açık stack/bahis bilgisi ve aksiyon geçmişi. Deste ve rakip kartları yoktur; görünüm savunmacı kopyadır. Showdown kartları ancak el bittikten sonra `shownHands` içinde görünür.
- `Table` (engine/table.ts) oturum katmanıdır: koltuk 0 insan, diğerleri bot. Bot stack'i biterse bir sonraki elden önce otomatik rebuy (başlangıç stack'i kadar); insan açıkça `rebuyHuman()` çağırmalı. `buyIns` ile net kâr/zarar koltuk başına izlenir.
- Bot düşünme süresi motorda yoktur; `runBots()` senkron çalışır, UI aksiyonlar arasına 0.6-2 sn bekleme ekler.
- Oyun içi aksiyon kaydı (`actionLog`) motorda tutulur; el geçmişi ve bot adaptasyonu bunu kullanacak.
- Milestone 3 botu `randomBot`: rastgele ama her zaman geçerli aksiyon. Personality'ler Milestone 5'te `deciderFor` ile takılır.

## Milestone 4
- UI mantık içermez: `useTable` motoru sarar, insan aksiyonunu iletir, bot sırasını 0.6-2 sn zamanlayıcıyla yürütür ve her değişiklikten sonra yeniden çizer. Geçerli aksiyonlar `legalActions()` bayraklarından gelir, butonlar buna göre pasif olur.
- Bahis boyutu hızlı butonları: hedef = `currentBet + oran * (pot + callTutarı)`; sınırlar motorun min/max değerine kırpılır.
- Klavye kısayolları: F fold, C check/call, R bet/raise. Sayı kutusu odaktayken kısayollar kapalıdır.
- Koltuk 0 (oyuncu) her zaman ekranın altındadır, diğerleri saat yönünde dizilir. Kart suit'i hem sembol hem renkle gösterilir.
- Menüde stack en az 10 big blind olmalı, BB >= SB (geçersiz ayarla başlatılamaz).
- `@vitejs/plugin-react` 4.x, Vite 5 ile uyumlu olduğu için sabitlendi (en yeni sürüm Vite 5 ile peer çakışması veriyor).
- StrictMode kullanılmıyor: ilk el başlatma efekti çift çalışmasın diye.

## Milestone 5
- El gücü: pre-flop Chen formülü (0..1'e normalize); post-flop Monte Carlo equity (varsayılan 120 örnek) yalnızca botun görebildiği bilgiyle (kendi kartları + board, kalan kartlardan rastgele rakip eli). Draw'lar equity'ye zaten yansır; ayrıca flush draw / straight out sayısı (`detectDraws`) semi-bluff ve implied odds bonusu için ayrıca kullanılır.
- Karar girdileri: el gücü, pot odds, implied odds (derin stack + draw), pozisyon (dealer'a göre geç = geniş aralık), efektif stack (12 BB altı push/fold), board dokusu (kuru/ıslak) ve rakip sayısı (çok kişilik potta blöf azalır, heads-up'ta artar).
- Kontrollü rastgelelik: güç değerine ±0.1 üçgen gürültü + eşik sonrası olasılıkla örnekleme. Aynı durumda aynı seed aynı kararı verir, farklı seed farklı karar verebilir.
- Arketipler (`personalities.ts`): TAG, LAG, Rock, Station parametre seti. Masa kurulurken arketipler karıştırılır; 4 bot'lu masada dördü de bulunur. İsim ve avatar indeksi benzersizdir; arketip UI'a gösterilmez.
- Calling station'ın "kolay fold etmez" davranışı: zayıf elle büyük bahse karşı fold etmeme olasılığı `callDownTendency^2 * 0.5`.
- Düşünme süresi: 0.6-2.0 sn rastgele; büyük bahis/all-in karşısında en fazla +1 sn (üst sınır 3 sn). `Table.thinkTime()` UI zamanlayıcısını besler.
- Bot adaptasyonu (README'de isteğe bağlı bonus) bu sürümde yapılmadı.

## Milestone 6
- Font: lisans sorunu olmaması için harici font yok. 5x7 bitmap font kodla tanımlı (`ui/pixel/font.ts`) ve SVG path olarak çizilir (`PixelText`). Düğme ve paragraf gibi uzun metinler sistem monospace fontuyla kalır (README "sistem fontuyla taklit"e izin veriyor); başlık, isim, stack, pot, rozet gibi oyun metinleri piksel fontludur.
- Tüm sprite'lar kodla üretilir: suit bitmap'leri (7x7), 12 benzersiz bot avatarı + oyuncuya özel avatar (8x8, parametrik saç/ten/gömlek), piksel chip yığınları (renk değerine göre). Kart suit'i hem şekil hem renkle gösterilir.
- Palet 12 renkle sınırlı; kenarlar keskin, border-radius yok, masa kumaşı 8px dama dokusu ve basamaklı köşeli `clip-path` ile piksel görünümlü.
- Animasyonlar `steps()` ile adım adım: kart dağıtma (desteden koltuğa), flop/turn/river çevirme (yüz yarıda görünür), chip'lerin pota toplanması ve kazanana kayması, sırası gelen koltukta yanıp sönen çerçeve, kazanan 5 kartın parlaması (diğerleri soluk). Süreler `--k` çarpanıyla ölçeklenir: Normal 1, Hızlı 0.4, Kapalı 0 (animasyonlar tamamen devre dışı, kartlar anında açılır).
- Animasyon mantığı (uçuş planı, koltuk/bahis konumları, kazanan kartlar) saf fonksiyonlardır (`ui/anim.ts`) ve birim testlidir; bileşenler yalnızca çizer.
- Animasyon hızı ayarı şimdilik menüde, oturum boyunca bellekte tutulur; kalıcı ayar kaydı Milestone 9'da `localStorage` katmanıyla eklenecek.

## Milestone 7
- Ses: tamamen Web Audio ile sentezlenir (kare/üçgen dalga osilatörler + gürültü patlamaları), ses dosyası yok. Sesler `audio/sounds.ts` içinde veri olarak tanımlı: kart dağıtma/açma, chip, check, fold, raise, all-in, kazanma, kaybetme, sıra sende uyarısı.
- Autoplay: `AudioEngine` ilk kullanıcı etkileşimine (pointerdown/keydown) kadar `AudioContext` oluşturmaz, o zamana kadar her çağrı etkisizdir; `unlock()` bağlamı oluşturur ve askıdaysa `resume()` eder.
- Efekt ve müzik ayrı gain bus'larından geçer, ayrı açma/kapama ve ses seviyesi vardır (menüde ve masa üst çubuğunda). Ses eğrisi `(v/100)^2`. Varsayılanlar: efekt 70, müzik 25 (müzik daha kısık).
- Müzik (README'de isteğe bağlı bonus): Am-F-C-G üzerine 4 ölçülük, veriden üretilen hafif döngü; ileri zamanlamalı (look-ahead) planlayıcı ile çalınır, kapatılabilir, varsayılan açık.
- Hangi olayda hangi ses: `audio/events.ts` saf fonksiyonu (`soundsForTransition`). Bir state değişiminde en fazla birkaç ses çalar; çok sokaklı otomatik board açılışı tek "deal" sesi verir; oyuncu fold ettiyse el sonunda ayrıca kaybetme sesi çalmaz.
- Ses ayarları şimdilik oturum belleğinde; kalıcı kayıt Milestone 9'da `localStorage` ile eklenecek.

## Milestone 8
- Kayıt: her biten el (`PAYOUT`) bir kez `HandRecord` olarak saklanır: el numarası, tarih, oturum, oyuncular ve pozisyonları (BTN/SB/BB/UTG/MP/CO), el başı ve sonu stack'ler, board, tüm aksiyonlar, pot, kazananlar ve el adı. Hole card olarak yalnızca oyuncunun kendi kartları ve showdown'da açılanlar yazılır; katlanan botların kartları saklanmaz. Blöf işaretlenmez.
- `pot` ve `winners[].amount` karşılanmayan bahsin iadesinden sonraki yarışılan potu gösterir; net sonuç (`humanNet`) iadeyi içerir.
- Replay: `buildReplay` kayıtlı elden blind'ler, her aksiyon (stack/bahis/pot ile) ve sonuç adımlarını üretir. Sonuçtan önce yalnızca oyuncunun kartları görünür.
- İstatistikler `StatsData` olarak artımlı tutulur (el geçmişinden ayrı), bu yüzden 500 el sınırı "tüm zamanlar" değerlerini bozmaz. Oturum istatistiği her yeni oturumda (Play) sıfırlanır, tüm zamanlar devam eder. Bakiye grafiği son 1000 el ile sınırlıdır. Kazanılan el = pot'tan pay alınan el; VPIP: pre-flop gönüllü call/bet/raise/all-in (BB check'i sayılmaz); PFR: pre-flop bet/raise/all-in.
- Bot profilleri (gözlenen VPIP/PFR) mevcut oturumun kayıtlarından hesaplanır. Gözlenen blöf oranı hesaplanmadı (README'de "hesaplanabilir" denmiş, zorunlu değil).
- Kalıcılık: `localStorage`, erişilemezse bellek içi yedek. Sürüm anahtarlı (`.v1`), bozuk veri sessizce boş kabul edilir. Kota dolarsa en eski %10 silinerek yeniden denenir. En fazla 500 el, aşılırsa en eskiler silinir.
- Sıfırlama: "Reset statistics" istatistikleri, "Clear hand history" el geçmişini siler; ikisi de onay ister ve birbirinden bağımsızdır.
- Dışa aktarma: JSON (`game`, `version`, `exportedAt`, `hands`) tarayıcıdan indirilir.

## Milestone 9
- Ayarlar (masa, animasyon hızı, ses) `localStorage`'da `pixelPoker.settings.v1` altında saklanır; okunurken doğrulanır, bozuk/geçersiz değerler varsayılana düşer. Geçersiz masa ayarı (ör. stack < 10 BB) kaydedilmez ve Play pasif olur. İşletim sistemi "azaltılmış hareket" istiyorsa, kayıtlı ayar yokken animasyonlar kapalı başlar.
- Motor girdi doğrulaması: blind ve stack'ler tam sayı, SB > 0, BB >= SB, stack >= 0; aksi halde `PokerGame` hata fırlatır (UI zaten aynı kuralı uygular).
- Ses motoru Web Audio yoksa ya da başlatılamazsa hata fırlatmaz, sessiz kalır.
- Erişilebilirlik: kartlarda kırmızı renk kontrast için koyulaştırıldı (#b3261e); palet değerleri `ui/palette.ts` ile CSS arasında testle eşitlenir ve metin kontrastları WCAG AA (4.5:1) için doğrulanır. Klavye kısayolları (F/C/R), görünür odak çerçevesi, `aria-live` ile "Your turn" duyurusu, kartlar için `aria-label`, `prefers-reduced-motion` desteği.
- Mobil: dar ekranlarda koltuk/kart ölçeği küçülür, avatar gizlenir, üst çubuk dikey dizilir. Masa oranı (16/10) animasyon hesapları için sabit tutuldu.
- Test ortamı: arayüz duman testi için jsdom + Testing Library eklendi (ekran akışı, kalıcılık, klavye kısayolu, replay). Bu testler davranışı doğrular, görsel görünümü değil.
- Bot adaptasyonu (README'de isteğe bağlı bonus) ve gözlenen blöf oranı bilinçli olarak yapılmadı.

## Okunabilirlik güncellemesi
- Kartlar büyütüldü (masa kartı 64x90, koltuk kartı 48x68), kart üzerindeki rank ve suit sprite'ları bir kademe büyütüldü. İsim, stack, rozet, bahis, pot ve üst çubuk piksel yazıları 1-2 kademe büyütüldü, avatar 40 px oldu, temel yazı boyutu 18 px.
- Koltuk halkası dikeyde biraz daraltıldı (yarıçap 38 -> 34) ve bahis chip'leri pota yaklaştırıldı; böylece büyük koltuklar taşmıyor ve birbirinin üstüne binmiyor.
- Ölçekleme artık sabit ekran eşiklerine değil masanın kendi genişliğine bağlı (container query + zoom): masa daraldıkça koltuklar ve board kademeli küçülür. Masa genişliği ayrıca pencere yüksekliğiyle sınırlanır, böylece aksiyon butonları genelde kaydırmadan görünür kalır.

## Kart boyutu güncellemesi
- Masa kartları 92x128, koltuk kartları 68x96 piksel; rank, suit ve büyük suit sprite'ları buna göre büyütüldü (rank/suit ölçeği 4 ve 3, büyük suit 6 ve 4).
- Masa oranı 16/10'dan 16/11'e çıkarıldı (büyük koltuklara yer açmak için). Oran tek bir sabitten (`FELT_ASPECT`) gelir; animasyon hesapları onu kullanır ve CSS'teki değerle uyumu testle doğrulanır. Masa genişliği için pencere yüksekliği payı 210 px'ten 150 px'e indirildi: küçük ekranlarda aksiyon butonları için hafif kaydırma gerekebilir.
- Dar masada küçülme ikiye ayrıldı: yazılar ve avatarlar önce ve daha çok küçülür (840 px altında avatar gizlenir), kartlar daha az küçülür; kartların okunabilir kalması öncelikli.

## Çip fiziği ve kart ölçeği güncellemesi
- Çipler artık `chipPhysics.ts` içindeki saf fizikle simüle edilir: parabolik atış (yerçekimi, belirlenen tepe yüksekliği, hedefe tam T saniyede iniş), her çarpmada enerji kaybıyla sekme (geri kazanım 0.45), sekmede yatay sürtünme ve zeminde kayma direnci, durma. Çizim `ChipLayer` (canvas) ile piksel çipler ve zeminde kalan gölgeyle yapılır.
- Çip atışları: bahis yapınca koltuktan bahis noktasına, sokak bitince bahislerden pota, el sonunda pot'tan kazananlara. Her atışta tutara göre birkaç çip (en fazla 10, değere göre renkli) kademeli gecikmeyle ve hafif saçılmayla atılır. Ortada toplanmış pot için çip yığını gösterilir. Animasyon hızı "Kapalı" ise çip atışı yoktur.
- Kartların boyutu sabit piksel ve zoom yerine masa genişliğine bağlandı (`--cw`, container query birimleri): masa kartı masa genişliğinin %10.5'i (64-160 px), koltuk kartı %8.5'i (52-128 px). Rank ve suit sprite'ları kart genişliğiyle orantılı ölçeklenir, böylece büyük masada kartlar büyür, dar masada orantılı küçülür.

## Çip kayması ve orta boy kartlar (güncelleme)
- Çipler artık sekmez: üstten görünen düz diskler olarak masanın üzerinde sabit sürtünmeyle kayar (başlangıç hızı 2D/T, yavaşlama 2D/T^2) ve hedefte tam durur; yayı, yüksekliği ve sekmesi yoktur. Kayma süresi yaklaşık 0.7 sn.
- Çipler üstten görünüşlü piksel disklerdir (11x11: siyah dış çizgi, 8 çentikli kenar bandı, gövde, açık renkli merkez). Değerine göre renkli: 1 gri-beyaz, 5 kırmızı, 25 yeşil, 100 lacivert/altın kenar, 500 mor, 1000 sarı. Bahis ve pot yığınları da üstten görünüşlüdür (az miktarda alttaki çipler hafif kayık görünür).
- Kart boyutu küçültüldü: masa kartı masa genişliğinin %7.5'i (54-104 px), koltuk kartı %6'sı (44-82 px). Koltuk minimum genişliği 120 px.

## Tasarım yenilemesi (gerçek tarayıcı ekran görüntüleriyle doğrulandı)
- Sahne: masa ekranı sabit 1280x720 tasarım sahnesidir ve pencereye oranı korunarak sığacak şekilde ölçeklenir (letterbox). Hiçbir çözünürlükte kaydırma yoktur; 1024x768, 1280x720, 1366x768, 1920x1080 ve 2560x1080'de ölçüldü. Kart, yazı ve koltuk boyutları artık sabit tasarım pikselleridir (masa kartı 72x100, rakip kartı 44x62, oyuncunun kartı 66x92); açılan showdown kartları oyuncu boyutunda gösterilir.
- Masa: ahşap kenarlı, basamaklı piksel hatlı oval masa; statik katmanlar (kenar, keçe) hareketli içerikten ayrıldığı için çip animasyonu ve parlama sırasında yeniden boyanmaz. Tarayıcıda 60 fps ölçüldü.
- Çipler: 15x17 piksel, üstten görünüşlü, kenar kalınlığı gösteren renkli çipler (1/5/25/100/500/1000 için ayrı renk), bahis ve pot için dikey yığınlar. Çipler sekmeden sürtünmeyle kayar; hedefte pile karışır. Bir yığının sayısı ve kazananın stack'i, çipler varınca (700 ms gecikmeyle) artar; azalmalar anında görünür.
- Oyun mekaniği/arayüz: koltuk başına son hamle etiketi (FOLD/CHECK/CALL/BET/RAISE/ALL-IN, sokak değişince temizlenir), dealer düğmesi, oyuncunun güncel el adı, call butonunda pot odds ve gereken equity, bet boyutu hazır ayarları (ilk raise için 2.5x/3x/4x BB, re-raise için mevcut bahsin katları, flop sonrası pot kesirleri), bahis miktarı chip adımına yuvarlanır (min ve all-in kesin), sabit yükseklikli alt panel (arayüz zıplamaz), kazananın kartları vurgulanır, otomatik sonraki el (ayarlardan kapatılabilir).
- Bot adaptasyonu (isteğe bağlı bonus) hâlâ yapılmadı.

## Kozmetik düzeltmeler (menü ve istatistik)
- Menü: başlık taşması giderildi (ölçeklenir, ortalanır, altın renkli), etiketler tek satır, bölümlere ayrıldı (Game / Display and sound), onay kutuları ve kaydırıcılar altın renkte, "Play" birincil buton, Statistics ve Hand history yan yana, dar ekranda yatay kaydırma yok, 768 px yüksekliğe sığıyor. Sayfa dili `en` yapıldı (Türkçe dil ayarı büyük harfe çevirirken "İ" üretiyordu).
- İstatistik: veri yokken anlamsız grafik yerine açıklama gösterilir, grafik panel genişliğinde, kutular iki satıra sığar, başlık boşlukları sıkılaştırıldı.
