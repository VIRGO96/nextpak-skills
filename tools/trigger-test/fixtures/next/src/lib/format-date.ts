// Format dates with an explicit locale AND time zone. `toLocaleString()` with no
// arguments uses the machine's settings, so the server (often UTC) and the browser
// render different text -> hydration mismatch, and users see the wrong day.
// Take the zone from the user's profile/cookie; store and send dates as ISO UTC strings.
export function formatDateTime(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}
