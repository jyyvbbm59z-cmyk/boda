// ─────────────────────────────────────────────────────────────
//  Todo lo que se ve en la web sale de aquí.
//  Cambia los textos, guarda y despliega (npm run deploy).
//  ⚠ Lo marcado con PENDIENTE es provisional.
// ─────────────────────────────────────────────────────────────

export const EVENT = {
  couple: ['Paula', 'Carlos'],
  // Fecha y hora de la ceremonia (hora de Madrid)
  date: '2027-05-22T13:00:00+02:00',
  // Hasta cuándo se puede confirmar o cambiar la respuesta
  rsvpDeadline: '2027-04-22T23:59:00+02:00', // PENDIENTE: un mes antes, a confirmar

  venue: {
    name: 'Villa Delia',
    town: 'Picaña',
    address: 'Camí dels Horts, 46210, Picaña',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Villa+Delia+Picanya',
    wazeUrl: 'https://waze.com/ul?q=Villa%20Delia%20Picanya&navigate=yes',
    parking: 'La finca tiene aparcamiento propio.',
  },

  intro: 'Nos hace mucha ilusión compartir este día tan especial contigo. ¡No\u00a0faltes!',

  // Horario del día (PENDIENTE: confirmar con la finca)
  schedule: [
    { time: '12:30', title: 'Llegada', text: 'Os esperamos en la entrada de la finca.' },
    { time: '13:00', title: 'Ceremonia civil', text: 'En el jardín. Cortita, prometido.' },
    { time: '14:00', title: 'Cóctel', text: 'Junto a la pérgola.' },
    { time: '15:30', title: 'Comida', text: 'Si tenéis alguna alergia, indicadlo al confirmar.' },
    { time: '18:30', title: 'Fiesta', text: 'Barra libre y las canciones que propongáis.' },
    { time: '23:00', title: 'Última vuelta', text: 'Sale el último autobús.' },
  ],


  // Paradas del autobús (PENDIENTE)
  bus: {
    note: 'Ponemos autobús para que nadie tenga que conducir. Marcadlo en el formulario para reservar plaza.',
    stops: [
      { id: 'valencia', name: 'Valencia, plaza de España', out: '11:15', back: '20:00 y 23:00', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Plaza+de+Espa%C3%B1a+Valencia' },
      { id: 'meliana', name: 'Meliana, ayuntamiento', out: '10:50', back: '20:00 y 23:00', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Ayuntamiento+de+Meliana' },
    ],
  },

  // Plazas totales y personas como máximo en cada respuesta
  capacity: 200,
  maxPerResponse: 6,

  maxSongs: 3,

  // Música de fondo: deja el MP3 en public/ y pon aquí su nombre ('' = sin música)
  music: '',

  // Regalo. Deja iban vacío ('') para ocultar la sección.
  gift: {
    text: 'Lo mejor que nos podéis regalar es venir. Si además queréis tener un detalle, aquí tenéis nuestra cuenta.',
    iban: '', // PENDIENTE, p. ej. 'ES00 0000 0000 0000 0000 0000'
  },

  faq: [
    { q: '¿Cómo hay que ir vestido?', a: 'Formal pero cómodo. La ceremonia es en jardín: mejor tacón ancho que de aguja.' },
    { q: '¿Pueden venir los niños?', a: 'Claro. Al confirmar, marcad quién es niño o niña para que el catering lo tenga en cuenta.' },
    { q: '¿Dónde está el código para confirmar?', a: 'En la invitación. Si no lo encontráis, preguntadnos.' },
    { q: '¿Y si cambio de idea?', a: 'Al confirmar os damos un enlace propio. Desde ese enlace (o desde este mismo móvil) podéis cambiar la respuesta hasta la fecha límite.' },
    { q: '¿A quién llamo si tengo dudas?', a: 'A cualquiera de los dos. Paula: 600 000 000. Carlos: 600 000 000.' }, // PENDIENTE
  ],
};
