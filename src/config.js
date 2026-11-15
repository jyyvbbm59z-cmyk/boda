// ─────────────────────────────────────────────────────────────
//  Todo lo que se ve en la web sale de aquí.
//  Cambia los textos, guarda y despliega (npm run deploy).
//  ⚠ Lo marcado con PENDIENTE es provisional.
// ─────────────────────────────────────────────────────────────

export const EVENT = {
  couple: ['Paula', 'Carlos'],
  // Fecha y hora de la ceremonia (hora de Madrid)
  date: '2027-05-22T12:30:00+02:00', // PENDIENTE: hora de la ceremonia
  // Hasta cuándo se puede confirmar o cambiar la respuesta
  rsvpDeadline: '2027-04-22T23:59:00+02:00', // PENDIENTE: un mes antes, a confirmar

  venue: {
    name: 'Villa Delia',
    town: 'Picanya, Valencia',
    address: 'Camí del Hort, s/n, 46210 Picanya, Valencia',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Villa+Delia+Picanya',
    wazeUrl: 'https://waze.com/ul?q=Villa%20Delia%20Picanya&navigate=yes',
    parking: 'La finca tiene aparcamiento propio.',
  },

  intro:
    'Nos casamos. Queremos celebrarlo en un jardín de Picanya con la gente que más queremos, y eso os incluye a vosotros.',

  // Horario del día (PENDIENTE: confirmar con la finca)
  schedule: [
    { time: '12:00', title: 'Llegada', text: 'Os esperamos en la entrada de la finca.' },
    { time: '12:30', title: 'Ceremonia civil', text: 'En el jardín. Cortita, prometido.' },
    { time: '13:30', title: 'Cóctel', text: 'Junto a la pérgola.' },
    { time: '15:00', title: 'Comida', text: 'Con el menú que elijáis aquí abajo.' },
    { time: '18:00', title: 'Fiesta', text: 'Barra libre y las canciones que propongáis.' },
    { time: '23:00', title: 'Última vuelta', text: 'Sale el último autobús.' },
  ],

  // Menús que se pueden elegir. "kids: true" = solo para niños.
  menus: [
    { id: 'carne', label: 'Carne' },
    { id: 'pescado', label: 'Pescado' },
    { id: 'vegetariano', label: 'Vegetariano' },
    { id: 'infantil', label: 'Infantil', kids: true },
  ],

  // Paradas del autobús (PENDIENTE)
  bus: {
    note: 'Ponemos autobús para que nadie tenga que conducir. Marcadlo en el formulario para reservar plaza.',
    stops: [
      { id: 'valencia', name: 'Valencia, plaza de España', out: '11:15', back: '20:00 y 23:00', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Plaza+de+Espa%C3%B1a+Valencia' },
      { id: 'meliana', name: 'Meliana, ayuntamiento', out: '10:50', back: '20:00 y 23:00', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Ayuntamiento+de+Meliana' },
    ],
  },

  maxSongs: 3,

  // Regalo. Deja iban vacío ('') para ocultar la sección.
  gift: {
    text: 'Lo mejor que nos podéis regalar es venir. Si además queréis tener un detalle, aquí tenéis nuestra cuenta.',
    iban: '', // PENDIENTE, p. ej. 'ES00 0000 0000 0000 0000 0000'
  },

  faq: [
    { q: '¿Cómo hay que ir vestido?', a: 'Formal pero cómodo. La ceremonia es en jardín: mejor tacón ancho que de aguja.' },
    { q: '¿Pueden venir los niños?', a: 'Si vuestra invitación los incluye, aparecerán en el formulario con su menú infantil.' },
    { q: '¿Puedo llevar acompañante?', a: 'El formulario os deja añadir tantas personas como plazas tiene vuestra invitación. Si necesitáis alguna más, escribidnos.' },
    { q: '¿Y si cambio de idea?', a: 'Volved a entrar con el mismo enlace y cambiad lo que queráis hasta la fecha límite.' },
    { q: '¿A quién llamo si tengo dudas?', a: 'A cualquiera de los dos. Paula: 600 000 000. Carlos: 600 000 000.' }, // PENDIENTE
  ],
};
