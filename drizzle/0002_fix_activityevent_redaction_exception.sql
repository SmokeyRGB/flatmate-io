ALTER POLICY "activityevent_append_only_update" ON "activity_event" TO public USING (EXISTS (
        SELECT 1 FROM application
        WHERE application.id = activity_event.subject_id
          AND activity_event.subject_type = 'application'
          AND application.retention_until IS NOT NULL
          AND application.retention_until < now()
      )) WITH CHECK (payload = '{}'::jsonb);