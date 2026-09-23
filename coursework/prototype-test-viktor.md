# Prototype User Test 
**Tester:** Viktor

## Allgemein
Note: Einladungs-Link für Bewerber-Informationen sollte früh implementiert werden um Aufgaben für Mods zu minimieren (evtl. vorziehen in v0.2 da kein großer Aufwand?) 

## RESIDENT-VIEW:
### Registrierung
- [!!!] Beitritt funktioniert nicht, weil Password-Info zu kurz angezeigt wurde
  -> Beim eingeben des Passworts wird gecheckt, dass es sicher ist - Info was required wird ist allerdings nicht angezeigt
   -> Das sollte nicht so!!! Entweder zeige an was für das Password required wird oder checke nicht, ob es sicher ist.
   -> Bspw. "Mind. Großbuchstabe & Kleinbuchstabe + Nummer"

### Dashboard
-> "8 von 8 haben abgestimmt - wer ist dabei" Screen ist unaussagekräftig! Es steht nicht da wer abgestimmt hat, und es ist auch so gedacht laut Text im Prototypen.
   -> Die Info wer alles abgestimmt hat gehört insgesamt in die Rangliste. Außerdem sollte man sehr wohl sehen, wer von den Stimmberechtigten schon abgestimmt hat.

-> [i] Viktor clicked zuerst auf Notifications, nicht auf Screening.
   -> Bei Neubeitritt sollte das Notificationzentrum noch nicht auffällig auf Notifications hinweisen.
      -> Evtl. nur Problem wegen Placeholder Notifications im Prototyp? Sonst sollte es ja keine "was habe ich verpasst" Infos beim Neubeitritt geben?
   -> Notifications sind noch unaussagekräftig. 
      -> "Wechselte von 'Neu' zu 'Gesehen'" ist zu technisch.
      -> Auch "Lisa Petersen wurde erfasst - 'Neu'" ist nicht verständlich. "Neue Bewerbung: Lisa Petersen" wäre besser.
   

### Rangliste
-> [!] Rangliste: 'Ergebnisse bleiben verdeckt bis du selbst abgestimmt hast' wird auch angezeigt, wenn man schon abgestimmt hat.
  -> Das ist verwirrend. Es sollte nur angezeigt werden, wenn man noch NICHT abgestimmt hat. Text oben in der Rangliste kann weg, da Bewerber-Scores mit genau dieser Nachricht auch ausgeblendet werden.

-> 'Ehemalige Bewohnerinnen können weiter mitlesen' in Info-Menü "So entsteht die Rangliste"
  -> das ist falsch: Ehemalige Bewohnerinnen sollten sich nichtmal einloggen können. Dementsprechend auch nicht mitlesen können.

-> Es sollte in der Rangliste (wenn man eine Einzelansicht eines Bewerberscores anklickt) angezeigt werden, wer wie abgestimmt hat, nicht nur die Gesamtzahl an einzelnen Votes.

-> "Status: Gesehen" in der Einzelansicht eines Bewerberscores - ist nicht aussagekräftig und verwirrend. 
  -> Was sagt der Status eines Bewerbers für den User im Moment aus? "Gesehen" im Vokabular unverständlich. Zeigt das, dass ich einen Bewerber gescreened habe, oder dass ALLE den Bewerber gescreened haben?


## ORGA-VIEW:
### Diese Runde:
- Runde & Bewerbungen der Runde gehören gemeinsam gruppiert - im Moment sind es distinke Boxen.
   -> Das gehört in eine Bubble.
- "Einladen" Button wechselt nur den Status, leitet nicht auf den Einladungs-Screen
- 'Archivieren' von Bewerbern unnötig.


### Mitglieder Screen:
- Einladungslink hinter eigenem Screen verstecken, außerdem unter der Mitgliederliste verschieben.
- Einladungslink "Zurückziehen" ist verwirrend, "Löschen" wäre informativer.
- Verbrauchte Einladungslinks ausgrauen "aufgebraucht" nicht deutlich genug.
   -> Außerdem sollte bei verwendeten Einladungslinks stehen, welcher Bewohner sich darüber registriert hat.

- "Kontakt" Button eigentlich unnötig.
   -> Entfernen!!!

- WG-Konto kann ausgeblendet werden. Was hilft die Info?



## Für den Moment ausgeklammert:
-> Stimmänderung - Sollte eine Stimmänderung Verifizierung von Moderatoren brauchen?
  -> Pro: Hindernis für Stimmänderung
  -> Contra: Noch eine Aufgabe für Moderation
