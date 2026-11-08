# Budget-Setup (Fork Tk2890/automaton)

Dieser Fork begrenzt Ausgaben und Selbstvermehrung hart im Code.

## Regeln für Selbstvermehrung (`src/replication/policy.ts`)

Ein Kind wird nur gestartet, wenn **alle** Bedingungen erfüllt sind:

| Regel | Standard |
|---|---|
| Eigener Gewinn = (Credits + USDC) − eingezahltes Startkapital | mind. **10 $** |
| Gleichzeitig aktive Kinder | max. **1** |
| Startgeld pro Kind (nur aus Gewinn, nie aus deinem Geld) | max. **5 $** |
| Kinder dürfen sich selbst vermehren | **nein** |
| Kontostand nicht lesbar | Vermehrung wird **verweigert** |

Kinder klonen diesen Fork (`AUTOMATON_CHILD_REPO_URL` zum Überschreiben),
damit dieselben Regeln auch für sie gelten.

## Ausgabegrenzen (neue Standardwerte)

| Grenze | Original | Fork |
|---|---|---|
| KI-Kosten pro Tag | 500 $ | **2 $** |
| Einzelne Überweisung | 50 $ | **5 $** |
| Überweisungen pro Stunde | 100 $ | **5 $** |
| Überweisungen pro Tag | 250 $ | **10 $** |

## Wichtig: Startkapital eintragen

In `~/.automaton/automaton.json`:

```json
{
  "replicationPolicy": {
    "creatorFundedCents": 2000
  }
}
```

`creatorFundedCents` ist alles, was du **insgesamt** eingezahlt hast (in Cent).
Wenn du später nachlädst, erhöhe den Wert entsprechend, sonst zählt dein
eigenes Geld als „Gewinn“.
