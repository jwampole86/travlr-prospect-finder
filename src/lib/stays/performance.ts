const DAY = 86_400_000;

/** Revenue counts a booking in the window its check-in falls in; nights are clipped to the window, so occupancy never exceeds 100%. */
export function performance(bookings: Array<{ check_in: string; check_out: string; total: number | string }>, from: string, to: string) {
  const windowNights = Math.round((Date.parse(to) - Date.parse(from)) / DAY);
  let nights = 0;
  let revenue = 0;
  for (const b of bookings) {
    const start = Math.max(Date.parse(b.check_in), Date.parse(from));
    const end = Math.min(Date.parse(b.check_out), Date.parse(to));
    nights += Math.max(0, Math.round((end - start) / DAY));
    if (b.check_in >= from && b.check_in < to) revenue += Number(b.total);
  }
  return {
    bookings: bookings.length,
    nights_booked: nights,
    window_nights: windowNights,
    occupancy_pct: windowNights ? Math.round((nights / windowNights) * 1000) / 10 : 0,
    revenue: Math.round(revenue * 100) / 100,
  };
}
