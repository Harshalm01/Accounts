SELECT
    id,
    month,
    "fileName" as file_name,
    jsonb_array_length(data::jsonb) as row_count,
    "uploadedAt" as uploaded_at
FROM "Roaster"
ORDER BY "uploadedAt" DESC;
