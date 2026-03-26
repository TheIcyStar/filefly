
CREATE TABLE IF NOT EXISTS file (
    path        TEXT PRIMARY KEY,
    content     TEXT 
);

CREATE TABLE IF NOT EXISTS openFile (
   filePath     TEXT PRIMARY KEY,
   userId       INT,
   CONSTRAINT openFile_filepath_to_file_filepath FOREIGN KEY (filePath) REFERENCES file(path)
);

CREATE TABLE IF NOT EXISTS activeUser (
    userId              INT PRIMARY KEY,
    colPos              INT,
    rowPos              INT,
    openFilePath        TEXT,
    highlightStartRow   INT,
    highlightStartCol   INT,
    highlightStopRow    INT,
    highlightStopCol    INT
    -- START HERE, ADD OTHER CONSTAINTS AS NEEDED
);

ALTER TABLE openFile
ADD CONSTRAINT openFile_userId_to_activeUser_userId FOREIGN KEY (userId) REFERENCES activeUser(userId);

CREATE TABLE IF NOT EXISTS chunk (
    filePath     TEXT,
    contents     TEXT,
    startPosRow  INT,
    startPosCol  INT,
    stopPosRow   INT,
    stopPosCol   INT
)