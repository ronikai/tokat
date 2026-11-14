# TOKAT BAR

Aynı WiFi'daki iki bilgisayardan, sadece fare ile oynanan 1v1 tokat düellosu.
Karşında rakibin duruyor; bar üzerinde salınan iğneyi **tam merkezde** durdurursan
en sert tokatı atarsın.

## Nasıl oynanır

1. `start.bat` çift tıkla (ya da `node server.js`)
2. Konsolda çıkan `http://192.168.x.x:3000` adresini arkadaşınla paylaş
3. Biri **ODA KUR** der, 4 haneli kodu arkadaşına verir
4. Arkadaşı kodu girer, ikiniz karakter + el seçersiniz
5. Sırayla değil, **aynı anda**: herkes kendi barında iğneyi tıklayıp kilitler
   - Merkeze yakınlık = tokat gücü
   - Yüksek güç rakibine hasar verir, düşük güçte senin elin savrulur
   - Canı biten kaybeder

## İnternetten oynama

Siteye girip **ODA KUR** diyebilirsin; bağlantı PeerJS (WebRTC) üzerinden
doğrudan iki tarayıcı arasında kurulur, sunucu gerekmez.

## Yapı

```
index.html      arayüz + sahne iskeleti
style.css       pixel-art tema, sahne, HUD
game.js         oyun döngüsü, bar mekaniği, PeerJS ağı
assets.js       karakter/el listesi + SVG şişe, kadeh, seyirci
img/            10 karakter portresi (normal + darbe), 9 el
sfx/            tokat ve arayüz sesleri
server.js       sıfır bağımlılıklı yerel sunucu
```

## Notlar

- Karakter ve el görselleri pixel-art setlerden kesilip şeffaf PNG'ye çevrildi.
- Sesler: Kenney (CC0) + tokat kayıtları.
- Tarayıcı tam ekran: sağ alttaki ⛶ veya `F`.
