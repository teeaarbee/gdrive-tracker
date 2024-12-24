/*
  # Create folders and changes tables

  1. New Tables
    - `folders`
      - `id` (uuid, primary key)
      - `folder_id` (text, Google Drive folder ID)
      - `name` (text, folder name)
      - `url` (text, Google Drive folder URL)
      - `is_monitoring` (boolean, monitoring status)
      - `last_checked` (timestamp, last check time)
      - `created_at` (timestamp)
      - `user_id` (uuid, references auth.users)

    - `changes`
      - `id` (uuid, primary key)
      - `folder_id` (uuid, references folders)
      - `file_id` (text, Google Drive file ID)
      - `file_name` (text)
      - `change_type` (text, enum: 'added', 'modified', 'deleted')
      - `modified_at` (timestamp)
      - `created_at` (timestamp)
      - `user_id` (uuid, references auth.users)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their own data
*/

-- Create folders table
CREATE TABLE folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id text NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  is_monitoring boolean DEFAULT true,
  last_checked timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users NOT NULL
);

-- Create changes table
CREATE TABLE changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES folders ON DELETE CASCADE NOT NULL,
  file_id text NOT NULL,
  file_name text NOT NULL,
  change_type text CHECK (change_type IN ('added', 'modified', 'deleted')) NOT NULL,
  modified_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users NOT NULL
);

-- Enable RLS
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE changes ENABLE ROW LEVEL SECURITY;

-- Folders policies
CREATE POLICY "Users can create their own folders"
  ON folders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own folders"
  ON folders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders"
  ON folders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders"
  ON folders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Changes policies
CREATE POLICY "Users can create changes for their folders"
  ON changes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view changes for their folders"
  ON changes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete changes for their folders"
  ON changes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE INDEX idx_changes_folder_id ON changes(folder_id);
CREATE INDEX idx_changes_user_id ON changes(user_id);