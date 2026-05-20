/** Turner list pages often expose a generic "no image" box — not the product photo. */
export function isTurnerPlaceholderImage(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  const u = url.toLowerCase();
  return (
    u.includes("no_image") ||
    u.includes("no-image") ||
    u.includes("placeholder") ||
    u.includes("spacer.gif") ||
    u.includes("tms_box_no")
  );
}

export function isTurnerProductImage(url: string | null | undefined): boolean {
  if (!url || isTurnerPlaceholderImage(url)) return false;
  return /assets\.turnermotorsport\.com/i.test(url);
}
