# Kòd QR yon sèl-itilizasyon

Aplikasyon an kreye yon QR diferan pou chak moun. Premye eskanè a valide kòd la; pwochen eskanè yo jwenn `used`. Cloudflare Pages sèvi paj la ak Pages Functions yo, epi D1 sere kòd yo, sesyon admin yo, ak estati itilizasyon yo.

## Kouri lokalman

Nan PowerShell, nan katab pwojè a:

```powershell
npm.cmd install
npm.cmd run d1:migrate:local
npm.cmd run dev -- --binding ADMIN_PASSWORD=yon-modpas-tès-lokal
```

Louvri `http://127.0.0.1:8788`. D1 lokal la rete anba `.wrangler/`; li pa konekte ak Cloudflare remote. Kòmand dev la sèlman retire `Secure` flag cookie a pou HTTP lokal la.

## Deplwaye sou Cloudflare

Kreye oswa konekte ak kont Cloudflare ou:

```powershell
npm.cmd exec -- wrangler login
npm.cmd run d1:create
npm.cmd run d1:migrate:remote
npm.cmd run pages:create
```

`d1:create` kreye D1 `qr-codes` epi mete ID remote li nan `wrangler.toml`. Fichye sa a pa gen sekrè; commit epi pouse chanjman ID a sou GitHub.

## Kenbe QR ki deja egziste yo

Anvan deplwaman an, exporte bazdone SQLite lokal la. SQL export la gen bearer tokens; li ekri anba `data/`, ki nan `.gitignore`.

```powershell
python scripts/export_sqlite.py
npm.cmd exec -- wrangler d1 execute qr-codes --remote --file data/codes-import.sql
```

Export la idempotan: li sèvi ak token an kòm kle inik epi li konsève `used_at`. Pa pouse `data/codes-import.sql` sou GitHub. Kenbe fichye a lokal pou backup, oswa efase li apre ou fin verifye migrasyon an.

## Mete sekrè yo epi pibliye

Kreye modpas admin lan kòm sekrè Cloudflare; Wrangler ap mande w antre l nan terminal la. Pa mete modpas la nan fichye, nan GitHub, oswa nan chat.

```powershell
npm.cmd exec -- wrangler pages secret put ADMIN_PASSWORD --project-name qr-yon-sel-fwa
npm.cmd run deploy
```

Pages bay yon domèn `pages.dev` sou HTTPS. Kamera telefòn lan mande HTTPS ak pèmisyon kamera. D1 remote ak Pages bezwen yon kont Cloudflare; verifye kota ak kondisyon plan kont ou anvan deploy. Render pa nesesè pou chemen sa a.

## Kòd QR ki te enprime deja

Tokens yo ak estati `used_at` yo pase nan migrasyon an. URL nan ansyen QR ki te kode ak yon domèn tanporè Render/Cloudflare ap toujou lonje dwèt sou ansyen domèn sa a; apre deplwaman an, telechaje QR yo ankò nan dashboard la pou jwenn URL `pages.dev` la. Sa pa kreye nouvo token, li kenbe menm validite yon sèl-itilizasyon an.