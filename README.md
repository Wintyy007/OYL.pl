# OYL

Strona wytworni muzycznej OYL z prostym serwerem `Node.js`.

## Uruchomienie

```bash
npm start
```

Serwer uruchomi sie domyslnie na:

```text
http://localhost:3000
```

## Trasy

- `/`
- `/o-nas/`
- `/artysci/`
- `/utwory/`
- `/premiery/`
- `/kontakt/`
- `/api/latest-tracks`

## Uwagi

- Katalog `/private` jest zablokowany bezposrednio przez serwer.
- Potrzebne pliki frontendu sa serwowane tylko przez:
  - `/assets/styles.css`
  - `/assets/scripts.js`
- Najnowsze utwory sa pobierane dynamicznie z kanalu:
  - `https://www.youtube.com/@Young_Olek`
- CSS i JS nadal trafiaja do przegladarki, wiec nie da sie ich calkowicie ukryc przed uzytkownikiem, jesli strona ma dzialac.
