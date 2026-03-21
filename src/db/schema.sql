



CREATE TABLE IF NOT EXISTS file (
    path        TEXT PRIMARY KEY,
    content     TEXT 
);

CREATE TABLE IF NOT EXISTS openFile (
   filePath     TEXT PRIMARY KEY,
   userId       INT,
   CONSTRAINT openFilefilepathtofilepath FOREIGN KEY (filePath) REFERENCES file(path)
);

CREATE TABLE IF NOT EXISTS activeUser (
    userId              INT PRIMARY KEY,
    colPos              INT,
    rowPos              INT,
    openFilePath        TEXT,
    highlightStartRow   INT,
    highlightStartCol   INT,
    highlightStopRow    INT,
    highlightStopCol    INT,
    CONSTRAINT activeUseruserIdtoopenFiluserId FOREIGN KEY (userId) REFERENCES openFile(userId)
    -- START HERE, ADD OTHER CONSTAINTS
);

CREATE TABLE IF NOT EXISTS chunk (
    filePath     TEXT,
    contents     TEXT,
    startPosRow  INT,
    startPosCol  INT,
    stopPosRow   INT,
    stopPosCol   INT
)