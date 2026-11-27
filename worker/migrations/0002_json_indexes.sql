-- Indexes for the fields the AI tools filter on (worker/src/store.ts), one per table that is read
-- by that field. Each covers only the table's live rows, so a write touches at most the indexes of
-- its own table and tombstones none. The expression and the WHERE must stay textually the same as
-- what store.ts `whereClause` writes, or SQLite does not use them:
--   owner = ?1 AND tbl = 'cards' AND deleted = 0 AND json_extract(data, '$.deckId') = ?2
CREATE INDEX records_cards_deck_id ON records (owner, json_extract(data, '$.deckId')) WHERE tbl = 'cards' AND deleted = 0;
CREATE INDEX records_cards_image_id ON records (owner, json_extract(data, '$.imageId')) WHERE tbl = 'cards' AND deleted = 0;
CREATE INDEX records_reviews_card_id ON records (owner, json_extract(data, '$.cardId')) WHERE tbl = 'reviews' AND deleted = 0;
CREATE INDEX records_review_logs_card_id ON records (owner, json_extract(data, '$.cardId')) WHERE tbl = 'reviewLogs' AND deleted = 0;
CREATE INDEX records_drill_stats_card_id ON records (owner, json_extract(data, '$.cardId')) WHERE tbl = 'drillStats' AND deleted = 0;
CREATE INDEX records_doc_folders_parent_id ON records (owner, json_extract(data, '$.parentId')) WHERE tbl = 'docFolders' AND deleted = 0;
CREATE INDEX records_docs_folder_id ON records (owner, json_extract(data, '$.folderId')) WHERE tbl = 'docs' AND deleted = 0;
CREATE INDEX records_tasks_status ON records (owner, json_extract(data, '$.status')) WHERE tbl = 'tasks' AND deleted = 0;
