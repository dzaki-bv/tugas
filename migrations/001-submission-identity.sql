ALTER TABLE submissions ADD COLUMN class_id TEXT REFERENCES classes(id) ON DELETE SET NULL;
UPDATE submissions SET class_id = (
  SELECT c.id FROM task_classes tc JOIN classes c ON c.id=tc.class_id
  WHERE tc.task_id=submissions.task_id AND lower(trim(c.name))=lower(trim(submissions.student_class))
) WHERE class_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS submission_identity ON submissions(
  task_id, lower(trim(student_name)), coalesce('id:' || class_id, 'name:' || lower(trim(student_class)))
);
