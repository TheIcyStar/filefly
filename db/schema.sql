
CREATE TABLE IF NOT EXISTS file (
    path        TEXT PRIMARY KEY NOT NULL, -- Unix style path
    mtime       INT NOT NULL,
    content     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS directory (
    path        TEXT PRIMARY KEY NOT NULL,  -- Unix style path, workspace folder is "."
    mtime       INT NOT NULL
);

CREATE TABLE IF NOT EXISTS openFile (
   filePath     TEXT PRIMARY KEY NOT NULL,
   userId       INT NOT NULL,
   CONSTRAINT openFile_filepath_to_file_filepath FOREIGN KEY (filePath) REFERENCES file(path)
);

CREATE TABLE IF NOT EXISTS activeUser (
    userId              INT PRIMARY KEY NOT NULL,
    colPos              INT NOT NULL,
    rowPos              INT NOT NULL,
    openFilePath        TEXT NOT NULL,
    highlightStartRow   INT NOT NULL,
    highlightStartCol   INT NOT NULL,
    highlightStopRow    INT NOT NULL,
    highlightStopCol    INT NOT NULL,
    CONSTRAINT activeUser_openFilePath_to_file_path FOREIGN KEY (openFilePath) REFERENCES file(path)
);

ALTER TABLE openFile
ADD CONSTRAINT openFile_userId_to_activeUser_userId FOREIGN KEY (userId) REFERENCES activeUser(userId);

CREATE TABLE IF NOT EXISTS chunk (
    filePath      TEXT NOT NULL,
    num           INT NOT NULL,
    contents      TEXT NOT NULL,
    startPosRow   INT NOT NULL,
    startPosCol   INT NOT NULL,
    stopPosRow    INT NOT NULL,
    stopPosCol    INT NOT NULL,
    PRIMARY KEY (filePath, num),
    FOREIGN KEY (filePath) REFERENCES file(path) ON DELETE CASCADE
)

INSERT INTO directory VALUES ('.', 0); --Root directory that will always get pushed to
