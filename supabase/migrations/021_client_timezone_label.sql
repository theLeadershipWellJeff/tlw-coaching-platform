-- theLeadershipWell — friendly display city for a client's timezone
--
-- The picker stores an IANA zone (e.g. America/Chicago), but several cities share
-- one zone (Austin, Dallas, Houston, Chicago …). To show the coach back the city
-- they actually picked ("Austin — GMT-05:00") instead of the zone's canonical
-- city ("Chicago"), we remember the chosen label here. Purely cosmetic — all time
-- math still uses `clients.timezone`. Nullable; absent = fall back to the zone's
-- representative city.

alter table clients
  add column if not exists timezone_label text;
