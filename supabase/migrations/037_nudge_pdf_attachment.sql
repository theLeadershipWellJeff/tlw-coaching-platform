-- 035: Framework PDF attachments for nudges.
--
-- A framework nudge can carry a PDF of the framework (a Library PDF resource)
-- that is attached to the email when the nudge sends.
--
--   nudges.pdf_resource_id       — the PDF attached to THIS nudge (coach-editable
--                                  in the queue; framework nudges only in the UI).
--   garden_notes.pdf_resource_id — the framework leaf's standing PDF. New framework
--                                  nudges for that leaf default to it, and attaching
--                                  a PDF on a nudge writes it back here so future
--                                  nudges auto-attach ("attach as they get made").
--
-- Additive + nullable — nothing existing changes behavior until a PDF is attached.
-- ON DELETE SET NULL: removing a Library PDF simply detaches it everywhere.

alter table nudges
  add column if not exists pdf_resource_id uuid references pdf_resources(id) on delete set null;

alter table garden_notes
  add column if not exists pdf_resource_id uuid references pdf_resources(id) on delete set null;
