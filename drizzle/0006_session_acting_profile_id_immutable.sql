-- G-D14(b) / FR-1.6 / ADR-013: "Session.acting_profile_id shall be fixed at sign-in and shall not
-- be writable afterwards." Enforced at the database level (not application discipline alone) so a
-- raw SQL UPDATE is rejected the same as an application-layer one -- the guarded test for this
-- (tests/integration/raw-sql/session-immutable-profile.test.ts) must see a real rejection, not an
-- app-layer convention it happens to bypass.
CREATE FUNCTION reject_acting_profile_id_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.acting_profile_id IS DISTINCT FROM NEW.acting_profile_id THEN
    RAISE EXCEPTION 'session.acting_profile_id is fixed at creation and cannot be changed (ADR-013, G-D14)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER session_acting_profile_id_immutable
  BEFORE UPDATE ON session
  FOR EACH ROW
  EXECUTE FUNCTION reject_acting_profile_id_change();
