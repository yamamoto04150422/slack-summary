-- Create summaries table
CREATE TABLE IF NOT EXISTS summaries (
    id SERIAL PRIMARY KEY,
    channel_id VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_channel_id ON summaries(channel_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON summaries(created_at);

