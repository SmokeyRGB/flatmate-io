export function dataNoticeText(name: string) {
  return `Hallo ${name},

wir haben deine Angaben (Name, Alter, Kontakt, Nachricht) für die Zimmerbewerbung gespeichert. Verantwortlich dafür ist unsere WG, nicht die App. Wir nutzen die Daten nur für dieses Casting und löschen sie danach. Du kannst jederzeit Auskunft, Berichtigung oder Löschung verlangen — schreib uns einfach.

Viele Grüße
Deine WG in spe`;
}

export function thirdPartyNoticeText(name: string) {
  return `Hallo ${name},

wir haben deine Angaben für unsere Zimmervergabe nicht von dir selbst, sondern über Dritte bekommen (Name, Alter, Kontakt und was uns erzählt wurde). Das wollten wir dir offen sagen.

Verantwortlich für diese Daten ist unsere WG. Wir nutzen sie nur für dieses Casting und löschen sie danach. Du kannst jederzeit Auskunft, Berichtigung, Löschung oder Widerspruch verlangen — eine kurze Nachricht genügt, dann ist das erledigt.

Viele Grüße
Deine WG in spe`;
}

export function invitationText(name: string) {
  return `Hallo ${name},

die WG hat abgestimmt: Wir laden dich zum Kennenlernen ein. Melde dich einfach bei uns, dann finden wir gemeinsam einen Termin.

${dataNoticeText(name).split("\n").slice(2).join("\n")}`;
}
