# Kòd QR yon sèl-itilizasyon

Yon ti aplikasyon pou kreye QR diferan pou chak moun. Premye moun ki ouvri kòd la valide l; nenpòt lòt tantativ resevwa yon mesaj ki di kòd la deja itilize. Bazdone SQLite la fè verifikasyon sa a atomik, menm si de moun eseye an menm tan.

## Kouri lokalman

Nan PowerShell, nan katab pwojè a:

```powershell
python -m pip install -r requirements.txt
$env:ADMIN_PASSWORD = "chwazi-yon-modpas-solid"
$env:SECRET_KEY = "mete-yon-kle-sekrè-long-epi-inik"
python app.py
```

Apre sa, antre sou `http://localhost:5000`. Kole non oswa ID yo nan paj prensipal la, youn sou chak liy, epi klike **Kreye kòd QR**. Chak liy ap jwenn pwòp QR ak pwòp lyen. Ou ka telechaje QR a oswa kopye lyen an pou voye bay moun nan.

## Pou moun eskane yo ka rive sou sèvis la

Sèvis la dwe rete limen epi adrès QR la dwe aksesib pou moun k ap eskane a. `localhost` mache sèlman sou òdinatè k ap kouri sèvis la. Pou teste ak telefòn sou menm rezo a, sèvi ak adrès rezo òdinatè a; sepandan, browser telefòn yo bezwen yon paj HTTPS pou bay aksè kamera. Pou itilize eskanè kamera a sou telefòn oswa voye kòd bay moun lòt kote, mete aplikasyon an sou yon hosting HTTPS epi mete adrès piblik la nan `BASE_URL`, pa egzanp `https://qr.egzanp.com`.

Kenbe `ADMIN_PASSWORD` ak `SECRET_KEY` sekrè; pa sèvi ak modpas default `change-me` sou yon sèvè ki aksesib pou lòt moun. Kenbe fichye bazdone `data/codes.sqlite3` sou yon depo ki pèsistan. Sèvi ak yon sèl kopi aplikasyon an pou menm bazdone SQLite la.