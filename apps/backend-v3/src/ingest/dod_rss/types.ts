/**
 * Raw parsed RSS item shape from the DoD contract announcements feed.
 * All fields optional — extracted via regex from RSS XML.
 */

export interface DoDRSSItemRaw {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  creator?: string; // dc:creator
  guid?: string;
}
