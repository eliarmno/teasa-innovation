## Endpoint contatti (Serverless Vercel)

Questo progetto include un endpoint `api/contact.js` per inviare email dal form di contatto senza interazione dell’utente (niente mailto, niente verifiche).

### Variabili d’ambiente (Vercel → Settings → Environment Variables)
- RESEND_API_KEY: opzionale ma consigliata (chiave API Resend)
- FROM_EMAIL: mittente es. `Sito Teasa <no-reply@teasa-innovation.com>` (richiesta)
- TO_EMAIL: destinatario es. `elia.rmno@gmail.com` (obbligatoria)
- SMTP_HOST: host SMTP (opzionale, fallback)
- SMTP_PORT: porta SMTP (opzionale, fallback, es. 465/587)
- SMTP_USER: utente SMTP (opzionale, fallback)
- SMTP_PASS: password SMTP (opzionale, fallback)

Note:
- Se usi il fallback SMTP è necessario aggiungere la dipendenza `nodemailer` alle dipendenze del progetto (package.json).
- L’endpoint usa prima Resend; se non configurato o fallisce, prova SMTP; se falliscono entrambi ritorna 502/500.

### Deploy rapido su Vercel
1. Imposta le variabili d’ambiente sopra indicate.
2. Esegui deploy (o `vercel` da terminale). Per sviluppo locale: `vercel dev`.
3. L’endpoint sarà disponibile su `/api/contact`.

### Test locale
- Avvia: `vercel dev`
- Testa con cURL (vedi `test-curl.txt`).

### Log
- Vercel → Project → Deployments → Logs (filtra per Function logs)

### Rate limiting
- Implementato in-memory (Map). Su serverless è effimero per istanza/dimensione del cluster.
- Produzione: si consiglia uno store condiviso (es. Redis) per rate limiting consistente.

### Integrare il frontend
- Non è necessario modificare il markup del form.
- Incolla lo snippet in `snippets/contact-client.txt` vicino al tuo `submit` handler attuale.
- Lo snippet invia JSON a `/api/contact`, disabilita il bottone durante l’invio e mostra stato di successo/errore. In caso di successo, resetta il form e chiude la modal (se disponibile `closeModal()`).

### cURL veloce
Vedi `test-curl.txt` per esempi pronti.

### Errori comuni
- 400: campi mancanti/invalidi (`name`, `email`, `message`).
- 429: troppe richieste dall’IP (più di 6 in 10 minuti).
- 502/500: inoltro email fallito (controlla configurazione Resend/SMTP e i Log).
