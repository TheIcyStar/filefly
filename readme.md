# Filefly
A real-time multiplayer file editing extension for VS Code. This extension syncs your entire workspace's contents with all other connected users and shows real-time edits in any opened files.

<img width="2570" height="1409" alt="filefly-screeniespng(1)" src="https://github.com/user-attachments/assets/30b51688-0b8e-4227-91dd-ccc35a4ea845" />

> [!WARNING]
> This project was done as a learning opportunity and is **NOT** stable.\
> **You should assume that all files in the openned workspace folder can be wiped at any time**


## Installation
Don't :)\
Use [Live Share](https://marketplace.visualstudio.com/items?itemName=MS-vsliveshare.vsliveshare) instead. 


## Features
- Multiplayer document editing with line highlights for opened documents
- Full directory sync for all other files
- Color picker for user's highlight color
- Handles multiple database connection configurations
- Wipes your entire workspace folder before startup


## How to use
1. Clone this repository and open it in VS Code.
2. Create a copy of `.env.example` and rename it to `.env`. Fill out `FILEFLY_DB_PASSWORD`, `FILEFLY_DB_USERNAME`, and `FILEFLY_DB_DATABASE_NAME` with any values.
3. Run `docker compose up` to start a postgresql container. The database will be initialized with the database schema automatically
4. Run `npm install` to install dependencies
5. Press F5 to build and run the extension in a new VS Code window
6. **⚠️ Important**: Open a workspace folder that has no important files. This folder will be wiped
7. Use the command palette (`CTRL + SHIFT + P` or `⌘ + SHIFT + P`) and select `FileFly: New Multiplayer Connection`. Use the connection details from your .env
8. Select `FileFly: Connect` in the command palette
9. Select `FileFly: Start Real-Time Sync` to connect to the multiplayer session
